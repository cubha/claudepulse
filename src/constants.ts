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
