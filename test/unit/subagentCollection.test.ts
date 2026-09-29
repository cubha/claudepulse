import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WorkspaceMapper } from '../../src/services/WorkspaceMapper';
import { emptyToolCounts, mergeRecordsAcrossFiles } from '../../src/services/JsonlParser';
import { CLAUDE_WATCH_DEPTH, isIgnoredWatchPath } from '../../src/services/FileWatcher';
import type { SessionRecord } from '../../src/types';

/**
 * v0.2.5 D-B — Claude Code는 서브에이전트 transcript를 `projects/<p>/<session>/subagents/*.jsonl`에
 * 따로 쓴다(실측: 사이드체인 assistant 기록 전량이 여기에만 있고 최상위 파일엔 0건). 수집기가
 * 프로젝트 폴더 1단계만 읽어 서브에이전트 비용이 통째로 빠졌다(14일 토큰 7.2%).
 */
describe('WorkspaceMapper.getAllJsonlFiles — 서브에이전트 transcript 수집', () => {
  let claudeDir: string;
  let proj: string;
  const touch = (rel: string) => {
    const f = path.join(proj, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '{}\n');
    return f;
  };

  beforeEach(() => {
    claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subagents-'));
    proj = path.join(claudeDir, 'projects', '-repo-a');
    fs.mkdirSync(proj, { recursive: true });
  });
  afterEach(() => fs.rmSync(claudeDir, { recursive: true, force: true }));

  it('최상위 세션 파일과 <session>/subagents/*.jsonl을 함께 반환한다', async () => {
    const top = touch('s1.jsonl');
    const sub = touch('s1/subagents/agent-a1.jsonl');
    const files = await new WorkspaceMapper(claudeDir).getAllJsonlFiles();
    expect(files.sort()).toEqual([top, sub].sort());
  });

  it('subagents의 .meta.json, tool-results, 더 깊은 경로는 수집하지 않는다', async () => {
    touch('s1.jsonl');
    touch('s1/subagents/agent-a1.meta.json');
    touch('s1/tool-results/x.jsonl');
    touch('s1/subagents/nested/deep.jsonl');
    const files = await new WorkspaceMapper(claudeDir).getAllJsonlFiles();
    expect(files.map(f => path.relative(proj, f))).toEqual(['s1.jsonl']);
  });

  it('.orphaned-*/.superseded-* 같은 점 파일 transcript도 최상위에 있으면 수집한다 (중복은 전역 dedup이 제거)', async () => {
    const live = touch('s1.jsonl');
    const orphan = touch('.orphaned-s0.jsonl');
    const superseded = touch('.superseded-s1.jsonl');
    const files = await new WorkspaceMapper(claudeDir).getAllJsonlFiles();
    expect(files.sort()).toEqual([live, orphan, superseded].sort());
  });

  it('subagents 디렉토리가 없는 세션 폴더도 에러 없이 건너뛴다', async () => {
    touch('s1.jsonl');
    touch('s2/tool-results/y.txt');
    const files = await new WorkspaceMapper(claudeDir).getAllJsonlFiles();
    expect(files.map(f => path.relative(proj, f))).toEqual(['s1.jsonl']);
  });
});

function rec(p: Partial<SessionRecord>): SessionRecord {
  return {
    messageId: 'm1', requestId: 'r1', sessionId: 's1', model: 'claude-sonnet-5',
    timestamp: '2026-09-01T00:00:00.000Z', cwd: '/repo/a', gitBranch: 'main',
    usage: {
      input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0,
      cache_creation_5m_input_tokens: 0, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0,
    },
    costUsd: 0.01, toolCounts: emptyToolCounts(), editedFiles: [], isSidechain: false,
    ...p,
  };
}

/**
 * 파일 안 dedup만으로는 부족하다 — 서브에이전트는 부모 대화 이력을 복사해 시작해서, 같은 message.id가
 * 부모 파일(메인 체인)과 subagents 파일(사이드체인)에 함께 나온다(실측 약 45건). CLAUDE.md §3#1.
 */
