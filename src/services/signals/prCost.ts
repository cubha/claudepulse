import type { JournalEvent, PrCostRow, SessionRecord } from '../../types';
import { resolvePricing } from '../../utils/pricing';

/**
 * PR 단위 비용(v0.2.6 ST5) — Claude Code가 남기는 `pr-link`(세션 ↔ PR)로 **정확 조인**한다.
 * usage×git 회고(CommitAttributor)의 시간창 근사 조인과 달리 세션 단위가 확정 연결이다.
 * 다만 귀속 단위는 세션 전체다 — PR을 연결한 뒤 같은 세션에서 다른 일을 해도 그 PR에 들어간다.
 *
 * - 서브에이전트 레코드도 부모 sessionId를 갖고 있어 함께 들어간다(PR 작업의 실비용).
 * - 한 세션이 여러 PR에 연결되면 각 PR에 넣고 `sharedSessionCount`로 표시한다. 행끼리 더하면
 *   이중계산이므로 UI는 PR 비용의 합계를 내지 않는다.
 * - 연결된 세션의 레코드가 하나도 없으면(jsonl 회전으로 사라짐) 그 세션은 세지 않는다 — $0으로
 *   그리면 "공짜 PR"처럼 보인다. 남는 세션이 없는 PR은 행 자체를 뺀다.
 */
export function computePrCosts(records: SessionRecord[], events: JournalEvent[]): PrCostRow[] {
  const bySession = new Map<string, { costUsd: number; totalTokens: number; unpriced: boolean }>();
  for (const r of records) {
    const tokens = r.usage.input_tokens + r.usage.output_tokens + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens;
    const s = bySession.get(r.sessionId) ?? { costUsd: 0, totalTokens: 0, unpriced: false };
    s.costUsd += r.costUsd;
    s.totalTokens += tokens;
    if (tokens > 0 && resolvePricing(r.model).source === 'none') s.unpriced = true;
    bySession.set(r.sessionId, s);
  }

  const prSessions = new Map<string, { link: Extract<JournalEvent, { kind: 'pr_link' }>; sessions: Set<string>; firstLinkedAt: string }>();
  const sessionPrCount = new Map<string, number>();
  for (const e of events) {
    if (e.kind !== 'pr_link') continue;
    const key = `${e.prRepository}#${e.prNumber}`;
    let pr = prSessions.get(key);
    if (!pr) {
      pr = { link: e, sessions: new Set(), firstLinkedAt: e.timestamp };
      prSessions.set(key, pr);
    }
    if (e.timestamp < pr.firstLinkedAt) pr.firstLinkedAt = e.timestamp;
    if (!pr.sessions.has(e.sessionId)) {
      pr.sessions.add(e.sessionId);
      sessionPrCount.set(e.sessionId, (sessionPrCount.get(e.sessionId) ?? 0) + 1);
    }
  }

  const rows: PrCostRow[] = [];
  for (const { link, sessions, firstLinkedAt } of prSessions.values()) {
    let costUsd = 0, totalTokens = 0, sessionCount = 0, sharedSessionCount = 0, hasUnpricedRecords = false;
    for (const sid of sessions) {
      const s = bySession.get(sid);
      if (!s) continue;
      sessionCount++;
      costUsd += s.costUsd;
      totalTokens += s.totalTokens;
      if (s.unpriced) hasUnpricedRecords = true;
      if ((sessionPrCount.get(sid) ?? 0) > 1) sharedSessionCount++;
    }
    if (sessionCount === 0) continue;
    rows.push({
      prRepository: link.prRepository, prNumber: link.prNumber, prUrl: link.prUrl,
      costUsd, totalTokens, sessionCount, sharedSessionCount, firstLinkedAt, hasUnpricedRecords,
    });
  }
  return rows.sort((a, b) => b.costUsd - a.costUsd || b.firstLinkedAt.localeCompare(a.firstLinkedAt));
}
