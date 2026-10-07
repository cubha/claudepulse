import type { CompactionInfo, JournalEvent } from '../../types';

/**
 * 세션의 컨텍스트 압축 이력(v0.2.6 ST6) — `system/compact_boundary`. 컨텍스트 게이지는 마지막 레코드의
 * 점유량만 보므로 압축 직후 급락이 "왜 줄었는지" 설명이 없었다. 게이지가 가리키는 세션만 본다.
 */
export function computeCompaction(events: JournalEvent[], sessionId: string | null | undefined): CompactionInfo | null {
  if (!sessionId) return null;
  let count = 0;
  let autoCount = 0;
  let last: CompactionInfo['last'] | null = null;
  for (const e of events) {
    if (e.kind !== 'compact' || e.sessionId !== sessionId) continue;
    count++;
    if (e.trigger === 'auto') autoCount++;
    if (!last || e.timestamp > last.at) {
      last = { at: e.timestamp, trigger: e.trigger, preTokens: e.preTokens, postTokens: e.postTokens };
    }
  }
  return last ? { count, autoCount, last } : null;
}
