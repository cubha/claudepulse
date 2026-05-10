import { describe, it, expect } from 'vitest';
import { calculateCost } from '../../src/utils/pricing';

describe('calculateCost', () => {
  it('calculates correct cost for opus model', () => {
    // 1000 input × 15.0/1M + 500 output × 75.0/1M = 0.015 + 0.0375 = 0.0525
    const cost = calculateCost('claude-opus-4', { input: 1000, output: 500, cacheCreation: 0, cacheRead: 0 });
    expect(cost).toBeCloseTo(0.0525, 5);
  });

  it('calculates correct cost for sonnet model', () => {
    // 1M input × 3.0/1M + 1M output × 15.0/1M = 18.0
    const cost = calculateCost('claude-sonnet-4-5', { input: 1_000_000, output: 1_000_000, cacheCreation: 0, cacheRead: 0 });
    expect(cost).toBeCloseTo(18.0, 2);
  });

  it('uses prefix fallback for version-suffixed models', () => {
    const base = calculateCost('claude-opus-4', { input: 100, output: 100, cacheCreation: 0, cacheRead: 0 });
    const versioned = calculateCost('claude-opus-4-7', { input: 100, output: 100, cacheCreation: 0, cacheRead: 0 });
    expect(versioned).toBe(base);
  });

  it('returns 0 for unknown model', () => {
    const cost = calculateCost('unknown-model-xyz', { input: 100, output: 100, cacheCreation: 0, cacheRead: 0 });
    expect(cost).toBe(0);
  });
});
