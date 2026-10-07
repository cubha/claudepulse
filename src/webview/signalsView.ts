// v0.2.6 신호 렌더러 — 사이드바·대시보드가 쓰는 HTML 조각을 순수 함수로 모은다.
// 모듈 최상단에서 document를 만지지 않는다(노드 테스트 가능 — feedback_webview_ui_verification).
// 새 색·새 클래스 없음: .sb-chip·.skill-row·.panel-mcp-row·.cache-kpi-*·.status-marker 문법 재사용(§3#5·#6).
// 설명 문장은 본문이 아니라 title 툴팁으로만 간다(v0.2.4 규약).
import type {
  CacheMissBreakdown, CodexLimitExtras, CompactionInfo, RateLimitBucket, EffortUnattributed, EffortUsage,
  PrCostRow, RateLimitBlockHistory, SubagentStats, ThinkingShare, TurnHookStats,
} from '../types';
import { escapeHtml, fmtCost } from './format';
import { t } from './i18n';
import { statusMarkerHtml } from './statusMarker';
import { fmtTokens } from './webviewShared';

/** 지연 시간 표기 — 0.4s · 31s · 1m 31s · 2h 5m. */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** "3일 전" · "5h ago" — 차단 칩용. */
export function fmtAgo(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return t('ago_m').replace('{n}', String(min));
  const h = Math.floor(min / 60);
  if (h < 48) return t('ago_h').replace('{n}', String(h));
  return t('ago_d').replace('{n}', String(Math.floor(h / 24)));
}

function fmtLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 한도 창 이름 — 아는 것만 짧게, 모르는 값은 원문(미래 창 종류). */
export function rateLimitTypeLabel(type: string): string {
  if (type === 'five_hour') return '5h';
  if (type === 'seven_day') return '7d';
  if (type === 'seven_day_opus') return '7d Opus';
  if (type === 'seven_day_sonnet') return '7d Sonnet';
  return type;
}

const KNOWN_MISS_REASONS = new Set(['previous_message_not_found', 'messages_changed', 'model_changed', 'system_changed', 'unavailable']);

/** 캐시 미스 원인 표시명 — 모르는 원인은 원문(CLI가 새 원인을 추가할 수 있다). */
export function cacheMissReasonLabel(reason: string): string {
  return KNOWN_MISS_REASONS.has(reason) ? t(`cmr_${reason}`) : reason;
}

// ─────────────────────────────── 사이드바 ───────────────────────────────

/** 오늘 thinking 비중 칩(ST3). 필드가 없거나 output이 0이면 그리지 않는다(0%가 아니라 미상). */
export function thinkingChipHtml(th: ThinkingShare | null | undefined): string {
  if (!th || th.outputTokens <= 0) return '';
  const tip = `${t('thinking_tip')}\n${fmtTokens(th.thinkingTokens)} / ${fmtTokens(th.outputTokens)}`;
  return `<span class="sb-chip" title="${escapeHtml(tip)}">${escapeHtml(t('thinking_chip'))} ${(th.share * 100).toFixed(0)}%</span>`;
}

const BLOCK_CHIP_WINDOW_MS = 7 * 86_400_000;

/** 최근 7일 안의 마지막 한도 차단(ST4). 없으면 빈 문자열 — "차단 없음"을 칩으로 늘어놓지 않는다. */
export function blockChipHtml(blocks: RateLimitBlockHistory | null | undefined, nowMs: number): string {
  const last = blocks?.episodes[0];
  if (!last) return '';
  const age = nowMs - new Date(last.firstAt).getTime();
  if (!(age >= 0 && age <= BLOCK_CHIP_WINDOW_MS)) return '';
  const recent = blocks!.episodes.filter(e => nowMs - new Date(e.firstAt).getTime() <= BLOCK_CHIP_WINDOW_MS).length;
  const tip = [
    t('block_tip'),
    `${t('block_recent_count')}: ${recent}`,
    last.overageDisabledReason ? `overage: ${last.overageDisabledReason}` : '',
  ].filter(Boolean).join('\n');
  return `<span class="sb-chip sb-chip--warn" title="${escapeHtml(tip)}">⛔ ${escapeHtml(rateLimitTypeLabel(last.rateLimitType))} ${escapeHtml(t('block_chip'))} · ${escapeHtml(fmtAgo(age))}</span>`;
}

