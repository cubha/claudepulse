import { describe, it, expect } from 'vitest';
import { renderRetro } from '../../src/webview/retroView';
import { t } from '../../src/webview/i18n';
import type { CommitUsage, RetroSummary } from '../../src/types';

/**
 * v0.1.39 — 회고 "데이터 수집 중…" placeholder가 정상 response를 받으면
 * 반드시 커밋 막대로 replace 되는지 직접 검증(사용자 핵심 우려).
 * webview의 updateRetroSection은 응답 시 listEl.innerHTML을 renderRetro로 덮어쓴다.
 * 여기선 그 renderRetro를 placeholder가 든 가짜 element에 호출해 교체를 확정한다.
 */

function fakeEl(initial: string): { innerHTML: string } {
  return { innerHTML: initial };
}

function cu(sha: string, subject: string, costUsd: number): CommitUsage {
  return {
    commit: { sha, committedAt: '2026-06-20T10:00:00Z', branch: 'main', subject, repoRoot: '/r' },
    costUsd,
    totalTokens: 100,
    recordCount: 3,
    sessionIds: ['s1'],
    confidence: 'high',
  };
}

function summary(over: Partial<RetroSummary> = {}): RetroSummary {
  return {
    commits: [cu('abc1234def', 'feat: hello', 1.5)],
    unattributed: { costUsd: 0.5, totalTokens: 50, recordCount: 2, postLastCommitCostUsd: 0.5, noWindowMatchCostUsd: 0 },
    totalCostUsd: 2.0,
    approximate: true,
    generatedAt: '2026-06-22T00:00:00Z',
    ...over,
  };
}

describe('renderRetro — placeholder replace 계약', () => {
  it('정상 response → "수집 중" placeholder가 커밋 막대로 교체된다', () => {
    const el = fakeEl(`<div class="panel-loading">${t('collecting_data')}</div>`);
    renderRetro(el, summary());

    // placeholder가 사라졌다(= replace 됨)
    expect(el.innerHTML).not.toContain('panel-loading');
    expect(el.innerHTML).not.toContain(t('collecting_data'));
    // 실제 커밋 행이 들어왔다
    expect(el.innerHTML).toContain('retro-row');
    expect(el.innerHTML).toContain('abc1234');      // sha 7자
    expect(el.innerHTML).toContain('feat: hello');  // subject
    expect(el.innerHTML).toContain('$1.50');        // 비용
  });

  it('커밋 0 + 미귀속만 있어도 replace 된다(no_retro_data 아님)', () => {
    const el = fakeEl(`<div class="panel-loading">${t('collecting_data')}</div>`);
    renderRetro(el, summary({ commits: [] }));
    expect(el.innerHTML).not.toContain('panel-loading');
    expect(el.innerHTML).toContain('retro-unattributed'); // 미귀속 1급 슬라이스
    expect(el.innerHTML).not.toContain(t('no_retro_data'));
  });

  it('retro=null → no_retro_data로 교체(placeholder 유지 아님)', () => {
    const el = fakeEl(`<div class="panel-loading">${t('collecting_data')}</div>`);
    renderRetro(el, null);
    expect(el.innerHTML).not.toContain('panel-loading');
    expect(el.innerHTML).toContain(t('no_retro_data'));
  });

  it('commits·unattributed 모두 0 → no_retro_data', () => {
    const el = fakeEl('init');
    renderRetro(el, summary({
      commits: [],
      unattributed: { costUsd: 0, totalTokens: 0, recordCount: 0, postLastCommitCostUsd: 0, noWindowMatchCostUsd: 0 },
    }));
    expect(el.innerHTML).toContain(t('no_retro_data'));
  });

  it('subject의 HTML 특수문자는 이스케이프된다(XSS 방지 회귀)', () => {
    const el = fakeEl('');
    renderRetro(el, summary({ commits: [cu('deadbeef00', '<img src=x onerror=alert(1)>', 1.0)] }));
    expect(el.innerHTML).not.toContain('<img src=x');
    expect(el.innerHTML).toContain('&lt;img');
  });
});

describe('renderRetro — v0.2.4 본문 서술 제거', () => {
  it('근사 귀속 안내 문장을 본문에 렌더하지 않는다(카드 헤더 ≈배지 툴팁이 담당)', () => {
    const el = fakeEl('');
    renderRetro(el, summary());
    expect(el.innerHTML).not.toContain(t('retro_disclaimer'));
    expect(el.innerHTML).not.toContain('retro-disclaimer');
  });

  it('user.email 강등 → 본문 문장 없이 경고 마커, 문장은 title 툴팁', () => {
    const el = fakeEl('');
    renderRetro(el, summary({
      commitScopes: [{ requested: 'mine', applied: 'all', authorEmail: null, degraded: true }],
    }));
    expect(el.innerHTML).toContain('status-marker warn');
    const tip = t('retro_scope_degraded');
    // 문장은 title 속성 안에만 있다 — 태그 사이 텍스트 노드로는 없다.
    const textOnly = el.innerHTML.replace(/<[^>]*>/g, '');
    expect(textOnly).not.toContain(tip.slice(0, 20));
    expect(el.innerHTML).toMatch(/title="[^"]*user\.email/);
  });

  it('강등 없는 스코프는 짧은 라벨 한 줄로 남는다', () => {
    const el = fakeEl('');
    renderRetro(el, summary({
      commitScopes: [{ requested: 'mine', applied: 'mine', authorEmail: 'a@b.c', degraded: false }],
    }));
    expect(el.innerHTML).toContain(`${t('scope_label')}: ${t('retro_scope_mine')}`);
  });
});
