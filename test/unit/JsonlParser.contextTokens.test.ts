import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { JsonlParser } from '../../src/services/JsonlParser';

/** assistant 엔트리 한 줄 생성 — usage 객체를 그대로 주입(iterations 포함 가능). */
function line(messageId: string, usage: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'assistant',
    requestId: messageId,
    sessionId: 's1',
    timestamp: '2026-08-03T00:00:00.000Z',
    cwd: '/tmp',
    gitBranch: 'main',
    message: {
      id: messageId,
      model: 'claude-sonnet-5',
      usage,
      content: [],
    },
  }) + '\n';
}

const tmpFiles: string[] = [];
function tmpFile(): string {
  const p = path.join(os.tmpdir(), `claudepulse-ctxtok-${process.pid}-${tmpFiles.length}.jsonl`);
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  for (const p of tmpFiles) { try { fs.unlinkSync(p); } catch { /* noop */ } }
  tmpFiles.length = 0;
});

describe('JsonlParser — SessionRecord.contextTokens (S2, 2026-08-03)', () => {
  it('iterations 없으면 기존 usage 합계로 폴백(레거시 로그 호환)', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, line('m1', {
      input_tokens: 2, output_tokens: 77,
      cache_read_input_tokens: 91_249, cache_creation_input_tokens: 711,
    }));
    const parser = new JsonlParser();
    const [rec] = await parser.parseFile(file);
    expect(rec.contextTokens).toBe(2 + 91_249 + 711);
  });

  it('iterations 있으면 마지막 message iteration 기준(합산 아님) — advisor_message 제외', async () => {
    // 실측 샘플 재현: top-level은 [0]+[2] 합(69,338)이지만 컨텍스트 크기는 [2] 단독(35,310)이어야 함
    const file = tmpFile();
    fs.writeFileSync(file, line('m1', {
      input_tokens: 4, output_tokens: 846,
      cache_read_input_tokens: 64_847, cache_creation_input_tokens: 4_487,
      iterations: [
        { type: 'message', input_tokens: 2, output_tokens: 466, cache_read_input_tokens: 30_821, cache_creation_input_tokens: 3_205 },
        { type: 'advisor_message', input_tokens: 35_633, output_tokens: 7_249, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        { type: 'message', input_tokens: 2, output_tokens: 380, cache_read_input_tokens: 34_026, cache_creation_input_tokens: 1_282 },
      ],
    }));
    const parser = new JsonlParser();
    const [rec] = await parser.parseFile(file);
    expect(rec.contextTokens).toBe(2 + 34_026 + 1_282); // 35,310 — 합산(69,338)이 아님
  });

  it('iterations가 단일 message 항목뿐이면 그 값 그대로(합산과 동일값이라 비구분 케이스)', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, line('m1', {
      input_tokens: 2, output_tokens: 77,
      cache_read_input_tokens: 91_249, cache_creation_input_tokens: 711,
      iterations: [
        { type: 'message', input_tokens: 2, output_tokens: 77, cache_read_input_tokens: 91_249, cache_creation_input_tokens: 711 },
      ],
    }));
    const parser = new JsonlParser();
    const [rec] = await parser.parseFile(file);
    expect(rec.contextTokens).toBe(2 + 91_249 + 711);
  });

  it('iterations 전부 advisor_message뿐인 극단 케이스는 top-level usage 합계로 폴백', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, line('m1', {
      input_tokens: 4, output_tokens: 100,
      cache_read_input_tokens: 1_000, cache_creation_input_tokens: 0,
      iterations: [
        { type: 'advisor_message', input_tokens: 4, output_tokens: 100, cache_read_input_tokens: 1_000, cache_creation_input_tokens: 0 },
      ],
    }));
    const parser = new JsonlParser();
    const [rec] = await parser.parseFile(file);
    expect(rec.contextTokens).toBe(4 + 1_000 + 0);
  });
});