/** 컨텍스트 게이지 보조 칩(ST6) — 게이지가 가리키는 세션에 압축이 있었을 때만. */
export function compactionChipHtml(c: CompactionInfo | null | undefined): string {
  if (!c) return '';
  const trigger = c.last.trigger === 'auto' ? t('compact_auto') : c.last.trigger === 'manual' ? t('compact_manual') : c.last.trigger;
  const tip = `${t('compaction_tip')}\n${trigger} · ${fmtTokens(c.last.preTokens)} → ${fmtTokens(c.last.postTokens)}\n${t('compact_auto')} ${c.autoCount} / ${c.count}`;
  return `<span class="sb-chip" title="${escapeHtml(tip)}">🗜 ${escapeHtml(t('compaction_chip'))} ${c.count}</span>`;
}

/**
 * Codex 크레딧·지출통제·차단 사유(ST9). 의미 있는 값만 행으로 — 판정은 호출측 hasMeaningfulCodexLimits.
 * 차단 사유·지출 한도 도달은 **그 창이 아직 안 풀렸을 때만** 그린다. extras는 마지막 스냅샷 값이라, 차단 뒤
 * Codex를 다시 안 쓰면 리셋 후에도 "차단"이 남는다(VERIFY scope-critic 적발 — 거짓 경보).
 */
export function codexLimitsRowsHtml(x: CodexLimitExtras | null | undefined, buckets: RateLimitBucket[], nowMs: number): string {
  if (!x) return '';
  const windowLive = buckets.some(b => b.resetsAt * 1000 > nowMs);
  const row = (label: string, value: string, tip?: string) => `<div class="sb-section-hdr">
      <span class="sb-section-label">${escapeHtml(label)}</span>
      <span class="sb-section-right"><span class="mono"${tip ? ` title="${escapeHtml(tip)}"` : ''}>${value}</span></span>
    </div>`;
  const rows: string[] = [];
  const c = x.credits;
  if (c && (c.hasCredits || c.unlimited || c.balance !== null)) {
    // balance는 형식 미확인 문자열(PLAN §2-4) — 해석하지 않고 원문을 보인다.
    rows.push(row(t('codex_credits'), c.unlimited ? escapeHtml(t('codex_credits_unlimited')) : escapeHtml(c.balance ?? '—')));
  }
  if (x.individualLimit) {
    const il = x.individualLimit;
    rows.push(row(t('codex_spend_limit'), `${escapeHtml(il.used)} / ${escapeHtml(il.limit)} · ${il.remainingPercent}% ${escapeHtml(t('left'))}`));
  }
  if (x.spendControlReached === true && (!x.individualLimit || x.individualLimit.resetsAt * 1000 > nowMs)) {
    rows.push(row(t('codex_spend_limit'), statusMarkerHtml({ label: t('codex_spend_reached'), tip: t('codex_spend_reached_tip'), tone: 'danger' })));
  }
  if (x.rateLimitReachedType && windowLive) {
    const known = ['rate_limit_reached', 'workspace_owner_credits_depleted', 'workspace_member_credits_depleted',
      'workspace_owner_usage_limit_reached', 'workspace_member_usage_limit_reached'].includes(x.rateLimitReachedType);
    const label = known ? t(`codex_reached_${x.rateLimitReachedType}`) : x.rateLimitReachedType;
    rows.push(row(t('codex_reached_type'), statusMarkerHtml({ label, tip: x.rateLimitReachedType, tone: 'danger' })));
  }
  return rows.join('');
}

// ─────────────────────────────── 대시보드 ───────────────────────────────

