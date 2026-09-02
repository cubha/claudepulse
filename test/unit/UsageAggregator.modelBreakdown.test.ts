import { describe, it, expect } from 'vitest';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import { calcCost } from '../../src/utils/pricing';
import type { SessionRecord } from '../../src/types';

/** 오늘(UTC) 타임스탬프 — modelBreakdown은 오늘 레코드만 집계한다. */
function todayAt(hhmm: string): string {
  return `${new Date().toISOString().slice(0, 10)}T${hhmm}:00.000Z`;
}

function rec(model: string, tokens: number, hhmm: string): SessionRecord {
  const usage = {
    input_tokens: 0,
    output_tokens: tokens,
    cache_creation_input_tokens: 0,
    cache_creation_5m_input_tokens: 0,
    cache_creation_1h_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  return {
    messageId: `${model}-${hhmm}`,
    requestId: `${model}-${hhmm}`,
    sessionId: 's1',
    model,
    timestamp: todayAt(hhmm),
    cwd: '/repo',
    gitBranch: 'main',
    usage,
    costUsd: calcCost(model, {
      input_tokens: 0, output_tokens: tokens,
      cache_creation_5m_input_tokens: 0, cache_creation_1h_input_tokens: 0,
      cache_read_input_tokens: 0,
    }),
    toolCounts: emptyToolCounts(),
    editedFiles: [],
    isSidechain: false,
  };
}

const agg = new UsageAggregator();

describe('modelBreakdown — 가격 미상 모델이 섞였을 때', () => {
  it('가격을 전부 아는 경우엔 비용 기준 share를 쓴다', () => {
    const s = agg.aggregate([rec('claude-opus-5', 1_000_000, '01:00'), rec('claude-sonnet-5', 1_000_000, '02:00')]);
    expect(s.modelShareBasis).toBe('cost');
    expect(s.unpricedModels).toEqual([]);
    // opus $25 vs sonnet $10 → 25/35
    expect(s.modelBreakdown[0].model).toBe('claude-opus-5');
    expect(s.modelBreakdown[0].share).toBeCloseTo(25 / 35, 6);
    expect(s.modelBreakdown.every(m => m.pricingSource === 'exact')).toBe(true);
  });

  it('미가격 모델이 하나라도 있으면 share 기준이 토큰으로 바뀌고 그 사실이 노출된다', () => {
    // 실제 사고 재현: 토큰 대부분이 미가격 모델인데 가격 있는 소수 모델이 100%를 독식했다.
    const s = agg.aggregate([
      rec('claude-nextgen-9', 97_000_000, '01:00'), // 가격표에 없고 패밀리도 없음 → source 'none'
      rec('claude-opus-5', 3_000_000, '02:00'),
    ]);
    expect(s.unpricedModels).toEqual(['claude-nextgen-9']);
    expect(s.modelShareBasis).toBe('tokens');
    // 비용 기준이었다면 opus가 100%였을 자리 — 토큰 기준이라 실제 지배 모델이 1위다
    expect(s.modelBreakdown[0].model).toBe('claude-nextgen-9');
    expect(s.modelBreakdown[0].share).toBeCloseTo(0.97, 6);
    expect(s.modelBreakdown[0].pricingSource).toBe('none');
    expect(s.modelBreakdown[1].share).toBeCloseTo(0.03, 6);
  });

  it('share 합은 기준과 무관하게 1이다', () => {
    for (const records of [
      [rec('claude-opus-5', 1e6, '01:00'), rec('claude-sonnet-5', 2e6, '02:00')],
      [rec('claude-nextgen-9', 1e6, '01:00'), rec('claude-opus-5', 2e6, '02:00')],
    ]) {
      const s = agg.aggregate(records);
      expect(s.modelBreakdown.reduce((a, m) => a + m.share, 0)).toBeCloseTo(1, 6);
    }
  });

  it('가격표에 없어도 같은 패밀리가 있으면 근사 과금하고 근사임을 표시한다', () => {
    const s = agg.aggregate([rec('claude-opus-9', 1_000_000, '01:00')]);
    expect(s.unpricedModels).toEqual([]);          // 0원으로 조용히 버리지 않는다
    expect(s.modelBreakdown[0].pricingSource).toBe('family');
    expect(s.modelBreakdown[0].costUsd).toBeGreaterThan(0);
  });
});

describe('modelBreakdown — 사용량 0 유사모델', () => {
  it('<synthetic>처럼 토큰·비용이 모두 0인 항목은 목록에 넣지 않는다', () => {
    const s = agg.aggregate([rec('claude-opus-5', 1_000_000, '01:00'), rec('<synthetic>', 0, '02:00')]);
    expect(s.modelBreakdown.map(m => m.model)).toEqual(['claude-opus-5']);
    // 그리고 가격 미상 경고를 유발하지 않는다 — 쓰지도 않은 모델이다
    expect(s.unpricedModels).toEqual([]);
    expect(s.modelShareBasis).toBe('cost');
  });
});
