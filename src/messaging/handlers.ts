import { Messenger } from 'vscode-messenger';
import type { RateLimitSnapshot, UsageSummary } from '../types';
import { GetRateLimit, GetUsageSummary, RequestLogin, RequestRefresh } from './contracts';

export function registerHandlers(
  messenger: Messenger,
  getSnapshot: () => RateLimitSnapshot | null,
  getUsageSummary: () => UsageSummary | null,
  onRefresh: () => void,
  onLogin: () => void
): void {
  messenger.onRequest(GetRateLimit, () => {
    const snap = getSnapshot();
    if (!snap) throw new Error('not_ready');
    return snap;
  });
  messenger.onRequest(GetUsageSummary, () => getUsageSummary());
  messenger.onNotification(RequestRefresh, () => { void onRefresh(); });
  messenger.onNotification(RequestLogin, () => { onLogin(); });
}
