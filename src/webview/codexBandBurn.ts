// Codex 버킷별 소모율/안전시각 산출 (v0.2.3 R3).
//
// 왜 별도 순수 모듈인가: 사이드바는 v0.2.1 ST10부터 버킷별 burn을 보여 줬지만 대시보드는
// 못 보여 줬다. 원인은 카드가 없어서가 아니라 **패널측에 버킷 이력 저장소가 없어서**였다 —
// panelView.ts는 PushCodexRateLimit을 받아 스냅샷을 덮어쓰기만 하고 누적하지 않았고,
// burn은 포인트 2개 이상이라야 산출되므로 카드만 만들면 영원히 "수집 중"에 고착한다.
// 그래서 이력 누적(codexBucketHistory.ts)과 산출(이 파일)을 둘 다 잠글 수 있는 형태로 둔다.
//
// panelView는 deriveCodexBucketBurn 값을 panel-metric-* 마크업에 끼워 넣고, 사이드바는 아래
// buildCodexBucketBurnRow(rate-burn-row 마크업)를 쓴다. 두 표면의 마크업이 다르므로 공유하는 것은
// **판정과 수치**지 HTML이 아니다.
import { calcSafeUntil, calcProjAtReset, deriveBurnState, burnStateLabelKey, pickBurnUnit, type PollPoint } from './burnRate';
import { fmtPct, fmtTime } from './webviewShared';
import { t } from './i18n';

// 표기 단위 선택(pickBurnUnit)은 burnRate.ts가 소유한다 — v0.2.3 추가분에서 **같은 결함이
// Claude 7D 행에도 있었음**이 드러나 두 표면의 공통 조상으로 올렸다. 여기 사본을 두면
// 한쪽만 고쳐지는 드리프트가 다시 생긴다.

export interface CodexBucketBurn {
  /** "1.00%/min" · "6.00%/hr" · "0.72%/day" — 단위는 창 길이가 정한다(pickBurnUnit). 산출 불가면 null. */
  rateText: string | null;
  /** "14:32:10" — 리셋 전에 소진되지 않으면 null. 없는 값을 지어내지 않는다. */
  safeText: string | null;
  /**
   * "12%" — 이 속도로 가면 리셋 시점에 남는 양(v0.2.3 ⑪). safeText와 **같은 게이트**(리셋 전 소진
   * 궤도일 때만)를 쓴다 — buildBurnRow가 Claude 행에서 쓰는 규칙과 동일해야 두 행이 같은 뜻이 된다.
   */
  projText: string | null;
  /** rateText가 null일 때 대신 쓸 i18n 키(수집 중 / 유휴 / 미사용). */
  fallbackKey: string;
  /** 실측 delta가 아니라 경과 기반 추정으로 낸 값인가. */
  isEstimate: boolean;
  /** 실측 delta=0(유휴) — "수집 중"과 구분해 0%/min으로 명시한다. */
  isIdle: boolean;
}

/**
 * `windowMs`를 인자로 받는다 — 5h/7d/30d를 하드코딩하지 않기 위해서다.
 * Codex 버킷은 개수도 window도 가변이라(free=30일 단일, 유료=5h+7d) 호출측이
 * `bucket.windowMinutes * 60_000`을 그대로 넘긴다.
 */
export function deriveCodexBucketBurn(
  history: PollPoint[],
  utilization: number,
  msUntilReset: number,
  windowMs: number,
): CodexBucketBurn {
  const state = deriveBurnState(history, utilization, msUntilReset, windowMs);
  const fallbackKey = burnStateLabelKey(state.kind);
  const isIdle = state.kind === 'idle';

  if (state.rate === null) {
    return { rateText: null, safeText: null, projText: null, fallbackKey, isEstimate: false, isIdle };
  }

  const unit = pickBurnUnit(windowMs);
  const rateText = `${(state.rate * 100 * unit.perMinFactor).toFixed(2)}${unit.suffix}`;
  // rate가 0(유휴)이면 calcSafeUntil이 null을 낸다 — 0으로 나눈 무한대를 시각으로 쓰지 않는다.
  const resetAt = new Date(Date.now() + msUntilReset);
  const safeUntil = calcSafeUntil(utilization, state.rate, resetAt);

  return {
    rateText,
    safeText: safeUntil ? fmtTime(safeUntil) : null,
    projText: safeUntil ? fmtPct(calcProjAtReset(utilization, state.rate, msUntilReset)) : null,
    fallbackKey,
    isEstimate: state.isEstimate,
    isIdle,
  };
}

/**
 * 사이드바 버킷 행용 HTML(`.rate-burn-row`). 대시보드는 마크업이 달라(`panel-metric-sub`)
 * deriveCodexBucketBurn을 직접 쓰지만, **판정과 수치는 이 한 곳에서 나온다** — 같은 버킷의
 * 소모율이 사이드바와 대시보드에서 다르게 보이면 어느 쪽이 맞는지 사용자가 알 수 없다.
 *
 * v0.2.1 ST10은 여기에 Claude용 buildBurnRow를 그대로 썼는데, 그 경로는 %/min 고정이라
 * 30일 버킷에서 "0.00%/min"을 출력했다(pickBurnUnit 주석 참조).
 */
export function buildCodexBucketBurnRow(
  history: PollPoint[],
  utilization: number,
  msUntilReset: number,
  windowMs: number,
): string {
  const burn = deriveCodexBucketBurn(history, utilization, msUntilReset, windowMs);
  if (burn.rateText === null) return '';
  const est = burn.isEstimate ? ` (${t('est_label')})` : '';
  // "(proj N% left)"는 buildBurnRow와 같은 모양 — v0.2.3 A2 교체 때 빠졌던 조각(v0.2.3 ⑪).
  const proj = burn.projText ? ` (${t('proj')} ${burn.projText} ${t('left')})` : '';
  const safe = burn.safeText ? ` · ${t('safe_until')} ${burn.safeText}${proj}` : '';
  return `<div class="rate-burn-row">
    <span class="rate-burn-label">${t('burn')} ${burn.rateText}${est}${safe}</span>
  </div>`;
}
