import { describe, it, expect } from 'vitest';
import {
  calcBurnRate,
  calcBurnRateEstimate,
  deriveBurnState,
  burnStateLabelKey,
  type PollPoint,
} from '../../src/webview/burnRate';

const FH_WINDOW_MS = 5 * 60 * 60 * 1000;

function pt(minutesAgoFromBase: number, v: number, base: number): PollPoint {
  return { t: new Date(base - minutesAgoFromBase * 60000), v };
}

describe('calcBurnRate — 최근 N분(기본 30분) 평균 기울기', () => {
  it('포인트 2개 미만이면 null', () => {
    expect(calcBurnRate([])).toBeNull();
    expect(calcBurnRate([{ t: new Date(), v: 0.1 }])).toBeNull();
  });

  it('두 포인트 사이 시간차 0이면 null', () => {
    const t = new Date();
    expect(calcBurnRate([{ t, v: 0.1 }, { t, v: 0.2 }])).toBeNull();
  });

  it('윈도 내 가장 오래된 포인트까지 평균 — 인접 2포인트보다 안정적', () => {
    const base = Date.now();
    const history: PollPoint[] = [
      pt(30, 0.10, base),
      pt(20, 0.14, base), // 노이즈: 이 구간만 보면 기울기 급등
      pt(10, 0.145, base),
      pt(0, 0.20, base)
    ];
    // 30분 윈도 전체 평균: (0.20-0.10)/30 = 0.00333.../min
    const rate = calcBurnRate(history, 30);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo((0.20 - 0.10) / 30, 5);
  });

  it('히스토리가 윈도보다 짧으면 처음 포인트까지만 사용', () => {
    const base = Date.now();
    const history: PollPoint[] = [pt(5, 0.10, base), pt(0, 0.15, base)];
    const rate = calcBurnRate(history, 30);
    expect(rate!).toBeCloseTo((0.15 - 0.10) / 5, 5);
  });

  it('utilization 하락(윈도 리셋)이면 음수 반환', () => {
    const base = Date.now();
    const history: PollPoint[] = [pt(10, 0.80, base), pt(0, 0.05, base)];
    const rate = calcBurnRate(history);
    expect(rate!).toBeLessThan(0);
  });
});

describe('calcBurnRateEstimate — 세션 경과 기반 추정', () => {
  it('경과 1분 미만이면 null', () => {
    expect(calcBurnRateEstimate(0.1, FH_WINDOW_MS - 30_000, FH_WINDOW_MS)).toBeNull();
  });

  it('경과시간 기준 utilization/elapsedMin', () => {
    const msUntilReset = FH_WINDOW_MS - 10 * 60000; // 10분 경과
    expect(calcBurnRateEstimate(0.05, msUntilReset, FH_WINDOW_MS)).toBeCloseTo(0.05 / 10, 5);
  });
});

describe('deriveBurnState — 상태머신', () => {
  it('utilization=0 → no_usage (수집중 아님)', () => {
    const state = deriveBurnState([], 0, FH_WINDOW_MS, FH_WINDOW_MS);
    expect(state.kind).toBe('no_usage');
    expect(state.rate).toBeNull();
  });

  it('히스토리 <2 + 경과 1분 미만 → collecting', () => {
    const state = deriveBurnState([], 0.02, FH_WINDOW_MS - 30_000, FH_WINDOW_MS);
    expect(state.kind).toBe('collecting');
    expect(state.rate).toBeNull();
  });

  it('히스토리 <2 지만 경과 1분 이상 → active(추정치 폴백)', () => {
    const msUntilReset = FH_WINDOW_MS - 5 * 60000;
    const state = deriveBurnState([], 0.05, msUntilReset, FH_WINDOW_MS);
    expect(state.kind).toBe('active');
    expect(state.isEstimate).toBe(true);
    expect(state.rate).toBeCloseTo(0.05 / 5, 5);
  });

  it('두 폴링 포인트 사이 delta=0 (유휴) → idle, "수집 중" 아님', () => {
    const base = Date.now();
    const history: PollPoint[] = [pt(10, 0.30, base), pt(0, 0.30, base)];
    const state = deriveBurnState(history, 0.30, FH_WINDOW_MS - 60 * 60000, FH_WINDOW_MS);
    expect(state.kind).toBe('idle');
    expect(state.rate).toBe(0);
  });

  it('utilization 실측 상승 → active(실측치, isEstimate=false)', () => {
    const base = Date.now();
    const history: PollPoint[] = [pt(10, 0.20, base), pt(0, 0.30, base)];
    const state = deriveBurnState(history, 0.30, FH_WINDOW_MS - 60 * 60000, FH_WINDOW_MS);
    expect(state.kind).toBe('active');
    expect(state.isEstimate).toBe(false);
    expect(state.rate!).toBeCloseTo(0.01, 5);
  });

  it('윈도 리셋(음수 delta) + 추정 가능 → window_reset(추정치 폴백)', () => {
    const base = Date.now();
    const history: PollPoint[] = [pt(10, 0.80, base), pt(0, 0.05, base)];
    const msUntilReset = FH_WINDOW_MS - 5 * 60000;
    const state = deriveBurnState(history, 0.05, msUntilReset, FH_WINDOW_MS);
    expect(state.kind).toBe('window_reset');
    expect(state.isEstimate).toBe(true);
    expect(state.rate!).toBeCloseTo(0.05 / 5, 5);
  });

  it('윈도 리셋 + 추정 불가(경과 1분 미만) → window_reset, rate null', () => {
    const base = Date.now();
    const history: PollPoint[] = [pt(10, 0.80, base), pt(0, 0.05, base)];
    const state = deriveBurnState(history, 0.05, FH_WINDOW_MS - 30_000, FH_WINDOW_MS);
    expect(state.kind).toBe('window_reset');
    expect(state.rate).toBeNull();
  });
});

describe('burnStateLabelKey — 값 대신 상태 라벨을 쓸 때의 i18n 키', () => {
  // 회귀 잠금: BURN RATE 카드는 idle을 "유휴"로 표기하는데 SAFE UNTIL 카드만
  // idle을 "데이터 수집 중"으로 흘려보내던 결함(v0.1.47 재검증 갭A).
  it('idle은 collecting_data가 아니라 idle_label', () => {
    expect(burnStateLabelKey('idle')).toBe('idle_label');
  });

  it('no_usage는 no_usage_yet', () => {
    expect(burnStateLabelKey('no_usage')).toBe('no_usage_yet');
  });

  it('진짜 수집 중(collecting)은 collecting_data', () => {
    expect(burnStateLabelKey('collecting')).toBe('collecting_data');
  });

  it('window_reset은 히스토리가 리셋된 상태라 collecting_data', () => {
    expect(burnStateLabelKey('window_reset')).toBe('collecting_data');
  });

  it('어떤 kind도 유휴를 수집 중으로 오표기하지 않는다', () => {
    const kinds = ['no_usage', 'collecting', 'idle', 'active', 'window_reset'] as const;
    for (const k of kinds) {
      if (k === 'idle') expect(burnStateLabelKey(k)).not.toBe('collecting_data');
    }
  });
});
