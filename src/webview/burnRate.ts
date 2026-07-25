// 소모율(burn-rate) 순수 계산 모듈 — main.ts에서 분리(v0.1.47 ①).
// 상태머신(deriveBurnState)이 "idle(유휴)"과 "collecting(수집 중)"을 구분해
// 유휴 상태가 영구히 "데이터 수집 중…"으로 고착되는 버그를 없앤다.

export type PollPoint = { t: Date; v: number };

export type BurnStateKind = 'no_usage' | 'collecting' | 'idle' | 'active' | 'window_reset';

export interface BurnState {
  kind: BurnStateKind;
  /** 표시할 %/min 수치. null이면 표시할 수치 없음(no_usage/collecting/추정 불가 window_reset) */
  rate: number | null;
  isEstimate: boolean;
}

const STABILIZE_WINDOW_MIN = 30;

/** 최근 최대 windowMinutes 구간의 평균 기울기(%/min). 인접 2포인트만 쓰면 노이즈에 취약해 구간 평균으로 안정화. */
export function calcBurnRate(history: PollPoint[], windowMinutes: number = STABILIZE_WINDOW_MIN): number | null {
  if (history.length < 2) return null;
  const last = history[history.length - 1];
  const cutoff = last.t.getTime() - windowMinutes * 60000;

  let base = history[history.length - 2];
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].t.getTime() >= cutoff) {
      base = history[i];
    } else {
      break;
    }
  }

  const deltaV = last.v - base.v;
  const deltaT = (last.t.getTime() - base.t.getTime()) / 60000;
  if (deltaT <= 0) return null;
  return deltaV / deltaT; // %/min (양수 = 소비 중, 음수 = 윈도 리셋)
}

/** 히스토리가 부족할 때(세션 첫 진입 등) 경과 시간 기반 추정 번 레이트 */
export function calcBurnRateEstimate(utilization: number, msUntilReset: number, windowMs: number): number | null {
  const elapsed = windowMs - msUntilReset;
  const elapsedMin = elapsed / 60000;
  if (elapsedMin < 1) return null;
  return utilization / elapsedMin;
}

export function calcSafeUntil(
  utilization: number,
  burnRatePerMin: number,
  resetAt: Date
): Date | null {
  if (burnRatePerMin <= 0) return null;
  const remaining = 1 - utilization;
  const minsLeft = remaining / burnRatePerMin;
  const safeUntil = new Date(Date.now() + minsLeft * 60000);
  if (safeUntil > resetAt) return null;
  return safeUntil;
}

export function calcProjAtReset(
  utilization: number,
  burnRatePerMin: number,
  msUntilReset: number
): number {
  const minsUntilReset = msUntilReset / 60000;
  const projected = utilization + burnRatePerMin * minsUntilReset;
  return Math.min(1, Math.max(0, 1 - projected));
}

/**
 * burn-rate 표시 상태머신.
 * - no_usage: utilization=0 — 아직 사용 안 함
 * - collecting: 히스토리 부족 + 경과 추정도 불가(세션 진입 직후 1분 미만) — 진짜 "수집 중"
 * - idle: 실측 delta=0 — 유휴. "수집 중"이 아니라 0%/min으로 명시 표시
 * - window_reset: 실측 delta<0(리셋으로 utilization 하락) — 가능하면 경과 추정치로 폴백
 * - active: 실측 delta>0, 또는 히스토리 부족 시 경과 추정치로 폴백
 */
export function deriveBurnState(
  history: PollPoint[],
  utilization: number,
  msUntilReset: number,
  windowMs: number
): BurnState {
  if (utilization === 0) {
    return { kind: 'no_usage', rate: null, isEstimate: false };
  }

  const measured = calcBurnRate(history);
  const estimate = calcBurnRateEstimate(utilization, msUntilReset, windowMs);

  if (measured === null) {
    return estimate === null
      ? { kind: 'collecting', rate: null, isEstimate: false }
      : { kind: 'active', rate: estimate, isEstimate: true };
  }

  if (measured < 0) {
    return estimate === null
      ? { kind: 'window_reset', rate: null, isEstimate: false }
      : { kind: 'window_reset', rate: estimate, isEstimate: true };
  }

  if (measured === 0) {
    return { kind: 'idle', rate: 0, isEstimate: false };
  }

  return { kind: 'active', rate: measured, isEstimate: false };
}

/**
 * rate 수치 대신 상태 라벨을 표시해야 할 때 쓸 i18n 키.
 *
 * BURN RATE·SAFE UNTIL 두 카드가 각자 손으로 kind 분기를 쓰다가 SAFE UNTIL만
 * idle을 누락해 "데이터 수집 중"으로 오표기하는 결함이 있었다(v0.1.47 재검증).
 * 소비 지점이 늘어도 해석이 갈리지 않도록 분기를 여기 한 곳으로 모은다.
 */
export function burnStateLabelKey(kind: BurnStateKind): string {
  if (kind === 'no_usage') return 'no_usage_yet';
  if (kind === 'idle') return 'idle_label';
  return 'collecting_data';
}
