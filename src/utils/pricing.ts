/**
 * LiteLLM 가격 스냅샷 임베드 (오프라인 USD 환산).
 *
 * 갱신 절차:
 *  1. https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json 참조
 *  2. pricing/litellm-snapshot.json 수동 갱신
 *  3. CHANGELOG에 기록
 *
 * 단가 단위: USD per 1M tokens. 모델별 input/output/cache_creation/cache_read 분리.
 */

interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheCreationPerMTok?: number;
  cacheReadPerMTok?: number;
}

// TODO: pricing/litellm-snapshot.json import (resolveJsonModule 사용)
const PRICING: Record<string, ModelPricing> = {
  // placeholder — 빌드 타임 import로 대체 예정
  'claude-opus-4': { inputPerMTok: 15.0, outputPerMTok: 75.0, cacheCreationPerMTok: 18.75, cacheReadPerMTok: 1.5 },
  'claude-sonnet-4-5': { inputPerMTok: 3.0, outputPerMTok: 15.0, cacheCreationPerMTok: 3.75, cacheReadPerMTok: 0.3 },
  'claude-haiku-4-5': { inputPerMTok: 1.0, outputPerMTok: 5.0, cacheCreationPerMTok: 1.25, cacheReadPerMTok: 0.1 }
};

export function calculateCost(
  model: string,
  tokens: { input: number; output: number; cacheCreation: number; cacheRead: number }
): number {
  const p = matchPricing(model);
  if (!p) return 0;
  const cost =
    (tokens.input * p.inputPerMTok) / 1_000_000 +
    (tokens.output * p.outputPerMTok) / 1_000_000 +
    (tokens.cacheCreation * (p.cacheCreationPerMTok ?? p.inputPerMTok)) / 1_000_000 +
    (tokens.cacheRead * (p.cacheReadPerMTok ?? p.inputPerMTok)) / 1_000_000;
  return cost;
}

function matchPricing(model: string): ModelPricing | null {
  // 정확 일치 우선, prefix 일치 fallback (모델 버전 suffix 대응)
  if (PRICING[model]) return PRICING[model];
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  return key ? PRICING[key] : null;
}
