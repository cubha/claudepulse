import { describe, it, expect } from 'vitest';
import { findCodexPricing, calcCodexCost, CODEX_PRICING } from '../../../src/sources/codex/codexPricing';

describe('CODEX_PRICING — OpenAI 캐시 구조(생성비 0)', () => {
  it('모든 등재 모델의 cache_creation이 0이다(OpenAI는 캐시 생성비 없음)', () => {
    for (const price of Object.values(CODEX_PRICING)) {
      expect(price.cache_creation).toBe(0);
      expect(price.cache_creation_1h).toBe(0);
    }
  });

  it('gpt-5-codex 가격이 등재돼 있다(1.25/10, cached≈10%)', () => {
    const p = CODEX_PRICING['gpt-5-codex'];
    expect(p.input).toBe(1.25);
    expect(p.output).toBe(10);
    expect(p.cache_read).toBeCloseTo(0.125, 5);
  });
});

describe('findCodexPricing — longest-prefix 매칭(Claude findPricing 재사용 패턴)', () => {
  it('정확히 일치하면 그 가격', () => {
    expect(findCodexPricing('gpt-5-codex')).toBeDefined();
  });

  it('접미사 변종(예: gpt-5-codex-preview)도 접두사로 매칭된다', () => {
    const p = findCodexPricing('gpt-5-codex-preview');
    expect(p).toEqual(findCodexPricing('gpt-5-codex'));
  });

  it('가격표에 없는 신규 모델(gpt-5.6-terra)은 undefined — unpricedModels로 처리해야 한다', () => {
    // 2026-09-19 자체 실측에서 발견된 미등재 모델. 추측 가격을 넣지 않는다(reference_add_new_model 절차).
    expect(findCodexPricing('gpt-5.6-terra')).toBeUndefined();
  });
});

describe('calcCodexCost — 비캐시 input=input-cached, 캐시 생성비 0', () => {
  it('가격표에 있는 모델은 정확히 계산한다', () => {
    // input 1000(cached 200 포함), output 500 — gpt-5-codex 기준
    const cost = calcCodexCost('gpt-5-codex', {
      inputTokens: 1000, cachedInputTokens: 200, cacheWriteInputTokens: 0,
      outputTokens: 500, reasoningOutputTokens: 0, totalTokens: 1500,
    });
    // 비캐시 input 800 * 1.25/1e6 + cached 200 * 0.125/1e6 + output 500 * 10/1e6
    const expected = (800 * 1.25 + 200 * 0.125 + 500 * 10) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('가격표에 없는 모델은 null(0으로 과소표시하지 않는다)', () => {
    expect(calcCodexCost('gpt-5.6-terra', {
      inputTokens: 100, cachedInputTokens: 0, cacheWriteInputTokens: 0,
      outputTokens: 50, reasoningOutputTokens: 0, totalTokens: 150,
    })).toBeNull();
  });

  it('reasoning_output_tokens는 output에 포함된 부분집합이라 별도 과금하지 않는다', () => {
    const withReasoning = calcCodexCost('gpt-5-codex', {
      inputTokens: 100, cachedInputTokens: 0, cacheWriteInputTokens: 0,
      outputTokens: 500, reasoningOutputTokens: 300, totalTokens: 600,
    });
    const withoutReasoning = calcCodexCost('gpt-5-codex', {
      inputTokens: 100, cachedInputTokens: 0, cacheWriteInputTokens: 0,
      outputTokens: 500, reasoningOutputTokens: 0, totalTokens: 600,
    });
    expect(withReasoning).toBe(withoutReasoning);
  });
});
