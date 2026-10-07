import type { CacheMissBreakdown, CacheMissReasonRow, SessionRecord } from '../../types';
import { resolvePricing } from '../../utils/pricing';

/**
 * 캐시 미스 원인 분해(v0.2.6 ST2) — `message.diagnostics.cache_miss_reason`.
 *
 * 추정 비용 = 놓친 토큰 × (쓰기 요율 − 읽기 요율). 캐시를 읽었으면 read 요율이었을 토큰이
 * 미스로 다시 **쓰였다**는 가정이다. 쓰기 요율은 그 레코드가 실제로 만든 캐시의 TTL 구성(5m·1h 토큰
 * 비율)으로 가중하고, 캐시를 하나도 안 만든 레코드는 5m 요율로 본다.
 *
 * ⚠️ `previous_message_not_found`·`unavailable`은 토큰을 기록하지 않는다(실측 78%). 이 원인들은
 * 건수만 있고 토큰·비용은 **null(미상)** — 0으로 합치면 "비용 없음"처럼 보인다(v0.1.55 거짓초록).
 * 그래서 합계 `estCostUsd`는 하한값이고, `hasUnknownTokens`가 그 사실을 UI에 전한다.
 */
export function computeCacheMiss(records: SessionRecord[], sinceIso: string): CacheMissBreakdown {
  const byReason = new Map<string, CacheMissReasonRow & { tokenRows: number; pricedRows: number }>();
  let recordCount = 0;
  let missCount = 0;
  let estCostUsd = 0;
  let hasUnknownTokens = false;
  let hasUnpricedRecords = false;

  for (const r of records) {
    // Codex는 이 진단 필드가 원천적으로 없다 — 분모에 넣으면 미스율이 희석된다.
    if ((r.provider ?? 'claude') !== 'claude') continue;
    if (r.timestamp < sinceIso) continue;
    recordCount++;
    const miss = r.cacheMiss;
    if (!miss) continue;
    missCount++;

    let row = byReason.get(miss.reason);
    if (!row) {
      row = { reason: miss.reason, count: 0, missedTokens: null, estCostUsd: null, hasUnpricedRecords: false, tokenRows: 0, pricedRows: 0 };
      byReason.set(miss.reason, row);
    }
    row.count++;

    if (miss.missedTokens === null) {
      hasUnknownTokens = true;
      continue;
    }
    row.tokenRows++;
    row.missedTokens = (row.missedTokens ?? 0) + miss.missedTokens;

    const { price, source } = resolvePricing(r.model);
    if (!price || source === 'none') {
      row.hasUnpricedRecords = true;
      hasUnpricedRecords = true;
      continue;
    }
    const cc5m = r.usage.cache_creation_5m_input_tokens;
    const cc1h = r.usage.cache_creation_1h_input_tokens;
    const writeRate = cc5m + cc1h > 0
      ? (cc5m * price.cache_creation + cc1h * price.cache_creation_1h) / (cc5m + cc1h)
      : price.cache_creation;
    const cost = miss.missedTokens * Math.max(0, writeRate - price.cache_read) / 1_000_000;
    row.pricedRows++;
    row.estCostUsd = (row.estCostUsd ?? 0) + cost;
    estCostUsd += cost;
  }

  const reasons: CacheMissReasonRow[] = [...byReason.values()]
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .map(({ tokenRows: _t, pricedRows: _p, ...row }) => row);

  return { reasons, missCount, recordCount, estCostUsd, hasUnknownTokens, hasUnpricedRecords };
}
