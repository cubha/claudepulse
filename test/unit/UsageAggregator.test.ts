import { describe, it, expect, beforeEach } from 'vitest';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import type { UsageRecord } from '../../src/types';

let msgCounter = 0;
function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    messageId: `msg-${++msgCounter}`,
    sessionId: 'sess1',
    projectPath: '/home/user/project',
    timestamp: new Date(),
    model: 'claude-sonnet-4-5',
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUSD: 0.001,
    ...overrides,
  };
}

describe('UsageAggregator', () => {
  let aggregator: UsageAggregator;

  beforeEach(() => {
    msgCounter = 0;
    aggregator = new UsageAggregator();
  });

  it('empty ingest produces all-zero snapshot', () => {
    const snap = aggregator.buildSnapshot();
    expect(snap.today.totalTokens).toBe(0);
    expect(snap.monthToDate.totalTokens).toBe(0);
    expect(snap.topProjects).toHaveLength(0);
    expect(snap.billingWindow.tokensInWindow).toBe(0);
  });

  it('today filter excludes yesterday records at calendar boundary', () => {
    // Use local time strings (no 'Z') so getDate/getMonth operate correctly
    const now = new Date('2026-05-10T10:00:00');
    const yesterday = new Date('2026-05-09T10:00:00');
    aggregator.ingest([
      makeRecord({ timestamp: now }),      // today → 150 tokens
      makeRecord({ timestamp: yesterday }), // yesterday → excluded
    ]);
    const snap = aggregator.buildSnapshot(now);
    expect(snap.today.totalTokens).toBe(150); // 100 + 50
    expect(snap.monthToDate.totalTokens).toBe(300); // both in same month
  });

  it('5h billing window excludes records older than 5 hours', () => {
    const now = new Date('2026-05-10T12:00:00');
    const sixHoursAgo = new Date('2026-05-10T06:00:00'); // outside 5h window
    const twoHoursAgo = new Date('2026-05-10T10:00:00'); // inside 5h window
    aggregator.ingest([
      makeRecord({ timestamp: sixHoursAgo }),
      makeRecord({ timestamp: twoHoursAgo }),
    ]);
    const snap = aggregator.buildSnapshot(now);
    expect(snap.billingWindow.tokensInWindow).toBe(150); // only 2h-ago record
  });

  it('topProjects capped at 5, sorted by cost descending', () => {
    for (let i = 0; i < 7; i++) {
      aggregator.ingest([makeRecord({ projectPath: `/proj/${i}`, costUSD: i * 0.1 })]);
    }
    const snap = aggregator.buildSnapshot();
    expect(snap.topProjects).toHaveLength(5);
    for (let i = 0; i < snap.topProjects.length - 1; i++) {
      expect(snap.topProjects[i].cost).toBeGreaterThanOrEqual(snap.topProjects[i + 1].cost);
    }
  });

  it('listSessions groups records by sessionId', () => {
    const now = new Date();
    aggregator.ingest([
      makeRecord({ sessionId: 'sa', timestamp: now }),
      makeRecord({ sessionId: 'sa', timestamp: new Date(now.getTime() + 60000) }),
      makeRecord({ sessionId: 'sb', timestamp: now }),
    ]);
    const sessions = aggregator.listSessions('all');
    expect(sessions).toHaveLength(2);
    const sa = sessions.find(s => s.sessionId === 'sa');
    expect(sa?.totalTokens).toBe(300); // 2 records × 150
  });

  it('getSessionDetail returns timeSeries in 5-minute buckets', () => {
    const base = new Date('2026-05-10T10:00:00Z');
    aggregator.ingest([
      makeRecord({ sessionId: 'sc', timestamp: base }),
      makeRecord({ sessionId: 'sc', timestamp: new Date(base.getTime() + 2 * 60 * 1000) }), // +2 min → same bucket
      makeRecord({ sessionId: 'sc', timestamp: new Date(base.getTime() + 6 * 60 * 1000) }), // +6 min → next bucket
    ]);
    const detail = aggregator.getSessionDetail('sc');
    expect(detail).not.toBeNull();
    expect(detail!.timeSeries).toHaveLength(2); // 2 distinct 5-min buckets
    expect(detail!.timeSeries[0].tokens).toBe(300); // 2 records in first bucket
    expect(detail!.timeSeries[1].tokens).toBe(150); // 1 record in second bucket
  });

  it('getSessionDetail returns null for unknown sessionId', () => {
    expect(aggregator.getSessionDetail('nonexistent')).toBeNull();
  });
});
