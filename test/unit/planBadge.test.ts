import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { panelPlanBadgeText } from '../../src/webview/planBadge';

/**
 * v0.2.3 ⑩ — 대시보드 헤더 플랜 배지의 단일 소유자.
 *
 * 로드맵은 "Codex일 때 배지를 비운다"로 적었지만 실측은 달랐다: Codex 배지는 이미 그려지고
 * 있었고, 결함은 **쓰기 지점 4곳이 각자 조건부로만 써서 마지막에 도착한 쪽이 이기는 것**이었다.
 * - updatePanel(Claude)은 provider를 보지 않는다 → Codex 모드로 대시보드를 열면 체인으로 늦게
 *   도착한 GetRateLimit가 Codex 배지를 Claude 티어로 덮는다.
 * - Codex→Claude 전환은 아무도 배지를 다시 쓰지 않는다 → Codex 배지가 다음 폴링까지 잔존.
 * 그래서 "무엇을 보일지"를 이 순수 함수 하나가 정하고, 모든 쓰기 지점은 결과를 무조건 쓴다.
 * 빈 문자열 = 지움.
 */

const claude = { plan: { subscriptionType: 'max', rateLimitTier: 'default_claude_max_5x' } };
const codex = { planType: 'plus' };

describe('panelPlanBadgeText (v0.2.3 ⑩)', () => {
  it('Codex 활성이면 Claude 스냅샷이 있어도 Codex planType을 낸다 (덮어쓰기 결함)', () => {
    expect(panelPlanBadgeText('codex', claude, codex)).toBe('PLUS');
  });

  it('Claude 활성이면 Codex 스냅샷이 있어도 Claude 티어를 낸다 (전환 후 잔존 결함)', () => {
    expect(panelPlanBadgeText('claude', claude, codex)).toBe('Max 5x');
  });

  it('Codex 활성인데 planType이 없으면 빈 문자열 — Claude 배지로 폴백하지 않는다', () => {
    expect(panelPlanBadgeText('codex', claude, { planType: null })).toBe('');
    expect(panelPlanBadgeText('codex', claude, null)).toBe('');
  });

  it('Claude 활성인데 subscriptionType이 없으면 빈 문자열 — 이전 배지를 남기지 않는다', () => {
    expect(panelPlanBadgeText('claude', { plan: undefined }, codex)).toBe('');
    expect(panelPlanBadgeText('claude', null, codex)).toBe('');
  });

  it('Codex planType은 값별 분기 없이 대문자화만 한다 (§8 불변식5 — 사이드바와 동일 규칙)', () => {
    expect(panelPlanBadgeText('codex', null, { planType: 'team_enterprise' })).toBe('TEAM_ENTERPRISE');
  });
});

// 선택자가 옳아도 **쓰기 지점이 선택자를 우회하면** 같은 결함이 돌아온다(v0.1.47 교훈 — 순수함수를
// "호출한다"가 "모든 소비 지점이 그것을 쓴다"를 보장하지 않았다). 배지 DOM을 만지는 곳을 1곳으로 잠근다.
describe('panelView.ts 플랜 배지 쓰기 지점 단일화 (v0.2.3 ⑩)', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/webview/panelView.ts'), 'utf-8');

  it("getElementById('panel-plan-badge')는 renderPanelPlanBadge 안에서만 1회 나온다", () => {
    const hits = src.match(/getElementById\('panel-plan-badge'\)/g) ?? [];
    expect(hits.length).toBe(1);
    const fnStart = src.indexOf('function renderPanelPlanBadge');
    const hitAt = src.indexOf("getElementById('panel-plan-badge')");
    expect(fnStart).toBeGreaterThan(-1);
    expect(hitAt).toBeGreaterThan(fnStart);
    expect(hitAt - fnStart).toBeLessThan(300);
  });

  it('updatePanel·updateCodexBandSection·applyProviderVisibility가 모두 renderPanelPlanBadge를 부른다', () => {
    for (const fn of ['function updatePanel(', 'function updateCodexBandSection(', 'function applyProviderVisibility(']) {
      const start = src.indexOf(fn);
      expect(start, fn).toBeGreaterThan(-1);
      const next = src.indexOf('\nfunction ', start + fn.length);
      const body = src.slice(start, next === -1 ? undefined : next);
      expect(body, fn).toContain('renderPanelPlanBadge()');
    }
  });

  it('PushLang 재빌드 경로가 provider 가시성(배지 포함)을 재적용한다', () => {
    const start = src.indexOf('messenger.onNotification(PushLang');
    const body = src.slice(start, src.indexOf('});', start));
    expect(body).toContain('rehydrateAfterRebuild()');
    const fn = src.slice(src.indexOf('function rehydrateAfterRebuild'), src.indexOf('export function initPanel'));
    expect(fn).toContain('applyProviderVisibility()');
  });

  // 인수검증 V1 — 초기 GetLang pull도 재빌드하는데 재수화가 빠져 있었다. 경로별 손 적기 대신
  // "rebuildPanelDom 호출 수 == 뒤따르는 rehydrateAfterRebuild 수"로 잠근다(정의부 제외).
  it('rebuildPanelDom을 부르는 모든 지점이 곧바로 rehydrateAfterRebuild를 부른다', () => {
    const calls = [...src.matchAll(/\brebuildPanelDom\(messenger\);/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const m of calls) {
      const after = src.slice(m.index! + m[0].length, m.index! + m[0].length + 400);
      expect(after).toContain('rehydrateAfterRebuild()');
    }
  });
});
