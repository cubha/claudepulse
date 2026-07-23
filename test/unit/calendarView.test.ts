import { describe, it, expect } from 'vitest';
import { buildCalendarCells, heatLevel, monthLabelFlags } from '../../src/webview/calendarView';
import type { CalendarDay } from '../../src/webview/calendarView';

function day(date: string, costUsd: number, totalTokens = 100): CalendarDay {
  return { date, costUsd, totalTokens };
}

describe('heatLevel — quartile 경계', () => {
  it('cost<=0 또는 데이터 없음 → 0', () => {
    expect(heatLevel(0, [1, 2, 3, 4])).toBe(0);
    expect(heatLevel(-1, [1, 2, 3, 4])).toBe(0);
    expect(heatLevel(5, [])).toBe(0);
  });

  it('p25 이하 → 1, p50 이하 → 2, p75 이하 → 3, 초과 → 4', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8]; // p25=idx2=3, p50=idx4=5, p75=idx6=7
    expect(heatLevel(3, sorted)).toBe(1);
    expect(heatLevel(5, sorted)).toBe(2);
    expect(heatLevel(7, sorted)).toBe(3);
    expect(heatLevel(8, sorted)).toBe(4);
  });
});

describe('buildCalendarCells — 윈도우·정렬·패딩', () => {
  it('windowDays=30 — today가 포함되고, 마지막 셀이 today다', () => {
    const todayKey = '2026-07-23'; // 목요일(UTC)
    const cells = buildCalendarCells([day(todayKey, 1.5, 500)], 30, todayKey);
    const last = cells[cells.length - 1];
    expect(last.date).toBe(todayKey);
    expect(last.isToday).toBe(true);
    expect(last.cost).toBe(1.5);
    expect(last.tokens).toBe(500);
  });

  it('월요일 시작 정렬 — 그리드 길이가 7의 배수', () => {
    const todayKey = '2026-07-23'; // 목요일
    const cells = buildCalendarCells([], 30, todayKey);
    expect(cells.length % 7).toBe(0);
  });

  it('패딩 경계 0칸 — 윈도우 시작이 월요일이면 그리드 첫 셀 = 윈도우 시작일 그대로', () => {
    // 2026-06-29는 월요일(UTC) — windowDays=1이면 windowStart=today=2026-06-29
    const todayKey = '2026-06-29';
    const cells = buildCalendarCells([], 1, todayKey);
    expect(cells[0].date).toBe('2026-06-29');
    expect(cells.length).toBe(7); // 월~일 한 주 전체
  });

  it('패딩 경계 6칸 — 윈도우 시작이 일요일이면 6일 패딩(월~일 전체 주)', () => {
    // 2026-07-05는 일요일(UTC) — windowDays=1이면 windowStart=today=2026-07-05
    const todayKey = '2026-07-05';
    const cells = buildCalendarCells([], 1, todayKey);
    expect(cells[0].date).toBe('2026-06-29'); // 그 주 월요일까지 6일 패딩
    expect(cells[cells.length - 1].date).toBe('2026-07-05');
    expect(cells.length).toBe(7);
  });

  it('데이터 없는 날은 cost 0 · tokens 0으로 채워진다', () => {
    const todayKey = '2026-07-23';
    const cells = buildCalendarCells([], 30, todayKey);
    expect(cells.every(c => c.cost === 0 && c.tokens === 0)).toBe(true);
  });

  it('windowDays=371(대시보드) — 윈도우 시작 이전 데이터는 그리드에 없다', () => {
    const todayKey = '2026-07-23';
    const tooOld = day('2020-01-01', 99, 1000);
    const cells = buildCalendarCells([tooOld], 371, todayKey);
    expect(cells.find(c => c.date === '2020-01-01')).toBeUndefined();
  });

  it('windowDays=30 vs 371 — 같은 today 기준 371이 30보다 그리드가 훨씬 크다', () => {
    const todayKey = '2026-07-23';
    const cells30 = buildCalendarCells([], 30, todayKey);
    const cells371 = buildCalendarCells([], 371, todayKey);
    expect(cells371.length).toBeGreaterThan(cells30.length);
  });

  it('today 이후 날짜는 그리드에 포함되지 않는다(오늘이 마지막)', () => {
    const todayKey = '2026-07-23';
    const cells = buildCalendarCells([], 30, todayKey);
    expect(cells.every(c => c.date <= todayKey)).toBe(true);
  });
});

describe('monthLabelFlags — 주별 라벨 표시', () => {
  it('각 주 첫날이 1~7일이면 true, 아니면 false — 길이는 주 수와 동일', () => {
    const todayKey = '2026-07-23';
    const cells = buildCalendarCells([], 30, todayKey);
    const flags = monthLabelFlags(cells);
    expect(flags.length).toBe(cells.length / 7);
  });

  it('윈도우 시작 주 첫날이 1~7일 범위면 해당 주 플래그가 true', () => {
    // 2026-06-29(월)부터 시작하는 1주 윈도우 — 6/29는 1~7일 범위 아님(29일) → false
    const cells = buildCalendarCells([], 1, '2026-06-29');
    const flags = monthLabelFlags(cells);
    expect(flags[0]).toBe(false);
  });

  it('주 첫날이 매달 1~7일에 걸치면 true', () => {
    // 2026-07-06(월)부터 시작 — 7/6은 1~7 범위 → true
    const cells = buildCalendarCells([], 1, '2026-07-12'); // 일요일, windowStart=2026-07-12, gridStart=2026-07-06(월)
    const flags = monthLabelFlags(cells);
    expect(flags[0]).toBe(true);
  });
});
