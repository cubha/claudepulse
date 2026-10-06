import type { PricingSource } from '../utils/pricing';
import type { AgentProvider } from '../sources/recordKey';
import type { AgentAvailability } from '../sources/AgentSource';
import type { RateLimitBucket } from '../sources/codex/codexRollout';
export type { PricingSource };
export type { AgentProvider };
export type { AgentAvailability };
export type { RateLimitBucket };

/**
 * Codex 한도 스냅샷(v0.2.0, ST5/ST7) — `RateLimitSnapshot`(Claude, 고정 fiveHour/sevenDay +
 * overage/fallback/plan)과 **의도적으로 분리**했다. Codex는 버킷 개수·기간이 플랜별로 가변이고
 * (D9: free=단일 30일, 유료=5h+7d) overage·fallback 개념 자체가 없다 — 억지로 같은 타입에
 * 끼워 맞추면 Claude 전용 필드가 Codex에서 항상 undefined인 반쪽 타입이 된다.
 * `buckets: []`는 "값 없음"이 아니라 **게이지 섹션을 숨기라는 신호**다(extractRateLimitBuckets 계약,
 * PLAN §8 불변식3 "빈 값과 0 값을 같게 그리지 않는다").
 */
export interface CodexRateLimitSnapshot {
  buckets: RateLimitBucket[];
  planType: string | null;
  generatedAt: string;
  /**
   * 최근 관측된 `model_context_window`(v0.2.0, verify-impl B-V2/B-V6 보완) — Codex CLI가
   * `token_count` 라인에 함께 실어 보내는 실측치. buckets와 별개 latest-wins 스캔(codex는 이
   * 값이 없는 구버전도 있어 null 허용) — 없으면 UI가 그 행을 숨긴다(빈 값≠0 원칙).
   */
  modelContextWindow: number | null;
}

/** 양 프로바이더의 3단 빈 상태 판정 묶음(ST7/ST8) — 스위처가 "이 프로바이더로 전환 가능한가"를 안다. */
export interface ProviderAvailability {
  claude: AgentAvailability;
  codex: AgentAvailability;
}

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
  status: 'allowed' | 'allowed_warning' | 'danger' | 'blocked';
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
  overallStatus: 'allowed' | 'allowed_warning' | 'danger' | 'blocked';
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

/**
 * 폴러 오류 상태 — 웹뷰 로그인 UI 분기용.
 * - token_stale: accessToken은 만료됐으나 refreshToken 보유 → CLI 실행 시 자동 갱신되는 회복 가능 상태(로그아웃 아님).
 * - token_expired: refreshToken도 없음 → 실제 재로그인 필요.
 */
export type PollerError = 'credentials_missing' | 'token_stale' | 'token_expired' | 'network_error';

// ─────────────────────────────────────────────────────────────
// jsonl 파싱 도메인 모델 (v0.0.5+)
// ─────────────────────────────────────────────────────────────

/** jsonl assistant 엔트리의 usage 필드 서브셋. */
export interface JournalUsage {
  input_tokens: number;
  output_tokens: number;
  /** 캐시 생성 토큰 합계 (5m + 1h) — 집계 토큰 카운트용. */
  cache_creation_input_tokens: number;
  /** 5m TTL 캐시 생성 토큰 (요율 input × 1.25). usage.cache_creation.ephemeral_5m_input_tokens */
  cache_creation_5m_input_tokens: number;
  /** 1h TTL 캐시 생성 토큰 (요율 input × 2.0). usage.cache_creation.ephemeral_1h_input_tokens */
  cache_creation_1h_input_tokens: number;
  cache_read_input_tokens: number;
  /** usage.service_tier — 'standard' | 'batch' | 'priority' 등. batch 시 비용 −50%. */
  serviceTier?: string;
  /** usage.server_tool_use.web_search_requests — 건당 $0.01 별도 과금(WEB_SEARCH_USD_PER_REQUEST). */
  webSearchRequests?: number;
}

