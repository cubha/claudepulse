import { describe, it, expect } from 'vitest';
import { pickBurnUnit } from '../../src/webview/burnRate';
import { buildBurnRow, FH_WINDOW_MS, SD_WINDOW_MS } from '../../src/webview/webviewShared';

// v0.2.3 추가분 — Claude 7D 행의 %/min 눌어붙음.
//
// 경위: R3에서 Codex 버킷의 "0.00%/min" 거짓 신호를 pickBurnUnit으로 고쳤는데, **같은 결함이
// Claude의 7D 행에 그대로 남아 있었다**. 마켓 히어로 캡처에서 `WEEKLY USAGE (7D) 26%` 아래가
// `Burn 0.00%/min (est.)`로 찍혀 실증됐다 — `(est.)`가 붙었다는 것은 rate가 0(유휴)이 아니라
// **양수인데 toFixed(2)가 0.00으로 눌렀다**는 뜻이다(buildBurnRow는 rate<=0이면 행 자체를 안 만든다).
//
// 그래서 pickBurnUnit을 두 표면의 공통 조상인 burnRate.ts로 올리고 buildBurnRow도 그것을 쓴다.

describe('pickBurnUnit — 창 길이가 표기 단위를 정한다', () => {
  it('5h 창은 %/min이다', () => {
    expect(pickBurnUnit(FH_WINDOW_MS)).toEqual({ suffix: '%/min', perMinFactor: 1 });
  });

  it('7d 창은 %/hr이다', () => {
    expect(pickBurnUnit(SD_WINDOW_MS)).toEqual({ suffix: '%/hr', perMinFactor: 60 });
  });

  it('30d 창(Codex free 단일 버킷)은 %/day다', () => {
    expect(pickBurnUnit(30 * 24 * 60 * 60 * 1000)).toEqual({ suffix: '%/day', perMinFactor: 60 * 24 });
  });

  it('임계는 창 경계보다 넉넉하다 — 벤더가 정확히 300/10080분을 주지 않아도 같은 단위로 떨어진다', () => {
    // 10081분짜리 7일 창(벤더 오차)이 %/day로 떨어지면 안 된다.
    expect(pickBurnUnit(10081 * 60 * 1000).suffix).toBe('%/hr');
    // 301분짜리 5시간 창도 %/min을 유지한다.
    expect(pickBurnUnit(301 * 60 * 1000).suffix).toBe('%/min');
  });
});

describe('buildBurnRow — Claude 행도 창에 맞는 단위로 쓴다', () => {
  // 히어로 캡처에 찍힌 상황을 그대로 재현한다: 7일 창, 26% 소모, 리셋까지 1일 남음.
  // 히스토리가 없어 경과 추정 경로를 탄다 — 경과 6일(8640분), rate = 0.26/8640 = 3.01e-5 /min.
  //   %/min으로 쓰면 0.003% → "0.00%/min"  (유휴와 구분 불가 = 고치려는 결함)
  //   %/hr로 쓰면  0.1806% → "0.18%/hr"
  const sevenDayRow = () => buildBurnRow([], 0.26, 24 * 60 * 60 * 1000, SD_WINDOW_MS);

  it('7d 행이 0.00으로 눌어붙지 않는다', () => {
    const html = sevenDayRow();
    expect(html).not.toContain('0.00');
    expect(html).toContain('%/hr');
    expect(html).not.toContain('%/min');
  });

  it('7d 행의 수치가 창 길이에 맞게 환산된다', () => {
    expect(sevenDayRow()).toContain('0.18%/hr');
  });

  it('5h 행은 %/min을 유지한다(기존 동작 불변)', () => {
    // 5시간 창, 36% 소모, 1시간 남음 → 경과 4시간(240분) → 0.0015/min → 0.15%/min
    const html = buildBurnRow([], 0.36, 60 * 60 * 1000, FH_WINDOW_MS);
    expect(html).toContain('0.15%/min');
    expect(html).not.toContain('%/hr');
  });

  it('산출 불가(rate 없음)일 때는 행 자체를 만들지 않는다 — 단위 변경이 이 계약을 건드리지 않았다', () => {
    // utilization 0 = no_usage → rate null
    expect(buildBurnRow([], 0, 60 * 60 * 1000, FH_WINDOW_MS)).toBe('');
  });
});
