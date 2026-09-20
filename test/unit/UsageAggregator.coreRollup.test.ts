import { describe, it, expect } from 'vitest';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import type { SessionRecord } from '../../src/types';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayIso(hour: string): string {
  return `${todayKey()}T${hour}:00:00.000Z`;
}

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

describe('UsageAggregator — 코어 롤업 [characterization] (v0.1.54 ST1 테스트 백필)', () => {
  it('today는 당일 레코드만 합산한 DailyUsage를 반환한다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, timestamp: todayIso('09') }),
      rec({ costUsd: 2.0, timestamp: todayIso('15') }),
      rec({ costUsd: 99.0, timestamp: '2020-01-01T10:00:00.000Z' }), // 과거 — today에서 제외
    ]);
    expect(r.today.date).toBe(todayKey());
    expect(r.today.costUsd).toBeCloseTo(3.0, 6);
  });

  it('레코드가 없으면 today는 0값 DailyUsage다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([]);
    expect(r.today.date).toBe(todayKey());
    expect(r.today.costUsd).toBe(0);
    expect(r.today.totalTokens).toBe(0);
  });

  it('last7Days는 오늘 포함 7일 연속 배열이며, 데이터 없는 날은 0값으로 채운다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([rec({ costUsd: 5.0, timestamp: todayIso('10') })]);
    expect(r.last7Days.length).toBe(7);
    expect(r.last7Days[6].date).toBe(todayKey()); // 마지막 원소가 오늘
    expect(r.last7Days[6].costUsd).toBeCloseTo(5.0, 6);
    expect(r.last7Days[0].costUsd).toBe(0); // 6일 전 — 데이터 없음
  });

  it('cacheHitRate는 (cacheRead)/(input+cacheCreation+cacheRead)로 일별 계산된다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({
        costUsd: 1.0,
        timestamp: todayIso('09'),
        usage: {
          input_tokens: 100, output_tokens: 50,
          cache_creation_input_tokens: 100, cache_creation_5m_input_tokens: 0,
          cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 300,
        },
      }),
    ]);
    // denom = 100 + 100 + 300 = 500, hitRate = 300/500 = 0.6
    expect(r.today.cacheHitRate).toBeCloseTo(0.6, 6);
  });

  it('토큰 유입이 전혀 없는 날의 cacheHitRate는 0이다(0분모 가드)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([]);
    expect(r.today.cacheHitRate).toBe(0);
  });

  it('modelBreakdown은 당일 레코드만 모델별로 집계하고 비용 내림차순 정렬한다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, timestamp: todayIso('09'), model: 'claude-haiku-4-5' }),
      rec({ costUsd: 5.0, timestamp: todayIso('10'), model: 'claude-opus-4-8' }),
      rec({ costUsd: 99.0, timestamp: '2020-01-01T10:00:00.000Z', model: 'claude-sonnet-4-5' }), // 과거 제외
    ]);
    expect(r.modelBreakdown.map(m => m.model)).toEqual(['claude-opus-4-8', 'claude-haiku-4-5']);
    expect(r.modelBreakdown[0].share).toBeCloseTo(5 / 6, 6);
  });

  it('modelBreakdown이 비어있으면(당일 레코드 없음) share 계산은 0분모를 가드한다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([rec({ costUsd: 1.0, timestamp: '2020-01-01T10:00:00.000Z' })]);
    expect(r.modelBreakdown).toEqual([]);
  });

  it('cacheStats.hitRate/savedUsd는 당일 캐시 유입만 반영한다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({
        costUsd: 1.0,
        timestamp: todayIso('09'),
        model: 'claude-opus-4-8',
        usage: {
          input_tokens: 0, output_tokens: 0,
          cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0,
          cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 1000,
        },
      }),
    ]);
    expect(r.cacheStats.hitRate).toBeCloseTo(1.0, 6);
    expect(r.cacheStats.savedUsd).toBeGreaterThan(0);
  });

  it('알 수 없는 모델(가격 미매칭)은 캐시 절약 계산에서 조용히 0으로 처리된다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({
        costUsd: 1.0,
        timestamp: todayIso('09'),
        model: 'totally-unknown-model-xyz',
        usage: {
          input_tokens: 0, output_tokens: 0,
          cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0,
          cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 1000,
        },
      }),
    ]);
    expect(r.cacheStats.savedUsd).toBe(0);
  });

  it('todayToolCounts는 당일 레코드의 도구 사용량만 합산한다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({
        costUsd: 1.0,
        timestamp: todayIso('09'),
        toolCounts: { ...emptyToolCounts(), edit: 3, bash: 2 },
      }),
      rec({
        costUsd: 1.0,
        timestamp: '2020-01-01T10:00:00.000Z',
        toolCounts: { ...emptyToolCounts(), edit: 100 }, // 과거 — 제외
      }),
    ]);
    expect(r.todayToolCounts.edit).toBe(3);
    expect(r.todayToolCounts.bash).toBe(2);
  });

  it('recentSessions는 세션별 1건으로 묶어 startTime 내림차순 최대 20건 반환한다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, timestamp: '2026-05-01T10:00:00.000Z', sessionId: 'a' }),
      rec({ costUsd: 1.0, timestamp: '2026-05-01T11:00:00.000Z', sessionId: 'a' }), // 동일 세션 — 중복 아님
      rec({ costUsd: 1.0, timestamp: '2026-05-03T10:00:00.000Z', sessionId: 'b' }),
    ]);
    expect(r.recentSessions.map(s => s.sessionId)).toEqual(['b', 'a']);
    expect(r.recentSessions.find(s => s.sessionId === 'a')!.messageCount).toBe(2);
  });

  it('recentSessions는 20건을 초과하면 최신 20건으로 자른다', () => {
    const agg = new UsageAggregator();
    const records = Array.from({ length: 25 }, (_, i) =>
      rec({ costUsd: 1.0, timestamp: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`, sessionId: `s${i}` })
    );
    const r = agg.aggregate(records);
    expect(r.recentSessions.length).toBe(20);
    expect(r.recentSessions[0].sessionId).toBe('s24'); // 가장 최신
  });

  it('recentEditedFiles는 최근 활동순으로 정렬된 파일 경로 최대 20건이다(중복 제거)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, timestamp: '2026-05-01T10:00:00.000Z', editedFiles: ['a.ts'] }),
      rec({ costUsd: 1.0, timestamp: '2026-05-03T10:00:00.000Z', editedFiles: ['b.ts'] }),
      rec({ costUsd: 1.0, timestamp: '2026-05-02T10:00:00.000Z', editedFiles: ['a.ts'] }), // a.ts 최신 갱신
    ]);
    expect(r.recentEditedFiles).toEqual(['b.ts', 'a.ts']);
  });

  it('editedFiles가 빈 레코드만 있으면 recentEditedFiles는 빈 배열이다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([rec({ costUsd: 1.0, timestamp: todayIso('09'), editedFiles: [] })]);
    expect(r.recentEditedFiles).toEqual([]);
  });

  it('todayReasoningTokens는 당일 Codex 레코드의 reasoningTokens만 합산한다(verify-impl B-V2 보완)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, timestamp: todayIso('09'), provider: 'codex', reasoningTokens: 120 }),
      rec({ costUsd: 1.0, timestamp: todayIso('10'), provider: 'codex', reasoningTokens: 30 }),
      rec({ costUsd: 1.0, timestamp: '2020-01-01T10:00:00.000Z', provider: 'codex', reasoningTokens: 999 }), // 과거 — 제외
    ]);
    expect(r.todayReasoningTokens).toBe(150);
  });

  it('Claude 레코드는 reasoningTokens가 미정의라 0으로 합산되고 기존 today 집계는 영향받지 않는다(무행위변경 확인)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 2.0, timestamp: todayIso('09') }), // provider 미지정 = Claude, reasoningTokens 미정의
    ]);
    expect(r.todayReasoningTokens).toBe(0);
    expect(r.today.costUsd).toBeCloseTo(2.0, 6);
  });
});