describe('mergeRecordsAcrossFiles — 파일 간 message.id dedup', () => {
  it('여러 파일에 같은 message.id가 있으면 1건만 남는다', () => {
    const out = mergeRecordsAcrossFiles([[rec({ messageId: 'm1' })], [rec({ messageId: 'm1', isSidechain: true })]]);
    expect(out).toHaveLength(1);
  });

  it('메인 체인 원본이 사이드체인 사본보다 우선한다 — 사본이 더 최신이어도 (비용이 서브에이전트로 새지 않게)', () => {
    const main = rec({ messageId: 'm1', timestamp: '2026-09-01T00:00:00.000Z', isSidechain: false });
    const copy = rec({ messageId: 'm1', timestamp: '2026-09-01T00:05:00.000Z', isSidechain: true, agentId: 'a1' });
    const out = mergeRecordsAcrossFiles([[copy], [main]]);
    expect(out).toEqual([main]);
  });

  it('둘 다 사이드체인이면 더 최신 기록을 남긴다', () => {
    const older = rec({ messageId: 'm1', isSidechain: true, timestamp: '2026-09-01T00:00:00.000Z', costUsd: 0.01 });
    const newer = rec({ messageId: 'm1', isSidechain: true, timestamp: '2026-09-01T00:01:00.000Z', costUsd: 0.02 });
    expect(mergeRecordsAcrossFiles([[newer], [older]])).toEqual([newer]);
  });

  it('사본 파일(.superseded 등)이 같은 메인 체인 기록을 다시 담아도 1건으로 센다', () => {
    const live = rec({ messageId: 'm1', timestamp: '2026-09-01T00:00:00.000Z' });
    const copy = rec({ messageId: 'm1', timestamp: '2026-09-01T00:00:00.000Z' });
    expect(mergeRecordsAcrossFiles([[live], [copy]])).toHaveLength(1);
  });

  it('서로 다른 message.id는 모두 남고 timestamp 오름차순으로 정렬된다', () => {
    const a = rec({ messageId: 'a', timestamp: '2026-09-02T00:00:00.000Z' });
    const b = rec({ messageId: 'b', timestamp: '2026-09-01T00:00:00.000Z', isSidechain: true });
    expect(mergeRecordsAcrossFiles([[a], [b]]).map(r => r.messageId)).toEqual(['b', 'a']);
  });
});

describe('Claude 감시기 — subagents까지 도달하되 tool-results·meta는 폴링하지 않는다', () => {
  it('감시 깊이는 projects/<p>/<session>/subagents/<file>에 닿는 3이다', () => {
    expect(CLAUDE_WATCH_DEPTH).toBe(3);
  });

  it.each([
    ['/h/.claude/projects/p/s1/tool-results', true],
    ['/h/.claude/projects/p/s1/subagents/agent-a.meta.json', true],
    ['/h/.claude/projects/p/.hidden', true],
    ['/h/.claude/projects/p/s1/subagents/agent-a.jsonl', false],
    ['/h/.claude/projects/p/s1.jsonl', false],
    ['/h/.claude', false],
  ])('%s → ignored=%s', (p, want) => {
    expect(isIgnoredWatchPath(p)).toBe(want);
  });

  it('extension이 Claude 감시기에 CLAUDE_WATCH_DEPTH를 넘긴다 (기본값 2 방치 금지)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/extension.ts'), 'utf-8');
    expect(src).toMatch(/new FileWatcher\(undefined, getConfig\(\)\.usageRefreshIntervalMs, 'projects', CLAUDE_WATCH_DEPTH\)/);
  });

  it('refresh 경로가 파일별 레코드를 mergeRecordsAcrossFiles로 합친다 (perFile.flat() 금지)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/extension.ts'), 'utf-8');
    expect(src).toContain('mergeRecordsAcrossFiles(perFile)');
    expect(src).not.toMatch(/allRecords\s*=\s*perFile\.flat\(\)/);
  });
});
