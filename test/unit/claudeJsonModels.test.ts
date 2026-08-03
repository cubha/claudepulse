import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readOneMillionModelsFromClaudeJson } from '../../src/utils/claudeJsonModels';

const tmpFiles: string[] = [];
function tmpFile(content: string): string {
  const p = path.join(os.tmpdir(), `claudepulse-cjm-${process.pid}-${tmpFiles.length}.json`);
  tmpFiles.push(p);
  fs.writeFileSync(p, content);
  return p;
}

afterEach(() => {
  for (const p of tmpFiles) { try { fs.unlinkSync(p); } catch { /* noop */ } }
  tmpFiles.length = 0;
});

describe('readOneMillionModelsFromClaudeJson — ~/.claude.json [1m] 증거 판별 (S1②, 2026-08-03)', () => {
  it('lastModelUsage 키에 [1m] 접미사가 있으면 base 모델 id를 Set에 포함', async () => {
    const p = tmpFile(JSON.stringify({
      projects: {
        '/mnt/d/workspace/fa-support': {
          lastModelUsage: {
            'claude-sonnet-5': { inputTokens: 1 },
            'claude-opus-5[1m]': { inputTokens: 2 },
            'claude-opus-5': { inputTokens: 3 },
          },
        },
      },
    }));
    const models = await readOneMillionModelsFromClaudeJson(p);
    expect(models.has('claude-opus-5')).toBe(true);
    expect(models.has('claude-sonnet-5')).toBe(false);
  });

  it('여러 project 엔트리를 모두 훑어 합집합으로 반환', async () => {
    const p = tmpFile(JSON.stringify({
      projects: {
        '/a': { lastModelUsage: { 'claude-opus-4-7[1m]': {} } },
        '/b': { lastModelUsage: { 'claude-sonnet-5[1m]': {} } },
      },
    }));
    const models = await readOneMillionModelsFromClaudeJson(p);
    expect(models.has('claude-opus-4-7')).toBe(true);
    expect(models.has('claude-sonnet-5')).toBe(true);
    expect(models.size).toBe(2);
  });

  it('파일이 없으면 빈 Set(예외 던지지 않음)', async () => {
    const models = await readOneMillionModelsFromClaudeJson('/nonexistent/path/.claude.json');
    expect(models.size).toBe(0);
  });

  it('JSON 파싱 실패(손상된 파일)면 빈 Set', async () => {
    const p = tmpFile('{ not valid json');
    const models = await readOneMillionModelsFromClaudeJson(p);
    expect(models.size).toBe(0);
  });

  it('projects 필드 자체가 없으면 빈 Set', async () => {
    const p = tmpFile(JSON.stringify({ numStartups: 5 }));
    const models = await readOneMillionModelsFromClaudeJson(p);
    expect(models.size).toBe(0);
  });

  it('lastModelUsage가 없는 project는 건너뜀(에러 없이)', async () => {
    const p = tmpFile(JSON.stringify({
      projects: {
        '/no-usage': { mcpContextUris: [] },
        '/has-usage': { lastModelUsage: { 'claude-fable-5[1m]': {} } },
      },
    }));
    const models = await readOneMillionModelsFromClaudeJson(p);
    expect(models.has('claude-fable-5')).toBe(true);
    expect(models.size).toBe(1);
  });
});
