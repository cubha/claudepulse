import { NotificationType, RequestType } from 'vscode-messenger-common';
import type { AgentProvider, CodexRateLimitSnapshot, PollHistoryPoint, ProviderAvailability, RateLimitSnapshot, RetroSummary, UsageSummary } from '../types';

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

/** Notification: webview → extension. 로그인 터미널 열기 요청(Claude — `claude auth login`). */
export const RequestLogin: NotificationType<void> = {
  method: 'requestLogin'
};

/** Notification: webview → extension. 로그인 터미널 열기 요청(Codex — `codex login`, v0.2.0 ST7). */
export const RequestLoginCodex: NotificationType<void> = {
  method: 'requestLoginCodex'
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

/**
 * Notification: extension → webview. 회고 요약 push (2026-06-29).
 *
 * 회고도 형제 섹션(usage)과 동일하게 push로 전달한다. pull-전용(GetRetroSummary)은
 * 락다운 환경에서 webview→extension 요청 라운드트립이 불발하면 "수집 중" 영구 고착했다.
 * push는 PushUsageSummary와 동일 BROADCAST 경로(검증됨)를 재사용. GetRetroSummary는 fallback 유지.
 * ⚠️ extension은 DashboardPanel이 열렸을 때만 build+push한다(닫힌 동안 백그라운드 git 셸아웃 금지).
 */
export const PushRetroSummary: NotificationType<RetroSummary | null> = {
  method: 'pushRetroSummary'
};

/**
 * Notification: webview → extension. 사이드바 📁 워크스페이스 칩 클릭 — 세션 선택기(QuickPick)를
 * 연다(v0.1.51). 결과(선택된 세션 고정 또는 취소)는 기존 PushUsageSummary 브로드캐스트로 반영된다
 * — 별도 응답 계약을 만들지 않는다(RequestRefresh와 동일 패턴).
 */
export const RequestOpenSessionPicker: NotificationType<void> = {
  method: 'requestOpenSessionPicker'
};

/**
 * Notification: webview → extension. 고정(pin)된 세션이 stale해졌을 때 사이드바에 뜨는
 * "자동 모드로 되돌리기" 링크 클릭(v0.1.51). 결과는 PushUsageSummary로 반영.
 */
export const RequestClearPinnedSession: NotificationType<void> = {
  method: 'requestClearPinnedSession'
};

/**
 * Notification: webview → extension. 사이드바 프로바이더 스위처 전환 요청(ST7).
 * extension이 activeProvider를 바꾸고 즉시 캐시된 요약(재계산 없이)을 재푸시한다.
 */
export const RequestSetProvider: NotificationType<AgentProvider> = {
  method: 'requestSetProvider'
};

/** Request: webview → extension. 현재 활성 프로바이더 조회(초기 로드). */
export const GetActiveProvider: RequestType<void, AgentProvider> = {
  method: 'getActiveProvider'
};

/** Notification: extension → webview. 활성 프로바이더 변경 브로드캐스트. */
export const PushActiveProvider: NotificationType<AgentProvider> = {
  method: 'pushActiveProvider'
};

/** Request: webview → extension. 양 프로바이더 3단 빈 상태 판정 조회(초기 로드). */
export const GetProviderAvailability: RequestType<void, ProviderAvailability> = {
  method: 'getProviderAvailability'
};

/** Notification: extension → webview. 양 프로바이더 판정 브로드캐스트(설치·로그인 상태 변화 시). */
export const PushProviderAvailability: NotificationType<ProviderAvailability> = {
  method: 'pushProviderAvailability'
};

/** Request: webview → extension. 현재 Codex 한도 스냅샷 조회(초기 로드, GetRateLimit의 Codex 대응). */
export const GetCodexRateLimit: RequestType<void, CodexRateLimitSnapshot | null> = {
  method: 'getCodexRateLimit'
};

/**
 * Notification: extension → webview. Codex 한도 스냅샷 푸시(ST5/ST7).
 * `PushRateLimit`(Claude 전용)과 별도 채널 — activeProvider==='codex'일 때만 의미 있는 값이 온다.
 * null = rate_limits 자체가 세션에 없음(free 플랜 일부·API key 모드, D9) → 게이지 섹션 숨김 신호.
 */
export const PushCodexRateLimit: NotificationType<CodexRateLimitSnapshot | null> = {
  method: 'pushCodexRateLimit'
};

/**
 * Request: webview → extension. Codex 버킷별 사용률 이력 조회(v0.2.3 — Claude의 GetPollHistory 대응).
 *
 * 왜 필요한가: 이력이 없으면 소모율을 계산할 수 없는데, 웹뷰마다 따로 쌓으면 **열린 시점이
 * 다른 만큼 쌓인 양이 다르고 그래서 같은 버킷의 소모율이 화면마다 달라진다**(사이드바는 활성화
 * 때부터, 대시보드는 사용자가 열 때부터). 확장이 이력을 소유하고 웹뷰는 열릴 때 그것을 받아
 * 출발한다 — Claude가 snapshotHistory + GetPollHistory로 이미 쓰는 구조 그대로다.
 */
export const GetCodexPollHistory: RequestType<void, import('../webview/codexBucketHistory').CodexBucketHistoryPoint[]> = {
  method: 'getCodexPollHistory'
};

/**
 * Notification: extension → webview. VS Code 테마 변경 브로드캐스트(v0.2.3 R5).
 * 값은 body에 붙일 클래스명('theme-dark' | 'theme-light', themeClass.ts가 정한다).
 *
 * HTML shell을 다시 만들지 않고 클래스만 토글하는 이유: shell 재생성은 웹뷰를 처음부터
 * 다시 그려 차트 인스턴스·수집된 폴링 이력·열려 있던 탭 상태를 전부 날린다. 테마를 바꿨을
 * 뿐인데 "수집 중"으로 되돌아가는 화면은 버그로 읽힌다. provider-codex 클래스와 같은 경로다.
 */
export const PushTheme: NotificationType<string> = {
  method: 'pushTheme'
};

/**
 * webview(사이드바·패널)가 BROADCAST로 수신해야 하는 알림 method 목록.
 *
 * ⚠️ vscode-messenger 계약: registerWebviewView/Panel의 broadcastMethods에 등재된
 * method만 BROADCAST 알림이 webview에 전달된다(미등재 시 onNotification 핸들러는 死).
 * → 두 등록 지점이 이 단일 상수를 공유해 드리프트(특정 push 누락 재발)를 차단한다.
 *
 * 회귀 근거: PushUsageSummary 누락으로 usage 카드(모델/캐시/스킬/일별/회고)가 push 갱신을
 * 못 받아 뷰 오픈 1회 pull로만 채워졌고, 그 pull이 refreshUsage보다 빠르면 placeholder 영구 고착됐다.
 */
export const WEBVIEW_BROADCAST_METHODS: string[] = [
  PushRateLimit.method,
  PushPollerError.method,
  PushLang.method,
  PushUsageSummary.method,
  PushRetroSummary.method,
  PushActiveProvider.method,
  PushProviderAvailability.method,
  PushCodexRateLimit.method,
  PushTheme.method,
];
