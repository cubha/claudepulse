import * as fs from 'fs';
import * as readline from 'readline';
import { RawJsonlEntry, UsageRecord } from '../types';
import { calculateCost } from '../utils/pricing';
import { decodeProjectPathFromJsonlPath } from '../utils/pathDecoder';

/**
 * jsonl 증분 파서.
 *
 * 🔴 CRITICAL: message.id로 dedup 필수 — Claude Code는 스트리밍 중 동일 assistant 응답을
 *    여러 번 jsonl에 기록한다. dedup 누락 시 billing 불일치 (ccusage·token-dashboard 검증).
 */
export class JsonlParser {
  private readonly seenMessageIds = new Set<string>();

  /**
   * jsonl 파일을 byteOffset부터 증분 파싱하여 신규 UsageRecord 배열을 반환한다.
   *
   * @param filePath jsonl 파일 절대 경로
   * @param byteOffset 마지막 read offset (증분 파싱용)
   * @returns 신규 UsageRecord 배열 + 새로운 byteOffset
   */
  async parseIncremental(filePath: string, byteOffset: number): Promise<{
    records: UsageRecord[];
    newOffset: number;
  }> {
    // 파일 크기 확인 — 변경 없으면 early return
    let fileSize: number;
    try {
      const stat = await fs.promises.stat(filePath);
      fileSize = stat.size;
    } catch {
      return { records: [], newOffset: byteOffset };
    }

    if (byteOffset >= fileSize) {
      return { records: [], newOffset: byteOffset };
    }

    // projectPath는 jsonl cwd 우선, 폴백 encoded 역변환 (동기 호출)
    const projectPath = decodeProjectPathFromJsonlPath(filePath);

    const records: UsageRecord[] = [];
    let accumulatedOffset = byteOffset;

    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath, {
        start: byteOffset,
        encoding: 'utf8',
      });

      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      rl.on('line', (line: string) => {
        // byteOffset 누적: UTF-8 바이트 길이 + '\n'
        const lineByteLen = Buffer.byteLength(line, 'utf8') + 1;

        const trimmed = line.trim();
        if (!trimmed) {
          accumulatedOffset += lineByteLen;
          return;
        }

        let entry: unknown;
        try {
          entry = JSON.parse(trimmed);
        } catch {
          // invalid JSON — silent skip
          accumulatedOffset += lineByteLen;
          return;
        }

        // type guard: RawJsonlEntry 검증
        if (!isRawJsonlEntry(entry)) {
          accumulatedOffset += lineByteLen;
          return;
        }

        // assistant + usage 있는 라인만 채택
        if (
          entry.type === 'assistant' &&
          entry.message?.usage &&
          entry.message.id
        ) {
          const messageId = entry.message.id;

          // 🔴 CRITICAL: dedup — 이미 본 message.id는 skip
          if (!this.seenMessageIds.has(messageId)) {
            this.seenMessageIds.add(messageId);
            const record = JsonlParser.toUsageRecord(entry, projectPath);
            if (record) {
              records.push(record);
            }
          }
        }

        accumulatedOffset += lineByteLen;
      });

      rl.on('close', () => resolve());
      rl.on('error', reject);
      stream.on('error', reject);
    });

    // 파일 실제 크기로 cap — 마지막 라인 \n 없는 경우 over-count 방지
    const newOffset = Math.min(accumulatedOffset, fileSize);

    return { records, newOffset };
  }

  /**
   * RawJsonlEntry → UsageRecord 변환 (pure function — dedup 없음).
   * 유효하지 않은 entry는 null 반환.
   */
  static toUsageRecord(entry: RawJsonlEntry, projectPath: string): UsageRecord | null {
    if (
      entry.type !== 'assistant' ||
      !entry.message ||
      !entry.message.id ||
      !entry.message.model ||
      !entry.message.usage ||
      !entry.sessionId ||
      !entry.timestamp
    ) {
      return null;
    }

    const usage = entry.message.usage;
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

    // pricing 재계산 (jsonl costUSD cross-check용이지만 본 SubTask에선 재계산 값 사용)
    const costUSD = calculateCost(entry.message.model, {
      input: inputTokens,
      output: outputTokens,
      cacheCreation: cacheCreationTokens,
      cacheRead: cacheReadTokens,
    });

    return {
      messageId: entry.message.id,
      sessionId: entry.sessionId,
      projectPath,
      timestamp: new Date(entry.timestamp),
      model: entry.message.model,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      costUSD,
    };
  }

  resetDedup(): void {
    this.seenMessageIds.clear();
  }
}

/**
 * unknown → RawJsonlEntry 타입 가드.
 * 최소 필드만 검사 — strict mode 호환.
 */
function isRawJsonlEntry(value: unknown): value is RawJsonlEntry {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj['type'] !== 'string') return false;
  if (typeof obj['sessionId'] !== 'string') return false;
  if (typeof obj['timestamp'] !== 'string') return false;
  // message 필드는 optional — 있으면 object여야 함
  if ('message' in obj && obj['message'] !== undefined) {
    if (typeof obj['message'] !== 'object' || obj['message'] === null) return false;
  }
  return true;
}
