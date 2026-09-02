import { describe, it, expect } from 'vitest';
import { calcCost, resolvePricing } from '../../src/utils/pricing';
import oracle from '../fixtures/vendor-cost-oracle.json';

/**
 * 벤더 오라클 회귀 — Claude Code CLI 자신이 jsonl(type=cost-state)에 기록한 모델별 costUSD와
 * 우리 calcCost를 대조한다.
 *
 * 이 테스트가 존재하는 이유: PRICING에 현행 세대 모델이 없으면 calcCost가 **조용히 0**을 내고,
 * tsc·eslint·빌드·기존 유닛테스트가 전부 통과한다. 실제로 v0.1.54까지 opus-5·sonnet-5가
 * 미등재라 사용자 비용이 실제의 1~2%로 계측됐다. 내부 일관성 테스트로는 절대 못 잡는 부류라
 * 외부 진실원이 필요하다.
 *
 * 판정은 밴드다 — cacheCreation의 5m/1h TTL 배분이 cost-state 집계에 남지 않아 단일값 복원이
 * 불가능하기 때문. 실제 비용은 [전량 5m, 전량 1h] 사이에 반드시 들어온다.
 */
interface OracleSample {
  sample: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  vendorCostUSD: number;
}

const samples = oracle.samples as OracleSample[];

/** 부동소수 누적 오차 여유. 밴드 폭 자체가 넓으므로 이 값이 판정을 무디게 만들지 않는다. */
const EPS = 0.005;

function costWithCacheSplit(s: OracleSample, ratio1h: number): number {
  const cc1h = Math.round(s.cacheCreationInputTokens * ratio1h);
  return calcCost(s.model, {
    input_tokens: s.inputTokens,
    output_tokens: s.outputTokens,
    cache_creation_5m_input_tokens: s.cacheCreationInputTokens - cc1h,
    cache_creation_1h_input_tokens: cc1h,
    cache_read_input_tokens: s.cacheReadInputTokens,
    webSearchRequests: s.webSearchRequests,
  });
}

describe('벤더 오라클 대비 calcCost', () => {
  it('픽스처가 비어 있지 않다 (붕괴가 초록으로 읽히는 것 차단 — D-0류)', () => {
    expect(samples.length).toBeGreaterThanOrEqual(30);
    expect(new Set(samples.map(s => s.model)).size).toBeGreaterThanOrEqual(4);
    // 웹검색 과금이 실제로 검사되는지 — 0건이면 그 경로가 사문이다
    expect(samples.filter(s => s.webSearchRequests > 0).length).toBeGreaterThan(0);
  });

  it.each(samples)('$model $sample — 벤더 비용이 5m~1h 밴드 안에 든다', (s) => {
    const lo = costWithCacheSplit(s, 0);
    const hi = costWithCacheSplit(s, 1);
    expect(lo).toBeGreaterThan(0);
    expect(s.vendorCostUSD).toBeGreaterThanOrEqual(lo * (1 - EPS));
    expect(s.vendorCostUSD).toBeLessThanOrEqual(hi * (1 + EPS));
  });

  it('오라클에 등장하는 모든 모델이 정확매칭으로 해석된다 (family 근사 아님)', () => {
    for (const model of new Set(samples.map(s => s.model))) {
      expect(resolvePricing(model).source, model).toBe('exact');
    }
  });
});
