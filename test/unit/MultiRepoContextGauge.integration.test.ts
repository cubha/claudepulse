import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WorkspaceMapper } from '../../src/services/WorkspaceMapper';
import { JsonlParser } from '../../src/services/JsonlParser';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { buildSessionPickerItems } from '../../src/utils/sessionPicker';

/**
 * 실 파이프라인 3-repo 재현(SubTask6) — 2026-08-06 실사용 버그의 정확한 재현.
 *
 * WorkspaceMapper.getAllJsonlFiles() → JsonlParser.parseFile() → UsageAggregator.aggregate()를
 * 손으로 만든 SessionRecord가 아니라 **실제 jsonl 파일**로 태운다(RetroPipeline.integration.test.ts와
 * 동일한 "실 파이프라인" 원칙). WorkspaceMapper/JsonlParser는 claudeDir을 생성자 인자로 받으므로
 * 실제 ~/.claude/projects는 절대 건드리지 않고 os.tmpdir() 하위 임시 디렉토리만 사용한다.
 *
 * 시나리오: APP-FE(방금 활성) · APP-BE(1d19h 전 방치) · BATCH-BE(2d3h 전 방치) 3-repo를 동시에
 * 열어둔 멀티루트 워크스페이스. 오늘 재현된 버그는 게이지가 APP-BE(비활성)에 고정 표시된 것.
 */