/** dedup+비용 계산 후 남은 단일 assistant 레코드. */
export interface SessionRecord {
  /**
   * 이 레코드를 만든 에이전트(v0.2.0). 생략 시 'claude' — 기존 픽스처·저장 인덱스가 전부
   * Claude이므로 옵셔널로 두어 마이그레이션 없이 호환한다(contextTokens와 같은 방식).
   * 소비측은 `record.provider ?? 'claude'`로 읽는다.
   */
  provider?: AgentProvider;
  /**
   * dedup 키. Claude는 `message.id` 원본 그대로(§3#1, 키가 바뀌면 저장 인덱스와 어긋난다),
   * 그 외 프로바이더는 `makeRecordKey`가 네임스페이스를 붙인다(`src/sources/recordKey.ts`).
   */
  messageId: string;
  requestId: string;    // requestId (스트리밍 dedup 키)
  sessionId: string;
  model: string;
  timestamp: string;    // ISO8601
  cwd: string;
  gitBranch: string;    // jsonl entry.gitBranch (없으면 빈 문자열)
  usage: JournalUsage;
  costUsd: number;      // LiteLLM 기반 계산값
  toolCounts: ToolUseCounts;  // 이 메시지의 도구 사용 카운트
  editedFiles: string[];      // Edit/Write 도구의 file_path 목록
  attributionSkill?: string;  // jsonl entry.attributionSkill (스킬 귀속, 없으면 미정의)
  isSidechain: boolean;       // jsonl entry.isSidechain (서브에이전트 소비 여부)
  agentId?: string;           // jsonl entry.agentId (서브에이전트 식별자)
  attributionAgent?: string;  // jsonl entry.attributionAgent (서브에이전트 타입 — 사이드체인에만 의미, v0.2.5b)
  mcpServerCounts?: Record<string, number>;  // mcp__<server>__<tool> 서버별 호출수 (MCP 호출 없으면 미정의)
  /**
   * Codex 전용 추론 토큰(v0.2.0, verify-impl B-V2 보완) — `usage.reasoning_output_tokens`,
   * Claude jsonl에는 대응 필드가 없어 항상 미정의. UsageAggregator가 today 스코프로 합산해
   * `UsageSummary.todayReasoningTokens`에 싣는다(Claude는 합산에 기여 없이 0 유지 — 무행위변경).
   */
  reasoningTokens?: number;
  /**
   * 이 레코드 시점의 실제 컨텍스트 창 점유량(S2, 2026-08-03) — 과금용 usage 합계와 다르다.
   * top-level usage는 한 assistant 턴 안 여러 API 호출(iterations)의 **합산값**이라, 컨텍스트
   * 크기로 쓰면 최대 2× 과대계산된다(reference_jsonl_new_fields_2026h1 실측). iterations가 있으면
   * advisor_message를 제외한 마지막 message iteration의 input+cache_read+cache_creation 합.
   * 옵셔널: JsonlParser가 파싱한 실 레코드는 항상 채워지고, 손으로 만든 테스트 픽스처는 생략 시
   * usage 합계로 폴백(UsageAggregator 소비부)한다 — 기존 테스트 파일 대량 수정 회피.
   */
  contextTokens?: number;
  /**
   * 프롬프트 캐시 미스 원인(v0.2.6) — `message.diagnostics.cache_miss_reason`. `missedTokens`는
   * messages/model/system_changed에만 기록되고 previous_message_not_found·unavailable에는 없다
   * (실측 78%) — 그때는 **null(미상)**이지 0이 아니다(v0.1.55 거짓초록).
   */
  cacheMiss?: CacheMissInfo;
  /** `usage.output_tokens_details.thinking_tokens`(v0.2.6) — output_tokens에 **포함된** 값. 별도 과금 금지. */
  thinkingTokens?: number;
  /** top-level `effort`(v0.2.6) — 유효 effort. `perTurnEffort`는 턴 오버라이드라 대부분 null이어서 쓰지 않는다. */
  effort?: string;
}

/** 캐시 미스 원인 1건(v0.2.6). */
export interface CacheMissInfo {
  reason: string;
  /** 놓친 캐시 토큰. 원인이 토큰을 기록하지 않으면 null(미상). */
  missedTokens: number | null;
}

/**
 * jsonl의 비-assistant 이벤트(v0.2.6 ST1) — 사용량 레코드(SessionRecord)와 별개 채널.
 * `eventKey`는 파일 간 dedup 키: uuid가 있으면 uuid, pr-link는 uuid가 없어 `pr:<repo>#<n>@<session>`.
 */
