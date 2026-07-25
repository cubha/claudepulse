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

describe('UsageAggregator — 스킬별 비용 분해 (#7)', () => {
  it('attributionSkill별 비용·토큰 집계 + 비용 내림차순', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, attributionSkill: 'sh-dev-loop' }),
      rec({ costUsd: 3.0, attributionSkill: 'ship' }),
      rec({ costUsd: 2.0, attributionSkill: 'sh-dev-loop' }),
    ]);
    expect(r.skillBreakdown.map(s => s.skill)).toEqual(['sh-dev-loop', 'ship']);
    const shDev = r.skillBreakdown.find(s => s.skill === 'sh-dev-loop')!;
    expect(shDev.costUsd).toBeCloseTo(3.0, 6);
    // share: sh-dev-loop 3.0 / 총 귀속비용 6.0 = 0.5
    expect(shDev.share).toBeCloseTo(0.5, 6);
  });

  it('attributionSkill 없는 메인 레코드는 스킬 행이 아닌 "스킬 외 작업" 버킷으로 1급 집계', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 5.0 }), // 스킬 미정의 → 버킷
      rec({ costUsd: 1.0, attributionSkill: 'plan' }),
    ]);
    // 버킷은 스킬 행이 아니다
    expect(r.skillBreakdown).toHaveLength(1);
    expect(r.skillBreakdown[0].skill).toBe('plan');
    // 버킷은 1급으로 보존 (숨김/드롭 금지)
    expect(r.skillUnattributed.costUsd).toBeCloseTo(5.0, 6);
    // share 분모 = grand-total(스킬 1.0 + 버킷 5.0 = 6.0) → plan 1.0/6.0
    expect(r.skillBreakdown[0].share).toBeCloseTo(1.0 / 6.0, 6);
  });

  it('서브에이전트(사이드체인)는 스킬 버킷에 포함되지 않음 (이중계산 방지)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 4.0, attributionSkill: 'ship' }),            // 스킬
      rec({ costUsd: 2.0 }),                                      // 스킬 외 (메인)
      rec({ costUsd: 10.0, isSidechain: true, agentId: 'a1' }),   // 서브에이전트 — 스킬/버킷 어디에도 X
    ]);
    // 버킷은 메인체인 스킬 외 작업만 (사이드체인 10.0 제외)
    expect(r.skillUnattributed.costUsd).toBeCloseTo(2.0, 6);
    // share 분모 = grand-total(스킬 4.0 + 버킷 2.0 = 6.0), 사이드체인 미포함
    const ship = r.skillBreakdown.find(s => s.skill === 'ship')!;
    expect(ship.share).toBeCloseTo(4.0 / 6.0, 6);
    // 사이드체인 비용은 subagentStats로만 노출
    expect(r.subagentStats.subagentCostUsd).toBeCloseTo(10.0, 6);
  });
});

describe('UsageAggregator — 24h/7d 기간 스코프 attribution (v0.1.48 ②)', () => {
  function tsAgo(ms: number): string {
    return new Date(Date.now() - ms).toISOString();
  }
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  it('24h 스코프는 24시간 이내 레코드만, 7d는 7일 이내만 포함', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, attributionSkill: 'ship', timestamp: tsAgo(1 * HOUR) }),   // 24h+7d 포함
      rec({ costUsd: 2.0, attributionSkill: 'ship', timestamp: tsAgo(3 * DAY) }),    // 7d만 포함
      rec({ costUsd: 4.0, attributionSkill: 'ship', timestamp: tsAgo(20 * DAY) }),   // 둘 다 제외(전체만)
    ]);

    expect(r.attributionScopes.last24h.skillBreakdown[0]?.costUsd).toBeCloseTo(1.0, 6);
    expect(r.attributionScopes.last7d.skillBreakdown[0]?.costUsd).toBeCloseTo(3.0, 6);
    // 전체(top-level) 스코프는 기존처럼 전달받은 레코드 전체
    expect(r.skillBreakdown[0]?.costUsd).toBeCloseTo(7.0, 6);
  });

  it('24h 스코프에서도 share 분모는 그 스코프의 grand-total(이중계산 없음)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 3.0, attributionSkill: 'ship', timestamp: tsAgo(1 * HOUR) }),
      rec({ costUsd: 1.0, timestamp: tsAgo(1 * HOUR) }), // 스킬 외 버킷, 24h 이내
      rec({ costUsd: 100.0, attributionSkill: 'ship', timestamp: tsAgo(20 * DAY) }), // 24h 밖 — 영향 없어야 함
    ]);
    const scope = r.attributionScopes.last24h;
    expect(scope.skillUnattributed.costUsd).toBeCloseTo(1.0, 6);
    // grand-total = 3.0(ship) + 1.0(버킷) = 4.0 → share = 0.75
    expect(scope.skillBreakdown[0].share).toBeCloseTo(0.75, 6);
  });
});

describe('UsageAggregator — MCP 서버별 호출수 집계 (v0.1.48 ②, 호출 수 기반 share)', () => {
  it('mcpServerCounts를 서버명별로 합산하고 호출수 기반 share를 계산', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, mcpServerCounts: { playwright: 3 } }),
      rec({ costUsd: 1.0, mcpServerCounts: { playwright: 1, 'chrome-devtools': 4 } }),
    ]);
    const byServer = Object.fromEntries(r.mcpServerBreakdown.map(m => [m.server, m]));
    expect(byServer.playwright.callCount).toBe(4);
    expect(byServer['chrome-devtools'].callCount).toBe(4);
    // grand-total 호출수 = 8 → 각 4/8 = 0.5
    expect(byServer.playwright.share).toBeCloseTo(0.5, 6);
    expect(byServer['chrome-devtools'].share).toBeCloseTo(0.5, 6);
  });

  it('MCP 호출 없으면 빈 배열', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([rec({ costUsd: 1.0 })]);
    expect(r.mcpServerBreakdown).toEqual([]);
  });
});

describe('UsageAggregator — 서브에이전트 vs 메인 분리 (#8)', () => {
  it('isSidechain 비용 분리 + 서브에이전트 비중 + 고유 agentId 수', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 6.0, isSidechain: false }),
      rec({ costUsd: 3.0, isSidechain: true, agentId: 'a1' }),
      rec({ costUsd: 1.0, isSidechain: true, agentId: 'a1' }),
      rec({ costUsd: 2.0, isSidechain: true, agentId: 'a2' }),
    ]);
    expect(r.subagentStats.mainCostUsd).toBeCloseTo(6.0, 6);
    expect(r.subagentStats.subagentCostUsd).toBeCloseTo(6.0, 6);
    // 6 / (6+6) = 0.5
    expect(r.subagentStats.subagentShare).toBeCloseTo(0.5, 6);
    expect(r.subagentStats.subagentCount).toBe(2); // a1, a2
  });

  it('서브에이전트 없으면 비중 0', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([rec({ costUsd: 4.0, isSidechain: false })]);
    expect(r.subagentStats.subagentCostUsd).toBe(0);
    expect(r.subagentStats.subagentShare).toBe(0);
    expect(r.subagentStats.subagentCount).toBe(0);
  });
});
