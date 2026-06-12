import * as fs from 'node:fs';
import * as readline from 'node:readline';
import type { JournalUsage, SessionRecord, ToolUseCounts } from '../types';
import { calcCost } from '../utils/pricing';

/** mtime+offset 캐시 엔트리 */
interface ParseCache {
  mtime: number;
  offset: number;
  records: SessionRecord[];
}

const SKIP_TYPES = new Set(['progress', 'file-history-snapshot', 'attachment', 'permission-mode']);

/** 모든 도구 카테고리를 0으로 초기화. */
export function emptyToolCounts(): ToolUseCounts {
  return { edit: 0, write: 0, bash: 0, read: 0, grep: 0, webSearch: 0, webFetch: 0, mcp: 0, other: 0 };
}

/** tool_use 블록 name → ToolUseCounts 카테고리. */
export function classifyToolName(name: string): keyof ToolUseCounts {
  if (name === 'Edit' || name === 'MultiEdit') return 'edit';
  if (name === 'Write') return 'write';
  if (name === 'Bash') return 'bash';
  if (name === 'Read') return 'read';
  if (name === 'Grep' || name === 'Glob') return 'grep';
  if (name === 'WebSearch' || name === 'web_search') return 'webSearch';
  if (name === 'WebFetch' || name === 'web_fetch') return 'webFetch';
  if (name.startsWith('mcp__')) return 'mcp';
  return 'other';
}

export class JsonlParser {
  private readonly cache = new Map<string, ParseCache>();

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

        // 캐시 생성 TTL 분리: usage.cache_creation.{ephemeral_5m,ephemeral_1h}_input_tokens
        // 구버전 로그(객체 없음)는 평면 cache_creation_input_tokens를 전량 5m로 간주 → 기존 동작 보존.
        const flatCacheCreate = Number(usage['cache_creation_input_tokens'] ?? 0);
        const cacheCreation = usage['cache_creation'] as Record<string, unknown> | undefined;
        const cc5m = cacheCreation ? Number(cacheCreation['ephemeral_5m_input_tokens'] ?? 0) : flatCacheCreate;
        const cc1h = cacheCreation ? Number(cacheCreation['ephemeral_1h_input_tokens'] ?? 0) : 0;
        const serviceTier = usage['service_tier'] !== undefined ? String(usage['service_tier']) : undefined;

        const journalUsage: JournalUsage = {
          input_tokens: Number(usage['input_tokens'] ?? 0),
          output_tokens: Number(usage['output_tokens'] ?? 0),
          // 평면 합계는 분해 정보가 있으면 5m+1h로 정규화(집계 토큰 카운트 일관성)
          cache_creation_input_tokens: cacheCreation ? cc5m + cc1h : flatCacheCreate,
          cache_creation_5m_input_tokens: cc5m,
          cache_creation_1h_input_tokens: cc1h,
          cache_read_input_tokens: Number(usage['cache_read_input_tokens'] ?? 0),
          serviceTier,
        };

        // server_tool_use 카운트 (API usage 필드)
        const serverToolUse = usage['server_tool_use'] as Record<string, unknown> | undefined;
        const webSearchCount = Number(serverToolUse?.['web_search_requests'] ?? 0);
        const webFetchCount = Number(serverToolUse?.['web_fetch_requests'] ?? 0);

        // content 배열에서 tool_use 블록 파싱
        const content = msg['content'];
        const toolCounts = emptyToolCounts();
        toolCounts.webSearch = webSearchCount;
        toolCounts.webFetch = webFetchCount;
        const editedFiles: string[] = [];

        if (Array.isArray(content)) {
          for (const block of content as Array<Record<string, unknown>>) {
            if (block['type'] !== 'tool_use') continue;
            const name = String(block['name'] ?? '');
            const input = block['input'] as Record<string, unknown> | undefined;
            const cat = classifyToolName(name);
            toolCounts[cat]++;
            if (cat === 'edit' || cat === 'write') {
              const fp = String(input?.['file_path'] ?? '');
              if (fp) editedFiles.push(fp);
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
          costUsd: calcCost(model, journalUsage),
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

  clearCache(): void {
    this.cache.clear();
  }
}
