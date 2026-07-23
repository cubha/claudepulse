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
export function heatLevel(_cost: number, _sortedPositiveCosts: number[]): number {
  return 0;
}

/**
 * days를 today 기준 windowDays 폭의 캘린더 셀 배열로 변환한다.
 * 월요일 시작 요일 정렬을 위해 윈도우 시작 주의 요일만큼 앞쪽으로 패딩한다.
 * todayKey는 호출부가 주입(예: new Date().toISOString().slice(0,10)) — 결정론 확보.
 */
export function buildCalendarCells(_days: CalendarDay[], _windowDays: number, _todayKey: string): CalendarCell[] {
  return [];
}

/** 각 주(週) 열의 첫 날짜가 그 달 1~7일이면 월 라벨을 표시할지 여부 — 주 단위 boolean 배열. */
export function monthLabelFlags(_cells: CalendarCell[]): boolean[] {
  return [];
}