export type JournalEvent =
  | { kind: 'turn_duration'; eventKey: string; sessionId: string; timestamp: string; isSidechain: boolean; durationMs: number; messageCount: number }
  | { kind: 'stop_hooks'; eventKey: string; sessionId: string; timestamp: string; isSidechain: boolean; hooks: Array<{ command: string; durationMs: number }>; errorCount: number; preventedContinuation: boolean }
  | { kind: 'compact'; eventKey: string; sessionId: string; timestamp: string; isSidechain: boolean; trigger: string; preTokens: number; postTokens: number; durationMs: number }
  | { kind: 'pr_link'; eventKey: string; sessionId: string; timestamp: string; prNumber: number; prUrl: string; prRepository: string }
  | { kind: 'api_error'; eventKey: string; sessionId: string; timestamp: string; isSidechain: boolean; status: number; error: string; quota?: QuotaRejection };

/** 429 레코드의 `quotaLimits`(v0.2.6) — 어떤 창이 언제 풀리는지. */
export interface QuotaRejection {
  status: string;
  rateLimitType: string;
  /** unix 초 */
  resetsAt: number;
  overageStatus?: string;
  overageDisabledReason?: string;
}

// ─────────────────────────────────────────────────────────────
// v0.2.6 신호(Claude 전용) — src/services/signals/*.ts 순수 함수의 산출물
// ─────────────────────────────────────────────────────────────

/** 캐시 미스 원인 1행. 토큰을 기록하지 않는 원인은 missedTokens·estCostUsd가 null(미상). */
export interface CacheMissReasonRow {
  reason: string;
  count: number;
  missedTokens: number | null;
  /** 놓친 토큰이 읽기 대신 쓰기로 과금된 추가분(추정). 토큰 미상이거나 전부 가격 미상이면 null. */
  estCostUsd: number | null;
  hasUnpricedRecords: boolean;
}

export interface CacheMissBreakdown {
  /** 건수 내림차순 */
  reasons: CacheMissReasonRow[];
  missCount: number;
  /** 분모 — 기간 안 Claude 레코드 수 */
  recordCount: number;
  /** 가격·토큰을 아는 미스의 추정 비용 합 */
  estCostUsd: number;
  /** 토큰을 기록하지 않는 원인이 하나라도 있으면 true — 합계가 하한값이라는 뜻 */
  hasUnknownTokens: boolean;
}

/** 오늘 thinking 비중(v0.2.6 ST3). 분모 = thinking 필드가 있는 레코드의 output. */
export interface ThinkingShare {
  thinkingTokens: number;
  outputTokens: number;
  share: number;
}

/** 한도 차단 에피소드 — 같은 (창, 해제시각)의 429 재시도를 한 사건으로 묶는다(v0.2.6 ST4). */
export interface RateLimitBlockEpisode {
  rateLimitType: string;
  /** unix 초 */
  resetsAt: number;
  firstAt: string;
  lastAt: string;
  rejectedCount: number;
  overageDisabledReason?: string;
}

export interface RateLimitBlockHistory {
  /** firstAt 내림차순 */
  episodes: RateLimitBlockEpisode[];
  /** quotaLimits 없는 429 — 어느 창인지 몰라 에피소드로 만들지 않는다 */
  unclassified429: number;
  /** 5xx 서버 오류(529 overloaded 등) — 한도 차단이 아니다 */
  serverErrors: { count: number; lastAt: string | null; byStatus: Record<number, number> };
}

/** PR 1개의 비용(v0.2.6 ST5) — pr-link로 연결된 세션의 레코드 합(세션 단위 근사). */
export interface PrCostRow {
  prRepository: string;
  prNumber: number;
  prUrl: string;
  costUsd: number;
  totalTokens: number;
  sessionCount: number;
  /** 다른 PR에도 연결된 세션 수 — 0이 아니면 PR 간 합계가 이중계산된다 */
  sharedSessionCount: number;
  firstLinkedAt: string;
  hasUnpricedRecords: boolean;
}

/** 현재 컨텍스트 세션의 압축 이력(v0.2.6 ST6). */
export interface CompactionInfo {
  count: number;
  autoCount: number;
  last: { at: string; trigger: string; preTokens: number; postTokens: number };
}

