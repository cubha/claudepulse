import { describe, it, expect } from 'vitest';
import { deriveCodexBucketBurn, buildCodexBucketBurnRow } from '../../src/webview/codexBandBurn';
import type { PollPoint } from '../../src/webview/burnRate';

/**
 * v0.2.3 R3 — 대시보드 Codex 지표밴드의 버킷별 burn/safe 산출.
 *
 * 사이드바는 v0.2.1 ST10부터 버킷별 소모율을 보여 주는데 대시보드는 못 보여 줬다. 원인은
 * "카드가 없어서"가 아니라 **패널측에 버킷 이력 저장소가 없어서**였다 — panelView.ts는
 * PushCodexRateLimit을 받아 스냅샷만 덮어쓰고 누적하지 않았고, burn은 포인트 2개 이상이
 * 있어야 산출되므로 카드를 만들어 봤자 영원히 "수집 중"이었다.
 *
 * 이 함수는 그 산출부를 순수화한 것이다. 렌더는 panelView가 하고 여기서는 값만 낸다.
 */

const min = (n: number) => n * 60_000;

function history(points: Array<[minutesAgo: number, util: number]>): PollPoint[] {
  const now = Date.now();
  return points.map(([ago, v]) => ({ t: new Date(now - min(ago)), v }));
}

describe('deriveCodexBucketBurn (v0.2.3 R3)', () => {
  it('실측 이력 2점 이상이면 측정 소모율을 낸다', () => {
    // 10분간 0.20 → 0.30 = 0.01/min = 1.00%/min
    const r = deriveCodexBucketBurn(history([[10, 0.20], [0, 0.30]]), 0.30, min(120), min(300));
    expect(r.rateText).toBe('1.00%/min');
    expect(r.isEstimate).toBe(false);
  });

  it('이력이 1점뿐이면 경과 기반 추정으로 폴백하고 추정임을 표시한다', () => {
    const r = deriveCodexBucketBurn(history([[0, 0.30]]), 0.30, min(200), min(300));
    expect(r.rateText).not.toBeNull();
    expect(r.isEstimate).toBe(true);
  });

  it('소모율이 산출되면 안전시각(safe until)을 함께 낸다', () => {
    // 1.00%/min으로 0.30에서 출발하면 70분 뒤 소진 — 리셋(120분)보다 앞이라 표시 대상.
    const r = deriveCodexBucketBurn(history([[10, 0.20], [0, 0.30]]), 0.30, min(120), min(300));
    expect(r.safeText).toMatch(/^\d{1,2}:\d{2}/);
  });

  it('리셋 전에 소진되지 않으면 safeText는 null이다 (없는 값을 지어내지 않는다)', () => {
    // 10분간 0.01 상승 = 0.001/min. 0.02에서 리셋까지 30분이면 소진 안 됨.
    const r = deriveCodexBucketBurn(history([[10, 0.01], [0, 0.02]]), 0.02, min(30), min(300));
    expect(r.rateText).not.toBeNull();
    expect(r.safeText).toBeNull();
  });

  it('사용량 0이면 수치 대신 상태 라벨 키를 낸다', () => {
    const r = deriveCodexBucketBurn([], 0, min(120), min(300));
    expect(r.rateText).toBeNull();
    expect(r.fallbackKey).toBe('no_usage_yet');
  });

  it('유휴(delta=0)는 "수집 중"이 아니라 0%/min으로 명시된다', () => {
    const r = deriveCodexBucketBurn(history([[10, 0.30], [0, 0.30]]), 0.30, min(120), min(300));
    expect(r.rateText).toBe('0.00%/min');
    expect(r.isIdle).toBe(true);
  });

  it('버킷 window가 달라도 같은 함수로 산출된다 (5h/7d/30d 하드코딩 없음)', () => {
    const h = history([[10, 0.20], [0, 0.30]]);
    const r5h = deriveCodexBucketBurn(h, 0.30, min(120), min(300));
    const r30d = deriveCodexBucketBurn(h, 0.30, min(120), min(43200));
    // 같은 물리량을 각 창에 맞는 단위로 표기한다 — 수치는 달라도 둘 다 산출된다.
    expect(r5h.rateText).not.toBeNull();
    expect(r30d.rateText).not.toBeNull();
  });

  // ── 단위 선택: 긴 창에서 %/min이 0.00으로 눌어붙는 문제 ──────────────
  //
  // Codex free 플랜은 30일 단일 버킷이다(43200분). 12% 소모를 %/min으로 적으면
  // 0.00069%/min → toFixed(2)로 "0.00%/min"이 된다. 이건 "측정 불가"도 "유휴"도 아닌데
  // 화면에는 유휴와 똑같이 보인다 — v0.1.47에서 SAFE UNTIL이 idle을 "수집 중"으로
  // 오표기하던 것과 같은 부류의 거짓 신호다. 창 길이에 맞는 단위를 고른다.

  it('5h 창은 %/min으로 적는다', () => {
    const r = deriveCodexBucketBurn(history([[10, 0.20], [0, 0.30]]), 0.30, min(120), min(300));
    expect(r.rateText).toBe('1.00%/min');
  });

  it('7d 창은 %/hr로 적는다', () => {
    // 10분간 0.01 상승 = 0.001/min = 0.1%/min = 6.0%/hr
    const r = deriveCodexBucketBurn(history([[10, 0.01], [0, 0.02]]), 0.02, min(1440), min(10080));
    expect(r.rateText).toBe('6.00%/hr');
  });

  it('30d 창은 %/day로 적는다 — 0.00%/min으로 눌어붙지 않는다', () => {
    // 30일 버킷, 12% 소모, 잔여 18일 → 경과 12일 기반 추정. %/min이면 0.00이 된다.
    const r = deriveCodexBucketBurn([], 0.12, min(18 * 1440), min(43200));
    expect(r.rateText).toMatch(/\/day$/);
    expect(r.rateText).not.toMatch(/^0\.00/);
  });
});

