import * as path from 'node:path';
import * as os from 'node:os';

export const EXTENSION_ID = 'cubha.claude-code-gauge';
export const EXTENSION_NAME = 'AgentVitals';

export const COMMANDS = {
  openDashboard: 'claudeCodeGauge.openDashboard',
  refresh: 'claudeCodeGauge.refresh',
  login: 'claudeCodeGauge.login',
  loginCodex: 'claudeCodeGauge.loginCodex'
} as const;

export const VIEW_IDS = {
  sidebar: 'claudeCodeGauge.sidebar'
} as const;

/** 설정 섹션명. onDidChangeConfiguration의 affectsConfiguration()은 **전체 키**를 요구한다 —
 * 상대 키를 넘기면 그런 섹션이 없어 항상 false가 되고 설정 변경이 조용히 무시된다(v0.1.56에서
 * pollIntervalMs/credentialsPath가 실제로 이 상태였다). CONFIG_KEYS와 조합해 쓸 것. */
export const CONFIG_SECTION = 'claudeCodeGauge';

/** getConfiguration('claudeCodeGauge') 기준 상대 키 */
export const CONFIG_KEYS = {
  credentialsPath: 'credentialsPath',
  pollIntervalMs: 'pollIntervalMs',
  utilizationWarnThreshold: 'utilizationWarnThreshold',
  usageRefreshIntervalMs: 'usageRefreshIntervalMs'
} as const;

/** 전체 설정 키(affectsConfiguration용) */
export function fullConfigKey(key: (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS]): string {
  return `${CONFIG_SECTION}.${key}`;
}

export const DEFAULT_CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

/** 5분 기본 폴링 간격 */
export const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 사용량(jsonl) 리프레시 **최소 간격** — 15초.
 *
 * chokidar 폴링(3초)이 감지한 변경을 FileWatcher가 이 값으로 스로틀한다. 디바운스가 아니라
 * 스로틀인 이유: Claude Code 세션이 살아있는 동안 jsonl은 쉬지 않고 append되므로, 디바운스
 * 윈도를 늘리면 타이머가 매 이벤트마다 리셋되어 **작업 중에는 영영 발화하지 않고** 손을 뗀
 * 뒤에야 1회 갱신된다(정확히 최신 데이터가 필요한 구간에서 멈춤).
 */
export const DEFAULT_USAGE_REFRESH_INTERVAL_MS = 15 * 1000;

/** 사용량 리프레시 간격 하한 — chokidar 감지 주기(3초)보다 짧게 잡을 이유가 없다. */
export const MIN_USAGE_REFRESH_INTERVAL_MS = 3000;

/**
 * 설정값을 유효한 리프레시 간격으로 좁힌다.
 *
 * package.json의 `type`·`minimum`은 **설정 UI에서만** 강제된다 — settings.json을 손으로 고치면
 * 0·음수·문자열이 그대로 도착한다. `Math.max(MIN, x)` 하나로는 부족하다: `Math.max(3000, NaN)`은
 * `NaN`이고 `elapsed >= NaN`은 언제나 false라, 스로틀이 열린 채로 매 이벤트를 통과시킨다
 * (막으려던 증상이 조용히 되돌아온다). 그래서 수치 여부를 먼저 판정한다.
 */
export function clampRefreshInterval(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_USAGE_REFRESH_INTERVAL_MS;
  return Math.max(MIN_USAGE_REFRESH_INTERVAL_MS, n);
}

/** 80% 초과 시 경고 */
export const DEFAULT_WARN_THRESHOLD = 0.8;

/**
 * 컨텍스트 게이지 stale 판정 임계(4시간, v0.1.51 세션 선택기). extension.ts(세션 선택기 QuickPick
 * 목록 계산)에서 쓴다. webview/main.ts는 별도 로컬 상수를 그대로 유지한다 — webview 번들은
 * platform:'browser'라 이 파일의 node:path/node:os 의존을 함께 번들링할 수 없다(esbuild.config.mjs
 * 참조). 값 변경 시 두 곳을 함께 갱신할 것.
 */
export const CONTEXT_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;

/** workspaceState 키 — 사용자가 사이드바 세션 선택기로 고정(pin)한 세션 ID (창/워크스페이스 단위) */
export const PINNED_SESSION_STATE_KEY = 'ccg-pinnedSessionId';
