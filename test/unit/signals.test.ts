import { describe, it, expect } from 'vitest';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import { computeCacheMiss } from '../../src/services/signals/cacheMiss';
import { computeRateLimitBlocks } from '../../src/services/signals/rateLimitBlocks';
import { computePrCosts } from '../../src/services/signals/prCost';
import { computeCompaction } from '../../src/services/signals/compaction';
import { computeTurnHooks, hookDisplayName } from '../../src/services/signals/turnHooks';
import type { JournalEvent, SessionRecord } from '../../src/types';

// v0.2.6 ST2·ST4·ST5·ST6·ST8 — 이벤트/레코드 → 신호 순수 함수. PLAN-v0.2.6 §2-3 데이터 사실 기준.

let seq = 0;
function rec(p: Partial<SessionRecord> = {}): SessionRecord {
  seq++;
  return {
    messageId: `m${seq}`, requestId: `r${seq}`, sessionId: 's1', model: 'claude-opus-4-8',
    timestamp: '2026-10-05T10:00:00.000Z', cwd: '/w', gitBranch: 'main',
    usage: {
      input_tokens: 100, output_tokens: 50,
      cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0,
      cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0,
    },
    costUsd: 1, toolCounts: emptyToolCounts(), editedFiles: [], isSidechain: false,
    ...p,
  };
}

const ev = {
  turn: (key: string, ts: string, durationMs: number, extra: Partial<Extract<JournalEvent, { kind: 'turn_duration' }>> = {}): JournalEvent =>
    ({ kind: 'turn_duration', eventKey: key, sessionId: 's1', timestamp: ts, isSidechain: false, durationMs, messageCount: 3, ...extra }),
  hooks: (key: string, ts: string, hooks: Array<{ command: string; durationMs: number }>, errorCount = 0): JournalEvent =>
    ({ kind: 'stop_hooks', eventKey: key, sessionId: 's1', timestamp: ts, isSidechain: false, hooks, errorCount, preventedContinuation: false }),
  compact: (key: string, ts: string, sessionId: string, trigger: string, pre: number, post: number): JournalEvent =>
    ({ kind: 'compact', eventKey: key, sessionId, timestamp: ts, isSidechain: false, trigger, preTokens: pre, postTokens: post, durationMs: 1000 }),
  pr: (sessionId: string, n: number, ts: string, repo = 'o/r'): JournalEvent =>
    ({ kind: 'pr_link', eventKey: `pr:${repo}#${n}@${sessionId}`, sessionId, timestamp: ts, prNumber: n, prUrl: `https://github.com/${repo}/pull/${n}`, prRepository: repo }),
  e429: (key: string, ts: string, type: string, resetsAt: number, extra: Partial<Extract<JournalEvent, { kind: 'api_error' }>> = {}): JournalEvent =>
    ({ kind: 'api_error', eventKey: key, sessionId: 's1', timestamp: ts, isSidechain: false, status: 429, error: 'rate_limit',
      quota: { status: 'rejected', rateLimitType: type, resetsAt, overageStatus: 'rejected', overageDisabledReason: 'out_of_credits' }, ...extra }),
  e5xx: (key: string, ts: string, status: number): JournalEvent =>
    ({ kind: 'api_error', eventKey: key, sessionId: 's1', timestamp: ts, isSidechain: false, status, error: 'overloaded' }),
};

