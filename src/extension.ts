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
import { PushPollerError, PushRateLimit, PushUsageSummary } from './messaging/contracts';
import { registerHandlers } from './messaging/handlers';
import type { PollHistoryPoint, PollerError, RateLimitSnapshot, SessionRecord, UsageSummary } from './types';

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

  // 영구 이력 초기 로드
  void cacheStore.load();

  async function refreshUsage(): Promise<void> {
    const files = workspaceMapper.getAllJsonlFiles();
    const perFile = await Promise.all(files.map(f => jsonlParser.parseFile(f)));
    allRecords = perFile.flat();
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
    }
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