/** 캐시 카드 하단 — 미스 원인 분해(ST2, 최근 7일). 미스 0건이면 빈 문자열. */
export function cacheMissHtml(cm: CacheMissBreakdown | null | undefined): string {
  if (!cm || cm.missCount === 0) return '';
  const max = cm.reasons[0]?.count || 1;
  const rows = cm.reasons.map(r => {
    const w = Math.max(2, (r.count / max) * 100);
    const tokens = r.missedTokens === null ? t('cache_miss_tokens_unknown') : `${fmtTokens(r.missedTokens)} ${t('tokens')}`;
    const tip = `${r.reason} · ${r.count} · ${tokens}`;
    const value = r.estCostUsd === null
      ? `<span class="skill-cost mono" title="${escapeHtml(r.missedTokens === null ? t('cache_miss_tokens_unknown_tip') : t('pricing_unknown_note'))}">${r.count}×</span>`
      : `<span class="skill-cost mono">${r.count}× · ≈${fmtCost(r.estCostUsd)}</span>`;
    return `<div class="skill-row${r.missedTokens === null ? ' skill-row-other' : ''}" title="${escapeHtml(tip)}">
      <span class="skill-name">${escapeHtml(cacheMissReasonLabel(r.reason))}</span>
      <span class="skill-bar-wrap"><span class="skill-bar${r.missedTokens === null ? ' skill-bar-other' : ''}" style="width:${w}%"></span></span>
      ${value}
    </div>`;
  }).join('');
  const rate = cm.recordCount > 0 ? cm.missCount / cm.recordCount : 0;
  // 비용을 하나도 못 셌는데(전량 미가격·토큰 미상) 0을 그리면 "추가 비용 없음"으로 읽힌다(v0.1.55 거짓초록,
  // VERIFY scope-critic 적발). 일부라도 셌으면 하한(≥)으로, 하나도 못 셌으면 '가격 미상'으로 낸다.
  const anyUncounted = cm.hasUnknownTokens || cm.hasUnpricedRecords;
  const costLabel = cm.estCostUsd === 0 && anyUncounted
    ? t('pricing_unknown')
    : `${anyUncounted ? '≥' : '≈'}${fmtCost(cm.estCostUsd)}`;
  const tip = `${t('cache_miss_est_tip')}${cm.hasUnknownTokens ? `\n${t('cache_miss_tokens_unknown_tip')}` : ''}${cm.hasUnpricedRecords ? `\n${t('pricing_unknown_note')}` : ''}`;
  return `<div class="panel-mcp-header" id="cache-miss-header">${escapeHtml(t('cache_miss_header'))}
      <span class="panel-chart-readout mono" title="${escapeHtml(tip)}">${cm.missCount}/${cm.recordCount} · ${(rate * 100).toFixed(1)}% · ${costLabel}</span>
    </div>
    <div id="cache-miss-list">${rows}</div>`;
}

/** 한도 차단 이력 목록 행(ST4) — 에피소드 + 서버 오류 요약 행. 둘 다 없으면 빈 배열(섹션 숨김 신호). */
export function blockHistoryRows(b: RateLimitBlockHistory | null | undefined): string[] {
  if (!b) return [];
  const rows = b.episodes.map(e => {
    const tip = `${e.rateLimitType} · ${t('block_retries')} ${e.rejectedCount}${e.overageDisabledReason ? `\noverage: ${e.overageDisabledReason}` : ''}\n${fmtLocalDateTime(e.firstAt)} → ${fmtLocalDateTime(e.lastAt)}`;
    return `<div class="panel-mcp-row" title="${escapeHtml(tip)}">
      <span>${statusMarkerHtml({ label: rateLimitTypeLabel(e.rateLimitType), tip: t('block_tip'), tone: 'danger' })} <span class="mono">${escapeHtml(fmtLocalDateTime(e.firstAt))}</span></span>
      <span class="mono">${e.rejectedCount}×</span>
    </div>`;
  });
  if (b.serverErrors.count > 0) {
    const detail = Object.entries(b.serverErrors.byStatus).map(([s, n]) => `${s}×${n}`).join(' · ');
    rows.push(`<div class="panel-mcp-row" title="${escapeHtml(`${t('server_error_tip')}\n${detail}`)}">
      <span>${statusMarkerHtml({ label: t('server_error_label'), tip: t('server_error_tip'), tone: 'muted' })}${b.serverErrors.lastAt ? ` <span class="mono">${escapeHtml(fmtLocalDateTime(b.serverErrors.lastAt))}</span>` : ''}</span>
      <span class="mono">${b.serverErrors.count}×</span>
    </div>`);
  }
  return rows;
}

