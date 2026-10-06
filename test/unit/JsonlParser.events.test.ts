import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { JsonlParser, mergeEventsAcrossFiles } from '../../src/services/JsonlParser';
import type { JournalEvent } from '../../src/types';

// v0.2.6 ST1 — 비-assistant 이벤트 채널. 필드 모양은 2026-10-06 로컬 jsonl 실측을 그대로 옮겼다
// (PLAN-v0.2.6 §2-3).

const tmpFiles: string[] = [];
function tmpFile(): string {
  const p = path.join(os.tmpdir(), `claudepulse-events-${process.pid}-${tmpFiles.length}.jsonl`);
  tmpFiles.push(p);
  return p;
}
afterEach(() => {
  for (const p of tmpFiles) { try { fs.unlinkSync(p); } catch { /* noop */ } }
  tmpFiles.length = 0;
});

const j = (o: unknown) => JSON.stringify(o) + '\n';

function assistant(id: string, ts: string, extra: Record<string, unknown> = {}, usageExtra: Record<string, unknown> = {}, msgExtra: Record<string, unknown> = {}): string {
  return j({
    type: 'assistant', requestId: `req-${id}`, sessionId: 's1', timestamp: ts, cwd: '/w', gitBranch: 'main',
    ...extra,
    message: {
      id, model: 'claude-opus-4-8',
      usage: { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usageExtra },
      content: [],
      ...msgExtra,
    },
  });
}

const turnDuration = (uuid: string, ts: string, ms: number) =>
  j({ type: 'system', subtype: 'turn_duration', uuid, sessionId: 's1', timestamp: ts, durationMs: ms, messageCount: 12, isSidechain: false });

const stopHooks = (uuid: string, ts: string) => j({
  type: 'system', subtype: 'stop_hook_summary', uuid, sessionId: 's1', timestamp: ts, isSidechain: false,
  hookCount: 2,
  hookInfos: [
    { command: 'node $HOME/.claude/hooks/session-metrics.js', durationMs: 62 },
    { command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/stop-hook.sh"', durationMs: 32 },
  ],
  hookErrors: ['boom'], preventedContinuation: false,
});

const compact = (uuid: string, ts: string) => j({
  type: 'system', subtype: 'compact_boundary', uuid, sessionId: 's1', timestamp: ts, isSidechain: false,
  compactMetadata: { trigger: 'auto', preTokens: 786256, postTokens: 34714, durationMs: 142086 },
});

const prLink = (ts: string, n = 7) =>
  j({ type: 'pr-link', sessionId: 's1', prNumber: n, prUrl: `https://github.com/o/r/pull/${n}`, prRepository: 'o/r', timestamp: ts });

const rateLimited = (uuid: string, ts: string) => j({
  type: 'assistant', uuid, requestId: `req-${uuid}`, sessionId: 's1', timestamp: ts, isSidechain: false,
  error: 'rate_limit', isApiErrorMessage: true, apiErrorStatus: 429,
  quotaLimits: { status: 'rejected', resetsAt: 1788928200, rateLimitType: 'five_hour', overageStatus: 'rejected', overageDisabledReason: 'out_of_credits' },
  message: { id: `syn-${uuid}`, model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 }, content: [] },
});

const overloaded = (uuid: string, ts: string) => j({
  type: 'assistant', uuid, requestId: `req-${uuid}`, sessionId: 's1', timestamp: ts, isSidechain: false,
  error: 'overloaded', isApiErrorMessage: true, apiErrorStatus: 529,
  message: { id: `syn-${uuid}`, model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 }, content: [] },
});

