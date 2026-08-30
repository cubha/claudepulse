// 사이드바·패널 양쪽이 공유하는 순수 포맷터 + Usage Calendar HTML 빌더 (v0.1.54 ST5 분리).
// DOM에 접근하지 않는다 — main.ts에서 기계적으로 추출.
import type { UnifiedWindow } from '../types';
import { t, getLang } from './i18n';
import { escapeHtml, fmtCost } from './format';
import { buildCalendarCells, heatLevel, monthLabelFlags, type CalendarDay } from './calendarView';
import { calcSafeUntil, calcProjAtReset, deriveBurnState, type PollPoint } from './burnRate';

export const FH_WINDOW_MS = 5 * 60 * 60 * 1000; // 5h
export const SD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7d

export function fmtPct(utilization: number): string {
  return `${(utilization * 100).toFixed(0)}%`;
}

export function fmtReset(ms: number): string {
  if (ms <= 0) return 'now';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function fmtTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export function statusColor(status: UnifiedWindow['status']): string {
  if (status === 'blocked' || status === 'danger') return 'var(--c-danger)';
  if (status === 'allowed_warning') return 'var(--c-warn)';
  return 'var(--c-sonnet)';
}

export function statusLabel(status: UnifiedWindow['status']): string {
  if (status === 'blocked') return t('status_blocked');
  if (status === 'danger') return t('status_danger');
  if (status === 'allowed_warning') return t('status_warning');
  return t('status_ok');
}

export function barFillWidth(utilization: number): string {
  const pct = Math.min(100, Math.max(0, utilization * 100));
  return `width:${pct}%;`;
}


export function fmtPlanTier(subscriptionType: string, rateLimitTier: string): string {
  const m = /(\d+)x/.exec(rateLimitTier);
  const base = subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1);
  return m ? `${base} ${m[1]}x` : base || rateLimitTier;
}

export function buildBurnRow(history: PollPoint[], utilization: number, msUntilReset: number, windowMs: number): string {
  const state = deriveBurnState(history, utilization, msUntilReset, windowMs);
  if (state.rate === null || state.rate <= 0) return '';
  const resetAt = new Date(Date.now() + msUntilReset);
  const safeUntil = calcSafeUntil(utilization, state.rate, resetAt);
  const projRemaining = calcProjAtReset(utilization, state.rate, msUntilReset);
  const rateStr = `${(state.rate * 100).toFixed(2)}%/min${state.isEstimate ? ` (${t('est_label')})` : ''}`;
  const safeStr = safeUntil ? ` · ${t('safe_until')} ${fmtTime(safeUntil)} (${t('proj')} ${fmtPct(projRemaining)} ${t('left')})` : '';
  return `<div class="rate-burn-row">
    <span class="rate-burn-label">${t('burn')} ${rateStr}${safeStr}</span>
  </div>`;
}

// ──────────────────────────────────────────────
// SIDEBAR

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// 모델 문자열 분류 단일 소스 (이름·액센트·색상 3개 함수가 공유)
export type ModelKind = 'fable' | 'opus' | 'sonnet' | 'haiku' | 'other';
export const MODEL_KINDS: Exclude<ModelKind, 'other'>[] = ['fable', 'opus', 'sonnet', 'haiku'];

export function modelKind(model: string): ModelKind {
  return MODEL_KINDS.find(k => model.includes(k)) ?? 'other';
}

export function modelShortName(model: string): string {
  const k = modelKind(model);
  if (k === 'other') return model.split('-').slice(-2).join('-');
  return k.charAt(0).toUpperCase() + k.slice(1);
}

export const CALENDAR_LOCALE: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' };

