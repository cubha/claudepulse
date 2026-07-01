import { describe, it, expect } from 'vitest';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import type { SessionRecord } from '../../src/types';

function rec(p: Partial<SessionRecord> & { costUsd: number; timestamp: string }): SessionRecord {
  return {
    messageId: Math.random().toString(36),
    requestId: Math.random().toString(36),
    sessionId: 's1',
    model: 'claude-opus-4-8',
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

describe('UsageAggregator — historicalDays (v0.1.43 B방식 backfill)', () => {
  it('last7Days 윈도우 밖(30일 이상 과거)의 날짜도 historicalDays에 포함한다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, timestamp: '2026-05-01T10:00:00.000Z' }),
      rec({ costUsd: 2.0, timestamp: '2026-06-12T10:00:00.000Z' }),
    ]);
    const dates = r.historicalDays.map(d => d.date);
    expect(dates).toContain('2026-05-01');
    expect(dates).toContain('2026-06-12');
  });

  it('날짜 오름차순으로 정렬한다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, timestamp: '2026-06-12T10:00:00.000Z' }),
      rec({ costUsd: 2.0, timestamp: '2026-05-01T10:00:00.000Z' }),
      rec({ costUsd: 3.0, timestamp: '2026-05-15T10:00:00.000Z' }),
    ]);
    expect(r.historicalDays.map(d => d.date)).toEqual(['2026-05-01', '2026-05-15', '2026-06-12']);
  });

  it('같은 날짜의 레코드는 costUsd·토큰을 합산한다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.5, timestamp: '2026-05-01T09:00:00.000Z' }),
      rec({ costUsd: 2.5, timestamp: '2026-05-01T15:00:00.000Z' }),
    ]);
    const day = r.historicalDays.find(d => d.date === '2026-05-01');
    expect(day).toBeDefined();
    expect(day!.costUsd).toBeCloseTo(4.0, 6);
  });

  it('레코드가 없으면 historicalDays는 빈 배열이다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([]);
    expect(r.historicalDays).toEqual([]);
  });
});
