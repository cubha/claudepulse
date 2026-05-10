import { NotificationType, RequestType } from 'vscode-messenger-common';
import type { RateLimitSnapshot } from '../types';

/** Request: webview → extension. 현재 Rate Limit 스냅샷 요청. */
export const GetRateLimit: RequestType<void, RateLimitSnapshot> = {
  method: 'getRateLimit'
};

/** Notification: extension → webview. 새 스냅샷 푸시. */
export const PushRateLimit: NotificationType<RateLimitSnapshot> = {
  method: 'pushRateLimit'
};

/** Notification: webview → extension. 즉시 폴링 요청. */
export const RequestRefresh: NotificationType<void> = {
  method: 'requestRefresh'
};
