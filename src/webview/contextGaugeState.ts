import type { SessionContextUsage } from '../types';

/**
 * 사이드바 컨텍스트 게이지 배지·색상·경고링크 순수 계산 — DOM·getLang() 등 비순수 의존 배제
 * (calendarView.ts와 동일한 순수계산/렌더링 분리 패턴, contextGaugeState.test.ts로 단위 검증).
 *
 * colorStatus는 rate-bar-fill의 기존 data-status 어휘(allowed/allowed_warning/danger)를 재사용.
 * pinned 모드에서만 오래됨(stale)이 색상을 경고로 끌어올린다 — auto 모드는 최신값을 스스로
 * 따라가므로 되돌릴 대상이 없다(showRevertLink=false 고정).
 */
export interface ContextGaugeState {
  colorStatus: 'allowed' | 'allowed_warning' | 'danger';
  isStale: boolean;
  showRevertLink: boolean;
}

function ratioStatus(ratio: number): ContextGaugeState['colorStatus'] {
  if (ratio >= 0.90) return 'danger';
  if (ratio >= 0.80) return 'allowed_warning';
  return 'allowed';
}

export function resolveContextGaugeState(
  ctx: SessionContextUsage,
  nowMs: number,
  staleThresholdMs: number
): ContextGaugeState {
  const ageMs = nowMs - new Date(ctx.timestamp).getTime();
  const isStale = ageMs > staleThresholdMs;
  const base = ratioStatus(ctx.ratio);
  const pinnedStale = ctx.mode === 'pinned' && isStale;
  // 더 나쁜 상태가 이긴다 — pinned-stale은 최소 allowed_warning으로 끌어올리되 danger는 유지.
  const colorStatus = pinnedStale && base === 'allowed' ? 'allowed_warning' : base;
  return {
    colorStatus,
    isStale,
    showRevertLink: pinnedStale,
  };
}
