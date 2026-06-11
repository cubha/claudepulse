import * as fs from 'node:fs';
import * as readline from 'node:readline';
import type { JournalUsage, SessionRecord, ToolUseCounts } from '../types';

/** mtime+offset 캐시 엔트리 */
interface ParseCache {
  mtime: number;
  offset: number;
  records: SessionRecord[];
}

type PricingModel = { input: number; output: number; cache_creation: number; cache_read: number };
type PricingMap = Record<string, PricingModel>;

const SKIP_TYPES = new Set(['progress', 'file-history-snapshot', 'attachment', 'permission-mode']);

export class JsonlParser {
  private readonly cache = new Map<string, ParseCache>();
  private readonly pricing: PricingMap;

  constructor(pricing: PricingMap) {
    this.pricing = pricing;
  }

  /**
   * 지정 파일에서 새 레코드만 증분 파싱.
   * 변경 없으면 캐시 그대로 반환.
   */
  async parseFile(filePath: string): Promise<SessionRecord[]> {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      this.cache.delete(filePath);
      return [];
    }

    const cached = this.cache.get(filePath);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.records;
    }

    const startOffset = cached?.mtime === stat.mtimeMs ? cached.offset : 0;
    const existingRecords: SessionRecord[] = cached ? [...cached.records] : [];

    const newRecords = await this.readFrom(filePath, startOffset);
    const merged = this.dedup([...existingRecords, ...newRecords]);

    this.cache.set(filePath, {
      mtime: stat.mtimeMs,
      offset: stat.size,
      records: merged,
    });

    return merged;
  }

  private async readFrom(filePath: string, offset: number): Promise<SessionRecord[]> {
    const records: SessionRecord[] = [];

    // requestId 기준 마지막 엔트리만 보존 (스트리밍 중복)
    const byRequestId = new Map<string, SessionRecord>();

    return new Promise((resolve) => {
      let stream: fs.ReadStream;
      try {
        stream = fs.createReadStream(filePath, { start: offset, encoding: 'utf8' });
      } catch {
        resolve([]);
        return;
      }

      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        line = line.trim();
        if (!line) return;

        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }

        if (SKIP_TYPES.has(String(entry['type'] ?? ''))) return;
        if (entry['type'] !== 'assistant') return;

        const msg = entry['message'] as Record<string, unknown> | undefined;
        if (!msg) return;

        const usage = msg['usage'] as Record<string, unknown> | undefined;
        if (!usage) return;

        const messageId = String(msg['id'] ?? '');
        const requestId = String(entry['requestId'] ?? messageId);
        if (!messageId) return;

        const journalUsage: JournalUsage = {
          input_tokens: Number(usage['input_tokens'] ?? 0),
          output_tokens: Number(usage['output_tokens'] ?? 0),
          cache_creation_input_tokens: Number(usage['cache_creation_input_tokens'] ?? 0),
          cache_read_input_tokens: Number(usage['cache_read_input_tokens'] ?? 0),
        };

        // server_tool_use.web_search_requests (API usage 필드)
        const serverToolUse = usage['server_tool_use'] as Record<string, unknown> | undefined;
        const webSearchCount = Number(serverToolUse?.['web_search_requests'] ?? 0);

        // content 배열에서 tool_use 블록 파싱
        const content = msg['content'];
        const toolCounts: ToolUseCounts = { edit: 0, write: 0, bash: 0, webSearch: webSearchCount, other: 0 };
        const editedFiles: string[] = [];

        if (Array.isArray(content)) {
          for (const block of content as Array<Record<string, unknown>>) {
            if (block['type'] !== 'tool_use') continue;
            const name = String(block['name'] ?? '');
            const input = block['input'] as Record<string, unknown> | undefined;
            if (name === 'Edit' || name === 'MultiEdit') {
              toolCounts.edit++;
              const fp = String(input?.['file_path'] ?? '');
              if (fp) editedFiles.push(fp);
            } else if (name === 'Write') {
              toolCounts.write++;
              const fp = String(input?.['file_path'] ?? '');
              if (fp) editedFiles.push(fp);
            } else if (name === 'Bash') {
              toolCounts.bash++;
            } else if (name === 'WebSearch' || name === 'web_search') {
              toolCounts.webSearch++;
            } else {
              toolCounts.other++;
            }
          }
        }

        const model = String(msg['model'] ?? 'unknown');
        const record: SessionRecord = {
          messageId,
          requestId,
          sessionId: String(entry['sessionId'] ?? ''),
          model,
          timestamp: String(entry['timestamp'] ?? new Date().toISOString()),
          cwd: String(entry['cwd'] ?? ''),
          gitBranch: String(entry['gitBranch'] ?? ''),
          usage: journalUsage,
          costUsd: this.calcCost(model, journalUsage),
          toolCounts,
          editedFiles,
        };

        // 같은 requestId → 마지막 엔트리로 교체 (스트리밍 중복 처리)
        byRequestId.set(requestId, record);
      });

      rl.on('close', () => {
        records.push(...byRequestId.values());
        resolve(records);
      });

      rl.on('error', () => resolve(records));
    });
  }

  /** message.id 기준 cross-file dedup */
  private dedup(records: SessionRecord[]): SessionRecord[] {
    const seen = new Map<string, SessionRecord>();
    for (const r of records) {
      // 같은 message.id가 있으면 더 최신 timestamp 것으로 교체
      const existing = seen.get(r.messageId);
      if (!existing || r.timestamp > existing.timestamp) {
        seen.set(r.messageId, r);
      }
    }
    return [...seen.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private calcCost(model: string, usage: JournalUsage): number {
    const pricing = this.findPricing(model);
    if (!pricing) return 0;

    const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
    const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
    const cacheCreateCost = (usage.cache_creation_input_tokens / 1_000_000) * pricing.cache_creation;
    const cacheReadCost = (usage.cache_read_input_tokens / 1_000_000) * pricing.cache_read;

    return inputCost + outputCost + cacheCreateCost + cacheReadCost;
  }

  private findPricing(model: string): PricingModel | undefined {
    if (this.pricing[model]) return this.pricing[model];

    const lm = model.toLowerCase();

    // 가장 긴 접두사 우선: claude-opus-4-1 > claude-opus-4 (utils/pricing.ts와 동일 로직)
    let best: string | undefined;
    for (const key of Object.keys(this.pricing)) {
      if (lm.startsWith(key) && (best === undefined || key.length > best.length)) {
        best = key;
      }
    }
    if (best !== undefined) return this.pricing[best];

    // 폴백: 동일 패밀리(첫 3세그먼트) → 첫 매칭 키
    const family = lm.split('-').slice(0, 3).join('-');
    for (const key of Object.keys(this.pricing)) {
      if (key.startsWith(family)) return this.pricing[key];
    }
    return undefined;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