/** 턴 지연·훅 오버헤드(v0.2.6 ST8) — 최근 7일(UTC 일 단위, 오늘 포함). */
export interface TurnHookStats {
  turnCount: number;
  totalTurnMs: number;
  medianMs: number | null;
  p90Ms: number | null;
  maxMs: number | null;
  /** 오래된 날 → 오늘, 7칸. 턴 없는 날은 medianMs=null */
  daily: Array<{ date: string; count: number; medianMs: number | null }>;
  /** 스크립트 표시명별(경로 제거), totalMs 내림차순 */
  hooks: Array<{ name: string; totalMs: number; count: number; avgMs: number }>;
  hookTotalMs: number;
  /** 턴(Stop 훅 실행) 1회당 평균 훅 시간. 훅 실행이 없으면 null */
  avgHookMsPerTurn: number | null;
  /**
   * avgHookMsPerTurn / medianMs — "보통 턴"에서 훅이 차지하는 비율. 벽시계 합계 대비(hookTotalMs/
   * totalTurnMs)로 재지 않는 이유: 턴 시간은 승인 대기 등을 포함한 벽시계라 33시간짜리 이상치가 있다
   * (30일 실측 — 합계 대비 0.21%, 중앙값 기준 1.5%). 둘 중 하나라도 없으면 null.
   */
  hookShare: number | null;
  hookErrorCount: number;
}

/** effort별 사용량(v0.2.6 ST7) — `effort` 기준, 비용 내림차순, share 분모 = 스코프 총비용. */
export interface EffortUsage {
  effort: string;
  costUsd: number;
  totalTokens: number;
  share: number;
  hasUnpricedRecords: boolean;
}

/** effort 필드가 없는 레코드(구버전 CLI·Codex 등) — 숨기면 거짓 정밀도. */
export interface EffortUnattributed {
  costUsd: number;
  totalTokens: number;
  share: number;
  hasUnpricedRecords: boolean;
}

/** extension이 Claude 요약에 붙이는 신호 묶음(v0.2.6). Codex 요약에는 없다. */
export interface ClaudeSignals {
  cacheMiss: CacheMissBreakdown;
  rateLimitBlocks: RateLimitBlockHistory;
  prCosts: PrCostRow[];
  compaction: CompactionInfo | null;
  turnHooks: TurnHookStats;
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
  lastActivity: string;   // ISO8601 (마지막 레코드 timestamp) — 세션 선택기 최근활동순 정렬용
  model: string;          // 마지막 레코드의 모델 — 세션 선택기 모델 배지용
  contextTokens: number;  // 마지막 레코드의 컨텍스트 점유량(resolveContextTokens, 누적 아님) — 세션 선택기 토큰/윈도 표기용
  branch: string;         // 마지막 레코드의 gitBranch — 세션 선택기 표시용
  /**
   * 이 세션에 기여한 레코드 중 가격표에 없는(pricingSource='none') 모델이 하나라도 있으면 true.
   * costUsd===0이 "실측 0"인지 "가격 미상이라 계산 불가"인지 fmtCost는 구분 못한다(v0.1.55
   * 거짓초록 부류) — UI가 이 플래그로 0을 "미상"으로 표시할지 판단한다. today.unpricedModels와
   * 달리 세션은 today 스코프가 아니라서(recentSessions=최근 20개, 날짜 무관) 그 필드로 대체 불가.
   */
  hasUnpricedRecords: boolean;
}

/**
 * 세션 선택기(QuickPick) 후보 항목 — SessionSummary + 정밀 컨텍스트 윈도 정보.
 * maxWindow/ratio는 UsageAggregator가 sessionContext와 동일한 분모 3단 계단(S1: 관측증명→
 * claude.json→200K 테이블)으로 미리 계산해 넣는다 — 선택 전(목록)과 선택 후(게이지)의 ratio가
 * 서로 달라 보이는 걸 방지한다(sessionPicker.ts는 이 값을 재계산하지 않고 그대로 소비).
 */
export interface ContextSessionSummary extends SessionSummary {
  maxWindow: number;
  ratio: number;
}

/** 모델 share를 무엇으로 재는가. 가격 미상 모델이 섞이면 비용 비율이 거짓이 되어 토큰으로 바꾼다. */
export type ModelShareBasis = 'cost' | 'tokens';

/** 모델별 사용량 분해 (오늘 기준). */
export interface ModelBreakdown {
  model: string;
  tokens: number;
  costUsd: number;
  /**
   * 0.0 ~ 1.0. 기준은 UsageSummary.modelShareBasis — 전 모델의 가격을 알면 비용, 하나라도
   * 모르면 토큰이다. **행마다 다른 기준을 쓰지 않는다**(합이 1이 되어야 하므로).
   */
  share: number;
  /**
   * 이 행의 비용이 어디서 나왔나. 'none'이면 costUsd는 계측값이 아니라 **미상**이다 —
   * UI는 0을 측정치처럼 그리면 안 된다(v0.1.55 거짓초록 부류).
   */
  pricingSource: PricingSource;
}

