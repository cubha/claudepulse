import { Messenger } from 'vscode-messenger';
import type { RateLimitSnapshot } from '../types';
import { GetRateLimit, RequestLogin, RequestRefresh } from './contracts';

export function registerHandlers(
  messenger: Messenger,
  getSnapshot: () => RateLimitSnapshot | null,
  onRefresh: () => void,
  onLogin: () => void
): void {
  messenger.onRequest(GetRateLimit, () => {
    const snap = getSnapshot();
    if (!snap) throw new Error('not_ready');
    return snap;
  });
  messenger.onNotification(RequestRefresh, () => { void onRefresh(); });
  messenger.onNotification(RequestLogin, () => { onLogin(); });
}
