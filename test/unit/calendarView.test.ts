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

  it('월요일 시작 정렬 — 앞쪽 패딩은 0~6일, 뒤쪽(오늘 이후)은 패딩하지 않는다', () => {
    // gridStart는 windowStart가 속한 주의 월요일 — 패딩폭은 windowStart 요일에 좌우되어 0~6일.
    // 마지막 셀은 항상 today(요일 무관, 부분 마지막 주 허용) — CSS grid-auto-flow:column이 처리.
    const todayKey = '2026-07-23'; // 목요일
    const cells = buildCalendarCells([], 30, todayKey);
    expect(cells.length).toBeGreaterThanOrEqual(30);
    expect(cells.length).toBeLessThanOrEqual(30 + 6);
    expect(cells[cells.length - 1].date).toBe(todayKey);
  });

  it('패딩 경계 — 그리드 첫 셀은 항상 월요일(UTC)이고 패딩폭은 0~6일', () => {
    // windowDays=1 → windowStart=today. 임의 요일(today)에 대해 gridStart(그리드 첫 셀)는
    // 그 주의 월요일로 정렬되므로 패딩폭(windowStart 대비)은 0(today가 월요일)~6(today가 일요일)일.
    for (const todayKey of ['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05']) {
      const cells = buildCalendarCells([], 1, todayKey);
      const firstDow = new Date(`${cells[0].date}T00:00:00.000Z`).getUTCDay();
      expect(firstDow).toBe(1); // 월요일(UTC) = getUTCDay() 1
      expect(cells.length).toBeGreaterThanOrEqual(1);
      expect(cells.length).toBeLessThanOrEqual(7);
      expect(cells[cells.length - 1].date).toBe(todayKey);
    }
  });

  it('패딩 경계 6칸 — windowStart가 일요일이면 패딩 6일(그리드 길이 7)', () => {
    // getUTCDay()===0인 날짜를 today로 두면 windowDays=1일 때 windowStart=today=일요일 → 최대 패딩.
    const sunday = ['2026-06-28', '2026-07-05', '2026-07-12'].find(
      d => new Date(`${d}T00:00:00.000Z`).getUTCDay() === 0
    );
    expect(sunday).toBeDefined();
    const cells = buildCalendarCells([], 1, sunday!);
    expect(cells.length).toBe(7);
    expect(cells[0].date).not.toBe(sunday);
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
    expect(flags.length).toBe(Math.ceil(cells.length / 7));
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