/** 캐시 효율 통계. */
export interface CacheStats {
  hitRate: number;    // cache_read / (input + cache_creation + cache_read)
  savedUsd: number;   // cache_read_tokens × (input_price - cache_read_price) / 1M
}

/** 도구 사용 카운트. */
export interface ToolUseCounts {
  edit: number;
  write: number;
  bash: number;
  read: number;       // Read
  grep: number;       // Grep + Glob (검색)
  webSearch: number;  // WebSearch + server_tool_use.web_search_requests
  webFetch: number;   // WebFetch + server_tool_use.web_fetch_requests
  mcp: number;        // mcp__* 도구 그룹
  other: number;      // Task/Skill/Agent 등 기타
}

/** 일별 도구 사용 집계 (히스토그램용). */
export interface DailyToolStats {
  date: string;  // YYYY-MM-DD
  edit: number;
  write: number;
  bash: number;
  webSearch: number;
}

/** 스킬별 사용량 집계 (attributionSkill 기준, 비용 내림차순). */
export interface SkillUsage {
  skill: string;         // attributionSkill 값
  costUsd: number;       // 누적 비용
  totalTokens: number;   // 누적 토큰
  share: number;         // 0.0 ~ 1.0 (귀속된 비용 중 비율)
  /** 이 스킬에 기여한 레코드 중 가격표에 없는 모델이 하나라도 있으면 true (SessionSummary와 동일 목적). */
  hasUnpricedRecords: boolean;
}

/**
 * "스킬 외 작업" 1급 버킷 — 활성 스킬(Skill 툴)이 로드되지 않은 동안의 메인체인 작업.
 * 정의: !isSidechain && !attributionSkill. 평문 NL 직접작업 + 스킬 로드 전/후 lead-up 포함.
 * ⚠️ 사이드체인(서브에이전트)은 제외 — subagentStats로 별도 노출(이중계산 금지).
 * 숨기면 거짓 정밀도(attributionSkill 커버리지 실측 ~33%) → 스킬 행과 동등 렌더.
 */
export interface SkillUnattributed {
  costUsd: number;       // 누적 비용
  totalTokens: number;   // 누적 토큰
  /** 이 버킷에 기여한 레코드 중 가격표에 없는 모델이 하나라도 있으면 true. */
  hasUnpricedRecords: boolean;
}

/** 서브에이전트 vs 메인 소비 분리 통계. */
export interface SubagentStats {
  mainCostUsd: number;       // isSidechain=false 비용
  subagentCostUsd: number;   // isSidechain=true 비용
  subagentShare: number;     // 0.0 ~ 1.0 (전체 비용 중 서브에이전트 비중)
  subagentCount: number;     // 고유 agentId 수
  /** mainCostUsd/subagentCostUsd 각각에 가격표에 없는 모델 기여가 있었는지(독립 플래그 — 한쪽만 미상일 수 있음). */
  mainHasUnpriced: boolean;
  subagentHasUnpriced: boolean;
}

/**
 * 서브에이전트 타입별 사용량(v0.2.5b) — 사이드체인 레코드만, `attributionAgent` 기준, 비용 내림차순.
 * share 분모 = 사이드체인 총비용(타입 합계 + 타입 미상 버킷 = SubagentStats.subagentCostUsd).
 */
export interface SubagentTypeUsage {
  agentType: string;
  costUsd: number;
  totalTokens: number;
  runCount: number;      // 이 타입의 고유 agentId 수
  share: number;         // 0.0 ~ 1.0
  hasUnpricedRecords: boolean;
}

/** attributionAgent가 없는 사이드체인 — 숨기면 거짓 정밀도라 1급 버킷으로 노출한다. */
export interface SubagentTypeUnattributed {
  costUsd: number;
  totalTokens: number;
  runCount: number;
  hasUnpricedRecords: boolean;
}

/**
 * MCP 서버별 호출수 집계. 비용이 아닌 **호출 수** 기반 share다(v0.1.48 확정) —
 * 한 assistant 메시지에 MCP·비MCP 도구가 혼재하면 서버별 비용 분해가 원천적으로 불가능하기 때문.
 */
