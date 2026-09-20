import { describe, it, expect } from 'vitest';
import {
  median,
  THRESHOLD_LOW,
  THRESHOLD_HIGH,
  classifyCacheHitRate,
  filterQualifyingCostDays,
  calcCostAnomalyPct,
  calcPaceBaseline,
} from '../../src/webview/metricCalc';
import type { DailyUsage } from '../../src/types';

function day(date: string, totalTokens: number, costUsd: number): DailyUsage {
  return { date, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens, costUsd, cacheHitRate: 0 };
}

describe('median', () => {
  it('빈 배열은 null', () => {
    expect(median([])).toBeNull();
  });
  it('홀수 개는 중앙값', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('짝수 개는 중앙 두 값의 평균', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('classifyCacheHitRate — 60/90 밴드', () => {
  it('경계값 THRESHOLD_LOW(60) 미만이면 drop', () => {
    expect(classifyCacheHitRate(59.9)).toBe('drop');
  });
  it('경계값 THRESHOLD_LOW(60) 포함부터 normal', () => {
    expect(classifyCacheHitRate(60)).toBe('normal');
    expect(classifyCacheHitRate(60.1)).toBe('normal');
  });
  it('보드 표본 78.4%(정상)·31.2%(급락) 재현', () => {
    expect(classifyCacheHitRate(78.4)).toBe('normal');
    expect(classifyCacheHitRate(31.2)).toBe('drop');
  });
  it('THRESHOLD_HIGH는 90', () => {
    expect(THRESHOLD_HIGH).toBe(90);
    expect(THRESHOLD_LOW).toBe(60);
  });
});

describe('filterQualifyingCostDays — 가격미상(costUsd=0)·오늘 제외', () => {
  const days: DailyUsage[] = [
    day('2026-09-10', 1000, 1.5),
    day('2026-09-11', 1000, 0),      // 가격표 미등재 — 제외
    day('2026-09-12', 0, 0),         // 사용 없음 — 제외
    day('2026-09-13', 500, 2.0),
    day('2026-09-18', 800, 4.18),    // 오늘 — 제외
  ];
  it('가격미상·무사용·오늘을 모두 제외한다', () => {
    const qualifying = filterQualifyingCostDays(days, '2026-09-18');
    expect(qualifying.map(d => d.date)).toEqual(['2026-09-10', '2026-09-13']);
  });
});

describe('calcCostAnomalyPct — 표본 부족 시 숨김', () => {
  it('표본 7개 미만이면 null (거짓 경보 방지)', () => {
    expect(calcCostAnomalyPct(4.18, [1.0, 2.0, 3.0], 7)).toBeNull();
  });
  it('표본 7개 이상이면 (오늘-중앙값)/중앙값', () => {
    const costs = [1, 2, 2, 2, 3, 3, 3]; // median = 2
    expect(calcCostAnomalyPct(4, costs, 7)).toBeCloseTo(1.0, 5); // +100%
  });
  it('median이 0이면 null(0으로 나누기 방지)', () => {
    const costs = [0, 0, 0, 0, 0, 0, 0];
    expect(calcCostAnomalyPct(4, costs, 7)).toBeNull();
  });
});

describe('calcPaceBaseline — 0..100 clamp', () => {
  const start = 1000;
  const reset = 2000;
  it('윈도 시작 시점은 0', () => {
    expect(calcPaceBaseline(1000, start, reset)).toBe(0);
  });
  it('윈도 종료 시점은 100', () => {
    expect(calcPaceBaseline(2000, start, reset)).toBe(100);
  });
  it('중간 지점은 선형 보간', () => {
    expect(calcPaceBaseline(1500, start, reset)).toBe(50);
  });
  it('윈도 이전이면 0으로 clamp(음수 방지)', () => {
    expect(calcPaceBaseline(500, start, reset)).toBe(0);
  });
  it('윈도 이후면 100으로 clamp', () => {
    expect(calcPaceBaseline(2500, start, reset)).toBe(100);
  });
});
