import type { ClaudeSignals, JournalEvent, SessionRecord } from '../../types';
import { computeCacheMiss } from './cacheMiss';
import { computeCompaction } from './compaction';
import { computePrCosts } from './prCost';
import { computeRateLimitBlocks } from './rateLimitBlocks';
import { computeTurnHooks } from './turnHooks';

const DAY_MS = 86_400_000;

/**
 * Claude 요약에 붙는 신호 묶음(v0.2.6 ST12). 집계기(UsageAggregator)는 SessionRecord만 보므로
 * 이벤트 채널이 필요한 신호는 여기서 extension이 한 번에 만든다(priceDriftModels와 같은 자리).
 * 캐시 미스는 최근 7일 — 하루 미스가 수 건 수준이라 today로는 표본이 거의 없다(실측 7일 86건).
 */
export function buildClaudeSignals(
  records: SessionRecord[],
  events: JournalEvent[],
  contextSessionId: string | null | undefined,
  now: Date,
): ClaudeSignals {
  return {
    cacheMiss: computeCacheMiss(records, new Date(now.getTime() - 7 * DAY_MS).toISOString()),
    rateLimitBlocks: computeRateLimitBlocks(events),
    prCosts: computePrCosts(records, events),
    compaction: computeCompaction(events, contextSessionId),
    turnHooks: computeTurnHooks(events, now),
  };
}