// ── v0.2.3 ⑪ (proj N% left) 복원 ────────────────────────────────────
//
// v0.2.3 A2가 사이드바 Codex 버킷 행을 buildBurnRow → buildCodexBucketBurnRow로 바꾸면서
// buildBurnRow가 붙이던 "(proj N% left)" 조각이 빠졌다. 의도였다는 기록이 없고, 이 조각은
// 리셋 전 소진 궤도(safeUntil non-null)일 때만 나오므로 **가장 알려줘야 할 때** 정보가 줄었다.
// 게이트·모양은 buildBurnRow와 같아야 한다 — 같은 버킷이 Claude 행과 다른 규칙으로 보이면 안 된다.
describe('deriveCodexBucketBurn projText (v0.2.3 ⑪)', () => {
  it('리셋 전 소진 궤도이면 리셋 시점 잔여 투영(%)을 낸다', () => {
    // 1.00%/min, 0.30에서 리셋까지 120분 → 투영 1.50 → 잔여 0으로 클램프
    const r = deriveCodexBucketBurn(history([[10, 0.20], [0, 0.30]]), 0.30, min(120), min(300));
    expect(r.safeText).not.toBeNull();
    expect(r.projText).toBe('0%');
  });

  it('리셋 전에 소진되지 않으면 projText도 null이다 (buildBurnRow와 같은 게이트)', () => {
    const r = deriveCodexBucketBurn(history([[10, 0.01], [0, 0.02]]), 0.02, min(30), min(300));
    expect(r.safeText).toBeNull();
    expect(r.projText).toBeNull();
  });

  it('소모율 산출 불가면 projText는 null이다', () => {
    const r = deriveCodexBucketBurn([], 0, min(120), min(300));
    expect(r.projText).toBeNull();
  });
});

describe('buildCodexBucketBurnRow proj 조각 (v0.2.3 ⑪)', () => {
  it('소진 궤도일 때 "· safe until HH:MM (proj N% left)" 모양으로 렌더한다', () => {
    const html = buildCodexBucketBurnRow(history([[10, 0.20], [0, 0.30]]), 0.30, min(120), min(300));
    expect(html).toMatch(/· \S.* \d{1,2}:\d{2}.* \(\S+ 0% \S+\)/);
  });

  it('소진 궤도가 아니면 proj 조각이 없다', () => {
    const html = buildCodexBucketBurnRow(history([[10, 0.01], [0, 0.02]]), 0.02, min(30), min(300));
    expect(html).not.toBe('');
    expect(html).not.toMatch(/\(.*%.*\)/);
  });
});
