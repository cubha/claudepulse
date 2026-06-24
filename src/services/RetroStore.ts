import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommitUsage, RetroSummary } from '../types';

/**
 * RetroStore — 커밋 단위 귀속(CommitUsage)을 SHA-keyed로 영속화.
 *
 * CacheStore 패턴({version, load, merge, persist}) 재사용하되 **별도 파일**
 * `ccg-retro.json`을 쓴다(커밋귀속은 SHA-keyed, 날짜-keyed인 ccg-history.json 오버로드 금지).
 *
 * 존재 이유 = v0.1.37의 "마이그레이션" 본질: jsonl이 ~30일 롤오프되면 raw 로그가 사라져도
 * 커밋귀속 스냅샷은 이 스토어에 남아 장기 회고가 raw-log 윈도 밖에서도 생존한다.
 */

interface PersistedData {
  version: number;
  commits: Record<string, CommitUsage>; // sha → CommitUsage
  summary?: RetroSummary | null;        // v0.1.39: first-paint용 전체 요약 스냅샷
}

const STORE_VERSION = 2;

export class RetroStore {
  private readonly filePath: string;
  private commits: Record<string, CommitUsage> = {};
  private summary: RetroSummary | null = null;

  constructor(storageDirFsPath: string) {
    this.filePath = path.join(storageDirFsPath, 'ccg-retro.json');
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      const data = JSON.parse(raw) as PersistedData;
      // v1(commits-only)·v2 모두 수용 — 구버전은 summary 없음(첫 빌드 전까지 null).
      if ((data.version === 1 || data.version === STORE_VERSION) && data.commits) {
        this.commits = data.commits;
      }
      if (data.summary) this.summary = data.summary;
    } catch {
      this.commits = {};
      this.summary = null;
    }
  }

  /** CommitUsage 배열을 SHA 키로 병합(동일 SHA는 최신 귀속으로 덮어씀) 후 저장. */
  async merge(usages: CommitUsage[]): Promise<void> {
    for (const u of usages) {
      this.commits[u.commit.sha] = u;
    }
    await this.persist();
  }

  /**
   * v0.1.39: 전체 RetroSummary 스냅샷을 영속(first-paint 헤지).
   * commits도 함께 SHA-keyed 병합 → getAll 장기보관과 단일 진실 유지.
   */
  async saveSummary(summary: RetroSummary): Promise<void> {
    this.summary = summary;
    for (const u of summary.commits) {
      this.commits[u.commit.sha] = u;
    }
    await this.persist();
  }

  /** 마지막 영속된 전체 요약(없으면 null) — 빌드 전 즉시 반환용. */
  getSummary(): RetroSummary | null {
    return this.summary;
  }

  /** 저장된 모든 커밋 귀속을 비용 내림차순으로 반환. */
  getAll(): CommitUsage[] {
    return Object.values(this.commits).sort((a, b) => b.costUsd - a.costUsd);
  }

  private async persist(): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      const data: PersistedData = { version: STORE_VERSION, commits: this.commits, summary: this.summary };
      await fs.promises.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // non-fatal: 영구 저장 실패 시 무시 (CacheStore와 동일 정책)
    }
  }
}
