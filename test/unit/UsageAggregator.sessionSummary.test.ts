import { describe, it, expect } from 'vitest';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import type { SessionRecord } from '../../src/types';

function rec(p: Partial<SessionRecord> & { costUsd: number }): SessionRecord {
  return {
    messageId: Math.random().toString(36),
    requestId: Math.random().toString(36),
    sessionId: 's1',
    model: 'claude-sonnet-4-6',
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

describe('UsageAggregator — SessionSummary.lastActivity/model/contextTokens (세션 선택기 선행)', () => {
  it('레코드가 1건뿐인 세션 — lastActivity=그 timestamp, model=그 모델, contextTokens=resolveContextTokens 값', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({
        costUsd: 1.0,
        sessionId: 's1',
        timestamp: '2026-06-12T10:00:00.000Z',
        model: 'claude-opus-4-8',
        usage: { input_tokens: 1_000, output_tokens: 10, cache_creation_input_tokens: 500, cache_creation_5m_input_tokens: 500, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 2_000 },
      }),
    ]);
    const s = r.recentSessions.find(x => x.sessionId === 's1')!;
    expect(s.lastActivity).toBe('2026-06-12T10:00:00.000Z');
    expect(s.model).toBe('claude-opus-4-8');
    // contextTokens 필드가 없는 픽스처 → resolveContextTokens 폴백(usage 합): 1000+500+2000=3500
    expect(s.contextTokens).toBe(3_500);
  });

  it('여러 레코드가 입력 배열에 시간 역순으로 들어와도 lastActivity/model/contextTokens는 최신(가장 큰 timestamp) 레코드 기준 — 누적 아님', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      // 배열상 먼저지만 더 최신 timestamp
      rec({
        costUsd: 1.0,
        sessionId: 's1',
        timestamp: '2026-06-12T10:10:00.000Z',
        model: 'claude-opus-4-8',
        usage: { input_tokens: 9_000, output_tokens: 10, cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 1_000 },
      }),
      // 배열상 나중이지만 더 과거 timestamp — 이 레코드 값이 반영되면 안 됨
      rec({
        costUsd: 1.0,
        sessionId: 's1',
        timestamp: '2026-06-12T10:00:00.000Z',
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 100_000, output_tokens: 10, cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
    ]);
    const s = r.recentSessions.find(x => x.sessionId === 's1')!;
    expect(s.lastActivity).toBe('2026-06-12T10:10:00.000Z');
    expect(s.model).toBe('claude-opus-4-8');
    // 누적이면 9000+1000+100000=110000이 되어 잘못됨. 최신 레코드만: 9000+1000=10000
    expect(s.contextTokens).toBe(10_000);
  });

  it('서로 다른 세션은 독립적으로 추적된다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's1', timestamp: '2026-06-12T10:00:00.000Z', model: 'claude-opus-4-8' }),
      rec({ costUsd: 1.0, sessionId: 's2', timestamp: '2026-06-12T11:00:00.000Z', model: 'claude-haiku-4-5-20251001' }),
    ]);
    const s1 = r.recentSessions.find(x => x.sessionId === 's1')!;
    const s2 = r.recentSessions.find(x => x.sessionId === 's2')!;
    expect(s1.model).toBe('claude-opus-4-8');
    expect(s2.model).toBe('claude-haiku-4-5-20251001');
    expect(s1.lastActivity).toBe('2026-06-12T10:00:00.000Z');
    expect(s2.lastActivity).toBe('2026-06-12T11:00:00.000Z');
  });

  it('contextTokens 필드가 픽스처에 직접 주어지면 usage 합이 아니라 그 값을 그대로 쓴다(resolveContextTokens 위임 확인)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({
        costUsd: 1.0,
        sessionId: 's1',
        timestamp: '2026-06-12T10:00:00.000Z',
        contextTokens: 42_000,
        usage: { input_tokens: 1_000, output_tokens: 10, cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
    ]);
    const s = r.recentSessions.find(x => x.sessionId === 's1')!;
    expect(s.contextTokens).toBe(42_000);
  });
});
