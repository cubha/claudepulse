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

/** 폴러 오류 상태 — 웹뷰 로그인 UI 분기용. */
export type PollerError = 'credentials_missing' | 'token_expired' | 'network_error';

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
}

/** dedup+비용 계산 후 남은 단일 assistant 레코드. */
export interface SessionRecord {
  messageId: string;    // message.id (cross-file dedup 키)
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
}

/** 서브에이전트 vs 메인 소비 분리 통계. */
export interface SubagentStats {
  mainCostUsd: number;       // isSidechain=false 비용
  subagentCostUsd: number;   // isSidechain=true 비용
  subagentShare: number;     // 0.0 ~ 1.0 (전체 비용 중 서브에이전트 비중)
  subagentCount: number;     // 고유 agentId 수
}

/** 브랜치별 사용량 집계. */
export interface BranchUsage {
  branch: string;        // 브랜치명
  costUsd: number;       // 누적 비용
  totalTokens: number;   // 누적 토큰
  sessionCount: number;  // 세션 수
  lastActive: string;    // 가장 최근 timestamp (ISO8601)
}

/** Webview로 전달하는 전체 사용량 요약. */
export interface UsageSummary {
  today: DailyUsage;
  last7Days: DailyUsage[];
  recentSessions: SessionSummary[];  // 최근 20개
  modelBreakdown: ModelBreakdown[];  // 오늘 모델별 집계
  cacheStats: CacheStats;            // 오늘 캐시 효율
  todayToolCounts: ToolUseCounts;    // 오늘 도구 사용 집계
  last7DaysTools: DailyToolStats[];  // 7일 도구 트렌드
  recentEditedFiles: string[];       // 최근 편집 파일 목록 (top 20)
  branchBreakdown: BranchUsage[];    // 브랜치별 비용 집계 (비용 내림차순)
  skillBreakdown: SkillUsage[];      // 스킬별 비용 집계 (비용 내림차순)
  skillUnattributed: SkillUnattributed;  // "스킬 외 작업" 1급 버킷 (!isSidechain && !attributionSkill)
  subagentStats: SubagentStats;      // 서브에이전트 vs 메인 소비 분리
  activeBranch: string;              // 가장 최근 활성 브랜치명 (사이드바 칩용)
  historicalDays: DailyUsage[];      // CacheStore 전체 이력 (날짜 오름차순)
  generatedAt: string;               // ISO8601
}

// ─────────────────────────────────────────────────────────────
// usage×git 회고 뷰 도메인 모델 (v0.1.37)
//
// ⚠️ 포워드 컨트랙트(codex-later): 본 모델은 단일 프로바이더(Claude) 전제.
// PLAN-v0.1.4-codex-provider 착수 시 Codex session_meta가 cwd를 보유하므로
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
export interface RetroSummary {
  commits: CommitUsage[];          // 비용 내림차순
  unattributed: UnattributedBucket;
  totalCostUsd: number;            // 전체 레코드 비용 (커밋+미귀속)
  approximate: true;               // UI 근사치 라벨 강제
  generatedAt: string;             // ISO8601
}

/** extension → webview 전달용 폴링 히스토리 포인트. JSON 직렬화 안전. */
export interface PollHistoryPoint {
  t: string;   // ISO8601
  fh: number;  // fiveHour.utilization (0.0~1.0)
  sd: number;  // sevenDay.utilization (0.0~1.0)
}
