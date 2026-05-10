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
  claudeProjectsPath: 'claudepulse.claudeProjectsPath',
  costAlertThresholdUsd: 'claudepulse.costAlertThresholdUsd',
  refreshDebounceMs: 'claudepulse.refreshDebounceMs'
} as const;

export const DEFAULT_CLAUDE_PROJECTS_PATH = path.join(os.homedir(), '.claude', 'projects');

export const CACHE_FILES = {
  fileIndex: 'file-index.json',
  aggregateCache: 'cache-v1.json'
} as const;
