// Rate Limit 대시보드 도메인 모델 — Anthropic /v1/messages 응답 헤더 기반

/** 단일 rate limit 윈도우 (5h 또는 7d) 상태. */
export interface UnifiedWindow {
  /** 0.0 ~ 1.0 사용률 */
  utilization: number;
  /** 재설정 시각 */
  resetAt: Date;
  /** 재설정까지 남은 ms */
  msUntilReset: number;
  /** API 상태값 */
  status: 'allowed' | 'allowed_warning' | 'blocked';
}

/** Webview ↔ Extension 메시지 페이로드. */
export interface RateLimitSnapshot {
  fiveHour: UnifiedWindow;
  sevenDay: UnifiedWindow;
  /** 종합 상태 (worst-case) */
  overallStatus: 'allowed' | 'allowed_warning' | 'blocked';
  generatedAt: Date;
}

/** ~/.claude/.credentials.json 파싱 결과. */
export interface ClaudeCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
}

/** 폴러 오류 상태 — 웹뷰 로그인 UI 분기용. */
export type PollerError = 'credentials_missing' | 'token_expired' | 'network_error';
