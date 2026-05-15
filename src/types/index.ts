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

/** 플랜 정보 (credentials.json 기반). */
export interface PlanInfo {
  subscriptionType: string;  // e.g. "max"
  rateLimitTier: string;     // e.g. "default_claude_max_5x"
  organizationUuid?: string;
}

/** 추가 사용량(overage) 윈도우 상태. */
export interface OverageWindow {
  status: 'allowed' | 'rejected';
  utilization: number;       // 0.0 ~ 1.0
  disabledReason?: string;
}

/** Fallback(속도 제한) 정보. */
export interface FallbackInfo {
  available: 'available' | 'unavailable';
  percentage?: number;       // e.g. 0.5 = 50% 속도
}

/** Webview ↔ Extension 메시지 페이로드. */
export interface RateLimitSnapshot {
  fiveHour: UnifiedWindow;
  sevenDay: UnifiedWindow;
  /** 종합 상태 (worst-case) */
  overallStatus: 'allowed' | 'allowed_warning' | 'blocked';
  generatedAt: Date;
  /** 플랜 정보 (credentials에 있을 때만) */
  plan?: PlanInfo;
  /** Overage(추가 사용량) 상태 */
  overage?: OverageWindow;
  /** Fallback(속도 축소) 상태 */
  fallback?: FallbackInfo;
  /** 현재 병목 윈도우 */
  representativeClaim?: 'five_hour' | 'seven_day';
  /** 7d 임계값 돌파 시 해당 임계값 (0.0~1.0) */
  sevenDaySurpassedThreshold?: number;
  /** 이용 가능한 업그레이드 경로 목록 */
  upgradePaths?: string[];
}

/** ~/.claude/.credentials.json 파싱 결과. */
export interface ClaudeCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
  subscriptionType?: string;
  rateLimitTier?: string;
  organizationUuid?: string;
}

/** 폴러 오류 상태 — 웹뷰 로그인 UI 분기용. */
export type PollerError = 'credentials_missing' | 'token_expired' | 'network_error';
