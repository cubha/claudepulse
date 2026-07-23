/**
 * Usage Calendar 히트맵 순수 로직 — GitHub 기여도식, 월요일 시작 정렬.
 *
 * v0.1.45: main.ts(updateUsageCalendar)에서 추출. 대시보드(371일 고정뷰)와
 * 사이드바(30일 축소뷰)가 windowDays만 다르게 공유한다. DOM·Intl·getLang() 등
 * 비순수 의존을 배제해 단위테스트 가능하게 분리했다(calendarView.test.ts).
 */
export interface CalendarDay {
  date: string;
  costUsd: number;
  totalTokens: number;
}

export interface CalendarCell {
  date: string;
  cost: number;
  tokens: number;
  isToday: boolean;
}

/** 비용>0 값의 표시 윈도우 내 quartile로 강도 산출(절대값 임계 아님 — DESIGN-TOKENS.md 스펙). */
export function heatLevel(cost: number, sortedPositiveCosts: number[]): number {
  if (cost <= 0 || sortedPositiveCosts.length === 0) return 0;
  const pctile = (p: number) => sortedPositiveCosts[Math.min(sortedPositiveCosts.length - 1, Math.floor(p * sortedPositiveCosts.length))];
  if (cost <= pctile(0.25)) return 1;
  if (cost <= pctile(0.5)) return 2;
  if (cost <= pctile(0.75)) return 3;
  return 4;
}

const isoDow = (d: Date): number => (d.getUTCDay() + 6) % 7; // 0=Mon..6=Sun

/**
 * days를 today 기준 windowDays 폭의 캘린더 셀 배열로 변환한다.
 * 월요일 시작 요일 정렬을 위해 윈도우 시작 주의 요일만큼 앞쪽으로 패딩한다.
 * todayKey는 호출부가 주입(예: new Date().toISOString().slice(0,10)) — 결정론 확보.
 */
export function buildCalendarCells(days: CalendarDay[], windowDays: number, todayKey: string): CalendarCell[] {
  const byDate = new Map(days.map(d => [d.date, d]));
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const windowStart = new Date(today);
  windowStart.setUTCDate(windowStart.getUTCDate() - (windowDays - 1));

  const gridStart = new Date(windowStart);
  gridStart.setUTCDate(gridStart.getUTCDate() - isoDow(windowStart));

  const cells: CalendarCell[] = [];
  const cur = new Date(gridStart);
  while (cur.getTime() <= today.getTime()) {
    const key = cur.toISOString().slice(0, 10);
    const d = byDate.get(key);
    cells.push({
      date: key,
      cost: d?.costUsd ?? 0,
      tokens: d?.totalTokens ?? 0,
      isToday: key === todayKey,
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return cells;
}

/** 각 주(週) 열의 첫 날짜가 그 달 1~7일이면 월 라벨을 표시할지 여부 — 주 단위 boolean 배열. */
export function monthLabelFlags(cells: CalendarCell[]): boolean[] {
  const weeks = Math.ceil(cells.length / 7);
  const flags: boolean[] = [];
  for (let w = 0; w < weeks; w++) {
    const weekFirst = cells[w * 7];
    const d = new Date(`${weekFirst.date}T00:00:00.000Z`);
    flags.push(d.getUTCDate() <= 7);
  }
  return flags;
}
