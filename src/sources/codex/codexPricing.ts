import type { ModelPrice } from '../../utils/pricing';
import type { TokenUsageTotals } from './codexRollout';

/**
 * Codex(OpenAI) 가격 스냅샷 (USD per 1M tokens, 2026-09 리서치 — 수동검증 유지).
 *
 * `ModelPrice` 형을 그대로 재사용한다(`src/utils/pricing.ts`) — Claude와 구조가 같아 구조 변경이
 * 불필요하다(reference_codex_integration.md "비용" 절). 단 **캐시 구조가 다르다**:
 * OpenAI는 캐시 **생성 비용이 없다**(`cache_creation`/`cache_creation_1h` = 0 고정) — Anthropic처럼
 * 5m/1h TTL별 1.25×/2.0× 할증이 없고, cached input은 input의 ~10%만 받는다.
 *
 * ⚠️ 신규 모델(예: `gpt-5.6-terra`, 2026-09-19 자체 실측에서 발견)은 **추측 가격을 넣지 않는다** —
 * `findCodexPricing`이 undefined를 반환하면 호출측이 `unpricedModels`에 담아야 한다
 * ([[reference_add_new_model]] 절차와 동일).
 */
export const CODEX_PRICING: Record<string, ModelPrice> = {
  'gpt-5-codex':      { input: 1.25, output: 10.0, cache_creation: 0, cache_creation_1h: 0, cache_read: 0.125 },
  'gpt-5.2-codex':    { input: 1.75, output: 14.0, cache_creation: 0, cache_creation_1h: 0, cache_read: 0.175 },
  'gpt-5.3-codex':    { input: 1.75, output: 14.0, cache_creation: 0, cache_creation_1h: 0, cache_read: 0.175 },
  'codex-mini-latest':{ input: 1.5,  output: 6.0,  cache_creation: 0, cache_creation_1h: 0, cache_read: 0.375 },
};

/** longest-prefix 매칭 — Claude `findPricing`과 같은 패턴(모델 변종·접미사 흡수). */
export function findCodexPricing(model: string): ModelPrice | undefined {
  let best: ModelPrice | undefined;
  let bestLen = -1;
  for (const [key, price] of Object.entries(CODEX_PRICING)) {
    if (model.startsWith(key) && key.length > bestLen) {
      best = price;
      bestLen = key.length;
    }
  }
  return best;
}

/** 가격표에 없는 모델은 null — 0으로 과소표시하지 않는다(unpricedModels 패턴). */
export function calcCodexCost(model: string, usage: TokenUsageTotals): number | null {
  const price = findCodexPricing(model);
  if (!price) return null;
  const nonCachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  // reasoning_output_tokens ⊂ outputTokens — 이미 포함된 부분집합이라 별도 과금하지 않는다.
  const cost =
    (nonCachedInput * price.input) / 1_000_000 +
    (usage.cachedInputTokens * price.cache_read) / 1_000_000 +
    (usage.outputTokens * price.output) / 1_000_000;
  return cost;
}
