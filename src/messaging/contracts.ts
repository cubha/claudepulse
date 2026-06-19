import { NotificationType, RequestType } from 'vscode-messenger-common';
import type { PollHistoryPoint, RateLimitSnapshot, RetroSummary, UsageSummary } from '../types';

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

/** Notification: extension → webview. 폴러 오류 상태 푸시. */
export const PushPollerError: NotificationType<import('../types').PollerError> = {
  method: 'pushPollerError'
};

/** Notification: webview → extension. 로그인 터미널 열기 요청. */
export const RequestLogin: NotificationType<void> = {
  method: 'requestLogin'
};

/** Notification: webview → extension. 대시보드 패널 열기 요청. */
export const RequestOpenDashboard: NotificationType<void> = {
  method: 'requestOpenDashboard'
};

/** Notification: webview → extension. claude.ai 사용 크레딧 설정 페이지 열기 요청. */
export const RequestOpenBillingSettings: NotificationType<void> = {
  method: 'requestOpenBillingSettings'
};

/** Notification: webview → extension. 언어 변경 요청 (언어 코드: 'ko'|'en'|'ja'|'zh'). */
export const RequestSetLang: NotificationType<string> = {
  method: 'requestSetLang'
};

/** Request: webview → extension. 현재 저장된 언어 코드 조회. */
export const GetLang: RequestType<void, string> = {
  method: 'getLang'
};

/** Notification: extension → webview. 언어 변경 브로드캐스트. */
export const PushLang: NotificationType<string> = {
  method: 'pushLang'
};

/** Request: webview → extension. 폴링 히스토리 요청 (대시보드 첫 오픈 시 pre-hydrate용). */
export const GetPollHistory: RequestType<void, PollHistoryPoint[]> = {
  method: 'getPollHistory'
};

/** Request: webview → extension. 현재 사용량 요약 요청. */
export const GetUsageSummary: RequestType<void, UsageSummary | null> = {
  method: 'getUsageSummary'
};

/** Notification: extension → webview. 새 사용량 요약 푸시. */
export const PushUsageSummary: NotificationType<UsageSummary> = {
  method: 'pushUsageSummary'
};

/**
 * Request: webview → extension. usage×git 회고 요약 요청 (v0.1.37).
 * 회고 뷰 오픈/갱신 시 lazy 호출 — git log는 HEAD SHA로 캐시됨.
 */
export const GetRetroSummary: RequestType<void, RetroSummary | null> = {
  method: 'getRetroSummary'
};