describe('ST2 — 캐시 미스 원인 분해', () => {
  const since = '2026-09-29T00:00:00.000Z';

  it('원인별 건수·토큰·추정비용을 집계하고 건수 내림차순으로 낸다', () => {
    // opus-4-8: cache_creation 6.25 · cache_creation_1h 10 · cache_read 0.5 ($/1M)
    const r = computeCacheMiss([
      rec({ cacheMiss: { reason: 'messages_changed', missedTokens: 1_000_000 } }),                     // 5m 요율: 6.25-0.5 = 5.75
      rec({ cacheMiss: { reason: 'messages_changed', missedTokens: 1_000_000 },
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 10, cache_creation_5m_input_tokens: 0, cache_creation_1h_input_tokens: 10, cache_read_input_tokens: 0 } }), // 1h: 10-0.5 = 9.5
      rec({ cacheMiss: { reason: 'previous_message_not_found', missedTokens: null } }),
      rec({ cacheMiss: { reason: 'previous_message_not_found', missedTokens: null } }),
      rec({ cacheMiss: { reason: 'previous_message_not_found', missedTokens: null } }),
      rec(),
    ], since);

    expect(r.recordCount).toBe(6);
    expect(r.missCount).toBe(5);
    expect(r.reasons.map(x => x.reason)).toEqual(['previous_message_not_found', 'messages_changed']);
    const pmnf = r.reasons[0];
    expect(pmnf).toMatchObject({ count: 3, missedTokens: null, estCostUsd: null });
    const mc = r.reasons[1];
    expect(mc.count).toBe(2);
    expect(mc.missedTokens).toBe(2_000_000);
    expect(mc.estCostUsd).toBeCloseTo(5.75 + 9.5, 6);
    expect(r.estCostUsd).toBeCloseTo(15.25, 6);
    expect(r.hasUnknownTokens).toBe(true);
  });

  it('since 이전 레코드는 제외한다', () => {
    const r = computeCacheMiss([
      rec({ timestamp: '2026-09-01T00:00:00.000Z', cacheMiss: { reason: 'model_changed', missedTokens: 5 } }),
      rec({ timestamp: '2026-10-01T00:00:00.000Z' }),
    ], since);
    expect(r.recordCount).toBe(1);
    expect(r.missCount).toBe(0);
    expect(r.reasons).toEqual([]);
  });

  it('가격 미상 모델의 미스는 토큰은 세되 비용은 미상으로 표시한다', () => {
    const r = computeCacheMiss([rec({ model: 'mystery-model-9', cacheMiss: { reason: 'system_changed', missedTokens: 100 } })], since);
    expect(r.reasons[0]).toMatchObject({ reason: 'system_changed', missedTokens: 100, estCostUsd: null, hasUnpricedRecords: true });
    expect(r.estCostUsd).toBe(0);
  });

  it('Codex 레코드는 분모에서 뺀다(캐시 미스 진단 필드가 원천적으로 없다)', () => {
    const r = computeCacheMiss([rec({ provider: 'codex' }), rec()], since);
    expect(r.recordCount).toBe(1);
  });
});

describe('ST4 — 차단 이력', () => {
  it('429 재시도 행을 (유형, resetsAt) 에피소드로 묶고 최신순으로 낸다', () => {
    const r = computeRateLimitBlocks([
      ev.e429('a', '2026-09-09T04:20:07.000Z', 'five_hour', 1788928200),
      ev.e429('b', '2026-09-09T04:21:07.000Z', 'five_hour', 1788928200),
      ev.e429('c', '2026-09-09T04:25:00.000Z', 'five_hour', 1788928200, { isSidechain: true }),
      ev.e429('d', '2026-09-20T01:00:00.000Z', 'seven_day', 1789500000),
    ]);
    expect(r.episodes).toHaveLength(2);
    expect(r.episodes[0]).toMatchObject({ rateLimitType: 'seven_day', resetsAt: 1789500000, rejectedCount: 1 });
    expect(r.episodes[1]).toMatchObject({
      rateLimitType: 'five_hour', resetsAt: 1788928200, rejectedCount: 3,
      firstAt: '2026-09-09T04:20:07.000Z', lastAt: '2026-09-09T04:25:00.000Z', overageDisabledReason: 'out_of_credits',
    });
  });

  it('529·500은 서버 오류로 따로 센다 — 한도 차단이 아니다', () => {
    const r = computeRateLimitBlocks([
      ev.e5xx('x', '2026-09-01T00:00:00.000Z', 529),
      ev.e5xx('y', '2026-09-02T00:00:00.000Z', 529),
      ev.e5xx('z', '2026-09-03T00:00:00.000Z', 500),
    ]);
    expect(r.episodes).toEqual([]);
    expect(r.serverErrors).toEqual({ count: 3, lastAt: '2026-09-03T00:00:00.000Z', byStatus: { 500: 1, 529: 2 } });
  });

  it('quotaLimits 없는 429는 에피소드로 만들지 않고 미분류로 센다', () => {
    const r = computeRateLimitBlocks([
      { kind: 'api_error', eventKey: 'q', sessionId: 's1', timestamp: '2026-09-01T00:00:00.000Z', isSidechain: false, status: 429, error: 'rate_limit' },
    ]);
    expect(r.episodes).toEqual([]);
    expect(r.unclassified429).toBe(1);
  });
});

