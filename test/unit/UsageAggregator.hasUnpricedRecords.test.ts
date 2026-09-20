import { describe, it, expect } from 'vitest';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import type { SessionRecord } from '../../src/types';

// defer #9 — fmtCost(0)이 "미가격"과 "실측 0"을 구분 못하는 문제의 구조적 해법.
// 세션/브랜치/스킬/서브에이전트 집계가 costUsd===0일 때 그게 실측 0인지 가격 미상인지
// 판별할 수 있도록 hasUnpricedRecords(mainHasUnpriced/subagentHasUnpriced)를 OR 누적한다.
// unpricedModels(today 스코프)로는 recentSessions(최근 20개)·branchBreakdown(전체기간)·
// skillBreakdown(전체/24h/7d)을 판별할 수 없어(advisor 지적) 레코드 단위로 별도 추적한다.

const UNPRICED_MODEL = 'totally-unknown-model-xyz-9000';

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

describe('UsageAggregator — hasUnpricedRecords (defer #9)', () => {
  it('세션 전체가 미가격 모델뿐이면 costUsd=0 && hasUnpricedRecords=true', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 0, sessionId: 's1', model: UNPRICED_MODEL }),
    ]);
    const s = r.recentSessions.find(x => x.sessionId === 's1')!;
    expect(s.costUsd).toBe(0);
    expect(s.hasUnpricedRecords).toBe(true);
  });

  it('세션이 가격표 모델뿐이면 hasUnpricedRecords=false (실측 0과 혼동 금지)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 0, sessionId: 's1', model: 'claude-opus-4-8' }),
    ]);
    const s = r.recentSessions.find(x => x.sessionId === 's1')!;
    expect(s.hasUnpricedRecords).toBe(false);
  });

  it('세션에 가격+미가격 레코드가 섞이면 hasUnpricedRecords=true(과소계상 신호 보존)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, sessionId: 's1', model: 'claude-opus-4-8', timestamp: '2026-06-12T10:00:00.000Z' }),
      rec({ costUsd: 0, sessionId: 's1', model: UNPRICED_MODEL, timestamp: '2026-06-12T10:05:00.000Z' }),
    ]);
    const s = r.recentSessions.find(x => x.sessionId === 's1')!;
    expect(s.hasUnpricedRecords).toBe(true);
  });

  it('브랜치 전체가 미가격 모델뿐이면 hasUnpricedRecords=true', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 0, gitBranch: 'feat/x', model: UNPRICED_MODEL }),
    ]);
    const b = r.branchBreakdown.find(x => x.branch === 'feat/x')!;
    expect(b.hasUnpricedRecords).toBe(true);
  });

  it('브랜치가 가격표 모델뿐이면 hasUnpricedRecords=false', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 0.5, gitBranch: 'feat/x', model: 'claude-opus-4-8' }),
    ]);
    const b = r.branchBreakdown.find(x => x.branch === 'feat/x')!;
    expect(b.hasUnpricedRecords).toBe(false);
  });

  it('스킬 귀속 레코드가 미가격이면 skillBreakdown 행의 hasUnpricedRecords=true', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 0, model: UNPRICED_MODEL, attributionSkill: 'sh-dev-loop', isSidechain: false }),
    ]);
    const sk = r.skillBreakdown.find(x => x.skill === 'sh-dev-loop')!;
    expect(sk.hasUnpricedRecords).toBe(true);
  });

  it('스킬 미귀속 버킷(skillUnattributed)도 동일하게 판별된다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 0, model: UNPRICED_MODEL, isSidechain: false }),
    ]);
    expect(r.skillUnattributed.hasUnpricedRecords).toBe(true);
  });

  it('서브에이전트(isSidechain=true) 미가격이면 subagentHasUnpriced=true, main은 영향 없음', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, model: 'claude-opus-4-8', isSidechain: false, sessionId: 's1' }),
      rec({ costUsd: 0, model: UNPRICED_MODEL, isSidechain: true, agentId: 'sub-1', sessionId: 's1' }),
    ]);
    expect(r.subagentStats.subagentHasUnpriced).toBe(true);
    expect(r.subagentStats.mainHasUnpriced).toBe(false);
  });
});
