import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { JsonlParser, emptyToolCounts } from '../../src/services/JsonlParser';
import type { SessionRecord } from '../../src/types';

// v0.2.5b ST4 — 서브에이전트 타입별 비용. 사이드체인 레코드의 top-level attributionAgent 기준.
// 메인 체인은 스킬 집계에 이미 들어가므로 여기엔 절대 섞이지 않는다(이중계산 금지).

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

const side = (costUsd: number, agentId: string, attributionAgent?: string, extra: Partial<SessionRecord> = {}) =>
  rec({ costUsd, isSidechain: true, agentId, attributionAgent, ...extra });

describe('v0.2.5b ST4 — 서브에이전트 타입별 비용 집계', () => {
  it('타입별 비용·토큰·실행수(고유 agentId) 합산 + 비용 내림차순', () => {
    const r = new UsageAggregator().aggregate([
      side(1.0, 'a1', 'scope-critic'),
      side(2.0, 'a1', 'scope-critic'),
      side(1.5, 'a2', 'scope-critic'),
      side(5.0, 'a3', 'general-purpose'),
    ]);
    expect(r.subagentTypeBreakdown.map(t => t.agentType)).toEqual(['general-purpose', 'scope-critic']);
    const sc = r.subagentTypeBreakdown.find(t => t.agentType === 'scope-critic')!;
    expect(sc.costUsd).toBeCloseTo(4.5, 6);
    expect(sc.totalTokens).toBe(450);
    expect(sc.runCount).toBe(2); // a1, a2
  });

  it('메인 체인 레코드는 attributionAgent가 있어도 섞이지 않는다', () => {
    const r = new UsageAggregator().aggregate([
      rec({ costUsd: 9.0, isSidechain: false, attributionAgent: 'scope-critic' }),
      side(1.0, 'a1', 'scope-critic'),
    ]);
    expect(r.subagentTypeBreakdown).toHaveLength(1);
    expect(r.subagentTypeBreakdown[0].costUsd).toBeCloseTo(1.0, 6);
  });

  it('attributionAgent 없는 사이드체인은 "타입 미상" 버킷 — 타입 합계 + 버킷 = subagentCostUsd', () => {
    const r = new UsageAggregator().aggregate([
      side(3.0, 'a1', 'planner'),
      side(1.0, 'a2'),
      side(1.0, 'a3'),
      rec({ costUsd: 7.0 }),
    ]);
    expect(r.subagentTypeUnattributed.costUsd).toBeCloseTo(2.0, 6);
    expect(r.subagentTypeUnattributed.runCount).toBe(2);
    const sum = r.subagentTypeBreakdown.reduce((s, t) => s + t.costUsd, 0) + r.subagentTypeUnattributed.costUsd;
    expect(sum).toBeCloseTo(r.subagentStats.subagentCostUsd, 6);
  });

  it('share 분모 = 사이드체인 총비용(버킷 포함)', () => {
    const r = new UsageAggregator().aggregate([
      side(3.0, 'a1', 'planner'),
      side(1.0, 'a2'),
    ]);
    expect(r.subagentTypeBreakdown[0].share).toBeCloseTo(0.75, 6);
  });

  it('미가격 모델 기여는 타입별 플래그로 남는다(0을 계측값처럼 보이지 않게)', () => {
    const r = new UsageAggregator().aggregate([
      side(0, 'a1', 'fork', { model: 'claude-nextgen-9' }),
      side(0, 'a2', undefined, { model: 'claude-nextgen-9' }),
    ]);
    expect(r.subagentTypeBreakdown[0].hasUnpricedRecords).toBe(true);
    expect(r.subagentTypeUnattributed.hasUnpricedRecords).toBe(true);
    expect(r.subagentTypeUnattributed.totalTokens).toBe(150);
  });

  it('24h/7d 스코프에도 같은 집계가 들어간다', () => {
    const HOUR = 3600e3;
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    const r = new UsageAggregator().aggregate([
      side(1.0, 'a1', 'planner', { timestamp: ago(1 * HOUR) }),
      side(4.0, 'a2', 'planner', { timestamp: ago(72 * HOUR) }),
      side(8.0, 'a3', 'planner', { timestamp: ago(480 * HOUR) }),
    ]);
    expect(r.attributionScopes.last24h.subagentTypeBreakdown[0].costUsd).toBeCloseTo(1.0, 6);
    expect(r.attributionScopes.last7d.subagentTypeBreakdown[0].costUsd).toBeCloseTo(5.0, 6);
    expect(r.subagentTypeBreakdown[0].costUsd).toBeCloseTo(13.0, 6);
  });

  it('서브에이전트가 없으면 빈 목록 + 0 버킷', () => {
    const r = new UsageAggregator().aggregate([rec({ costUsd: 2.0 })]);
    expect(r.subagentTypeBreakdown).toEqual([]);
    expect(r.subagentTypeUnattributed).toEqual({ costUsd: 0, totalTokens: 0, runCount: 0, hasUnpricedRecords: false });
  });
});

describe('v0.2.5b ST4 — 파서가 attributionAgent를 옮긴다', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agenttype-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const line = (extra: Record<string, unknown>) => JSON.stringify({
    type: 'assistant', sessionId: 's1', requestId: 'req-' + Math.random(), timestamp: '2026-09-28T00:00:00.000Z',
    isSidechain: true, agentId: 'ag1',
    message: { id: 'msg-' + Math.random(), model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 5 } },
    ...extra,
  });

  it('attributionAgent 문자열을 SessionRecord.attributionAgent로 보존, 없으면 undefined', async () => {
    const file = path.join(dir, 'agent-x.jsonl');
    fs.writeFileSync(file, line({ attributionAgent: 'acceptance-critic' }) + '\n' + line({}) + '\n');
    const recs = await new JsonlParser().parseFile(file);
    expect(recs.map(r => r.attributionAgent).sort()).toEqual(['acceptance-critic', undefined]);
  });

  it('attributionAgent가 null·빈 문자열이면 "null"/"" 타입을 만들지 않고 미상으로 둔다 (/verify V1)', async () => {
    const file = path.join(dir, 'agent-y.jsonl');
    fs.writeFileSync(file, line({ attributionAgent: null }) + '\n' + line({ attributionAgent: '' }) + '\n');
    const recs = await new JsonlParser().parseFile(file);
    expect(recs.map(r => r.attributionAgent)).toEqual([undefined, undefined]);
  });
});
