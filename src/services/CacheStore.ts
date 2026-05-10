import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { CACHE_FILES } from '../constants';

/**
 * globalStorageUri 기반 JSON 인덱스.
 *
 * 저장 항목:
 *  - file-index.json: { [path]: { mtime, byteOffset } } — 증분 파싱용
 *  - cache-v1.json: 집계 스냅샷 (cold start 빠르게)
 *
 * 10만+ 레코드 누적 시 SQLite (better-sqlite3)로 마이그.
 */
export class CacheStore {
  constructor(private readonly storagePath: vscode.Uri) {}

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.storagePath.fsPath, { recursive: true });
  }

  private fp(name: string): string {
    return path.join(this.storagePath.fsPath, name);
  }

  async loadFileIndex(): Promise<Record<string, { mtime: number; byteOffset: number }>> {
    try {
      const txt = await fs.readFile(this.fp(CACHE_FILES.fileIndex), 'utf8');
      return JSON.parse(txt);
    } catch {
      return {};
    }
  }

  async saveFileIndex(idx: Record<string, { mtime: number; byteOffset: number }>): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.fp(CACHE_FILES.fileIndex), JSON.stringify(idx), 'utf8');
  }

  async loadAggregate<T>(): Promise<T | null> {
    try {
      const txt = await fs.readFile(this.fp(CACHE_FILES.aggregateCache), 'utf8');
      return JSON.parse(txt) as T;
    } catch {
      return null;
    }
  }

  async saveAggregate<T>(data: T): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.fp(CACHE_FILES.aggregateCache), JSON.stringify(data), 'utf8');
  }
}