describe('멀티루트 3-repo 실 파이프라인 재현 (SubTask6)', () => {
  let tmpDir: string;
  let feDir: string, beDir: string, batchDir: string;
  let mapper: WorkspaceMapper;
  let parser: JsonlParser;

  function encode(p: string): string {
    return p.replace(/[/\\]/g, '-').replace(/_/g, '-');
  }

  function writeSession(projectDir: string, opts: {
    sessionId: string; cwd: string; branch: string; timestamp: string; contextTokens: number;
  }): void {
    fs.mkdirSync(projectDir, { recursive: true });
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: opts.timestamp,
      cwd: opts.cwd,
      sessionId: opts.sessionId,
      gitBranch: opts.branch,
      requestId: `req-${opts.sessionId}`,
      message: {
        id: `msg-${opts.sessionId}`,
        model: 'claude-sonnet-4-6',
        usage: {
          input_tokens: opts.contextTokens,
          output_tokens: 20,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    });
    fs.writeFileSync(path.join(projectDir, `${opts.sessionId}.jsonl`), line + '\n');
  }

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccg-multirepo-'));
    const claudeDir = path.join(tmpDir, '.claude');
    const projectsDir = path.join(claudeDir, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });

    feDir = path.join(tmpDir, 'workspace', 'APP-FE');
    beDir = path.join(tmpDir, 'workspace', 'APP-BE');
    batchDir = path.join(tmpDir, 'workspace', 'BATCH-BE');

    const now = Date.now();
    writeSession(path.join(projectsDir, encode(feDir)), {
      sessionId: 's-fe', cwd: feDir, branch: 'feat/checkout-v2',
      timestamp: new Date(now - 2 * 60 * 1000).toISOString(), // 방금
      contextTokens: 126_000,
    });
    writeSession(path.join(projectsDir, encode(beDir)), {
      sessionId: 's-be', cwd: beDir, branch: 'main',
      timestamp: new Date(now - (1 * 24 + 19) * 60 * 60 * 1000).toISOString(), // 1d19h 전
      contextTokens: 82_000,
    });
    writeSession(path.join(projectsDir, encode(batchDir)), {
      sessionId: 's-batch', cwd: batchDir, branch: 'main',
      timestamp: new Date(now - (2 * 24 + 3) * 60 * 60 * 1000).toISOString(), // 2d3h 전
      contextTokens: 4_000,
    });

    mapper = new WorkspaceMapper(claudeDir);
    parser = new JsonlParser();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('오늘 재현된 버그 시나리오 — 3-repo 전부 열려있어도 실제 활성(APP-FE)이 자동 선택된다(구버전: APP-BE 고정)', async () => {
    const files = await mapper.getAllJsonlFiles();
    expect(files.length).toBe(3);
    const perFile = await Promise.all(files.map(f => parser.parseFile(f)));
    const records = perFile.flat();
    expect(records.length).toBe(3);

    const agg = new UsageAggregator();
    // 구버전 회귀 재현: workspaceFolders[0] 하나만(APP-BE) 넘기면 APP-FE는 후보에서 탈락
    const oldBuggyResult = agg.aggregate(records, beDir);
    expect(oldBuggyResult.sessionContext!.repoName).toBe('APP-BE');

    // 수정본: 열린 폴더 전체(workspaceRoots 배열)를 넘기면 실제 활성 세션(APP-FE)이 선택된다
    const fixedResult = agg.aggregate(records, [feDir, beDir, batchDir]);
    expect(fixedResult.sessionContext!.repoName).toBe('APP-FE');
    expect(fixedResult.sessionContext!.mode).toBe('auto');
    expect(fixedResult.sessionContext!.tokens).toBe(126_000);
  });

  it('contextSessions에 3-repo 세션이 모두 최근활동순으로 담긴다', async () => {
    const files = await mapper.getAllJsonlFiles();
    const perFile = await Promise.all(files.map(f => parser.parseFile(f)));
    const records = perFile.flat();

    const agg = new UsageAggregator();
    const result = agg.aggregate(records, [feDir, beDir, batchDir]);
    expect(result.contextSessions.map(s => s.sessionId)).toEqual(['s-fe', 's-be', 's-batch']);
  });

  it('APP-BE를 세션 선택기로 고정(pin)하면 방금 활성인 APP-FE보다 우선 표시된다', async () => {
    const files = await mapper.getAllJsonlFiles();
    const perFile = await Promise.all(files.map(f => parser.parseFile(f)));
    const records = perFile.flat();

    const agg = new UsageAggregator();
    const pinned = agg.aggregate(records, [feDir, beDir, batchDir], undefined, 's-be');
    expect(pinned.sessionContext!.repoName).toBe('APP-BE');
    expect(pinned.sessionContext!.mode).toBe('pinned');
    expect(pinned.sessionContext!.pinMissing).toBeFalsy();
  });

  it('세션이 종료된 뒤(다음 jsonl 스캔에서 사라짐) 고정을 시도하면 자동으로 폴백 + pinMissing 신호', async () => {
    const files = await mapper.getAllJsonlFiles();
    const perFile = await Promise.all(files.map(f => parser.parseFile(f)));
    const records = perFile.flat();

    const agg = new UsageAggregator();
    const result = agg.aggregate(records, [feDir, beDir, batchDir], undefined, 's-does-not-exist');
    expect(result.sessionContext!.repoName).toBe('APP-FE'); // auto 폴백
    expect(result.sessionContext!.mode).toBe('auto');
    expect(result.sessionContext!.pinMissing).toBe(true);
  });

  it('세션 선택기(QuickPick) 아이템이 실 파이프라인 데이터로도 올바르게 배지·정렬된다', async () => {
    const files = await mapper.getAllJsonlFiles();
    const perFile = await Promise.all(files.map(f => parser.parseFile(f)));
    const records = perFile.flat();

    const agg = new UsageAggregator();
    const result = agg.aggregate(records, [feDir, beDir, batchDir]);
    const items = buildSessionPickerItems(result.contextSessions, null, Date.now(), 4 * 60 * 60 * 1000);

    expect(items.map(i => i.repoName)).toEqual(['APP-FE', 'APP-BE', 'BATCH-BE']);
    expect(items[0].badge).toBe('auto'); // APP-FE
    expect(items[1].badge).toBeNull();
    expect(items[1].isStale).toBe(true); // APP-BE, 1d19h 전 > 4h 임계
    expect(items[2].isStale).toBe(true); // BATCH-BE, 2d3h 전
  });
});
