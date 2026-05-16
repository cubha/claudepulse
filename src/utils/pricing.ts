/** LiteLLM 기반 Claude 모델 가격 스냅샷 (USD per 1M tokens).
 * 갱신 시 pricing/litellm-snapshot.json 과 동시 수정 후 CHANGELOG 기록. */
export interface ModelPrice {
  input: number;
  output: number;
  cache_creation: number;
  cache_read: number;
}

export const PRICING: Record<string, ModelPrice> = {
  'claude-opus-4':     { input: 15.0,  output: 75.0, cache_creation: 18.75, cache_read: 1.5  },
  'claude-sonnet-4-5': { input:  3.0,  output: 15.0, cache_creation:  3.75, cache_read: 0.3  },
  'claude-haiku-4-5':  { input:  1.0,  output:  5.0, cache_creation:  1.25, cache_read: 0.1  },
};

/**
 * 모델명에 가장 근접한 가격 정책을 반환.
 * 정확한 매칭 없으면 prefix 기반 폴백.
 */
export function findPricing(model: string): ModelPrice | undefined {
  if (PRICING[model]) return PRICING[model];
  const lm = model.toLowerCase();
  for (const key of Object.keys(PRICING)) {
    if (lm.startsWith(key) || key.startsWith(lm.split('-').slice(0, 3).join('-'))) {
      return PRICING[key];
    }
  }
  return undefined;
}
