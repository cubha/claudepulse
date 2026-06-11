import { describe, it, expect } from 'vitest';
import { PRICING, findPricing } from '../../src/utils/pricing';

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
});
