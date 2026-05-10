import { NotificationType, RequestType } from 'vscode-messenger-common';
import type { SnapshotPayload } from '../types';

/** Request: webview → extension. 현재 스냅샷 요청. */
export const GetSnapshot: RequestType<{ range: 'today' | '7d' | '30d' | 'mtd' }, SnapshotPayload> = {
  method: 'getSnapshot'
};

/** Notification: extension → webview. 새 스냅샷 푸시. */
export const PushSnapshot: NotificationType<SnapshotPayload> = {
  method: 'pushSnapshot'
};

/** Notification: webview → extension. 사용자가 새로고침 요청. */
export const RequestRefresh: NotificationType<void> = {
  method: 'requestRefresh'
};
