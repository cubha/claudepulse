import * as fs from 'node:fs';
import type { JournalUsage, SessionRecord, ToolUseCounts, VendorCostSnapshot } from '../types';
import { calcCost } from '../utils/pricing';

/** mtime+offset 캐시 엔트리 */
interface ParseCache {
  mtime: number;
  offset: number;
  records: SessionRecord[];
  /** 파일의 마지막 cost-state 행(v0.2.5 D-C). 세션 도중 누적 갱신되므로 마지막 것만 의미가 있다. */
  costSnapshots: VendorCostSnapshot[];
}

/** cost-state.modelUsage → 스냅샷 행. 형식이 어긋난 행은 버린다(외부 입력). */
function toCostSnapshots(modelUsage: unknown): VendorCostSnapshot[] {
  if (!modelUsage || typeof modelUsage !== 'object' || Array.isArray(modelUsage)) return [];
  const out: VendorCostSnapshot[] = [];
  for (const [model, raw] of Object.entries(modelUsage as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const u = raw as Record<string, unknown>;
    const costUSD = Number(u['costUSD']);
    if (!Number.isFinite(costUSD)) continue;
    out.push({
      model,
      inputTokens: Number(u['inputTokens'] ?? 0),
      outputTokens: Number(u['outputTokens'] ?? 0),
      cacheReadInputTokens: Number(u['cacheReadInputTokens'] ?? 0),
      cacheCreationInputTokens: Number(u['cacheCreationInputTokens'] ?? 0),
      webSearchRequests: Number(u['webSearchRequests'] ?? 0),
      costUSD,
    });
  }
  return out;
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

/** mcp__<server>__<tool> → 서버명. mcp__ 접두사가 아니면 undefined. */
export function mcpServerName(name: string): string | undefined {
  if (!name.startsWith('mcp__')) return undefined;
  const parts = name.split('__');
  return parts.length >= 2 ? parts[1] : undefined;
}

/**
 * 파일별 레코드를 합치며 **파일 간** message.id 중복을 제거한다(CLAUDE.md §3#1, v0.2.5).
 *
 * 파일 안 dedup(`dedup`)은 파일마다 독립이라 여기서 다시 해야 한다. 서브에이전트 transcript
 * (`<session>/subagents/*.jsonl`)는 부모 대화 이력을 복사해 시작하므로, 같은 message.id가 부모
 * 파일(메인 체인)과 subagents 파일(사이드체인)에 함께 나온다(실측 약 45건).
 *
 * ⚠️ 우선순위는 "최신 timestamp"가 아니라 **메인 체인 원본 우선**이다. 최신 우선이면 사본이
 * 이겨 부모 턴의 비용이 서브에이전트 비용으로 재분류된다(`subagentStats`·스킬 집계가 `isSidechain`
 * 으로 갈린다). 둘 다 사이드체인일 때만 최신을 남긴다.
 */
export function mergeRecordsAcrossFiles(perFile: SessionRecord[][]): SessionRecord[] {
  const seen = new Map<string, SessionRecord>();
  for (const records of perFile) {
    for (const r of records) {
      const existing = seen.get(r.messageId);
      if (!existing) { seen.set(r.messageId, r); continue; }
      if (existing.isSidechain !== r.isSidechain) {
        if (!r.isSidechain) seen.set(r.messageId, r);
        continue;
      }
      if (r.timestamp > existing.timestamp) seen.set(r.messageId, r);
    }
  }
  return [...seen.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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
      stat = await fs.promises.stat(filePath);
    } catch {
      this.cache.delete(filePath);
      return [];
    }

    const cached = this.cache.get(filePath);
    // mtime만 보면 같은 밀리초 안의 append를 놓친다(파일시스템 mtime 해상도) — 크기도 함께 본다.
    if (cached && cached.mtime === stat.mtimeMs && cached.offset === stat.size) {
      return cached.records;
    }

    // 파일이 잘리거나 교체된 경우(offset > 현재 size) 증분 불가 → 전체 재파싱 폴백.
    const canIncrement = cached !== undefined && cached.offset <= stat.size;
    const startOffset = canIncrement ? cached.offset : 0;
    const existingRecords: SessionRecord[] = canIncrement ? [...cached.records] : [];

    const { records: newRecords, lastCostSnapshots, consumedBytes } = await this.readFrom(filePath, startOffset);
    const merged = this.dedup([...existingRecords, ...newRecords]);

    this.cache.set(filePath, {
      mtime: stat.mtimeMs,
      // 완결된 줄까지만 전진 — 쓰는 중인 마지막 줄은 다음 파싱에서 다시 읽는다(W2).
      offset: startOffset + consumedBytes,
      records: merged,
      // 이번 구간에 cost-state가 없으면 이전 스냅샷을 유지한다(증분 파싱).
      costSnapshots: lastCostSnapshots ?? (canIncrement ? cached.costSnapshots : []),
    });

    return merged;
  }

  private async readFrom(
    filePath: string,
    offset: number,
  ): Promise<{ records: SessionRecord[]; lastCostSnapshots: VendorCostSnapshot[] | null; consumedBytes: number }> {
    const records: SessionRecord[] = [];
    let lastCostSnapshots: VendorCostSnapshot[] | null = null;

    // requestId 기준 마지막 엔트리만 보존 (스트리밍 중복)
    const byRequestId = new Map<string, SessionRecord>();

    return new Promise((resolve) => {
      let stream: fs.ReadStream;
      try {
        stream = fs.createReadStream(filePath, { start: offset });
      } catch {
        resolve({ records: [], lastCostSnapshots: null, consumedBytes: 0 });
        return;
      }

      // Claude Code가 이 파일에 append하는 도중에 읽힐 수 있다. 마지막 개행 뒤의 미완결 바이트는
      // 처리하지도, offset을 전진시키지도 않는다 — 다음 파싱이 그 줄을 처음부터 다시 읽는다
      // (/ship 보안검토 W2. 전엔 offset=stat.size라 반쪽 줄이 버려진 뒤 영영 다시 안 읽혔다).
      // 개행(0x0A)은 UTF-8 멀티바이트의 연속 바이트로 나타나지 않으므로 바이트 단위로 잘라도
      // 문자가 깨지지 않는다(CodexSource.splitCompleteLines와 같은 원리).
      let pending: Buffer = Buffer.alloc(0);
      let consumedBytes = 0;
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (!ok) { resolve({ records: [], lastCostSnapshots: null, consumedBytes: 0 }); return; }
        records.push(...byRequestId.values());
        resolve({ records, lastCostSnapshots, consumedBytes });
      };
      stream.on('data', (chunk: string | Buffer) => {
        const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
        const buf = pending.length > 0 ? Buffer.concat([pending, bytes]) : bytes;
        let start = 0;
        let nl: number;
        while ((nl = buf.indexOf(0x0a, start)) !== -1) {
          handleLine(buf.toString('utf8', start, nl));
          start = nl + 1;
        }
        consumedBytes += start;
        pending = buf.subarray(start);
      });
      stream.on('end', () => finish(true));
      // 읽기 실패 시 이번 구간을 통째로 버리고 offset을 전진시키지 않는다(다음 refresh가 재시도).
      stream.on('error', () => finish(false));

      function handleLine(rawLine: string): void {
        const line = rawLine.trim();
        if (!line) return;

        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }

        if (SKIP_TYPES.has(String(entry['type'] ?? ''))) return;
        if (entry['type'] === 'cost-state') {
          lastCostSnapshots = toCostSnapshots(entry['modelUsage']);
          return;
        }
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

        // server_tool_use 카운트 (API usage 필드) — 웹검색은 토큰과 별개로 건당 과금되므로
        // 비용 계산 입력이기도 하다. 그래서 journalUsage 조립보다 먼저 읽는다.
        const serverToolUse = usage['server_tool_use'] as Record<string, unknown> | undefined;
        const webSearchCount = Number(serverToolUse?.['web_search_requests'] ?? 0);
        const webFetchCount = Number(serverToolUse?.['web_fetch_requests'] ?? 0);

        const journalUsage: JournalUsage = {
          input_tokens: Number(usage['input_tokens'] ?? 0),
          output_tokens: Number(usage['output_tokens'] ?? 0),
          // 평면 합계는 분해 정보가 있으면 5m+1h로 정규화(집계 토큰 카운트 일관성)
          cache_creation_input_tokens: cacheCreation ? cc5m + cc1h : flatCacheCreate,
          cache_creation_5m_input_tokens: cc5m,
          cache_creation_1h_input_tokens: cc1h,
          cache_read_input_tokens: Number(usage['cache_read_input_tokens'] ?? 0),
          serviceTier,
          webSearchRequests: webSearchCount,
        };

        // content 배열에서 tool_use 블록 파싱
        const content = msg['content'];
        const toolCounts = emptyToolCounts();
        toolCounts.webSearch = webSearchCount;
        toolCounts.webFetch = webFetchCount;
        const editedFiles: string[] = [];
        // 서버명은 jsonl에서 온 외부 문자열이라 prototype 없는 맵을 쓴다 — 'constructor'·'toString' 같은
        // 상속 프로퍼티명이 서버명으로 오면 `?? 0`이 상속 함수를 집어 카운트가 문자열로 오염된다.
        const mcpServerCounts: Record<string, number> = Object.create(null);

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
            if (cat === 'mcp') {
              const server = mcpServerName(name);
              if (server) mcpServerCounts[server] = (mcpServerCounts[server] ?? 0) + 1;
            }
          }
        }

        // 컨텍스트 창 점유량(S2) — iterations 있으면 advisor_message 제외 마지막 message
        // iteration 기준(top-level usage는 여러 API 호출의 합산이라 컨텍스트 크기로 부적합).
        // iterations 없거나 전부 advisor_message뿐이면 top-level usage 합계로 폴백.
        const rawIterations = usage['iterations'];
        const messageIterations = Array.isArray(rawIterations)
          ? (rawIterations as Array<Record<string, unknown>>).filter(it => it['type'] !== 'advisor_message')
          : [];
        const lastMessageIter = messageIterations.length > 0 ? messageIterations[messageIterations.length - 1] : undefined;
        const contextTokens = lastMessageIter
          ? Number(lastMessageIter['input_tokens'] ?? 0)
            + Number(lastMessageIter['cache_read_input_tokens'] ?? 0)
            + Number(lastMessageIter['cache_creation_input_tokens'] ?? 0)
          : journalUsage.input_tokens + journalUsage.cache_read_input_tokens + journalUsage.cache_creation_input_tokens;

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
          attributionSkill: entry['attributionSkill'] !== undefined ? String(entry['attributionSkill']) : undefined,
          isSidechain: entry['isSidechain'] === true,
          agentId: entry['agentId'] !== undefined ? String(entry['agentId']) : undefined,
          // null·빈 문자열을 'null'/'' 타입으로 만들지 않는다 — 미상 버킷으로 간다(v0.2.5b /verify V1).
          attributionAgent: typeof entry['attributionAgent'] === 'string' && entry['attributionAgent'] !== '' ? entry['attributionAgent'] : undefined,
          mcpServerCounts: Object.keys(mcpServerCounts).length > 0 ? mcpServerCounts : undefined,
          contextTokens,
        };

        // 같은 requestId → 마지막 엔트리로 교체 (스트리밍 중복 처리)
        byRequestId.set(requestId, record);
      }
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

  /** 파일의 마지막 cost-state 스냅샷(parseFile 이후 유효). 없으면 빈 배열. */
  getCostSnapshots(filePath: string): VendorCostSnapshot[] {
    return this.cache.get(filePath)?.costSnapshots ?? [];
  }

  clearCache(): void {
    this.cache.clear();
  }
}
