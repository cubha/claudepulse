import type { JournalEvent, RateLimitBlockEpisode, RateLimitBlockHistory } from '../../types';

/**
 * 한도 차단 이력(v0.2.6 ST4) — jsonl의 429 레코드(`quotaLimits`)에서 만든다.
 *
 * - 차단 **에피소드** = 같은 (창 종류, 해제 시각) 그룹. Claude Code는 차단 중 재시도마다 429 행을
 *   남긴다(실측 32행이 전부 같은 five_hour·resetsAt) — 행을 세면 사건 수가 부풀려진다.
 * - 529·500은 Anthropic 서버 오류다. 한도 차단과 섞으면 "한도에 막혔다"는 오신호가 된다.
 * - quotaLimits 없는 429는 어느 창인지 몰라 에피소드로 만들지 않고 `unclassified429`로만 센다.
 */
export function computeRateLimitBlocks(events: JournalEvent[]): RateLimitBlockHistory {
  const episodes = new Map<string, RateLimitBlockEpisode>();
  let unclassified429 = 0;
  const byStatus: Record<number, number> = {};
  let serverCount = 0;
  let serverLastAt: string | null = null;

  for (const e of events) {
    if (e.kind !== 'api_error') continue;
    if (e.status === 429) {
      if (!e.quota) { unclassified429++; continue; }
      const key = `${e.quota.rateLimitType}@${e.quota.resetsAt}`;
      const ep = episodes.get(key);
      if (!ep) {
        episodes.set(key, {
          rateLimitType: e.quota.rateLimitType,
          resetsAt: e.quota.resetsAt,
          firstAt: e.timestamp,
          lastAt: e.timestamp,
          rejectedCount: 1,
          overageDisabledReason: e.quota.overageDisabledReason,
        });
        continue;
      }
      ep.rejectedCount++;
      if (e.timestamp < ep.firstAt) ep.firstAt = e.timestamp;
      if (e.timestamp > ep.lastAt) ep.lastAt = e.timestamp;
      ep.overageDisabledReason ??= e.quota.overageDisabledReason;
      continue;
    }
    if (e.status >= 500) {
      serverCount++;
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
      if (serverLastAt === null || e.timestamp > serverLastAt) serverLastAt = e.timestamp;
    }
  }

  return {
    episodes: [...episodes.values()].sort((a, b) => b.firstAt.localeCompare(a.firstAt)),
    unclassified429,
    serverErrors: { count: serverCount, lastAt: serverLastAt, byStatus },
  };
}
