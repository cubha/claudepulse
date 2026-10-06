import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { parseRolloutLines, hasMeaningfulCodexLimits } from '../../../src/sources/codex/codexRollout';
import { CodexSource, rolloutLinesToSessionRecords } from '../../../src/sources/codex/CodexSource';
import { UsageAggregator } from '../../../src/services/UsageAggregator';
import { CODEX_CAPABILITIES } from '../../../src/sources/AgentSource';

// v0.2.6 ST9(크레딧·지출통제·차단사유) · ST11(Codex 서브에이전트).
// 스키마 근거: openai/codex ade17c6 protocol.rs RateLimitSnapshot·SubAgentSource.
// 서브에이전트 fixture는 2026-10-06 이 머신에서 codex-cli 0.160.1 `codex exec`로 생성한 실물(README).

const FIXTURE_DIR = path.join(__dirname, '../../fixtures/codex');
const loadLines = (f: string) => fs.readFileSync(path.join(FIXTURE_DIR, f), 'utf-8').split('\n').filter(l => l.trim());
const PARENT = 'real-free-subagent-parent-cli0.160.1.jsonl';
const CHILD = 'real-free-subagent-child-cli0.160.1.jsonl';
const PARENT_ID = '01a1115b-0425-75e1-a25f-3f5414740f4f';
const CHILD_ID = '01a1115b-1ebc-71f0-926e-6eee5e12a545';

const tokenCount = (rateLimits: unknown) => JSON.stringify({
  timestamp: '2026-10-06T00:00:00.000Z', type: 'event_msg',
  payload: { type: 'token_count', info: null, rate_limits: rateLimits },
});
const paidLike = {
  limit_id: 'codex', limit_name: null,
  primary: { used_percent: 40, window_minutes: 300, resets_at: 1792000000 },
  secondary: { used_percent: 10, window_minutes: 10080, resets_at: 1792500000 },
  credits: { has_credits: true, unlimited: false, balance: '12.50' },
  individual_limit: { limit: '100', used: '87.5', remaining_percent: 12, resets_at: 1793000000 },
  spend_control_reached: false,
  plan_type: 'plus',
  rate_limit_reached_type: 'workspace_member_usage_limit_reached',
};

describe('ST9 — Codex 크레딧·지출통제·차단 사유 파싱', () => {
  it('rate_limits의 추가 필드를 extras로 옮긴다', () => {
    const [line] = parseRolloutLines([tokenCount(paidLike)]);
    expect(line.type).toBe('token_count');
    if (line.type !== 'token_count') return;
    expect(line.rateLimits?.extras).toEqual({
      credits: { hasCredits: true, unlimited: false, balance: '12.50' },
      individualLimit: { limit: '100', used: '87.5', remainingPercent: 12, resetsAt: 1793000000 },
      spendControlReached: false,
      rateLimitReachedType: 'workspace_member_usage_limit_reached',
    });
  });

  it('free 실물의 credits{false,false,null}·나머지 null은 "의미 없음"이다 — 숨김', () => {
    const lines = parseRolloutLines(loadLines(PARENT));
    const tc = lines.find(l => l.type === 'token_count');
    expect(tc && tc.type === 'token_count' && tc.rateLimits?.extras).toEqual({
      credits: { hasCredits: false, unlimited: false, balance: null },
      individualLimit: null, spendControlReached: null, rateLimitReachedType: null,
    });
    expect(hasMeaningfulCodexLimits(tc && tc.type === 'token_count' ? tc.rateLimits?.extras : undefined)).toBe(false);
  });

  it.each([
    [{ credits: { hasCredits: true, unlimited: false, balance: null }, individualLimit: null, spendControlReached: null, rateLimitReachedType: null }, true],
    [{ credits: { hasCredits: false, unlimited: true, balance: null }, individualLimit: null, spendControlReached: null, rateLimitReachedType: null }, true],
    [{ credits: null, individualLimit: null, spendControlReached: true, rateLimitReachedType: null }, true],
    [{ credits: null, individualLimit: null, spendControlReached: false, rateLimitReachedType: null }, false],
    [{ credits: null, individualLimit: null, spendControlReached: null, rateLimitReachedType: 'rate_limit_reached' }, true],
    [{ credits: null, individualLimit: { limit: '1', used: '0', remainingPercent: 100, resetsAt: 0 }, spendControlReached: null, rateLimitReachedType: null }, true],
  ])('hasMeaningfulCodexLimits(%j) = %s', (extras, want) => {
    expect(hasMeaningfulCodexLimits(extras)).toBe(want);
  });

  describe('loadLatestRateLimit이 최신 extras를 싣는다', () => {
    const dirs: string[] = [];
    afterEach(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); dirs.length = 0; });

    it('최신 token_count의 extras', async () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-extras-'));
      dirs.push(home);
      const day = path.join(home, 'sessions/2026/10/06');
      fs.mkdirSync(day, { recursive: true });
      fs.writeFileSync(path.join(day, 'rollout-a.jsonl'), tokenCount(paidLike) + '\n');
      const snap = await new CodexSource(home).loadLatestRateLimit();
      expect(snap?.extras?.credits?.balance).toBe('12.50');
      expect(snap?.extras?.rateLimitReachedType).toBe('workspace_member_usage_limit_reached');
    });
  });
});

