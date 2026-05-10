import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { JsonlParser } from '../../src/services/JsonlParser';

function makeEntry(
  messageId: string,
  sessionId = 'sess1',
  model = 'claude-sonnet-4-5',
  extraContent = ''
): string {
  return JSON.stringify({
    type: 'assistant',
    sessionId,
    timestamp: new Date().toISOString(),
    cwd: '/tmp/proj',
    message: {
      id: messageId,
      model,
      usage: { input_tokens: 100, output_tokens: 50 },
    },
    ...(extraContent ? { _extra: extraContent } : {}),
  });
}

describe('JsonlParser', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-parser-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('parses a single valid entry', async () => {
    const parser = new JsonlParser();
    const file = path.join(tmpDir, 'session.jsonl');
    await fs.writeFile(file, makeEntry('msg-1') + '\n');
    const { records, newOffset } = await parser.parseIncremental(file, 0);
    expect(records).toHaveLength(1);
    expect(records[0].messageId).toBe('msg-1');
    expect(records[0].inputTokens).toBe(100);
    expect(records[0].outputTokens).toBe(50);
    expect(newOffset).toBeGreaterThan(0);
  });

  it('deduplicates same message.id across 5 repetitions', async () => {
    const parser = new JsonlParser();
    const file = path.join(tmpDir, 'dedup.jsonl');
    const content = Array(5).fill(makeEntry('msg-dup')).join('\n') + '\n';
    await fs.writeFile(file, content);
    const { records } = await parser.parseIncremental(file, 0);
    expect(records).toHaveLength(1);
  });

  it('incremental parse at saved offset yields no new records', async () => {
    const parser = new JsonlParser();
    const file = path.join(tmpDir, 'incr.jsonl');
    await fs.writeFile(file, makeEntry('msg-incr') + '\n');
    const first = await parser.parseIncremental(file, 0);
    expect(first.records).toHaveLength(1);
    const second = await parser.parseIncremental(file, first.newOffset);
    expect(second.records).toHaveLength(0);
    expect(second.newOffset).toBe(first.newOffset);
  });

  it('handles non-ASCII content without byte-offset drift', async () => {
    const parser = new JsonlParser();
    const file = path.join(tmpDir, 'unicode.jsonl');
    const userLine = JSON.stringify({
      type: 'user',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      cwd: '/tmp/proj',
      content: '日本語テスト🎉🚀',
    });
    const content = [makeEntry('msg-u1'), userLine, makeEntry('msg-u2')].join('\n') + '\n';
    await fs.writeFile(file, content);
    const { records, newOffset } = await parser.parseIncremental(file, 0);
    // Two assistant entries with distinct messageIds
    expect(records).toHaveLength(2);
    // Re-parse at newOffset must yield no new records
    const { records: r2 } = await parser.parseIncremental(file, newOffset);
    expect(r2).toHaveLength(0);
  });
});