describe('JsonlParser — 비-assistant 이벤트 채널 (v0.2.6 ST1)', () => {
  it('turn_duration·stop_hook_summary·compact_boundary·pr-link·API 오류를 이벤트로 수집한다', async () => {
    const file = tmpFile();
    fs.writeFileSync(file,
      turnDuration('u1', '2026-10-01T00:00:01.000Z', 80243)
      + stopHooks('u2', '2026-10-01T00:00:02.000Z')
      + compact('u3', '2026-10-01T00:00:03.000Z')
      + prLink('2026-10-01T00:00:04.000Z')
      + rateLimited('u5', '2026-10-01T00:00:05.000Z')
      + overloaded('u6', '2026-10-01T00:00:06.000Z'));
    const parser = new JsonlParser();
    await parser.parseFile(file);
    const ev = parser.getEvents(file);

    expect(ev.map(e => e.kind)).toEqual(['turn_duration', 'stop_hooks', 'compact', 'pr_link', 'api_error', 'api_error']);
    expect(ev[0]).toMatchObject({ kind: 'turn_duration', sessionId: 's1', durationMs: 80243, messageCount: 12, isSidechain: false });
    expect(ev[1]).toMatchObject({
      kind: 'stop_hooks', errorCount: 1, preventedContinuation: false,
      hooks: [
        { command: 'node $HOME/.claude/hooks/session-metrics.js', durationMs: 62 },
        { command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/stop-hook.sh"', durationMs: 32 },
      ],
    });
    expect(ev[2]).toMatchObject({ kind: 'compact', trigger: 'auto', preTokens: 786256, postTokens: 34714, durationMs: 142086 });
    expect(ev[3]).toMatchObject({ kind: 'pr_link', prNumber: 7, prRepository: 'o/r', prUrl: 'https://github.com/o/r/pull/7' });
    expect(ev[4]).toMatchObject({
      kind: 'api_error', status: 429, error: 'rate_limit',
      quota: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: 1788928200, overageStatus: 'rejected', overageDisabledReason: 'out_of_credits' },
    });
    expect(ev[5]).toMatchObject({ kind: 'api_error', status: 529, error: 'overloaded' });
    expect((ev[5] as Extract<JournalEvent, { kind: 'api_error' }>).quota).toBeUndefined();
  });

  it('증분 파싱 시 이벤트는 덮어쓰지 않고 누적된다(costSnapshots의 last-wins와 다르다)', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, turnDuration('u1', '2026-10-01T00:00:01.000Z', 1000));
    const parser = new JsonlParser();
    await parser.parseFile(file);
    fs.appendFileSync(file, turnDuration('u2', '2026-10-01T00:00:02.000Z', 2000));
    await parser.parseFile(file);
    expect(parser.getEvents(file).map(e => e.eventKey)).toEqual(['u1', 'u2']);
  });

  it('쓰는 중인 반쪽 줄의 이벤트는 다음 파싱에서 한 번만 잡힌다', async () => {
    const file = tmpFile();
    const full = turnDuration('u1', '2026-10-01T00:00:01.000Z', 1000);
    fs.writeFileSync(file, full.slice(0, 30));
    const parser = new JsonlParser();
    await parser.parseFile(file);
    expect(parser.getEvents(file)).toHaveLength(0);
    fs.appendFileSync(file, full.slice(30));
    await parser.parseFile(file);
    expect(parser.getEvents(file).map(e => e.eventKey)).toEqual(['u1']);
  });

  it('파일이 잘려 전체 재파싱하면 이벤트도 처음부터 다시 만든다(중복 누적 금지)', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, turnDuration('u1', '2026-10-01T00:00:01.000Z', 1000) + turnDuration('u2', '2026-10-01T00:00:02.000Z', 1000));
    const parser = new JsonlParser();
    await parser.parseFile(file);
    fs.writeFileSync(file, turnDuration('u9', '2026-10-01T00:00:09.000Z', 1000));
    await parser.parseFile(file);
    expect(parser.getEvents(file).map(e => e.eventKey)).toEqual(['u9']);
  });

  it('API 오류 레코드는 기존처럼 사용량 레코드로도 남는다(무행위변경)', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, rateLimited('u5', '2026-10-01T00:00:05.000Z'));
    const parser = new JsonlParser();
    const recs = await parser.parseFile(file);
    expect(recs.map(r => r.model)).toEqual(['<synthetic>']);
  });
});

describe('mergeEventsAcrossFiles — 파일 간 dedup', () => {
  it('같은 uuid 이벤트는 한 번만 남기고 시간순 정렬한다', async () => {
    const a = tmpFile(); const b = tmpFile();
    fs.writeFileSync(a, turnDuration('u2', '2026-10-01T00:00:02.000Z', 2000) + turnDuration('u1', '2026-10-01T00:00:01.000Z', 1000));
    fs.writeFileSync(b, turnDuration('u1', '2026-10-01T00:00:01.000Z', 1000));
    const parser = new JsonlParser();
    await parser.parseFile(a); await parser.parseFile(b);
    const merged = mergeEventsAcrossFiles([parser.getEvents(a), parser.getEvents(b)]);
    expect(merged.map(e => e.eventKey)).toEqual(['u1', 'u2']);
  });

  it('pr-link는 uuid가 없어 (repo, PR번호, 세션)으로 dedup한다 — 같은 PR이 반복 기록된다(실측 178키)', async () => {
    const a = tmpFile();
    fs.writeFileSync(a, prLink('2026-10-01T00:00:01.000Z') + prLink('2026-10-01T00:05:00.000Z') + prLink('2026-10-01T00:06:00.000Z', 8));
    const parser = new JsonlParser();
    await parser.parseFile(a);
    const merged = mergeEventsAcrossFiles([parser.getEvents(a)]);
    expect(merged.filter(e => e.kind === 'pr_link').map(e => (e as Extract<JournalEvent, { kind: 'pr_link' }>).prNumber)).toEqual([7, 8]);
  });
});

describe('SessionRecord 신규 필드 (v0.2.6 ST1)', () => {
  it('cache_miss_reason은 원인과 토큰을, 토큰이 없는 원인은 null(미상)로 옮긴다', async () => {
    const file = tmpFile();
    fs.writeFileSync(file,
      assistant('m1', '2026-10-01T00:00:01.000Z', {}, {}, { diagnostics: { cache_miss_reason: { type: 'messages_changed', cache_missed_input_tokens: 1234 } } })
      + assistant('m2', '2026-10-01T00:00:02.000Z', {}, {}, { diagnostics: { cache_miss_reason: { type: 'previous_message_not_found' } } })
      + assistant('m3', '2026-10-01T00:00:03.000Z'));
    const recs = await new JsonlParser().parseFile(file);
    expect(recs[0].cacheMiss).toEqual({ reason: 'messages_changed', missedTokens: 1234 });
    expect(recs[1].cacheMiss).toEqual({ reason: 'previous_message_not_found', missedTokens: null });
    expect(recs[2].cacheMiss).toBeUndefined();
  });

  it('thinking_tokens·effort를 옮기고, 없으면 미정의로 둔다', async () => {
    const file = tmpFile();
    fs.writeFileSync(file,
      assistant('m1', '2026-10-01T00:00:01.000Z', { effort: 'high', perTurnEffort: null }, { output_tokens_details: { thinking_tokens: 42 } })
      + assistant('m2', '2026-10-01T00:00:02.000Z'));
    const recs = await new JsonlParser().parseFile(file);
    expect(recs[0].thinkingTokens).toBe(42);
    expect(recs[0].effort).toBe('high');
    expect(recs[1].thinkingTokens).toBeUndefined();
    expect(recs[1].effort).toBeUndefined();
  });
});
