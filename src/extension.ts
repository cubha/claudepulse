import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';
import { BROADCAST } from 'vscode-messenger-common';
import { Logger } from './logger';
import {
  COMMANDS,
  CONFIG_KEYS,
  CONTEXT_STALE_THRESHOLD_MS,
  DEFAULT_CREDENTIALS_PATH,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_WARN_THRESHOLD,
  PINNED_SESSION_STATE_KEY,
  VIEW_IDS,
  clampRefreshInterval,
  fullConfigKey
} from './constants';
import { SidebarViewProvider } from './providers/SidebarViewProvider';
import { StatusBarController } from './providers/StatusBarController';
import { DashboardPanel } from './panel/DashboardPanel';
import { CredentialsReader } from './services/CredentialsReader';
import { RateLimitPoller } from './services/RateLimitPoller';
import { CredentialsWatcher } from './services/CredentialsWatcher';
import { FileWatcher } from './services/FileWatcher';
import { JsonlParser } from './services/JsonlParser';
import { UsageAggregator } from './services/UsageAggregator';
import { WorkspaceMapper } from './services/WorkspaceMapper';
import { CacheStore } from './services/CacheStore';
import { GitLogReader } from './services/GitLogReader';
import { CommitAttributor } from './services/CommitAttributor';
import { RetroStore } from './services/RetroStore';
import { PushPollerError, PushRateLimit, PushRetroSummary, PushUsageSummary } from './messaging/contracts';
import { registerHandlers } from './messaging/handlers';
import { resolveCredentialsPath } from './utils/credentialsPath';
import { readOneMillionModelsFromClaudeJson } from './utils/claudeJsonModels';
import { buildSessionPickerItems } from './utils/sessionPicker';
import type { CommitMeta, CommitScopeInfo, PollHistoryPoint, PollerError, RateLimitSnapshot, RetroCommitScope, RetroSummary, SessionRecord, UsageSummary } from './types';

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
  let credWatcher: CredentialsWatcher | null = null;
  let currentLang: string = context.globalState.get<string>('ccg-lang') ?? 'auto';

  const MAX_POLL_HISTORY = 60;
  const snapshotHistory: PollHistoryPoint[] = [];

  // jsonl 파이프라인
  const jsonlParser = new JsonlParser();
  const aggregator = new UsageAggregator();
  const workspaceMapper = new WorkspaceMapper();
  let fileWatcher: FileWatcher | null = null;
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

  /**
   * 회고를 push로 전달(형제 섹션 정렬). pull-전용은 락다운 환경에서 webview→extension
   * 요청 라운드트립 불발 시 영구 "수집 중" 고착 → push 백업.
   * ⚠️ DashboardPanel이 열렸을 때만 실행 — 패널 닫힌 동안 파일 변경마다 git 셸아웃이 도는 회귀 방지.
   * (retroDirty 가드로 깨끗하면 git 재빌드 없이 캐시본 push.)
   */
  function pushRetro(): void {
    if (!DashboardPanel.isOpen) return;
    void buildRetroSummary()
      .then((summary) => messenger.sendNotification(PushRetroSummary, BROADCAST, summary))
      .catch(() => undefined);
  }

  /** 설정값 → 회고 커밋 스코프. 미지의 값은 안전한 기본('mine')으로 떨어뜨린다. */
  function getRetroCommitScope(): RetroCommitScope {
    const v = vscode.workspace.getConfiguration('claudeCodeGauge').get<string>('retroCommitScope');
    return v === 'all' ? 'all' : 'mine';
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
    // 커밋 후보 스코프(v0.1.55). 기본 'mine' — 무필터 git log는 동료 커밋까지 후보로 만들고,
    // 근사조인이 사용자 사용량을 남의 커밋에 귀속시킨다. 설정으로 'all' 복원 가능.
    const requestedScope = getRetroCommitScope();
    const commits: CommitMeta[] = [];
    const commitScopes: CommitScopeInfo[] = [];
    for (const root of repoRoots) {
      commits.push(...await gitLogReader.readCommits(root, requestedScope));
      commitScopes.push(await gitLogReader.resolveScope(root, requestedScope));
    }
    const summary: RetroSummary = { ...commitAttributor.attribute(records, commits), commitScopes };
    lastRetroSummary = summary;
    // 전체 요약 영속 — first-paint + jsonl 30일 롤오프 후에도 커밋귀속 생존
    await retroStore.saveSummary(summary);
    return summary;
  }

  /** 사용자가 사이드바 세션 선택기로 고정(pin)한 세션 ID — 창(workspaceState) 단위로 영속(v0.1.51). */
  function getPinnedSessionId(): string | null {
    return context.workspaceState.get<string>(PINNED_SESSION_STATE_KEY) ?? null;
  }
  function setPinnedSessionId(sessionId: string | null): Thenable<void> {
    return context.workspaceState.update(PINNED_SESSION_STATE_KEY, sessionId ?? undefined);
  }

  let usageRefreshInFlight: Promise<void> | null = null;
  let usageRefreshQueued = false;

  /**
   * doRefreshUsage 재진입 가드(v0.1.56).
   *
   * 트리거가 1개(파일 감시)에서 3개(감시 스로틀 · 새로고침 버튼 · refresh 커맨드)로 늘면서
   * 두 실행이 겹칠 수 있게 됐다. doRefreshUsage는 여러 await 사이에서 allRecords와
   * lastUsageSummary를 대입하므로, 겹치면 **먼저 시작한 느린 실행이 나중에 끝나며 최신본을
   * 덮어쓴다**(doBuildRetroSummary의 스냅샷 주석이 걱정하던 것과 같은 형태의 race).
   *
   * 진행 중이면 실행하지 않되 요청을 **버리지 않고 1회 예약**한다 — 수동 새로고침이
   * "눌렀는데 갱신 안 됨"으로 끝나면 안 되기 때문. 중복 예약은 1개로 합친다.
   */
  function refreshUsage(): Promise<void> {
    if (usageRefreshInFlight) {
      usageRefreshQueued = true;
      return usageRefreshInFlight;
    }
    usageRefreshInFlight = doRefreshUsage()
      .catch((err: unknown) => { logger.error('refreshUsage failed', err); })
      .finally(() => {
        usageRefreshInFlight = null;
        if (usageRefreshQueued) {
          usageRefreshQueued = false;
          void refreshUsage();
        }
      });
    return usageRefreshInFlight;
  }

  async function doRefreshUsage(): Promise<void> {
    const files = await workspaceMapper.getAllJsonlFiles();
    const perFile = await Promise.all(files.map(f => jsonlParser.parseFile(f)));
    allRecords = perFile.flat();
    retroDirty = true; // 레코드 변경 → 다음 회고 요청에 1회 재빌드(매-푸시 재빌드 아님)
    // 열린 워크스페이스 폴더 전체를 sessionContext 후보 풀로 스코핑한다(v0.1.51, 멀티루트 실사용
    // 재현 수정 — 이전엔 첫 폴더 1개만 써서 다른 폴더의 활성 세션이 게이지에 아예 안 잡혔다).
    // workspaceFolders가 undefined(폴더 미오픈)면 그대로 undefined 전달 → aggregate()가 cross-project
    // 폴백으로 처리(빈 배열을 넘기면 "스코프 있음, 매칭 0건"이 되어 의미가 달라진다 — 구분 유지).
    const workspaceRoots = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath);
    // 컨텍스트 게이지 분모 3단 계단(S1②) — ~/.claude.json의 [1m] 흔적. 읽기 실패 시
    // 빈 Set(안전 폴백, project_context_gauge_overcount 메모리) — ①관측증명·③테이블로 계속 판단 가능.
    const knownOneMillionModels = await readOneMillionModelsFromClaudeJson();
    const pinnedSessionId = getPinnedSessionId();
    lastUsageSummary = aggregator.aggregate(allRecords, workspaceRoots, knownOneMillionModels, pinnedSessionId);
    // 고정한 세션이 후보 풀에서 사라졌다(세션 종료·워크스페이스 밖) — 죽은 pin을 정리해 다음
    // refresh부터 자동 모드로 조용히 복귀한다(SessionContextUsage.pinMissing, UsageAggregator).
    if (lastUsageSummary.sessionContext?.pinMissing) {
      await setPinnedSessionId(null);
    }
    // jsonl이 보유한 전체 범위(회전 천장 ~30일)를 CacheStore에 영구 저장 — last7Days만
    // merge하면 7일보다 오래된 날짜가 영구 보존되지 않아 히트맵이 얕아진다(v0.1.43).
    await cacheStore.merge(lastUsageSummary.historicalDays);
    // 전체 이력을 UsageSummary에 주입 (CacheStore가 jsonl 회전 이후에도 보존한 값으로 교체)
    lastUsageSummary.historicalDays = cacheStore.getAll();
    messenger.sendNotification(PushUsageSummary, BROADCAST, lastUsageSummary);
    // 회고도 push(패널 열렸을 때만 — pushRetro 내부 게이트). retroDirty=true로 갱신본 1회 재빌드.
    pushRetro();
  }

  /** 사이드바 📁 칩 클릭 — 세션 선택기(QuickPick) 오픈. 선택 결과는 refreshUsage()로 재계산+push. */
  function openSessionPicker(): void {
    const items = buildSessionPickerItems(
      lastUsageSummary?.contextSessions ?? [],
      getPinnedSessionId(),
      Date.now(),
      CONTEXT_STALE_THRESHOLD_MS
    );
    if (items.length === 0) {
      void vscode.window.showInformationMessage('이 워크스페이스에서 관측된 세션이 없습니다.');
      return;
    }
    type PickerEntry = vscode.QuickPickItem & { sessionId: string | null };
    const qpItems: PickerEntry[] = items.map(it => {
      const badgeIcon = it.badge === 'pinned' ? '$(pin) ' : it.badge === 'auto' ? '$(sync) ' : '';
      const pct = Math.round(it.ratio * 100);
      return {
        label: `${badgeIcon}${it.repoName}`,
        description: `${it.branch} · ${fmtAgeShort(it.ageMs)} · ${fmtTokensShort(it.contextTokens)}/${fmtTokensShort(it.maxWindow)} (${pct}%) · ${fmtModelShort(it.model)}`,
        detail: it.cwd,
        sessionId: it.sessionId,
      };
    });
    if (getPinnedSessionId()) {
      qpItems.unshift({
        label: '$(discard) 자동 모드로 되돌리기',
        description: '가장 최근 활동 세션을 자동으로 표시',
        sessionId: null,
      });
    }
    void vscode.window.showQuickPick(qpItems, { placeHolder: '컨텍스트 게이지에 표시할 세션 선택' })
      .then(selected => {
        if (!selected) return; // Esc — 변경 없음
        void setPinnedSessionId(selected.sessionId).then(() => refreshUsage());
      });
  }

  /** 사이드바 stale-pinned 상태의 "자동 모드로 되돌리기" 링크 클릭. */
  function clearPinnedSession(): void {
    void setPinnedSessionId(null).then(() => refreshUsage());
  }

  // 회고 스코프 설정 변경은 레코드 변경이 아니라 retroDirty가 서지 않는다. 그대로 두면 사용자가
  // mine↔all을 바꿔도 다음 jsonl 변경까지 아무 일도 없고, 화면의 스코프 라벨은 **적용되지 않은
  // 값**을 말한다(설정을 만들어놓고 동작은 안 하는 무성 실패).
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('claudeCodeGauge.retroCommitScope')) return;
      retroDirty = true;
      pushRetro();
    })
  );

  function startFileWatcher(): void {
    // minIntervalMs가 생성자 주입이라 설정 변경 시에는 재생성해야 한다.
    fileWatcher?.stop();
    fileWatcher = new FileWatcher(undefined, getConfig().usageRefreshIntervalMs);
    fileWatcher.on('change', () => { void refreshUsage(); });
    fileWatcher.start();
  }
  // dispose 등록은 1회만 — 클로저가 외부 fileWatcher를 참조하므로 항상 현재 인스턴스를 정지시킨다.
  context.subscriptions.push({ dispose: () => fileWatcher?.stop() });
  startFileWatcher();

  // 시작 시 초기 집계
  void refreshUsage();

  registerHandlers(
    messenger,
    () => lastSnapshot,
    () => snapshotHistory,
    () => {
      // webview의 GetUsageSummary pull = 로드 완료(ready) 신호 → 회고도 push로 first-paint.
      // (패널 열렸을 때만 — pushRetro 내부 게이트. retroDirty 가드로 중복 git 빌드 없음.)
      pushRetro();
      return lastUsageSummary;
    },
    () => { poller?.poll(); void refreshUsage(); },   // webview 새로고침 버튼도 동일(스로틀 우회)
    () => vscode.commands.executeCommand(COMMANDS.login),
    () => { void vscode.commands.executeCommand(COMMANDS.openDashboard); },
    () => { void vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/settings/usage')); },
    () => currentLang,
    (lang) => {
      currentLang = lang;
      void context.globalState.update('ccg-lang', lang);
    },
    () => buildRetroSummary(),
    () => openSessionPicker(),
    () => clearPinnedSession()
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
      // 수동 새로고침은 FileWatcher 스로틀을 우회한다 — 사용자가 눌렀는데 최대 간격만큼
      // 기다려야 하면 그건 버그다. (이전엔 rate limit만 갱신하고 사용량은 손대지 않았다.)
      poller?.poll();
      void refreshUsage();
    }),
    vscode.commands.registerCommand(COMMANDS.login, () => {
      const terminal = vscode.window.createTerminal({ name: 'Claude Login' });
      terminal.show();
      // 'claude login'은 유효한 서브커맨드가 아니다 — CLI가 인자를 프롬프트로 해석해 REPL만 열린다.
      // 정식 인증 명령은 'claude auth login'. (alias/함수 래퍼 환경은 셸 제어 밖이라 보장 불가 — login_hint로 수동 안내)
      terminal.sendText('claude auth login');
    })
  );

  context.subscriptions.push(statusBar, logger);

  function getConfig() {
    const cfg = vscode.workspace.getConfiguration('claudeCodeGauge');
    // scope:machine이 workspaceValue를 platform 단에서 이미 차단하지만, inspect()로
    // globalValue만 명시적으로 채택해 2차 방어(defense-in-depth)한다 — VS Code 네이티브
    // 경고가 투명성을 담당하므로 커스텀 경고는 추가하지 않는다.
    const credentialsInspect = cfg.inspect<string>(CONFIG_KEYS.credentialsPath);
    return {
      credentialsPath: resolveCredentialsPath(credentialsInspect, DEFAULT_CREDENTIALS_PATH),
      pollIntervalMs: cfg.get<number>(CONFIG_KEYS.pollIntervalMs) ?? DEFAULT_POLL_INTERVAL_MS,
      // package.json의 minimum·type은 설정 UI에서만 강제된다 — settings.json을 직접 편집하면
      // 0/음수는 물론 문자열도 그대로 들어와 스로틀이 사실상 해제된다(고치려던 증상이 조용히 복원).
      // Math.max로는 못 막는다: Math.max(3000, NaN)은 NaN이고, `elapsed >= NaN`은 항상 false라
      // 매 이벤트가 즉시 통과한다. 그래서 수치인지부터 확인하고 클램프한다.
      usageRefreshIntervalMs: clampRefreshInterval(cfg.get<unknown>(CONFIG_KEYS.usageRefreshIntervalMs)),
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

    // .credentials.json 변경(CLI 토큰 갱신) → 즉시 재폴링하여 stale 오탐 윈도우 제거.
    credWatcher?.stop();
    credWatcher = new CredentialsWatcher(credentialsPath);
    credWatcher.on('change', () => {
      logger.info('credentials changed — re-polling');
      void poller?.poll();
    });
    credWatcher.start();
  }

  // dispose 등록은 1회만 — startPoller 내부에서 push하면 설정 변경(재시작)마다 항목이 누적된다.
  // 클로저가 외부 변수(poller/credWatcher)를 참조하므로 항상 현재 인스턴스를 정지시킨다.
  context.subscriptions.push(
    { dispose: () => poller?.stop() },
    { dispose: () => credWatcher?.stop() }
  );

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
      // affectsConfiguration은 전체 키를 요구한다 — 상대 키(CONFIG_KEYS 원값)를 넘기던 시절엔
      // 항상 false여서 이 재시작이 한 번도 돌지 않았다(fullConfigKey 도입 이유).
      if (
        e.affectsConfiguration(fullConfigKey(CONFIG_KEYS.credentialsPath)) ||
        e.affectsConfiguration(fullConfigKey(CONFIG_KEYS.pollIntervalMs))
      ) {
        startPoller();
      }
      if (e.affectsConfiguration(fullConfigKey(CONFIG_KEYS.usageRefreshIntervalMs))) {
        startFileWatcher();
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

/** 세션 선택기 QuickPick 항목 설명용 — webview/main.ts의 fmtAge와 별개(브라우저 번들에서 import 불가). */
function fmtAgeShort(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return '방금';
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h 전`;
  if (hours > 0) return `${hours}h ${mins}m 전`;
  return `${mins}m 전`;
}

/** 세션 선택기 QuickPick 항목 설명용 — webview/main.ts의 fmtTokens와 별개(브라우저 번들에서 import 불가). */
function fmtTokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

/**
 * 세션 선택기 QuickPick 항목의 모델 표기 — 같은 repo에 여러 세션이 있을 때 모델이 구분 단서가 된다
 * (시안 docs/design/prototype/context-session-picker.html의 목록 메타 행 참조).
 * webview/main.ts의 modelShortName과 동일 규칙이지만 별도 정의 — main.ts는 Chart.js·DOM을 모듈
 * 레벨에서 쓰는 webview 진입점이라 extension host가 import할 수 없다(fmtAgeShort/fmtTokensShort와 동일 사유).
 */
const MODEL_KINDS_SHORT = ['fable', 'opus', 'sonnet', 'haiku'] as const;
function fmtModelShort(model: string): string {
  const kind = MODEL_KINDS_SHORT.find(k => model.includes(k));
  if (!kind) return model.split('-').slice(-2).join('-');
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
