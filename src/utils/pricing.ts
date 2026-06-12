/** LiteLLM 기반 Claude 모델 가격 스냅샷 (USD per 1M tokens).
 * 갱신 시 pricing/litellm-snapshot.json 과 동시 수정 후 CHANGELOG 기록. */
export interface ModelPrice {
  input: number;
  output: number;
  cache_creation: number;
  cache_read: number;
}

export const PRICING: Record<string, ModelPrice> = {
  // 최상위 티어 (Opus 위 신규 모델)
  'claude-fable-5':    { input: 10.0,  output: 50.0, cache_creation: 12.5,  cache_read: 1.0  },
  // Opus 4.5+ (현행 — $5/$25)
  'claude-opus-4-8':   { input:  5.0,  output: 25.0, cache_creation:  6.25, cache_read: 0.5  },
  'claude-opus-4-7':   { input:  5.0,  output: 25.0, cache_creation:  6.25, cache_read: 0.5  },
  'claude-opus-4-6':   { input:  5.0,  output: 25.0, cache_creation:  6.25, cache_read: 0.5  },
  'claude-opus-4-5':   { input:  5.0,  output: 25.0, cache_creation:  6.25, cache_read: 0.5  },
  // Opus 4.0/4.1 (레거시 deprecated — $15/$75)
  'claude-opus-4-1':   { input: 15.0,  output: 75.0, cache_creation: 18.75, cache_read: 1.5  },
  'claude-opus-4':     { input: 15.0,  output: 75.0, cache_creation: 18.75, cache_read: 1.5  },
  // Sonnet
  'claude-sonnet-4-6': { input:  3.0,  output: 15.0, cache_creation:  3.75, cache_read: 0.3  },
  'claude-sonnet-4-5': { input:  3.0,  output: 15.0, cache_creation:  3.75, cache_read: 0.3  },
  'claude-sonnet-4':   { input:  3.0,  output: 15.0, cache_creation:  3.75, cache_read: 0.3  },
  // Haiku
  'claude-haiku-4-5':  { input:  1.0,  output:  5.0, cache_creation:  1.25, cache_read: 0.1  },
};

/**
 * 모델명에 가장 근접한 가격 정책을 반환.
 * 1) 정확 매칭 → 2) 가장 긴 접두사 키 우선(claude-opus-4-1 > claude-opus-4) →
 * 3) 동일 패밀리(첫 3세그먼트) 폴백.
 */
export function findPricing(model: string): ModelPrice | undefined {
  if (PRICING[model]) return PRICING[model];
  const lm = model.toLowerCase();

  // 가장 긴 접두사 매칭: "claude-opus-4-1-20250805"는 claude-opus-4-1을,
  // "claude-opus-4-8-..."은 claude-opus-4-8을 정확히 집어낸다.
  let best: string | undefined;
  for (const key of Object.keys(PRICING)) {
    if (lm.startsWith(key) && (best === undefined || key.length > best.length)) {
      best = key;
    }
  }
  if (best !== undefined) return PRICING[best];

  // 폴백: 동일 패밀리(예: 미지의 claude-opus-4-9) → 첫 매칭 키
  const family = lm.split('-').slice(0, 3).join('-');
  for (const key of Object.keys(PRICING)) {
    if (key.startsWith(family)) return PRICING[key];
  }
  return undefined;
}

/** calcCost 입력 토큰 셋 (JournalUsage와 구조 호환). */
export interface CostTokens {
  input_tokens: number;
  output_tokens: number;
  /** 5m TTL 캐시 생성 토큰 (요율 input × 1.25) */
  cache_creation_5m_input_tokens: number;
  /** 1h TTL 캐시 생성 토큰 (요율 input × 2.0) */
  cache_creation_1h_input_tokens: number;
  cache_read_input_tokens: number;
  /** usage.service_tier — 'batch' 시 전체 −50% */
  serviceTier?: string;
}

/**
 * 단일 비용 진실원(single source of truth).
 * 캐시 생성을 5m(1.25×)·1h(2.0×) TTL로 분리 과금 — 1h를 5m 요율로 과금하던 과소계산 버그 수정.
 * service_tier=batch 시 전체 비용 −50%.
 */
export function calcCost(model: string, t: CostTokens): number {
  const p = findPricing(model);
  if (!p) return 0;

  // TODO(GREEN): 1h는 cache_creation_1h(2.0×) 요율, batch 티어 −50% 적용
  const cost =
    (t.input_tokens / 1_000_000) * p.input +
    (t.output_tokens / 1_000_000) * p.output +
    ((t.cache_creation_5m_input_tokens + t.cache_creation_1h_input_tokens) / 1_000_000) * p.cache_creation +
    (t.cache_read_input_tokens / 1_000_000) * p.cache_read;

  return cost;
}