describe('ST11 — Codex 서브에이전트(실물 fixture)', () => {
  it('session_meta.source의 thread_spawn을 snake_case로 읽는다', () => {
    const metas = parseRolloutLines(loadLines(CHILD)).filter(l => l.type === 'session_meta');
    const own = metas[0];
    expect(own.type === 'session_meta' && own.subagent).toEqual({
      parentThreadId: PARENT_ID, depth: 1, agentRole: null, agentPath: '/root/count_txt', agentNickname: 'Chandrasekhar',
    });
    const parentCopy = metas[1];
    expect(parentCopy.type === 'session_meta' && parentCopy.subagent).toBeNull();
  });

  it('레코드의 thread_id ≠ session_id 이면 사이드체인 — sessionId는 루트 세션, agentId는 스레드', () => {
    const child = rolloutLinesToSessionRecords(loadLines(CHILD));
    expect(child).toHaveLength(2);
    for (const r of child) {
      expect(r.isSidechain).toBe(true);
      expect(r.sessionId).toBe(PARENT_ID);
      expect(r.agentId).toBe(CHILD_ID);
    }
    const parent = rolloutLinesToSessionRecords(loadLines(PARENT));
    expect(parent).toHaveLength(3);
    for (const r of parent) {
      expect(r.isSidechain).toBe(false);
      expect(r.sessionId).toBe(PARENT_ID);
      expect(r.agentId).toBeUndefined();
    }
  });

  it('구버전 레코드(session_id·thread_id 없음)는 기존처럼 메인 체인이다', () => {
    const old = rolloutLinesToSessionRecords(loadLines('real-free-exec-1turn-cli0.155.1.jsonl'));
    expect(old.every(r => !r.isSidechain && r.agentId === undefined)).toBe(true);
  });

  describe('CodexSource 전 파일 로드 → 집계', () => {
    const dirs: string[] = [];
    afterEach(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); dirs.length = 0; });

    it('부모 3 + 서브 2 레코드, 서브에이전트 비중이 집계된다(같은 세션)', async () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sub-'));
      dirs.push(home);
      const day = path.join(home, 'sessions/2026/10/06');
      fs.mkdirSync(day, { recursive: true });
      fs.copyFileSync(path.join(FIXTURE_DIR, PARENT), path.join(day, 'rollout-2026-10-06T22-15-41-p.jsonl'));
      fs.copyFileSync(path.join(FIXTURE_DIR, CHILD), path.join(day, 'rollout-2026-10-06T22-15-46-c.jsonl'));
      const recs = await new CodexSource(home).loadAllSessionRecords();
      expect(recs).toHaveLength(5);
      expect(new Set(recs.map(r => r.sessionId))).toEqual(new Set([PARENT_ID]));
      const s = new UsageAggregator().aggregate(recs);
      expect(s.subagentStats.subagentCount).toBe(1);
      // fixture 모델 gpt-6-luna는 Codex 가격표에 없다(비용 0) — 비중(비용 기준)이 아니라 '미상' 플래그로 확인한다.
      // (작성 시 비중>0을 단언했으나 fixture 데이터 사실과 어긋난 전제였다 — VERIFY-SPEC ST11 참조)
      expect(s.subagentStats.subagentHasUnpriced).toBe(true);
      expect(recs.filter(r => r.isSidechain).reduce((t, r) => t + r.usage.output_tokens, 0)).toBe(51 + 5);
      // agent_role이 null(기본 역할)이면 타입 미상 버킷 — 임의 이름을 만들지 않는다
      expect(s.subagentTypeBreakdown).toEqual([]);
      expect(s.subagentTypeUnattributed.runCount).toBe(1);
    });
  });

  it('capability: Codex도 서브에이전트 귀속을 지원한다', () => {
    expect(CODEX_CAPABILITIES.subagentAttribution).toBe(true);
  });
});
