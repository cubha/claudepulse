import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';
import { BROADCAST } from 'vscode-messenger-common';
import { Logger } from './logger';
import {
  COMMANDS,
  CONFIG_KEYS,
  DEFAULT_CREDENTIALS_PATH,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_WARN_THRESHOLD,
  VIEW_IDS
} from './constants';
import { SidebarViewProvider } from './providers/SidebarViewProvider';
import { StatusBarController } from './providers/StatusBarController';
import { DashboardPanel } from './panel/DashboardPanel';
import { CredentialsReader } from './services/CredentialsReader';
import { RateLimitPoller } from './services/RateLimitPoller';
import { FileWatcher } from './services/FileWatcher';
import { JsonlParser } from './services/JsonlParser';
import { UsageAggregator } from './services/UsageAggregator';
import { WorkspaceMapper } from './services/WorkspaceMapper';
import { CacheStore } from './services/CacheStore';
import { GitLogReader } from './services/GitLogReader';
import { CommitAttributor } from './services/CommitAttributor';
import { RetroStore } from './services/RetroStore';
import { PushPollerError, PushRateLimit, PushUsageSummary } from './messaging/contracts';
import { registerHandlers } from './messaging/handlers';
import type { CommitMeta, PollHistoryPoint, PollerError, RateLimitSnapshot, RetroSummary, SessionRecord, UsageSummary } from './types';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger('Claude Code Gauge');
  logger.info('extension activating...');

  const messenger = new Messenger();
  const statusBar = new StatusBarController();
  statusBar.show();

  const credReader = new CredentialsReader();
  let lastSnapshot: RateLimitSnapshot | null = null;
  let lastUsageSummary: UsageSummary | null = null;
  let poller: RateLimitPoller | null = null;
  let currentLang: string = context.globalState.get<string>('ccg-lang') ?? 'auto';

  const MAX_POLL_HISTORY = 60;
  const snapshotHistory: PollHistoryPoint[] = [];

  // jsonl 파이프라인
  const jsonlParser = new JsonlParser();
  const aggregator = new UsageAggregator();
  const workspaceMapper = new WorkspaceMapper();
  const fileWatcher = new FileWatcher();
  const cacheStore = new CacheStore(context.globalStorageUri.fsPath);
  let allRecords: SessionRecord[] = [];

  // usage×git 회고 파이프라인 (v0.1.37) — lazy(뷰 오픈 시), HEAD SHA 캐시
  const gitLogReader = new GitLogReader();
  const commitAttributor = new CommitAttributor();
  const retroStore = new RetroStore(context.globalStorageUri.fsPath);

  // 회고 빌드 상태 (v0.1.39): dirty 디바운스 + 동시빌드 가드 + first-paint 캐시
  let lastRetroSummary: RetroSummary | null = null;
  let retroDirty = true;                                  // 레코드 변경 시 set → 다음 요청에 1회 재빌드
  let retroBuildInFlight: Promise<RetroSummary | null> | null = null;

  // 영구 이력 초기 로드. 회고는 load 후 영속 스냅샷을 메모리 캐시에 올려 first-paint 즉시 반환.
  void cacheStore.load();
  void retroStore.load().then(() => {
    if (!lastRetroSummary) lastRetroSummary = retroStore.getSummary();
  });

  /**
   * 회고 요약을 lazy 빌드한다(회고 뷰 오픈/갱신 시 호출).
   * v0.1.39: 비동기 git을 await(호스트 비차단). 깨끗하면 캐시 반환(매-푸시 재빌드 제거),
   * 동시 요청은 단일 빌드 공유. 영속 스냅샷으로 빌드 전에도 즉시 반환(first-paint).
   *
   * ⚠️ 포워드 컨트랙트: record 소싱은 단일 진입점 allRecords에서만 한다.
   * getAllJsonlFiles 재호출 금지 — codex "무행위변경 이관"이 이를 ClaudeSource로
   * 옮겨도 회고 ingestion이 깨지지 않게. (PLAN-v0.1.37 §5)
   */
  function buildRetroSummary(): Promise<RetroSummary | null> {
    // 깨끗 + 캐시 보유 → 재빌드 없이 즉시(매 PushUsageSummary 재빌드 차단).
    if (!retroDirty && lastRetroSummary) return Promise.resolve(lastRetroSummary);
    // dirty → 백그라운드 빌드 1회만 트리거(동시 요청 dedup). floating promise 방어(.catch).
    if (!retroBuildInFlight) {
      retroBuildInFlight = doBuildRetroSummary()
        .catch(() => lastRetroSummary)
        .finally(() => { retroBuildInFlight = null; });
    }
    // first-paint: 캐시(영속 스냅샷 포함)가 있으면 빌드를 기다리지 않고 즉시 반환.
    // 다음 푸시/요청에 갱신본이 반영된다. 캐시가 없을 때만(최초) 빌드 대기.
    return lastRetroSummary ? Promise.resolve(lastRetroSummary) : retroBuildInFlight;
  }

  async function doBuildRetroSummary(): Promise<RetroSummary | null> {
    // allRecords 스냅샷 + 즉시 dirty 해제 — 빌드 중 refreshUsage(records 재할당)가 들어오면
    // 그 refresh가 dirty=true를 재설정해 다음 요청에 재빌드된다(빌드-끝 reset이 B 변경을
    // 덮어쓰는 race 회피). 이후 전부 스냅샷 records만 사용(repoRoots·attribute 일관).
    const records = allRecords;
    retroDirty = false;
    if (records.length === 0) return lastRetroSummary; // 영속 스냅샷 유지(있으면)
    // 레코드 cwd → git repo root 집합 (중복 셸아웃 회피). getRepoRoot가 cwd당 캐시.
    const repoRoots = new Set<string>();
    const seenCwd = new Set<string>();
    for (const r of records) {
      if (!r.cwd || seenCwd.has(r.cwd)) continue;
      seenCwd.add(r.cwd);
      const root = await gitLogReader.getRepoRoot(r.cwd);
      if (root) repoRoots.add(root);
    }
    const commits: CommitMeta[] = [];
    for (const root of repoRoots) commits.push(...await gitLogReader.readCommits(root));
    const summary = commitAttributor.attribute(records, commits);
    lastRetroSummary = summary;
    // 전체 요약 영속 — first-paint + jsonl 30일 롤오프 후에도 커밋귀속 생존
    await retroStore.saveSummary(summary);
    return summary;
  }

  async function refreshUsage(): Promise<void> {
    const files = workspaceMapper.getAllJsonlFiles();
    const perFile = await Promise.all(files.map(f => jsonlParser.parseFile(f)));
    allRecords = perFile.flat();
    retroDirty = true; // 레코드 변경 → 다음 회고 요청에 1회 재빌드(매-푸시 재빌드 아님)
    lastUsageSummary = aggregator.aggregate(allRecords);
    // 오늘 포함 최근 7일 데이터를 CacheStore에 영구 저장
    await cacheStore.merge(lastUsageSummary.last7Days);
    // 전체 이력을 UsageSummary에 주입
    lastUsageSummary.historicalDays = cacheStore.getAll();
    messenger.sendNotification(PushUsageSummary, BROADCAST, lastUsageSummary);
  }

  fileWatcher.on('change', () => { void refreshUsage(); });
  fileWatcher.start();
  context.subscriptions.push({ dispose: () => fileWatcher.stop() });

  // 시작 시 초기 집계
  void refreshUsage();

  registerHandlers(
    messenger,
    () => lastSnapshot,
    () => snapshotHistory,
    () => lastUsageSummary,
    () => { poller?.poll(); },
    () => vscode.commands.executeCommand(COMMANDS.login),
    () => { void vscode.commands.executeCommand(COMMANDS.openDashboard); },
    () => { void vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/settings/usage')); },
    () => currentLang,
    (lang) => {
      currentLang = lang;
      void context.globalState.update('ccg-lang', lang);
    },
    () => buildRetroSummary()
  );

  const sidebarProvider = new SidebarViewProvider(context.extensionUri, messenger);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_IDS.sidebar, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.openDashboard, () => {
      DashboardPanel.createOrShow(context.extensionUri, messenger);
    }),
    vscode.commands.registerCommand(COMMANDS.refresh, () => {
      poller?.poll();
    }),
    vscode.commands.registerCommand(COMMANDS.login, () => {
      const terminal = vscode.window.createTerminal({ name: 'Claude Login' });
      terminal.show();
      terminal.sendText('claude login');
    })
  );

  context.subscriptions.push(statusBar, logger);

  function getConfig() {
    const cfg = vscode.workspace.getConfiguration('claudeCodeGauge');
    return {
      credentialsPath: cfg.get<string>(CONFIG_KEYS.credentialsPath) || DEFAULT_CREDENTIALS_PATH,
      pollIntervalMs: cfg.get<number>(CONFIG_KEYS.pollIntervalMs) ?? DEFAULT_POLL_INTERVAL_MS,
      warnThreshold: cfg.get<number>(CONFIG_KEYS.utilizationWarnThreshold) ?? DEFAULT_WARN_THRESHOLD,
    };
  }

  function startPoller(): void {
    poller?.stop();
    const { credentialsPath, pollIntervalMs } = getConfig();
    poller = new RateLimitPoller(
      credReader, credentialsPath, logger,
      (snapshot) => {
        lastSnapshot = snapshot;
        snapshotHistory.push({ t: snapshot.generatedAt.toISOString(), fh: snapshot.fiveHour.utilization, sd: snapshot.sevenDay.utilization });
        if (snapshotHistory.length > MAX_POLL_HISTORY) snapshotHistory.shift();
        statusBar.update(snapshot, lastUsageSummary?.today.costUsd);
        messenger.sendNotification(PushRateLimit, BROADCAST, snapshot);
        checkThreshold(snapshot);
      },
      (error: PollerError) => {
        messenger.sendNotification(PushPollerError, BROADCAST, error);
      }
    );
    poller.start(pollIntervalMs);
    context.subscriptions.push({ dispose: () => poller?.stop() });
  }

  let lastAlerted: 'fiveHour' | 'sevenDay' | null = null;

  function checkThreshold(snapshot: RateLimitSnapshot): void {
    const { warnThreshold } = getConfig();
    const fhOver = snapshot.fiveHour.utilization >= warnThreshold;
    const sdOver = snapshot.sevenDay.utilization >= warnThreshold;

    if (fhOver && lastAlerted !== 'fiveHour') {
      lastAlerted = 'fiveHour';
      const pct = (snapshot.fiveHour.utilization * 100).toFixed(0);
      void vscode.window.showWarningMessage(
        `Claude Code Gauge: Session usage at ${pct}% — resets in ${fmtReset(snapshot.fiveHour.msUntilReset)}`,
        'Open Dashboard'
      ).then(sel => { if (sel) void vscode.commands.executeCommand(COMMANDS.openDashboard); });
    } else if (sdOver && lastAlerted !== 'sevenDay') {
      lastAlerted = 'sevenDay';
      const pct = (snapshot.sevenDay.utilization * 100).toFixed(0);
      void vscode.window.showWarningMessage(
        `Claude Code Gauge: Weekly usage at ${pct}% — resets in ${fmtReset(snapshot.sevenDay.msUntilReset)}`,
        'Open Dashboard'
      ).then(sel => { if (sel) void vscode.commands.executeCommand(COMMANDS.openDashboard); });
    } else if (!fhOver && !sdOver) {
      lastAlerted = null;
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration(CONFIG_KEYS.credentialsPath) ||
        e.affectsConfiguration(CONFIG_KEYS.pollIntervalMs)
      ) {
        startPoller();
      }
    })
  );

  startPoller();
  logger.info('extension activated.');
}

export function deactivate(): void {
  // dispose는 context.subscriptions가 자동 처리
}

function fmtReset(ms: number): string {
  if (ms <= 0) return 'now';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
