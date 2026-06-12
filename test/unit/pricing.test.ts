import { describe, it, expect } from 'vitest';
import { PRICING, findPricing, calcCost } from '../../src/utils/pricing';

describe('findPricing', () => {
  it('fable-5 정확 매칭', () => {
    const p = findPricing('claude-fable-5');
    expect(p).toEqual({ input: 10.0, output: 50.0, cache_creation: 12.5, cache_read: 1.0 });
  });

  it('현행 Opus 4.x는 $5/$25로 매칭 (날짜 접미사 포함)', () => {
    expect(findPricing('claude-opus-4-8')?.input).toBe(5.0);
    expect(findPricing('claude-opus-4-8')?.output).toBe(25.0);
    // 실제 jsonl은 날짜 접미사가 붙을 수 있음
    expect(findPricing('claude-opus-4-5-20251101')?.input).toBe(5.0);
    expect(findPricing('claude-opus-4-7')?.output).toBe(25.0);
  });

  it('레거시 Opus 4.0/4.1은 $15/$75로 매칭 (longest-prefix 보장)', () => {
    // 현행 4.x 키가 먼저 정의돼 있어도 가장 긴 접두사가 우선해야 함
    expect(findPricing('claude-opus-4-1-20250805')?.input).toBe(15.0);
    expect(findPricing('claude-opus-4-1-20250805')?.output).toBe(75.0);
    expect(findPricing('claude-opus-4-20250514')?.input).toBe(15.0);
  });

  it('Sonnet 4.5/4.6은 $3/$15로 매칭', () => {
    expect(findPricing('claude-sonnet-4-6')?.input).toBe(3.0);
    expect(findPricing('claude-sonnet-4-5-20250929')?.input).toBe(3.0);
    expect(findPricing('claude-sonnet-4-6')?.output).toBe(15.0);
  });

  it('Haiku 4.5는 $1/$5로 매칭 (날짜 접미사 포함)', () => {
    expect(findPricing('claude-haiku-4-5-20251001')?.input).toBe(1.0);
    expect(findPricing('claude-haiku-4-5-20251001')?.output).toBe(5.0);
  });

  it('미지의 모델은 undefined 반환', () => {
    expect(findPricing('gpt-4o')).toBeUndefined();
    expect(findPricing('totally-unknown-model')).toBeUndefined();
  });

  it('PRICING 맵에 fable-5가 포함됨', () => {
    expect(PRICING['claude-fable-5']).toBeDefined();
  });

  it('모든 모델의 cache_creation_1h = input × 2.0 (1h write 요율)', () => {
    for (const [model, p] of Object.entries(PRICING)) {
      expect(p.cache_creation_1h, `${model} 1h 요율`).toBeCloseTo(p.input * 2.0, 6);
      // 평면 cache_creation은 5m 요율(input × 1.25)
      expect(p.cache_creation, `${model} 5m 요율`).toBeCloseTo(p.input * 1.25, 6);
    }
  });
});

const zeroTokens = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_5m_input_tokens: 0,
  cache_creation_1h_input_tokens: 0,
  cache_read_input_tokens: 0,
};

describe('calcCost — 캐시 TTL 분리 + service_tier', () => {
  it('1h 캐시 생성은 input의 2.0× 요율로 계산 (P0 과소계산 버그 수정)', () => {
    // opus-4-8 input=$5 → 1h write = $10/1M. 1M 토큰 → $10.0 (기존 버그는 $6.25)
    const cost = calcCost('claude-opus-4-8', { ...zeroTokens, cache_creation_1h_input_tokens: 1_000_000 });
    expect(cost).toBeCloseTo(10.0, 6);
  });

  it('5m 캐시 생성은 input의 1.25× 요율로 계산', () => {
    const cost = calcCost('claude-opus-4-8', { ...zeroTokens, cache_creation_5m_input_tokens: 1_000_000 });
    expect(cost).toBeCloseTo(6.25, 6);
  });

  it('5m + 1h 혼합 비용 합산', () => {
    // 5m 1M ($6.25) + 1h 1M ($10.0) = $16.25
    const cost = calcCost('claude-opus-4-8', {
      ...zeroTokens,
      cache_creation_5m_input_tokens: 1_000_000,
      cache_creation_1h_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(16.25, 6);
  });

  it('input/output/cache_read 기본 비용 계산', () => {
    // opus-4-8: input $5 + output $25 + cache_read $0.5 (각 1M)
    const cost = calcCost('claude-opus-4-8', {
      ...zeroTokens,
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(5.0 + 25.0 + 0.5, 6);
  });

  it('service_tier=batch는 전체 비용 −50%', () => {
    const base = calcCost('claude-opus-4-8', { ...zeroTokens, input_tokens: 1_000_000 });
    const batch = calcCost('claude-opus-4-8', { ...zeroTokens, input_tokens: 1_000_000, serviceTier: 'batch' });
    expect(base).toBeCloseTo(5.0, 6);
    expect(batch).toBeCloseTo(2.5, 6);
  });

  it('service_tier=standard / 미지정은 정가 (×1.0)', () => {
    const standard = calcCost('claude-opus-4-8', { ...zeroTokens, input_tokens: 1_000_000, serviceTier: 'standard' });
    expect(standard).toBeCloseTo(5.0, 6);
  });

  it('미지의 모델은 비용 0', () => {
    expect(calcCost('gpt-4o', { ...zeroTokens, input_tokens: 1_000_000 })).toBe(0);
  });
});
