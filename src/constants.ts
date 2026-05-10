import * as path from 'node:path';
import * as os from 'node:os';

export const EXTENSION_ID = 'cubha.claudepulse';
export const EXTENSION_NAME = 'Claudepulse';

export const COMMANDS = {
  openDashboard: 'claudepulse.openDashboard',
  refresh: 'claudepulse.refresh'
} as const;

export const VIEW_IDS = {
  sidebar: 'claudepulse.sidebar'
} as const;

export const CONFIG_KEYS = {
  credentialsPath: 'claudepulse.credentialsPath',
  pollIntervalMs: 'claudepulse.pollIntervalMs',
  utilizationWarnThreshold: 'claudepulse.utilizationWarnThreshold'
} as const;

export const DEFAULT_CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

/** 5분 기본 폴링 간격 */
export const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** 80% 초과 시 경고 */
export const DEFAULT_WARN_THRESHOLD = 0.8;
