import * as path from 'node:path';
import * as os from 'node:os';

export const EXTENSION_ID = 'cubha.claude-code-gauge';
export const EXTENSION_NAME = 'Claude Code Gauge';

export const COMMANDS = {
  openDashboard: 'claudeCodeGauge.openDashboard',
  refresh: 'claudeCodeGauge.refresh',
  login: 'claudeCodeGauge.login'
} as const;

export const VIEW_IDS = {
  sidebar: 'claudeCodeGauge.sidebar'
} as const;

/** getConfiguration('claudeCodeGauge') 기준 상대 키 */
export const CONFIG_KEYS = {
  credentialsPath: 'credentialsPath',
  pollIntervalMs: 'pollIntervalMs',
  utilizationWarnThreshold: 'utilizationWarnThreshold'
} as const;

export const DEFAULT_CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

/** 5분 기본 폴링 간격 */
export const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

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