/** PR별 비용 행(ST5). 공유 세션이 섞인 PR은 마커 — 행끼리 더하면 중복이다. */
export function prCostRows(rows: PrCostRow[] | null | undefined): string[] {
  return (rows ?? []).map(r => {
    const name = `${r.prRepository}#${r.prNumber}`;
    const shared = r.sharedSessionCount > 0
      ? ` ${statusMarkerHtml({ label: t('pr_shared'), tip: t('pr_shared_tip'), tone: 'warn' })}`
      : '';
    const cost = r.hasUnpricedRecords && r.costUsd === 0
      ? `<span class="branch-cost mono" title="${escapeHtml(t('pricing_unknown_note'))}">${t('pricing_unknown')}</span>`
      : `<span class="branch-cost mono">${fmtCost(r.costUsd)}</span>`;
    return `<div class="branch-row" title="${escapeHtml(`${r.prUrl}\n${t('sessions_label')} ${r.sessionCount} · ${fmtTokens(r.totalTokens)} ${t('tokens')}`)}">
      <span class="branch-name">${escapeHtml(name)}${shared}</span>
      ${cost}
      <span class="branch-tokens mono">${fmtTokens(r.totalTokens)}</span>
      <span class="branch-sessions mono">${r.sessionCount}</span>
      <span class="branch-last mono">${escapeHtml(r.firstLinkedAt.slice(0, 10))}</span>
    </div>`;
  });
}

/** effort별 비용 행(ST7) + 미상 버킷(1급, muted). 둘 다 없으면 빈 배열. */
export function effortRows(list: EffortUsage[] | null | undefined, unattr: EffortUnattributed | null | undefined): string[] {
  const items = list ?? [];
  const hasBucket = !!unattr && (unattr.costUsd > 0 || unattr.totalTokens > 0);
  if (items.length === 0 && !hasBucket) return [];
  const max = Math.max(items[0]?.share || 0, hasBucket ? unattr!.share : 0) || 1;
  const cost = (usd: number, unpriced: boolean) => unpriced && usd === 0
    ? `<span class="skill-cost mono" title="${escapeHtml(t('pricing_unknown_note'))}">${t('pricing_unknown')}</span>`
    : `<span class="skill-cost mono">${fmtCost(usd)}</span>`;
  const rows = items.map(e => `<div class="skill-row" title="${escapeHtml(`${e.effort} · ${(e.share * 100).toFixed(1)}% · ${fmtTokens(e.totalTokens)} ${t('tokens')}`)}">
      <span class="skill-name">${escapeHtml(e.effort)}</span>
      <span class="skill-bar-wrap"><span class="skill-bar" style="width:${Math.max(2, (e.share / max) * 100)}%"></span></span>
      ${cost(e.costUsd, e.hasUnpricedRecords)}
    </div>`);
  if (hasBucket) {
    rows.push(`<div class="skill-row skill-row-other" title="${escapeHtml(`${t('effort_unattributed_tip')}\n${(unattr!.share * 100).toFixed(1)}% · ${fmtTokens(unattr!.totalTokens)} ${t('tokens')}`)}">
      <span class="skill-name">${escapeHtml(t('effort_unattributed'))}</span>
      <span class="skill-bar-wrap"><span class="skill-bar skill-bar-other" style="width:${Math.max(2, (unattr!.share / max) * 100)}%"></span></span>
      ${cost(unattr!.costUsd, unattr!.hasUnpricedRecords)}
    </div>`);
  }
  return rows;
}

