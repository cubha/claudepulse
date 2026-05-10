import { NotificationType, RequestType } from 'vscode-messenger-common';
import type { SessionDetail, SessionSummary, SnapshotPayload } from '../types';

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

/** Request: webview → extension. 30일 세션 목록 요청. */
export const GetSessions: RequestType<{ range: '7d' | '30d' | 'all' }, SessionSummary[]> = {
  method: 'getSessions'
};

/** Request: webview → extension. 세션 상세 (드릴다운) 요청. */
export const GetSessionDetail: RequestType<{ sessionId: string }, SessionDetail | null> = {
  method: 'getSessionDetail'
};