describe('ST5 — PR 단위 비용', () => {
  it('pr-link 세션의 레코드 비용(서브에이전트 포함)을 PR에 귀속한다', () => {
    const rows = computePrCosts([
      rec({ sessionId: 'sA', costUsd: 2 }),
      rec({ sessionId: 'sA', costUsd: 3, isSidechain: true }),
      rec({ sessionId: 'sB', costUsd: 7 }),
      rec({ sessionId: 'sZ', costUsd: 100 }),
    ], [ev.pr('sA', 1, '2026-10-01T00:00:00.000Z'), ev.pr('sB', 2, '2026-10-02T00:00:00.000Z')]);
    expect(rows.map(r => [r.prNumber, r.costUsd, r.sessionCount])).toEqual([[2, 7, 1], [1, 5, 1]]);
    expect(rows[0]).toMatchObject({ prRepository: 'o/r', prUrl: 'https://github.com/o/r/pull/2', sharedSessionCount: 0 });
  });

  it('여러 PR에 걸친 세션은 각 PR에 넣되 shared로 표시한다(합계 이중계산 금지 신호)', () => {
    const rows = computePrCosts([rec({ sessionId: 'sA', costUsd: 4 })],
      [ev.pr('sA', 1, '2026-10-01T00:00:00.000Z'), ev.pr('sA', 2, '2026-10-01T01:00:00.000Z')]);
    expect(rows.map(r => [r.prNumber, r.costUsd, r.sharedSessionCount])).toEqual([[2, 4, 1], [1, 4, 1]]);
  });

  it('한 PR에 여러 세션이 연결되면 합산한다', () => {
    const rows = computePrCosts([rec({ sessionId: 'sA', costUsd: 1 }), rec({ sessionId: 'sB', costUsd: 2 })],
      [ev.pr('sA', 5, '2026-10-01T00:00:00.000Z'), ev.pr('sB', 5, '2026-10-03T00:00:00.000Z')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ prNumber: 5, costUsd: 3, sessionCount: 2, firstLinkedAt: '2026-10-01T00:00:00.000Z' });
  });

  it('레코드가 없는 세션(로그 회전)은 비용 0이 아니라 sessionCount에서 빠지고, 남은 세션이 없으면 PR을 뺀다', () => {
    const rows = computePrCosts([], [ev.pr('gone', 9, '2026-10-01T00:00:00.000Z')]);
    expect(rows).toEqual([]);
  });

  it('가격 미상 레코드가 섞이면 hasUnpricedRecords', () => {
    const rows = computePrCosts([rec({ sessionId: 'sA', costUsd: 0, model: 'mystery-model-9' })], [ev.pr('sA', 1, '2026-10-01T00:00:00.000Z')]);
    expect(rows[0].hasUnpricedRecords).toBe(true);
  });
});

