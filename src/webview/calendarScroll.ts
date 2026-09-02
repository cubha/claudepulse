/**
 * Usage Calendar 가로 스크롤 위치 소유 모듈 — 대시보드·사이드바 공용 (v0.1.55).
 *
 * 계약: 기본은 우측 끝(오늘) 고정. 사용자가 과거로 스크롤해둔 위치는 재렌더에도 보존한다.
 *
 * 왜 별도 모듈인가 — v0.1.55에서 고친 결함 A가 두 겹이었기 때문이다:
 *
 *  1) `innerHTML` 교체 직후 같은 동기 블록에서 `scrollLeft`를 대입하면 **그 시점의
 *     clientWidth로 클램프**된다. 이후 컨테이너가 좁아져도 재스크롤이 없어 우측 끝에
 *     못 미친 자리에 고착되고 오늘 셀이 잘린다(실측: 뷰포트 700px에서 130 vs 최대 182,
 *     52px 부족. ~750px 미만에서만 발현 — 그 이상은 클램프값이 우연히 최대치와 같아
 *     증상이 은폐되고, 그것이 v0.1.52부터 눈에 띄지 않은 이유다).
 *
 *  2) 더 나쁜 것은 그 고착값이 **"사용자가 과거로 스크롤했다"로 역추론돼 영구화**된다는
 *     점이다(`scrollLeft < max - 2`가 참이 되므로). 그래서 이 모듈은 우측 끝 여부를
 *     **좌표에서 역추론하지 않는다** — 직전에 우리가 적용한 값(`lastApplied`)과 다를 때만
 *     "사용자가 움직였다"로 판정한다.
 *
 * 그래서 대입 1회로 끝내지 않고, 다음 페인트(rAF×2)와 이후의 폭 변화(ResizeObserver)까지
 * 따라가는 **유지되는 계약**으로 구현한다. VS Code webview는 `retainContextWhenHidden`으로
 * 숨겨진 동안 렌더가 멈춰 rAF가 지연될 수 있는데, 다시 보일 때 발생하는 레이아웃 변화를
 * ResizeObserver가 받는다.
 *
 * 이 주장은 `scripts/verify-calendar-clip.js`가 실제로 단언한다 — "렌더 후 축소" 2건과
 * "숨김중 재렌더 후 복귀" 2건. 넷 다 ResizeObserver를 끄면 실패하는 것을 확인했다(2026-08-31).
 * 검증하지 않은 보호를 주석으로 주장하지 않는다 — 그게 v0.1.55에서 고친 실패 부류다.
 */

/** 브라우저 서브픽셀 반올림 여유. 우측 끝 판정·사용자 이동 판정에 공통 적용한다. */
const PIN_EPS = 2;

export interface CalendarScrollState {
  /** true면 재렌더 후 우측 끝(오늘)으로 고정한다. 좌표가 아니라 '의도'를 담는다. */
  pinnedToToday: boolean;
  /** pinnedToToday가 false일 때 복원할 위치. */
  savedScrollLeft: number;
  /** 우리가 마지막으로 적용한 뒤 실제로 읽힌 값(클램프 반영). 사용자 이동 판정 기준. */
  lastApplied: number;
  observer: ResizeObserver | null;
}

export function createCalendarScrollState(): CalendarScrollState {
  return { pinnedToToday: true, savedScrollLeft: 0, lastApplied: 0, observer: null };
}

/**
 * 재렌더(innerHTML 교체) **직전** 호출. 사용자가 스크롤을 움직였는지 판정해 상태에 기록한다.
 * 좌표를 그대로 믿지 않고 `lastApplied`와 비교하는 것이 핵심 — 클램프된 잘못된 위치를
 * '의도적 과거 탐색'으로 오인해 영구 고착시키는 경로를 여기서 끊는다.
 */
export function captureCalendarScroll(area: Element | null, state: CalendarScrollState): void {
  if (!area) return; // 첫 렌더 — 기본값(오늘 고정) 유지
  const cur = area.scrollLeft;
  if (Math.abs(cur - state.lastApplied) <= PIN_EPS) return; // 우리가 둔 그대로 = 사용자 이동 없음
  const max = area.scrollWidth - area.clientWidth;
  state.pinnedToToday = max <= 0 || cur >= max - PIN_EPS;
  state.savedScrollLeft = cur;
}

/**
 * 재렌더 **직후** 호출. 계약을 적용하고, 레이아웃이 확정될 때까지 유지한다.
 * 이전 렌더의 ResizeObserver는 여기서 정리된다(innerHTML 교체로 관측 대상이 사라지므로).
 */
export function applyCalendarScroll(area: Element | null, state: CalendarScrollState): void {
  state.observer?.disconnect();
  state.observer = null;
  if (!area) return;

  const settle = (): void => {
    // scrollWidth를 넘겨주면 브라우저가 현재 최대치로 클램프한다 — 최대치를 직접 계산하지 않는 이유.
    area.scrollLeft = state.pinnedToToday ? area.scrollWidth : state.savedScrollLeft;
    state.lastApplied = area.scrollLeft; // 클램프된 '실제' 값을 기억해야 다음 capture가 정확하다
  };

  settle();
  // 이 시점 폭은 아직 잠정값일 수 있다(세로 스크롤바 출현 등으로 이후 좁아진다).
  requestAnimationFrame(() => requestAnimationFrame(settle));

  // 그 뒤의 폭 변화(패널 리사이즈·사이드바 드래그·숨김→표시)도 따라간다.
  // 콜백이 크기를 바꾸지 않으므로 관측 루프는 발생하지 않는다.
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      if (state.pinnedToToday) settle();
    });
    ro.observe(area);
    state.observer = ro;
  }
}
