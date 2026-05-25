import * as fs from 'fs';
import * as path from 'path';
import type { DailyUsage } from '../types';

interface PersistedData {
  version: number;
  snapshots: Record<string, DailyUsage>;
}

export class CacheStore {
  private readonly filePath: string;
  private snapshots: Record<string, DailyUsage> = {};

  constructor(storageDirFsPath: string) {
    this.filePath = path.join(storageDirFsPath, 'ccg-history.json');
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      const data = JSON.parse(raw) as PersistedData;
      if (data.version === 1 && data.snapshots) {
        this.snapshots = data.snapshots;
      }
    } catch {
      this.snapshots = {};
    }
  }

  /** days 배열을 기존 스냅샷에 병합(덮어씀) 후 저장 */
  async merge(days: DailyUsage[]): Promise<void> {
    for (const d of days) {
      this.snapshots[d.date] = d;
    }
    await this.persist();
  }

  /** 저장된 모든 날짜 스냅샷을 날짜 오름차순으로 반환 */
  getAll(): DailyUsage[] {
    return Object.values(this.snapshots).sort((a, b) => a.date.localeCompare(b.date));
  }

  private async persist(): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      const data: PersistedData = { version: 1, snapshots: this.snapshots };
      await fs.promises.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // non-fatal: 영구 저장 실패 시 무시
    }
  }
}
