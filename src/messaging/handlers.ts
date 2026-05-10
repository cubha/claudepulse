import { Messenger } from 'vscode-messenger';
import type { RateLimitSnapshot } from '../types';
import { GetRateLimit, RequestRefresh } from './contracts';

export function registerHandlers(
  messenger: Messenger,
  getSnapshot: () => RateLimitSnapshot | null,
  onRefresh: () => void
): void {
  messenger.onRequest(GetRateLimit, () => {
    const snap = getSnapshot();
    if (!snap) {
      // 첫 폴링 전 또는 실패 상태 — null을 반환하면 webview가 loading/error UI를 표시
      throw new Error('not_ready');
    }
    return snap;
  });
  messenger.onNotification(RequestRefresh, () => { void onRefresh(); });
}
