/**
 * 벤더 비용 대조 — 가격표 드리프트를 런타임에 잡는다(v0.2.5 D-C).
 *
 * 왜 필요한가: v0.2.5 D-A에서 `claude-fable-5-1`이 최장접두사로 `claude-fable-5` 단가를 물려받아
 * +30~90% 과대계상됐는데, 키가 "있었기" 때문에 `unpricedModels`(키 없음)에 걸리지 않았고 화면은
 * 정상으로 보였다. 정답지는 Claude Code CLI가 jsonl에 직접 쓰는 `type=cost-state`다.
 *
 * 판정은 `test/unit/pricing.vendorOracle.test.ts`와 같은 밴드다 — cost-state에는 캐시 생성의
 * 5m/1h 배분이 남지 않으므로 [전량 5m, 전량 1h] 사이면 정상. ⚠️ 비교 대상은 **같은 스냅샷 행의
 * 토큰**이다. 세션 레코드 합계와 비교하면 안 된다(cost-state는 세션 도중 스냅샷이라 뒤처진다).
 */
import type { VendorCostSnapshot } from '../types';
import { calcCost, resolvePricing } from './pricing';

export interface PriceDrift { model: string; vendorUsd: number; expectedLoUsd: number; expectedHiUsd: number }

/** 반올림·부동소수 여유. 실측 정상 표본은 밴드 끝값과 소수 넷째 자리까지 맞는다. */
const TOLERANCE = 0.02;
/** 세션 초반 스냅샷은 금액이 작아 상대오차가 쉽게 튄다 — 이 금액 미만은 판정하지 않는다. */
const MIN_USD = 0.05;

function costAt(s: VendorCostSnapshot, ratio1h: number): number {
  const cc1h = Math.round(s.cacheCreationInputTokens * ratio1h);
  return calcCost(s.model, {
    input_tokens: s.inputTokens,
    output_tokens: s.outputTokens,
    cache_creation_5m_input_tokens: s.cacheCreationInputTokens - cc1h,
    cache_creation_1h_input_tokens: cc1h,
    cache_read_input_tokens: s.cacheReadInputTokens,
    webSearchRequests: s.webSearchRequests,
  });
}

/** 밴드를 벗어난 모델 목록(모델당 가장 크게 벗어난 스냅샷 1건, 모델명 순). */
export function detectPriceDrift(snapshots: VendorCostSnapshot[]): PriceDrift[] {
  const worst = new Map<string, { drift: PriceDrift; gap: number }>();
  for (const s of snapshots) {
    if (!(s.costUSD >= MIN_USD)) continue;
    // 비정상 토큰 값(NaN·Infinity)으로는 밴드를 만들 수 없다 — 허위 불일치 마커 방지(/ship 보안검토 I3).
    if (![s.inputTokens, s.outputTokens, s.cacheReadInputTokens, s.cacheCreationInputTokens, s.webSearchRequests].every(Number.isFinite)) continue;
    if (resolvePricing(s.model).source === 'none') continue;
    const lo = costAt(s, 0);
    const hi = costAt(s, 1);
    const below = lo * (1 - TOLERANCE) - s.costUSD;
    const above = s.costUSD - hi * (1 + TOLERANCE);
    const gap = Math.max(below, above);
    if (gap <= 0) continue;
    const prev = worst.get(s.model);
    if (!prev || gap > prev.gap) {
      worst.set(s.model, { drift: { model: s.model, vendorUsd: s.costUSD, expectedLoUsd: lo, expectedHiUsd: hi }, gap });
    }
  }
  return [...worst.values()].map(w => w.drift).sort((a, b) => a.model.localeCompare(b.model));
}
