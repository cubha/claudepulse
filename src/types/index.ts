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

// ─────────────────────────────────────────────────────────────
// jsonl 파싱 도메인 모델 (v0.0.5+)
// ─────────────────────────────────────────────────────────────

/** jsonl assistant 엔트리의 usage 필드 서브셋. */
export interface JournalUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

/** dedup+비용 계산 후 남은 단일 assistant 레코드. */
export interface SessionRecord {
  messageId: string;    // message.id (cross-file dedup 키)
  requestId: string;    // requestId (스트리밍 dedup 키)
  sessionId: string;
  model: string;
  timestamp: string;    // ISO8601
  cwd: string;
  usage: JournalUsage;
  costUsd: number;      // LiteLLM 기반 계산값
}

/** 하루 집계 (UTC 날짜 기준). */
export interface DailyUsage {
  date: string;         // YYYY-MM-DD UTC
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  cacheHitRate: number; // 일별 캐시 히트율 (0.0~1.0, 일별 트렌드용)
}

/** 세션 집계 (sessionId 기준). */
export interface SessionSummary {
  sessionId: string;
  startTime: string;    // ISO8601 (첫 레코드 timestamp)
  cwd: string;
  totalTokens: number;
  costUsd: number;
  messageCount: number;
}

/** 모델별 사용량 분해 (오늘 기준). */
export interface ModelBreakdown {
  model: string;
  tokens: number;
  costUsd: number;
  share: number;  // 0.0 ~ 1.0 (비용 기준 비율)
}

/** 캐시 효율 통계. */
export interface CacheStats {
  hitRate: number;    // cache_read / (input + cache_creation + cache_read)
  savedUsd: number;   // cache_read_tokens × (input_price - cache_read_price) / 1M
}

/** Webview로 전달하는 전체 사용량 요약. */
export interface UsageSummary {
  today: DailyUsage;
  last7Days: DailyUsage[];
  recentSessions: SessionSummary[];  // 최근 20개
  modelBreakdown: ModelBreakdown[];  // 오늘 모델별 집계
  cacheStats: CacheStats;            // 오늘 캐시 효율
  generatedAt: string;               // ISO8601
}