export interface McpServerUsage {
  server: string;       // mcp__<server>__<tool>에서 추출한 서버명
  callCount: number;     // 누적 호출 수
  share: number;         // 0.0 ~ 1.0 (이 스코프의 전체 MCP 호출 수 중 비율)
}

/** 스킬·서브에이전트·MCP attribution 묶음 — 기간 스코프(24h/7d)별로 동일 구조 재사용. */
export interface AttributionScope {
  skillBreakdown: SkillUsage[];
  skillUnattributed: SkillUnattributed;
  subagentStats: SubagentStats;
  subagentTypeBreakdown: SubagentTypeUsage[];
  subagentTypeUnattributed: SubagentTypeUnattributed;
  mcpServerBreakdown: McpServerUsage[];
  effortBreakdown: EffortUsage[];
  effortUnattributed: EffortUnattributed;
}

/**
 * 세션 컨텍스트 점유율(근사치) — aggregate()에 workspaceRoot가 주어지면 records 중 cwd가
 * 그 워크스페이스(또는 하위 디렉토리)인 것만 후보로 스코핑한다(v0.1.50, WorkspaceMapper.
 * cwdMatchesWorkspace와 동일 로직을 src/utils/workspaceMatch.ts로 공유). workspaceRoot
 * 미지정 시(예: VS Code 워크스페이스 미오픈) 기존처럼 cross-project 전체에서 선택한다.
 * 스코핑된 후보 중 timestamp 최댓값 레코드(isSidechain=false만, S3) 1건 기준.
 * 토큰값은 레코드의 contextTokens(S2) — iterations 있으면 마지막 message iteration 기준, top-level
 * usage 합계가 아니다(합산값이라 최대 2× 과대). 세션 전체를 누적합하면 안 되고, 마지막 레코드
 * 1건만 봐야 "현재 점유율"이 된다.
 * 1M 베타 윈도 활성 여부는 jsonl에 기록되지 않지만(S1, 2026-08-03) UsageAggregator가 ①records
 * 전체에서 해당 모델의 관측 최대 컨텍스트가 200K 초과인지(물리적 증명) ②`~/.claude.json`의
 * `[1m]` 흔적을 조합해 판정한다(project_context_gauge_overcount 메모리) — 둘 다 없을 때만 200K
 * 테이블로 폴백. 그래도 근사인 이유(auto-compact 등)는 웹뷰에서 "≈"로 고지.
 */
export interface SessionContextUsage {
  tokens: number;   // 마지막 레코드의 contextTokens(iterations 있으면 마지막 message 기준, 없으면 usage 합)
  model: string;
  maxWindow: number; // 모델 최대 컨텍스트 윈도(토큰) — S1 3단 계단(관측증명→claude.json→테이블) 적용됨
  ratio: number;     // 0.0 ~ 1.0
  cwd: string;       // 마지막 레코드의 작업 디렉토리 전체 경로
  repoName: string;  // path.basename(cwd) — repo 루트가 아닌 하위 디렉토리에서 기동됐으면 실제 repo명이 아닐 수 있음(cwd로 판별)
  timestamp: string; // 이 값이 측정된 레코드의 timestamp(ISO8601, S3) — webview 경과시간 라벨용
  sessionId: string; // 세션 선택기(QuickPick) 하이라이트·pin 매칭용(v0.1.51 세션 선택기)
  mode: 'auto' | 'pinned'; // 'auto' = 후보 풀 내 최신 레코드 자동선택, 'pinned' = 사용자가 고정한 세션
  pinMissing?: boolean;    // pinnedSessionId를 요청했으나 후보 풀에서 찾지 못해 auto로 폴백했음을 신호(호출측이 저장된 pin을 정리하는 트리거)
}

/** 브랜치별 사용량 집계. */
export interface BranchUsage {
  branch: string;        // 브랜치명
  costUsd: number;       // 누적 비용
  totalTokens: number;   // 누적 토큰
  sessionCount: number;  // 세션 수
  lastActive: string;    // 가장 최근 timestamp (ISO8601)
  /** 이 브랜치에 기여한 레코드 중 가격표에 없는 모델이 하나라도 있으면 true (SessionSummary와 동일 목적). */
  hasUnpricedRecords: boolean;
}