/** 고정 1년(53주) 뷰 — GitHub 관례와 동일하게 스코프 토글 없음(셀 크기 고정이라 토글 실익 낮음, 사용자 UI 피드백). */
export const CALENDAR_WINDOW_DAYS = 371;
/**
 * 사이드바 축소뷰 — 최근 3개월(90일, v0.1.45). 30일(≈5주)은 12px 셀 그대로 쓰면 사이드바
 * 기본 폭(~300px) 대비 컬럼이 너무 적어 여백이 크게 남았다(실측). 셀을 키우면 세로가 과도하게
 * 커지고 DESIGN-TOKENS.md 셀 스펙(12×12px)까지 개정해야 해서, 대신 윈도우를 넓혀 컬럼 수로
 * 폭을 채우는 쪽을 선택 — 대시보드와 동일한 12px 셀을 그대로 재사용(시각 일관성 유지),
 * 90일이 기본 폭을 거의 채우면서도 가로 스크롤을 유발하지 않는 실측 최적점(60일=부족, 120일=초과).
 */
export const SIDEBAR_CALENDAR_WINDOW_DAYS = 90;

/**
 * Usage Calendar 히트맵 HTML — GitHub 기여도식, --heat-0~4 블루 스케일(브랜드, DESIGN-TOKENS.md).
 * 셀 배열 계산은 calendarView.ts(순수·단위테스트됨)에 위임하고, 여기서는 i18n·DOM 문자열만 조립한다.
 * 대시보드(371일)·사이드바(30일)가 windowDays·showLegend만 다르게 이 함수를 공유한다.
 */
export function buildCalendarHtml(allDays: CalendarDay[], windowDays: number, todayKey: string, showLegend: boolean): string {
  const cells = buildCalendarCells(allDays, windowDays, todayKey);
  const sortedPositiveCosts = cells.filter(c => c.cost > 0).map(c => c.cost).sort((a, b) => a - b);

  const cellsHtml = cells.map(c => {
    const level = heatLevel(c.cost, sortedPositiveCosts);
    const cls = ['heat-cell'];
    if (level > 0) cls.push(`h${level}`);
    if (c.isToday) cls.push('is-today');
    const todayTag = c.isToday ? ` (${t('calendar_today_tag')})` : '';
    const title = `${c.date}${todayTag} — ${fmtCost(c.cost)} · ${fmtTokens(c.tokens)}`;
    return `<div class="${cls.join(' ')}" title="${escapeHtml(title)}"></div>`;
  }).join('');

  // 월 라벨 — 각 주 열의 첫 날짜가 그 달 1~7일이면 로캘 약어 표시(Intl, 신규 i18n 키 불필요)
  const monthFmt = new Intl.DateTimeFormat(CALENDAR_LOCALE[getLang()] ?? undefined, { month: 'short' });
  const labelFlags = monthLabelFlags(cells);
  const weeks = Math.ceil(cells.length / 7);
  const monthLabelsHtml: string[] = [];
  for (let w = 0; w < weeks; w++) {
    const weekFirst = cells[w * 7];
    const d = new Date(`${weekFirst.date}T00:00:00.000Z`);
    monthLabelsHtml.push(`<span>${labelFlags[w] ? escapeHtml(monthFmt.format(d)) : ''}</span>`);
  }

  const legendHtml = showLegend
    ? `<div class="calendar-legend">
      <span>${t('calendar_less')}</span>
      <div class="heat-cell"></div><div class="heat-cell h1"></div><div class="heat-cell h2"></div><div class="heat-cell h3"></div><div class="heat-cell h4"></div>
      <span>${t('calendar_more')}</span>
    </div>`
    : '';

  // .calendar-block = fit-content 래퍼. 그리드가 늘어나지 않으므로 레전드도 카드 우측이 아니라
  // 그리드 우측 끝에 붙어야 한 덩어리로 읽힌다.
  return `
    <div class="calendar-block">
      <div class="calendar-heat-wrap">
        <div class="calendar-weekday-col">
          <span></span><span>${t('calendar_mon')}</span><span></span><span>${t('calendar_wed')}</span><span></span><span>${t('calendar_fri')}</span><span></span>
        </div>
        <div class="calendar-grid-area">
          <div class="calendar-months">${monthLabelsHtml.join('')}</div>
          <div class="calendar-cells">${cellsHtml}</div>
        </div>
      </div>${legendHtml}
    </div>`;
}
