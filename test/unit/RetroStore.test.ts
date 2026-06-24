import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RetroStore } from '../../src/services/RetroStore';
import type { CommitUsage } from '../../src/types';

function cu(sha: string, costUsd: number): CommitUsage {
  return {
    commit: { sha, committedAt: '2026-06-10T10:00:00.000Z', branch: 'main', subject: 's', repoRoot: '/repo' },
    costUsd,
    totalTokens: 100,
    recordCount: 1,
    sessionIds: ['s1'],
    confidence: 'low',
  };
}

describe('RetroStore — SHA-keyed 영속', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retrostore-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('merge 후 load로 복원 — SHA 키 보존', async () => {
    const a = new RetroStore(dir);
    await a.merge([cu('aaa', 1), cu('bbb', 2)]);

    const b = new RetroStore(dir);
    await b.load();
    const all = b.getAll();
    expect(all.map(c => c.commit.sha).sort()).toEqual(['aaa', 'bbb']);
  });

  it('동일 SHA 재merge는 덮어씀(최신 귀속 반영)', async () => {
    const s = new RetroStore(dir);
    await s.merge([cu('aaa', 1)]);
    await s.merge([cu('aaa', 5)]); // 동일 SHA, 비용 갱신
    const all = s.getAll();
    expect(all.length).toBe(1);
    expect(all[0].costUsd).toBe(5);
  });

  it('별도 파일 ccg-retro.json 사용 — ccg-history.json 오버로드 안 함', async () => {
    const s = new RetroStore(dir);
    await s.merge([cu('aaa', 1)]);
    expect(fs.existsSync(path.join(dir, 'ccg-retro.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'ccg-history.json'))).toBe(false);
  });

  it('파일 없을 때 load는 빈 상태 — throw 안 함', async () => {
    const s = new RetroStore(dir);
    await s.load();
    expect(s.getAll()).toEqual([]);
  });
});
