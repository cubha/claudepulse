import { describe, it, expect } from 'vitest';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import type { SessionRecord } from '../../src/types';

function rec(p: Partial<SessionRecord> & { costUsd: number }): SessionRecord {
  return {
    messageId: Math.random().toString(36),
    requestId: Math.random().toString(36),
    sessionId: 's1',
    model: 'claude-opus-4-8',
    timestamp: '2026-06-12T10:00:00.000Z',
    cwd: '/tmp',
    gitBranch: 'main',
    usage: {
      input_tokens: 100, output_tokens: 50,
      cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0,
      cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0,
    },
    toolCounts: emptyToolCounts(),
    editedFiles: [],
    isSidechain: false,
    ...p,
  };
}

describe('UsageAggregator — 세션 컨텍스트 점유율 (#④, 누적합 아닌 마지막 레코드 1건 기준)', () => {
  it('마지막(최신) 레코드 1건의 input+cache_read+cache_creation 합으로 계산 — 세션 전체 누적 아님', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({
        costUsd: 1.0,
        timestamp: '2026-06-12T10:00:00.000Z',
        usage: { input_tokens: 50_000, output_tokens: 10, cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
      rec({
        costUsd: 1.0,
        timestamp: '2026-06-12T10:05:00.000Z', // 더 최신 — 이 레코드만 반영돼야 함
        model: 'claude-opus-4-8',
        usage: { input_tokens: 30_000, output_tokens: 10, cache_creation_input_tokens: 5_000, cache_creation_5m_input_tokens: 5_000, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 20_000 },
      }),
    ]);
    // 누적합이면 80,000+55,000=135,000이 되어 잘못됨. 마지막 레코드만: 30,000+20,000+5,000=55,000
    expect(r.sessionContext).not.toBeNull();
    expect(r.sessionContext!.tokens).toBe(55_000);
    expect(r.sessionContext!.model).toBe('claude-opus-4-8');
    // claude-opus-4-8 최대 윈도 200K → 55,000/200,000 = 0.275
    expect(r.sessionContext!.ratio).toBeCloseTo(0.275, 6);
  });

  it('레코드가 없으면 null', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([]);
    expect(r.sessionContext).toBeNull();
  });
});
