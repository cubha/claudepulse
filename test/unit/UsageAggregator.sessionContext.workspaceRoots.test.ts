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

describe('UsageAggregator — sessionContext 멀티루트 workspaceRoots (SubTask2)', () => {
  it('workspaceRoots 배열 — 열린 폴더 중 아무 곳이나 매칭되면 후보(단일 workspaceRoot의 상위집합)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's-fe', cwd: '/repo/APP-FE', timestamp: '2026-08-06T09:00:00.000Z' }),
    ], ['/repo/APP-FE', '/repo/APP-BE', '/repo/BATCH-BE']);
    expect(r.sessionContext).not.toBeNull();
    expect(r.sessionContext!.cwd).toBe('/repo/APP-FE');
  });

  it('오늘 재현된 버그 시나리오 — APP-FE만 활성인데 workspaceRoots에 3개 폴더가 다 열려 있으면 가장 최근(APP-FE)이 선택된다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's-be', cwd: '/repo/APP-BE', timestamp: '2026-08-04T14:00:00.000Z' }), // 1d19h 전 방치
      rec({ costUsd: 1.0, sessionId: 's-batch', cwd: '/repo/BATCH-BE', timestamp: '2026-08-03T11:00:00.000Z' }),
      rec({ costUsd: 1.0, sessionId: 's-fe', cwd: '/repo/APP-FE', timestamp: '2026-08-06T09:30:00.000Z' }), // 방금 — 실제 작업 중
    ], ['/repo/APP-FE', '/repo/APP-BE', '/repo/BATCH-BE']);
    expect(r.sessionContext!.cwd).toBe('/repo/APP-FE');
    expect(r.sessionContext!.mode).toBe('auto');
  });

  it('배열의 어느 폴더에도 매칭되는 레코드가 없으면 null — 전역 폴백 금지(기존 정직성 원칙 유지)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, cwd: '/repo/other', timestamp: '2026-08-06T09:00:00.000Z' }),
    ], ['/repo/APP-FE', '/repo/APP-BE']);
    expect(r.sessionContext).toBeNull();
  });

  it('workspaceRoots 미지정 시 기존 cross-project 동작 유지(하위호환)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, cwd: '/repo/a', timestamp: '2026-06-12T10:00:00.000Z' }),
      rec({ costUsd: 1.0, cwd: '/repo/b', timestamp: '2026-06-12T10:05:00.000Z' }),
    ]);
    expect(r.sessionContext!.cwd).toBe('/repo/b');
    expect(r.sessionContext!.mode).toBe('auto');
  });

  it('sessionContext에 sessionId 필드가 포함된다(QuickPick 하이라이트·pin 매칭용)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 'sess-xyz', cwd: '/repo/a', timestamp: '2026-06-12T10:00:00.000Z' }),
    ]);
    expect(r.sessionContext!.sessionId).toBe('sess-xyz');
  });
});

describe('UsageAggregator — sessionContext pinnedSessionId 고정(pin) 모드 (SubTask2)', () => {
  it('pinnedSessionId가 후보 풀에 있으면 자동 최신값이 아니라 고정 세션의 최신 레코드를 쓴다 — mode=pinned', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate(
      [
        rec({ costUsd: 1.0, sessionId: 's-old', cwd: '/repo/APP-FE', timestamp: '2026-08-06T08:00:00.000Z', contextTokens: 20_000 }),
        rec({ costUsd: 1.0, sessionId: 's-newest', cwd: '/repo/APP-FE', timestamp: '2026-08-06T09:30:00.000Z', contextTokens: 99_000 }), // 자동이면 이게 선택됨
      ],
      ['/repo/APP-FE'],
      undefined,
      's-old', // 사용자가 고정한 세션
    );
    expect(r.sessionContext!.sessionId).toBe('s-old');
    expect(r.sessionContext!.tokens).toBe(20_000);
    expect(r.sessionContext!.mode).toBe('pinned');
    expect(r.sessionContext!.pinMissing).toBeFalsy();
  });

  it('고정한 세션이 여러 레코드를 가지면 그중 최신(마지막) 레코드를 쓴다 — 누적 아님', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate(
      [
        rec({ costUsd: 1.0, sessionId: 's-pin', cwd: '/repo/a', timestamp: '2026-08-06T08:00:00.000Z', contextTokens: 10_000 }),
        rec({ costUsd: 1.0, sessionId: 's-pin', cwd: '/repo/a', timestamp: '2026-08-06T08:30:00.000Z', contextTokens: 15_000 }),
      ],
      ['/repo/a'],
      undefined,
      's-pin',
    );
    expect(r.sessionContext!.tokens).toBe(15_000);
    expect(r.sessionContext!.timestamp).toBe('2026-08-06T08:30:00.000Z');
  });

  it('고정한 세션이 후보 풀에서 사라지면(세션 종료·기록 소멸) 자동 모드로 폴백하고 pinMissing=true를 신호한다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate(
      [
        rec({ costUsd: 1.0, sessionId: 's-alive', cwd: '/repo/APP-FE', timestamp: '2026-08-06T09:30:00.000Z' }),
      ],
      ['/repo/APP-FE'],
      undefined,
      's-gone', // 더 이상 후보 풀에 없는 세션id
    );
    expect(r.sessionContext!.sessionId).toBe('s-alive');
    expect(r.sessionContext!.mode).toBe('auto');
    expect(r.sessionContext!.pinMissing).toBe(true);
  });

  it('고정한 세션의 cwd가 workspaceRoots 밖이면 "찾지 못함" 취급 — 스코프 밖 세션을 억지로 핀할 수 없다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate(
      [
        rec({ costUsd: 1.0, sessionId: 's-outside', cwd: '/repo/OTHER-REPO', timestamp: '2026-08-06T09:00:00.000Z' }),
        rec({ costUsd: 1.0, sessionId: 's-inside', cwd: '/repo/APP-FE', timestamp: '2026-08-06T08:00:00.000Z' }),
      ],
      ['/repo/APP-FE'],
      undefined,
      's-outside',
    );
    expect(r.sessionContext!.sessionId).toBe('s-inside');
    expect(r.sessionContext!.mode).toBe('auto');
    expect(r.sessionContext!.pinMissing).toBe(true);
  });

  it('pinnedSessionId를 지정하지 않으면(undefined) mode=auto, pinMissing은 falsy', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's1', cwd: '/repo/a', timestamp: '2026-08-06T09:00:00.000Z' }),
    ], ['/repo/a']);
    expect(r.sessionContext!.mode).toBe('auto');
    expect(r.sessionContext!.pinMissing).toBeFalsy();
  });

  it('레코드가 아예 없으면 pinnedSessionId 지정 여부와 무관하게 null', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([], ['/repo/a'], undefined, 's-anything');
    expect(r.sessionContext).toBeNull();
  });
});