/** Webview로 전달하는 전체 사용량 요약. */
export interface UsageSummary {
  today: DailyUsage;
  last7Days: DailyUsage[];
  recentSessions: SessionSummary[];  // 최근 20개
  modelBreakdown: ModelBreakdown[];  // 오늘 모델별 집계 (modelShareBasis 기준 내림차순)
  /**
   * 오늘 관측된 모델 중 가격표에 없어 비용을 계산할 수 없는 것들(pricingSource='none').
   * 비어있지 않으면 today.costUsd·cacheStats.savedUsd·modelBreakdown[].costUsd가 **과소계상**이다.
   * v0.1.54까지 이 사실이 어디에도 드러나지 않아, 현행 세대 모델 미등재로 비용이 실제의 1~2%로
   * 찍히는데도 화면은 정상으로 보였다.
   */
  unpricedModels: string[];
  /**
   * 벤더(Claude Code CLI)가 cost-state에 기록한 비용이 우리 가격표 밴드와 어긋나는 모델(v0.2.5).
   * 비어있지 않으면 해당 모델의 표시 비용이 틀렸다는 뜻이다 — unpricedModels(키 없음)와 달리
   * **키는 있는데 값이 틀린** 부류(v0.2.5 D-A: fable-5-1이 fable-5 단가로 +30~90% 과대계상)를 잡는다.
   * extension이 refresh마다 채운다(집계기는 cost-state를 보지 않는다). 없으면 미검사.
   */
  priceDriftModels?: string[];
  modelShareBasis: ModelShareBasis;
  /**
   * 오늘 추론 토큰 합계(Codex 전용, v0.2.0). Claude 레코드는 `reasoningTokens` 미정의라 항상
   * 0으로 합산돼 기존 Claude 화면에는 영향이 없다(그 필드를 렌더하는 곳이 아직 없다).
   */
  todayReasoningTokens: number;
  /** 오늘 Claude thinking 비중(v0.2.6 ST3). thinking 필드가 하나도 없으면 null. */
  todayThinking: ThinkingShare | null;
  cacheStats: CacheStats;            // 오늘 캐시 효율
  todayToolCounts: ToolUseCounts;    // 오늘 도구 사용 집계
  last7DaysTools: DailyToolStats[];  // 7일 도구 트렌드
  recentEditedFiles: string[];       // 최근 편집 파일 목록 (top 20)
  branchBreakdown: BranchUsage[];    // 브랜치별 비용 집계 (비용 내림차순)
  skillBreakdown: SkillUsage[];      // 스킬별 비용 집계 (비용 내림차순, 전체 스코프)
  skillUnattributed: SkillUnattributed;  // "스킬 외 작업" 1급 버킷 (!isSidechain && !attributionSkill, 전체 스코프)
  subagentStats: SubagentStats;      // 서브에이전트 vs 메인 소비 분리 (전체 스코프)
  subagentTypeBreakdown: SubagentTypeUsage[];          // 서브에이전트 타입별 (전체 스코프, v0.2.5b)
  subagentTypeUnattributed: SubagentTypeUnattributed;  // 타입 미상 사이드체인 버킷
  mcpServerBreakdown: McpServerUsage[];  // MCP 서버별 호출수 집계 (전체 스코프)
  effortBreakdown: EffortUsage[];        // effort별 비용 (전체 스코프, v0.2.6 ST7)
  effortUnattributed: EffortUnattributed;  // effort 필드 없는 레코드 버킷
  attributionScopes: {
    last24h: AttributionScope;
    last7d: AttributionScope;
  };
  activeBranch: string;              // 가장 최근 활성 브랜치명 (사이드바 칩용)
  sessionContext: SessionContextUsage | null;  // 가장 최근 활동 세션의 컨텍스트 점유율(근사치, cross-project 스코프)
  /**
   * 세션 선택기(QuickPick) 후보 목록 — sessionContext와 동일한 workspaceRoots+isSidechain
   * 필터를 거친 세션들을 lastActivity 내림차순으로 그룹핑(v0.1.51). recentSessions와 의도적으로
   * 분리: recentSessions는 cross-project를 유지해야 하는 v0.1.49 계약("매칭 0건" vs "세션 없음"
   * 구분, main.ts 참조)이 있어 스코핑할 수 없다.
   */
  contextSessions: ContextSessionSummary[];
  historicalDays: DailyUsage[];      // CacheStore 전체 이력 (날짜 오름차순)
  generatedAt: string;               // ISO8601
  /** Claude 전용 신호 묶음(v0.2.6) — extension이 refresh마다 붙인다. Codex 요약·구버전 픽스처는 없다. */
  signals?: ClaudeSignals;
}

