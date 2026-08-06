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

describe('UsageAggregator — SessionSummary.branch (세션 선택기 QuickPick 표시용)', () => {
  it('세션 최신 레코드의 gitBranch를 branch 필드로 노출', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's1', timestamp: '2026-06-12T10:00:00.000Z', gitBranch: 'feat/checkout-v2' }),
    ]);
    const s = r.recentSessions.find(x => x.sessionId === 's1')!;
    expect(s.branch).toBe('feat/checkout-v2');
  });

  it('브랜치가 바뀌며 여러 레코드가 있으면 최신(timestamp 최대) 레코드의 브랜치를 쓴다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's1', timestamp: '2026-06-12T10:00:00.000Z', gitBranch: 'main' }),
      rec({ costUsd: 1.0, sessionId: 's1', timestamp: '2026-06-12T10:05:00.000Z', gitBranch: 'feat/checkout-v2' }),
    ]);
    const s = r.recentSessions.find(x => x.sessionId === 's1')!;
    expect(s.branch).toBe('feat/checkout-v2');
  });
});

describe('UsageAggregator — contextSessions (세션 선택기 QuickPick 후보 목록, SubTask3)', () => {
  it('workspaceRoots 스코프 내 세션만 포함 — recentSessions(cross-project)와 별개', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's-fe', cwd: '/repo/APP-FE', timestamp: '2026-08-06T09:30:00.000Z' }),
      rec({ costUsd: 1.0, sessionId: 's-other', cwd: '/repo/OTHER', timestamp: '2026-08-06T09:00:00.000Z' }),
    ], ['/repo/APP-FE']);
    expect(r.contextSessions.map(s => s.sessionId)).toEqual(['s-fe']);
    // recentSessions는 여전히 cross-project(스코핑 안 됨) — v0.1.49 계약 보존 확인
    expect(r.recentSessions.map(s => s.sessionId).sort()).toEqual(['s-fe', 's-other']);
  });

  it('isSidechain 레코드는 제외(sessionContext와 동일 원칙)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's-main', cwd: '/repo/a', timestamp: '2026-08-06T09:00:00.000Z', isSidechain: false }),
      rec({ costUsd: 1.0, sessionId: 's-sub', cwd: '/repo/a', timestamp: '2026-08-06T09:30:00.000Z', isSidechain: true }),
    ], ['/repo/a']);
    expect(r.contextSessions.map(s => s.sessionId)).toEqual(['s-main']);
  });

  it('lastActivity 내림차순 정렬(최근활동순) — startTime 기준 아님', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      // 더 먼저 시작했지만(startTime 이름), 최근에 더 활동한 세션
      rec({ costUsd: 1.0, sessionId: 's-old-start', cwd: '/repo/a', timestamp: '2026-08-01T00:00:00.000Z' }),
      rec({ costUsd: 1.0, sessionId: 's-old-start', cwd: '/repo/a', timestamp: '2026-08-06T09:30:00.000Z' }),
      rec({ costUsd: 1.0, sessionId: 's-recent-start', cwd: '/repo/a', timestamp: '2026-08-06T08:00:00.000Z' }),
    ], ['/repo/a']);
    expect(r.contextSessions.map(s => s.sessionId)).toEqual(['s-old-start', 's-recent-start']);
  });

  it('workspaceRoots 미지정 시 cross-project 전체가 contextSessions', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's1', cwd: '/repo/a', timestamp: '2026-08-06T09:00:00.000Z' }),
    ]);
    expect(r.contextSessions.map(s => s.sessionId)).toEqual(['s1']);
  });

  it('레코드 없으면 빈 배열', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([]);
    expect(r.contextSessions).toEqual([]);
  });
});

describe('UsageAggregator — contextSessions의 maxWindow/ratio 정밀 계산(scope-critic 지적 수정, SubTask3)', () => {
  it('세션 자체가 200K를 넘긴 관측 증거가 있으면 그 세션의 contextSessions 항목도 1M 윈도로 계산된다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's1', cwd: '/repo/a', model: 'claude-sonnet-5', contextTokens: 303_186 }),
    ], ['/repo/a']);
    const s = r.contextSessions.find(x => x.sessionId === 's1')!;
    expect(s.maxWindow).toBe(1_000_000);
    expect(s.ratio).toBeCloseTo(0.303186, 6);
  });

  it('다른 세션(다른 sessionId)이 같은 모델로 200K를 넘긴 관측 증거만 있어도 그 모델을 쓰는 세션은 1M로 계산된다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's-evidence', cwd: '/repo/a', model: 'claude-sonnet-5', timestamp: '2026-08-01T00:00:00.000Z', contextTokens: 756_610 }),
      rec({ costUsd: 1.0, sessionId: 's-small', cwd: '/repo/a', model: 'claude-sonnet-5', timestamp: '2026-08-06T09:00:00.000Z', contextTokens: 72_492 }),
    ], ['/repo/a']);
    const small = r.contextSessions.find(x => x.sessionId === 's-small')!;
    expect(small.maxWindow).toBe(1_000_000);
    expect(small.ratio).toBeCloseTo(0.072492, 6);
  });

  it('knownOneMillionModels에 있는 모델도 contextSessions에서 1M로 계산된다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate(
      [rec({ costUsd: 1.0, sessionId: 's1', cwd: '/repo/a', model: 'claude-opus-5', contextTokens: 111_909 })],
      ['/repo/a'],
      new Set(['claude-opus-5']),
    );
    const s = r.contextSessions.find(x => x.sessionId === 's1')!;
    expect(s.maxWindow).toBe(1_000_000);
  });

  it('1M 증거가 없는 일반 모델은 기존 200K 테이블 그대로', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's1', cwd: '/repo/a', model: 'claude-opus-4-8', contextTokens: 50_000 }),
    ], ['/repo/a']);
    const s = r.contextSessions.find(x => x.sessionId === 's1')!;
    expect(s.maxWindow).toBe(200_000);
    expect(s.ratio).toBeCloseTo(0.25, 6);
  });

  it('auto 선택된 세션의 sessionContext.ratio와 contextSessions의 동일 세션 ratio가 정확히 일치한다(목록↔게이지 불일치 방지)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's1', cwd: '/repo/a', model: 'claude-sonnet-5', contextTokens: 303_186 }),
    ], ['/repo/a']);
    const listItem = r.contextSessions.find(x => x.sessionId === 's1')!;
    expect(r.sessionContext!.sessionId).toBe('s1');
    expect(listItem.ratio).toBeCloseTo(r.sessionContext!.ratio, 10);
    expect(listItem.maxWindow).toBe(r.sessionContext!.maxWindow);
  });
});
