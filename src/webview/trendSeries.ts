// Utilization Trend 차트의 시리즈 선택 (v0.2.3 R4).
//
// v0.2.2까지 updateTrendChart는 데이터셋 2개(Session 5h / Weekly 7d)를 손으로 적어 놨다.
// 그 고정 전제 때문에 panel-util-trend-card는 Codex 활성 시 통째로 숨는 카드였다 —
// Codex는 버킷 개수가 가변이라(free=30일 1개, 유료=5h+7d, 그리고 labelKey가 null인 미지의
// window도 온다) "2개"라는 수가 애초에 성립하지 않는다.
//
// 렌더(Chart.js 데이터셋 구성·축·페이스라인)는 panelView가 계속 소유한다. 여기서 떼어낸 것은
// **어떤 시리즈를 어떤 색으로 그릴 것인가**라는, DOM 없이 판정 가능한 부분뿐이다.
import type { PollPoint } from './burnRate';

/**
 * 시리즈 액센트 순환 목록.
 *
 * §3#6의 7+1 cap 안에서만 돈다 — 버킷이 4개를 넘으면 **새 색을 만들지 않고 처음으로 되돌아간다**.
 * 색이 겹치는 것은 읽기 불편할 뿐이지만, 8번째 액센트를 만드는 것은 디자인 계약 위반이다
 * (warn/danger/success는 상태색이라 시리즈 색으로 쓰지 않는다 — 추세선이 경고로 읽힌다).
 */
export const TREND_ACCENT_VARS = ['--c-sonnet', '--c-opus', '--c-haiku', '--c-fable'] as const;

export type TrendSeriesSource =
  | { kind: 'claude'; key: 'fh' | 'sd' }
  | { kind: 'codex'; windowMinutes: number; labelKey: string | null };

export interface TrendSeries {
  /** Chart.js 데이터셋 식별용 안정 키. */
  key: string;
  source: TrendSeriesSource;
  /** cutoff 이후로 걸러진 포인트. 빈 배열일 수 있다 — 0으로 채우지 않는다. */
  points: PollPoint[];
  /**
   * CSS 커스텀 프로퍼티 **이름**(§3#5 — 색 리터럴 금지). 소비측이 getCssVar로 값을 읽는다.
   *
   * ⚠️ 주석에 CSS 참조 함수 호출 문법을 예시로 적지 않는다 — verify.sh D-4는 TS 전체를
   * 정규식으로 긁어 소비 토큰을 세는데 주석 속 예시까지 실소비로 읽는다(실측: 이 자리에
   * 예시를 적었더니 D-4가 존재하지 않는 토큰을 미선언으로 보고했다). DESIGN-TOKENS.md에
   * 위반 hex를 적지 말라는 CLAUDE.md §9 관행과 같은 부류다.
   */
  accentVar: string;
}

export interface TrendSeriesArgs {
  provider: 'claude' | 'codex';
  fhHistory: PollPoint[];
  sdHistory: PollPoint[];
  codexHistory: Map<number, PollPoint[]>;
  codexBuckets: readonly { windowMinutes: number; labelKey: string | null }[];
  /** 이 시각 이전 포인트는 버린다(차트 스코프 필터). */
  cutoffMs: number;
}

function sliceFrom(points: PollPoint[], cutoffMs: number): PollPoint[] {
  return points.filter(p => p.t.getTime() >= cutoffMs);
}

export function buildTrendSeries(args: TrendSeriesArgs): TrendSeries[] {
  const { provider, fhHistory, sdHistory, codexHistory, codexBuckets, cutoffMs } = args;

  if (provider === 'claude') {
    // 기존 색 배정을 그대로 유지한다 — 일반화하면서 사용자가 익숙한 선 색이 바뀌면
    // "무엇이 달라졌나"가 데이터 변화인지 리팩터링 부작용인지 구분되지 않는다.
    return [
      { key: 'fh', source: { kind: 'claude', key: 'fh' }, points: sliceFrom(fhHistory, cutoffMs), accentVar: TREND_ACCENT_VARS[0] },
      { key: 'sd', source: { kind: 'claude', key: 'sd' }, points: sliceFrom(sdHistory, cutoffMs), accentVar: TREND_ACCENT_VARS[1] },
    ];
  }

  // 버킷 순서는 CodexSource가 준 순서를 그대로 쓴다(사이드바·지표밴드와 같은 순서라야
  // 같은 버킷이 세 화면에서 같은 위치에 있다).
  return codexBuckets.map((b, i) => ({
    key: `codex-${b.windowMinutes}`,
    source: { kind: 'codex' as const, windowMinutes: b.windowMinutes, labelKey: b.labelKey },
    points: sliceFrom(codexHistory.get(b.windowMinutes) ?? [], cutoffMs),
    accentVar: TREND_ACCENT_VARS[i % TREND_ACCENT_VARS.length],
  }));
}
