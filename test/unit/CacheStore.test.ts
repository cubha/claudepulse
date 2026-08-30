import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CacheStore } from '../../src/services/CacheStore';
import type { DailyUsage } from '../../src/types';

function day(date: string, costUsd: number): DailyUsage {
  return {
    date,
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 150,
    costUsd,
    cacheHitRate: 0,
  };
}

describe('CacheStore — 날짜별 스냅샷 영속 [characterization]', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cachestore-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('merge 후 load로 복원 — 날짜 키 보존', async () => {
    const a = new CacheStore(dir);
    await a.merge([day('2026-05-01', 1), day('2026-05-02', 2)]);

    const b = new CacheStore(dir);
    await b.load();
    expect(b.getAll().map(d => d.date)).toEqual(['2026-05-01', '2026-05-02']);
  });

  it('동일 날짜 재merge는 덮어씀', async () => {
    const s = new CacheStore(dir);
    await s.merge([day('2026-05-01', 1)]);
    await s.merge([day('2026-05-01', 5)]);
    const all = s.getAll();
    expect(all.length).toBe(1);
    expect(all[0].costUsd).toBe(5);
  });

  it('getAll은 날짜 오름차순으로 정렬한다', async () => {
    const s = new CacheStore(dir);
    await s.merge([day('2026-06-12', 3), day('2026-05-01', 1), day('2026-05-15', 2)]);
    expect(s.getAll().map(d => d.date)).toEqual(['2026-05-01', '2026-05-15', '2026-06-12']);
  });

  it('파일 없을 때 load는 빈 상태 — throw 안 함', async () => {
    const s = new CacheStore(dir);
    await s.load();
    expect(s.getAll()).toEqual([]);
  });

  it('별도 파일 ccg-history.json 사용', async () => {
    const s = new CacheStore(dir);
    await s.merge([day('2026-05-01', 1)]);
    expect(fs.existsSync(path.join(dir, 'ccg-history.json'))).toBe(true);
  });

  it('손상된 JSON이면 load는 빈 상태로 폴백(throw 안 함)', async () => {
    fs.writeFileSync(path.join(dir, 'ccg-history.json'), '{not valid json', 'utf8');
    const s = new CacheStore(dir);
    await s.load();
    expect(s.getAll()).toEqual([]);
  });

  it('version이 1이 아니면 스냅샷을 무시한다', async () => {
    fs.writeFileSync(
      path.join(dir, 'ccg-history.json'),
      JSON.stringify({ version: 2, snapshots: { '2026-05-01': day('2026-05-01', 9) } }),
      'utf8'
    );
    const s = new CacheStore(dir);
    await s.load();
    expect(s.getAll()).toEqual([]);
  });
});
