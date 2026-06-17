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

describe('UsageAggregator — 브랜치별 세션 수 (#4 단일 순회)', () => {
  it('브랜치별 고유 sessionId 개수를 정확히 집계', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, gitBranch: 'main', sessionId: 'a' }),
      rec({ costUsd: 1.0, gitBranch: 'main', sessionId: 'a' }), // 중복 세션
      rec({ costUsd: 1.0, gitBranch: 'main', sessionId: 'b' }),
      rec({ costUsd: 1.0, gitBranch: 'feature/x', sessionId: 'c' }),
    ]);
    const main = r.branchBreakdown.find(b => b.branch === 'main')!;
    const feat = r.branchBreakdown.find(b => b.branch === 'feature/x')!;
    expect(main.sessionCount).toBe(2);  // a, b (중복 a 1회 카운트)
    expect(feat.sessionCount).toBe(1);  // c
  });

  it('gitBranch 없는 레코드는 브랜치 집계에서 제외', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, gitBranch: '', sessionId: 'a' }),
      rec({ costUsd: 1.0, gitBranch: 'main', sessionId: 'b' }),
    ]);
    expect(r.branchBreakdown.map(b => b.branch)).toEqual(['main']);
    expect(r.branchBreakdown[0].sessionCount).toBe(1);
  });
});
