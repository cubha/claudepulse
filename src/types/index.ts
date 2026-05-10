// Domain model — ccusage 검증 스키마 + DESIGN-TOKENS와 정합

/** jsonl raw line (Anthropic Claude Code 기록 포맷). */
export interface RawJsonlEntry {
  type: 'user' | 'assistant' | 'summary' | string;
  sessionId: string;
  timestamp: string; // ISO 8601
  costUSD?: number; // present-but-unreliable; 항상 재계산 후 cross-check
  message?: {
    id: string; // 🔴 dedup primary key — 누락 시 billing 불일치
    model: string; // e.g. "claude-sonnet-4-5", "claude-opus-4-..."
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

/** 정규화된 사용량 레코드 (cache 토큰 분리). */
export interface UsageRecord {
  messageId: string;
  sessionId: string;
  projectPath: string; // ~/.claude/projects/<encoded>/ 디코딩된 절대경로
  timestamp: Date;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUSD: number;
}

/** 일별/주별/월별 집계 결과. */
export interface AggregatedStats {
  bucket: string; // 'YYYY-MM-DD' 또는 'YYYY-MM' 또는 'YYYY-Www'
  totalTokens: number;
  byModel: Record<string, number>; // 모델 → 토큰 합
  cost: number;
  sessionCount: number;
}

/** 프로젝트별 합계. */
export interface ProjectSummary {
  projectPath: string;
  displayName: string; // 폴더명 또는 워크스페이스명
  totalTokens: number;
  cost: number;
  sessionCount: number;
  lastActivity: Date;
}

/** 5h 빌링 윈도우 상태. */
export interface BillingWindow {
  windowStart: Date;
  windowEnd: Date;
  msRemaining: number;
  pctTimeRemaining: number; // 시간 기준 (정확)
  tokensInWindow: number;
  estimatedPctRemaining?: number; // 토큰 기준 (추정 — Anthropic 공식 한도 비공개)
}

/** Webview ↔ Extension 메시지 페이로드 공통 타입. */
export interface SnapshotPayload {
  today: AggregatedStats;
  monthToDate: AggregatedStats;
  topProjects: ProjectSummary[];
  billingWindow: BillingWindow;
  generatedAt: Date;
}