// ─────────────────────────────────────────────────────────────
// usage×git 회고 뷰 도메인 모델 (v0.1.37)
//
// ⚠️ 포워드 컨트랙트(codex-later): 본 모델은 단일 프로바이더(Claude) 전제.
// PLAN-v0.2.0-codex-provider 착수 시 Codex session_meta가 cwd를 보유하므로
// (회고 join 1차 키 = repo+윈도) Codex 레코드가 Claude 커밋 윈도에 오조인(undercount)된다.
// → 그때 CommitAttributor에 provider 필터를 추가(codex-owned)할 것.
//   지금 provider 파라미터를 선구현하지 않는다(dead param 금지).
// 상세: docs/PLAN-v0.1.37-usage-git-retro-2026-06-18.md §5
// ─────────────────────────────────────────────────────────────

/** git log 1커밋 메타. GitLogReader가 추출, CommitAttributor 입력. */
export interface CommitMeta {
  sha: string;
  committedAt: string;   // ISO8601 (committer date %cI, tz 포함 가능 — Date.parse로 UTC 정규화)
  branch: string;        // 읽은 시점의 현재 브랜치 (근사치 — §2 한계)
  subject: string;
  repoRoot: string;      // git rev-parse --show-toplevel
  // v0.1.39: files 제거 — 소비처 0건(CommitAttributor는 timestamp+repo 조인).
  // --name-only가 대형 repo서 회고 빌드 33초 블로킹의 97% 비용이라 드롭.
}

/** 귀속 신뢰도 — 매칭 레코드 수 기반(결정론). */
export type AttributionConfidence = 'high' | 'medium' | 'low';

/** 커밋 단위 사용량 귀속 결과. */
export interface CommitUsage {
  commit: CommitMeta;
  costUsd: number;          // r.costUsd 합산 (이미 cache amortize 반영 — 재계산 금지)
  totalTokens: number;
  recordCount: number;
  sessionIds: string[];     // 고유 세션
  confidence: AttributionConfidence;
}

/** 미귀속 버킷 — 숨기면 거짓 정밀도(§4). 1급 처리 필수. */
export interface UnattributedBucket {
  costUsd: number;
  totalTokens: number;
  recordCount: number;
  /** 마지막 커밋 이후 진행중 작업 비용 (repo/branch는 매치) */
  postLastCommitCostUsd: number;
  /** 어떤 repo/branch 윈도에도 안 맞는 비용 */
  noWindowMatchCostUsd: number;
}

/** 회고 요약 — webview 전달. */
/** 회고 커밋 후보 스코프. 'mine' = git config user.email 작성분만. */
export type RetroCommitScope = 'mine' | 'all';

/**
 * 실제로 적용된 스코프. `requested !== applied`면 UI가 요청대로 말하면 안 된다 —
 * user.email 미설정 repo에서 'mine'을 요청해도 필터를 걸 수 없어 'all'로 강등된다.
 */
export interface CommitScopeInfo {
  requested: RetroCommitScope;
  applied: RetroCommitScope;
  authorEmail: string | null;
  degraded: boolean;
}

export interface RetroSummary {
  commits: CommitUsage[];          // 비용 내림차순
  unattributed: UnattributedBucket;
  totalCostUsd: number;            // 전체 레코드 비용 (커밋+미귀속)
  approximate: true;               // UI 근사치 라벨 강제
  generatedAt: string;             // ISO8601
  /**
   * 커밋 후보를 어떻게 좁혔는지. repo마다 다를 수 있어 배열이다(멀티 repo 세션).
   * 비어있으면 스코프 정보 없이 만들어진 구버전 스냅샷(RetroStore 영속본)이다.
   */
  commitScopes?: CommitScopeInfo[];
}

/** extension → webview 전달용 폴링 히스토리 포인트. JSON 직렬화 안전. */
export interface PollHistoryPoint {
  t: string;   // ISO8601
  fh: number;  // fiveHour.utilization (0.0~1.0)
  sd: number;  // sevenDay.utilization (0.0~1.0)
}

/** jsonl `type=cost-state`의 modelUsage 한 행 — 벤더 자신의 과금 정답지(v0.2.5 D-C). */
export interface VendorCostSnapshot {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
}
