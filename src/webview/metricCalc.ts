// 게이지 밖 4곳(캐시밴드·신호품질·비용이상·페이스라인) 순수 계산 모듈 — burnRate.ts와 같은 패턴
// (DOM/Chart.js 의존 없음, 테스트 가능한 함수만).

import type { DailyUsage } from '../types';

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 캐시 히트율 정상범위 밴드(C1-Cache 보드: 78.4%=정상 내부, 31.2%=밴드 아래 급락). */
export const THRESHOLD_LOW = 60;
export const THRESHOLD_HIGH = 90;

export function classifyCacheHitRate(hitRatePct: number): 'normal' | 'drop' {
  return hitRatePct >= THRESHOLD_LOW ? 'normal' : 'drop';
}

/**
 * 비용 중앙값 표본에서 가격미상(costUsd=0인데 totalTokens>0 — 당시 가격표 미등재)·무사용·오늘 자신을
 * 제외한다. 이 필터 없이 median을 계산하면 가격미상 0이 섞여 "평소"가 허위로 무너진다
 * (longterm-cost-note의 costUnknownDays와 동일 원인).
 */
export function filterQualifyingCostDays(days: DailyUsage[], excludeDateKey: string): DailyUsage[] {
  return days.filter(d => d.totalTokens > 0 && d.costUsd > 0 && d.date !== excludeDateKey);
}

/**
 * 오늘 비용이 최근 평소(중앙값) 대비 얼마나 벗어났는지. 표본이 minSample 미만이면 null(배지 숨김) —
 * 2~3개 표본으로 "+61%"를 단언하지 않는다. median<=0이면 0으로 나누기 방지로 null.
 */
export function calcCostAnomalyPct(todayCost: number, qualifyingCosts: number[], minSample = 7): number | null {
  if (qualifyingCosts.length < minSample) return null;
  const m = median(qualifyingCosts);
  if (m === null || m <= 0) return null;
  return (todayCost - m) / m;
}

/**
 * 현재 5h 윈도 안에서 시각 t의 "기준 페이스"(0..100, 창 시작=0 → 리셋=100 선형). 호출측(updateTrendChart)이
 * 이 값을 쓸지 말지는 렌더 시점 t가 현재 윈도 안에 있는지로 판단해야 한다(24h 스코프처럼 여러 리셋을
 * 가로지르는 구간에서 단조 기준선이 100에 눌어붙는 것을 막기 위함) — 이 함수 자체는 range 클램프만 한다.
 */
export function calcPaceBaseline(nowMs: number, windowStartMs: number, resetAtMs: number): number {
  if (resetAtMs <= windowStartMs) return 100;
  const ratio = (nowMs - windowStartMs) / (resetAtMs - windowStartMs);
  return Math.min(100, Math.max(0, ratio * 100));
}
