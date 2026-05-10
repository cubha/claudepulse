import { RawJsonlEntry, UsageRecord } from '../types';

/**
 * jsonl 증분 파서.
 *
 * 🔴 CRITICAL: message.id로 dedup 필수 — Claude Code는 스트리밍 중 동일 assistant 응답을
 *    여러 번 jsonl에 기록한다. dedup 누락 시 billing 불일치 (ccusage·token-dashboard 검증).
 */
export class JsonlParser {
  private readonly seenMessageIds = new Set<string>();

  /**
   * @param _filePath jsonl 파일 절대 경로
   * @param _byteOffset 마지막 read offset (증분 파싱용)
   * @returns 신규 UsageRecord 배열 + 새로운 byteOffset
   */
  async parseIncremental(_filePath: string, _byteOffset: number): Promise<{
    records: UsageRecord[];
    newOffset: number;
  }> {
    // TODO:
    //  1. fs.createReadStream({ start: _byteOffset })
    //  2. readline 라인 단위 파싱
    //  3. JSON.parse — invalid 라인 무시
    //  4. type === 'assistant' && message.usage 있는 라인만 채택
    //  5. message.id dedup (this.seenMessageIds)
    //  6. UsageRecord로 정규화 (cache 분리)
    //  7. 새 byteOffset 계산 + 반환
    return { records: [], newOffset: _byteOffset };
  }

  static toUsageRecord(_entry: RawJsonlEntry, _projectPath: string): UsageRecord | null {
    // TODO: validation + cost 계산 (utils/pricing) + cache 분리
    return null;
  }

  resetDedup(): void {
    this.seenMessageIds.clear();
  }
}
