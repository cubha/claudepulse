import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

// node:fs는 spyOn으로 재정의 불가(non-configurable) → 부분 목으로 createReadStream 호출만 기록.
const h = vi.hoisted(() => ({ calls: [] as Array<{ start?: number }> }));

vi.mock('node:fs', async (importActual) => {
  const actual = await importActual<typeof import('node:fs')>();
  return {
    ...actual,
    default: actual,
    createReadStream: (p: fs.PathLike, opts?: { start?: number }) => {
      h.calls.push({ start: opts?.start });
      return actual.createReadStream(p, opts as Parameters<typeof actual.createReadStream>[1]);
    },
  };
});

import * as fs from 'node:fs';
import { JsonlParser } from '../../src/services/JsonlParser';

/** assistant 엔트리 한 줄 생성. */
function line(messageId: string, ts: string): string {
  return JSON.stringify({
    type: 'assistant',
    requestId: messageId,
    sessionId: 's1',
    timestamp: ts,
    cwd: '/tmp',
    gitBranch: 'main',
    message: {
      id: messageId,
      model: 'claude-opus-4-8',
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content: [],
    },
  }) + '\n';
}

const tmpFiles: string[] = [];
function tmpFile(): string {
  const p = path.join(os.tmpdir(), `claudepulse-incr-${process.pid}-${tmpFiles.length}.jsonl`);
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  h.calls.length = 0;
  for (const p of tmpFiles) { try { fs.unlinkSync(p); } catch { /* noop */ } }
  tmpFiles.length = 0;
});

describe('JsonlParser — 증분 파싱 (#1)', () => {
  it('파일 추가분만 cached.offset 부터 읽는다 (전체 재파싱 금지)', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, line('m1', '2026-06-12T10:00:00.000Z'));
    const firstSize = fs.statSync(file).size;

    const parser = new JsonlParser();
    const first = await parser.parseFile(file);
    expect(first).toHaveLength(1);

    // 새 라인 append + mtime 강제 갱신(테스트 속도로 mtimeMs 동일해지는 것 방지)
    fs.appendFileSync(file, line('m2', '2026-06-12T10:01:00.000Z'));
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);

    h.calls.length = 0; // 두 번째 parseFile 의 읽기만 관측
    const second = await parser.parseFile(file);

    // 핵심: 두 번째 호출은 firstSize 바이트 offset 부터 읽어야 한다 (버그 시 0)
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].start).toBe(firstSize);

    // 정합성: 이전 + 신규 레코드 병합
    expect(second.map(r => r.messageId).sort()).toEqual(['m1', 'm2']);
  });

  it('mtime 동일하면 캐시 즉시 반환 (재읽기 없음)', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, line('m1', '2026-06-12T10:00:00.000Z'));
    const parser = new JsonlParser();
    await parser.parseFile(file);

    h.calls.length = 0;
    const again = await parser.parseFile(file);
    expect(h.calls).toHaveLength(0);
    expect(again).toHaveLength(1);
  });

  it('파일이 잘려 offset 이 현재 크기보다 크면 전체 재파싱으로 폴백', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, line('m1', '2026-06-12T10:00:00.000Z') + line('m2', '2026-06-12T10:01:00.000Z'));
    const parser = new JsonlParser();
    const first = await parser.parseFile(file);
    expect(first).toHaveLength(2);

    // 파일 교체(절단): 더 작은 단일 라인. mtime 갱신.
    fs.writeFileSync(file, line('m3', '2026-06-12T10:02:00.000Z'));
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);

    h.calls.length = 0;
    const second = await parser.parseFile(file);
    expect(h.calls[0].start).toBe(0); // 폴백: 처음부터
    expect(second.map(r => r.messageId)).toContain('m3');
  });
});
