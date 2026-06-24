/**
 * 회고(Cost by Commit) 렌더 — 순수 함수(DOM은 listEl.innerHTML 할당만).
 *
 * v0.1.39: main.ts에서 추출. extension이 보낸 RetroSummary response를 받으면
 * placeholder('데이터 수집 중…')를 커밋 막대로 **무조건 교체**한다.
 * 이 replace 계약을 node 단위테스트로 박제하기 위해 분리했다(retroView.test.ts).
 */
import type { AttributionConfidence, RetroSummary } from '../types';
import { t } from './i18n';
import { escapeHtml, fmtCost } from './format';

function confidenceLabel(c: AttributionConfidence): string {
  return c === 'high' ? t('confidence_high') : c === 'medium' ? t('confidence_medium') : t('confidence_low');
}

function confidenceDot(c: AttributionConfidence): string {
  return c === 'high' ? '●' : c === 'medium' ? '◐' : '○';
}

/**
 * 회고 요약을 listEl에 렌더. retro가 null이거나 커밋·미귀속 모두 0이면 no_retro_data.
 * 그 외에는 미귀속 1급 슬라이스 + 상위 커밋 막대 + disclaimer로 innerHTML을 교체한다.
 */
export function renderRetro(listEl: { innerHTML: string }, retro: RetroSummary | null): void {
  if (!retro || (retro.commits.length === 0 && retro.unattributed.recordCount === 0)) {
    listEl.innerHTML = `<div class="panel-empty">${t('no_retro_data')}</div>`;
    return;
  }

  const total = retro.totalCostUsd > 0 ? retro.totalCostUsd : 1;
  const top = retro.commits.slice(0, 12);
  const maxCost = Math.max(top[0]?.costUsd ?? 0, retro.unattributed.costUsd, 0.000001);

  // 미귀속 버킷 = 1급 슬라이스. 항상 첫 행으로 노출(숨기면 거짓 정밀도 — §4).
  const u = retro.unattributed;
  const uShare = (u.costUsd / total) * 100;
  const unattRow = u.recordCount > 0
    ? `<div class="retro-row retro-unattributed" title="${t('retro_unattributed_tip')}">
        <span class="retro-name">◌ ${t('retro_unattributed')}</span>
        <span class="retro-bar-wrap"><span class="retro-bar retro-bar--unatt" style="width:${Math.max(2, (u.costUsd / maxCost) * 100)}%"></span></span>
        <span class="retro-conf" aria-hidden="true"></span>
        <span class="retro-cost mono">≈${fmtCost(u.costUsd)}</span>
        <span class="retro-share mono">${uShare.toFixed(0)}%</span>
      </div>`
    : '';

  const rows = top.map(c => {
    const share = (c.costUsd / total) * 100;
    const w = Math.max(2, (c.costUsd / maxCost) * 100);
    const sha = c.commit.sha.slice(0, 7);
    return `<div class="retro-row" title="${escapeHtml(sha)} · ${escapeHtml(c.commit.subject)} · ${c.recordCount} ${t('retro_records')}">
      <span class="retro-name"><span class="retro-sha mono">${escapeHtml(sha)}</span> ${escapeHtml(c.commit.subject)}</span>
      <span class="retro-bar-wrap"><span class="retro-bar conf-${c.confidence}" style="width:${w}%"></span></span>
      <span class="retro-conf conf-${c.confidence}" title="${t('retro_confidence')}: ${confidenceLabel(c.confidence)}">${confidenceDot(c.confidence)}</span>
      <span class="retro-cost mono">≈${fmtCost(c.costUsd)}</span>
      <span class="retro-share mono">${share.toFixed(0)}%</span>
    </div>`;
  }).join('');

  listEl.innerHTML = unattRow + rows
    + `<div class="retro-disclaimer">${t('retro_disclaimer')}</div>`;
}