describe('ST6 — compaction', () => {
  it('지정 세션의 압축 횟수와 마지막 압축을 낸다', () => {
    const c = computeCompaction([
      ev.compact('c1', '2026-10-01T00:00:00.000Z', 's1', 'manual', 500_000, 30_000),
      ev.compact('c2', '2026-10-01T02:00:00.000Z', 's1', 'auto', 786_256, 34_714),
      ev.compact('c3', '2026-10-01T03:00:00.000Z', 'other', 'auto', 1, 1),
    ], 's1');
    expect(c).toEqual({ count: 2, autoCount: 1, last: { at: '2026-10-01T02:00:00.000Z', trigger: 'auto', preTokens: 786_256, postTokens: 34_714 } });
  });

  it('압축이 없거나 세션이 없으면 null', () => {
    expect(computeCompaction([], 's1')).toBeNull();
    expect(computeCompaction([ev.compact('c1', '2026-10-01T00:00:00.000Z', 's1', 'auto', 1, 1)], null)).toBeNull();
  });
});

describe('ST8 — 턴 지연·훅 오버헤드', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');

  it('턴 통계(건수·합·중앙값·p90·최장)와 7일 일별 중앙값을 낸다', () => {
    const turns = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((s, i) =>
      ev.turn(`t${i}`, `2026-10-0${i < 5 ? 5 : 6}T0${i % 5}:00:00.000Z`, s * 1000));
    const r = computeTurnHooks([...turns, ev.turn('old', '2026-09-01T00:00:00.000Z', 999_000)], now);
    expect(r.turnCount).toBe(10);
    expect(r.totalTurnMs).toBe(550_000);
    expect(r.medianMs).toBe(55_000);
    expect(r.p90Ms).toBe(91_000);
    expect(r.maxMs).toBe(100_000);
    expect(r.daily).toHaveLength(7);
    expect(r.daily[6]).toEqual({ date: '2026-10-06', count: 5, medianMs: 80_000 });
    expect(r.daily[5]).toEqual({ date: '2026-10-05', count: 5, medianMs: 30_000 });
    expect(r.daily[0]).toEqual({ date: '2026-09-30', count: 0, medianMs: null });
  });

  it('훅은 스크립트 이름별로 합산하고 턴 시간 대비 비율을 낸다', () => {
    const r = computeTurnHooks([
      ev.turn('t1', '2026-10-06T00:00:00.000Z', 100_000),
      ev.hooks('h1', '2026-10-06T00:00:01.000Z', [
        { command: 'node $HOME/.claude/hooks/session-metrics.js', durationMs: 600 },
        { command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/stop-hook.sh"', durationMs: 100 },
      ], 1),
      ev.hooks('h2', '2026-10-06T00:00:02.000Z', [{ command: 'node $HOME/.claude/hooks/session-metrics.js', durationMs: 400 }]),
    ], now);
    expect(r.hooks).toEqual([
      { name: 'session-metrics.js', totalMs: 1000, count: 2, avgMs: 500 },
      { name: 'stop-hook.sh', totalMs: 100, count: 1, avgMs: 100 },
    ]);
    expect(r.hookTotalMs).toBe(1100);
    expect(r.hookShare).toBeCloseTo(0.011, 6);
    expect(r.hookErrorCount).toBe(1);
  });

  it('턴이 없으면 비율은 null(0으로 나누지 않는다), 사이드체인 턴은 제외', () => {
    const r = computeTurnHooks([ev.turn('s', '2026-10-06T00:00:00.000Z', 5000, { isSidechain: true })], now);
    expect(r.turnCount).toBe(0);
    expect(r.medianMs).toBeNull();
    expect(r.hookShare).toBeNull();
  });
});

describe('ST8 — 훅 표시명은 경로를 드러내지 않는다', () => {
  it.each([
    ['node $HOME/.claude/hooks/session-metrics.js', 'session-metrics.js'],
    ['node "/mnt/d/workspace/geobuke-code/dist/cli.js" hook stop', 'cli.js hook stop'],
    ['bash "${CLAUDE_PLUGIN_ROOT}/hooks/stop-hook.sh"', 'stop-hook.sh'],
    ['python3 /home/u/x/check.py --dir /home/u/secret', 'check.py --dir secret'],
    ['my-hook', 'my-hook'],
  ])('%s → %s', (cmd, want) => {
    expect(hookDisplayName(cmd)).toBe(want);
  });
});