/** 턴 지연·훅(ST8). 턴이 0이면 빈 문자열(섹션 숨김 신호). */
export function turnHooksHtml(s: TurnHookStats | null | undefined): string {
  if (!s || s.turnCount === 0) return '';
  const kpi = (label: string, value: string) => `<div class="cache-kpi-item">
      <div class="cache-kpi-label">${escapeHtml(label)}</div>
      <div class="cache-kpi-value mono">${value}</div>
    </div>`;
  let shareMarker = '';
  if (s.hookShare !== null) {
    const pct = s.hookShare * 100;
    shareMarker = statusMarkerHtml({
      label: `${t('hooks_label')} ${pct < 0.1 ? '<0.1' : pct.toFixed(1)}%`,
      tip: `${t('hook_share_tip')}\n${fmtDuration(s.avgHookMsPerTurn ?? 0)} / ${fmtDuration(s.medianMs ?? 0)}`,
      tone: pct >= 15 ? 'danger' : pct >= 5 ? 'warn' : 'ok',
    });
  }
  const kpis = `<div class="cache-kpi-row">
      ${kpi(t('turn_count'), String(s.turnCount))}
      ${kpi(t('turn_median'), `${fmtDuration(s.medianMs ?? 0)}${shareMarker}`)}
      ${kpi('p90', fmtDuration(s.p90Ms ?? 0))}
      ${kpi(t('turn_max'), fmtDuration(s.maxMs ?? 0))}
    </div>`;

  const dayMax = Math.max(...s.daily.map(d => d.medianMs ?? 0)) || 1;
  const days = s.daily.map(d => `<div class="skill-row${d.medianMs === null ? ' skill-row-other' : ''}" title="${escapeHtml(`${d.date} · ${d.count}`)}">
      <span class="skill-name mono">${escapeHtml(d.date.slice(5))}</span>
      <span class="skill-bar-wrap"><span class="skill-bar" style="width:${d.medianMs === null ? 0 : Math.max(2, (d.medianMs / dayMax) * 100)}%"></span></span>
      <span class="skill-cost mono">${d.medianMs === null ? '—' : fmtDuration(d.medianMs)}</span>
    </div>`).join('');

  const hookMax = s.hooks[0]?.totalMs || 1;
  const hooks = s.hooks.map(h => `<div class="skill-row" title="${escapeHtml(`${h.name} · ${h.count}× · ${t('hook_total')} ${fmtDuration(h.totalMs)}`)}">
      <span class="skill-name">${escapeHtml(h.name)}</span>
      <span class="skill-bar-wrap"><span class="skill-bar" style="width:${Math.max(2, (h.totalMs / hookMax) * 100)}%"></span></span>
      <span class="skill-cost mono">${fmtDuration(h.avgMs)}</span>
    </div>`).join('');
  const hookErr = s.hookErrorCount > 0
    ? statusMarkerHtml({ label: `${t('hook_errors')} ${s.hookErrorCount}`, tip: t('hook_errors_tip'), tone: 'warn' })
    : '';

  return `${kpis}
    <div class="panel-mcp-header">${escapeHtml(t('turn_daily_median'))}</div>
    <div id="turn-daily-list">${days}</div>
    ${hooks ? `<div class="panel-mcp-header">${escapeHtml(t('hooks_avg_header'))} ${hookErr}</div><div id="hook-list">${hooks}</div>` : ''}`;
}

/** Codex 추가 패널의 서브에이전트 행(ST11). 서브에이전트가 없으면 빈 문자열. */
export function codexSubagentRowHtml(sub: SubagentStats | null | undefined): string {
  if (!sub || sub.subagentCount === 0) return '';
  const value = sub.subagentHasUnpriced && sub.subagentCostUsd === 0
    ? `${sub.subagentCount} ${escapeHtml(t('agents_label'))} · <span title="${escapeHtml(t('pricing_unknown_note'))}">${t('pricing_unknown')}</span>`
    : `${sub.subagentCount} ${escapeHtml(t('agents_label'))} · ${(sub.subagentShare * 100).toFixed(0)}% · ${fmtCost(sub.subagentCostUsd)}`;
  return `<div class="panel-mcp-row"><span>${escapeHtml(t('subagent_consumption'))}</span><span class="mono">${value}</span></div>`;
}
