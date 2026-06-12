// Webview 진입점.
// data-mode={sidebar|panel} 속성으로 두 컨텍스트 분기.
import { Chart, registerables } from 'chart.js';
import { Messenger } from 'vscode-messenger-webview';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import { GetLang, GetPollHistory, GetRateLimit, GetUsageSummary, PushLang, PushPollerError, PushRateLimit, PushUsageSummary, RequestLogin, RequestOpenBillingSettings, RequestOpenDashboard, RequestRefresh, RequestSetLang } from '../messaging/contracts';
import type { DailyUsage, PollerError, RateLimitSnapshot, SessionSummary, UnifiedWindow, UsageSummary } from '../types';
import { getLang, setLang, t } from './i18n';

Chart.register(...registerables);


// esbuild가 vscode-messenger-webview 내부의 acquireVsCodeApi를 빈 모듈로 번들링하는 문제 우회.
// 글로벌에서 직접 호출해 캐싱 후 Messenger 생성자에 전달한다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _vsApi: unknown = typeof (globalThis as any).acquireVsCodeApi === 'function'
  ? (globalThis as any).acquireVsCodeApi()
  : undefined;

const mode = (document.body.dataset.mode ?? 'panel') as 'sidebar' | 'panel';
const root = document.getElementById('root');

try {
  if (mode === 'sidebar') {
    initSidebar();
  } else {
    initPanel();
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[Claude Code Gauge] webview init failed:', err);
  if (root) {
    root.innerHTML = `<div style="padding:12px;color:#f48771;font-size:12px;font-family:monospace;">
      Claude Code Gauge webview error:<br>${msg}<br><br>
      Open DevTools (Help → Toggle Developer Tools) for details.
    </div>`;
  }
}

// ──────────────────────────────────────────────
// 공통 유틸
// ──────────────────────────────────────────────

type PollPoint = { t: Date; v: number };

function fmtPct(utilization: number): string {
  return `${(utilization * 100).toFixed(0)}%`;
}

function fmtReset(ms: number): string {
  if (ms <= 0) return 'now';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function fmtTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function statusColor(status: UnifiedWindow['status']): string {
  if (status === 'blocked' || status === 'danger') return 'var(--c-danger)';
  if (status === 'allowed_warning') return 'var(--c-warn)';
  return 'var(--c-sonnet)';
}

function statusLabel(status: UnifiedWindow['status']): string {
  if (status === 'blocked') return t('status_blocked');
  if (status === 'danger') return t('status_danger');
  if (status === 'allowed_warning') return t('status_warning');
  return t('status_ok');
}

function barFillWidth(utilization: number): string {
  const pct = Math.min(100, Math.max(0, utilization * 100));
  return `width:${pct}%;`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function calcBurnRate(history: PollPoint[]): number | null {
  if (history.length < 2) return null;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const deltaV = last.v - prev.v;
  const deltaT = (last.t.getTime() - prev.t.getTime()) / 60000;
  if (deltaT <= 0) return null;
  return deltaV / deltaT; // %/min (양수 = 소비 중)
}

/** 히스토리 1개일 때 세션 경과 시간 기반 추정 번 레이트 */
function calcBurnRateEstimate(utilization: number, msUntilReset: number, windowMs: number): number | null {
  const elapsed = windowMs - msUntilReset;
  const elapsedMin = elapsed / 60000;
  if (elapsedMin < 1) return null;
  return utilization / elapsedMin; // %/min 추정
}

function calcSafeUntil(
  utilization: number,
  burnRatePerMin: number,
  resetAt: Date
): Date | null {
  if (burnRatePerMin <= 0) return null;
  const remaining = 1 - utilization;
  const minsLeft = remaining / burnRatePerMin;
  const safeUntil = new Date(Date.now() + minsLeft * 60000);
  if (safeUntil > resetAt) return null;
  return safeUntil;
}

function calcProjAtReset(
  utilization: number,
  burnRatePerMin: number,
  msUntilReset: number
): number {
  const minsUntilReset = msUntilReset / 60000;
  const projected = utilization + burnRatePerMin * minsUntilReset;
  return Math.min(1, Math.max(0, 1 - projected));
}

function fmtPlanTier(subscriptionType: string, rateLimitTier: string): string {
  const m = /(\d+)x/.exec(rateLimitTier);
  const base = subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1);
  return m ? `${base} ${m[1]}x` : base || rateLimitTier;
}

function buildBurnRow(history: PollPoint[], utilization: number, msUntilReset: number): string {
  const rate = calcBurnRate(history);
  if (rate === null || rate <= 0) return '';
  const resetAt = new Date(Date.now() + msUntilReset);
  const safeUntil = calcSafeUntil(utilization, rate, resetAt);
  const projRemaining = calcProjAtReset(utilization, rate, msUntilReset);
  const rateStr = `${(rate * 100).toFixed(2)}%/min`;
  const safeStr = safeUntil ? ` · ${t('safe_until')} ${fmtTime(safeUntil)} (${t('proj')} ${fmtPct(projRemaining)} ${t('left')})` : '';
  return `<div class="rate-burn-row">
    <span class="rate-burn-label">${t('burn')} ${rateStr}${safeStr}</span>
  </div>`;
}

// ──────────────────────────────────────────────
// SIDEBAR
// ──────────────────────────────────────────────

function initSidebar(): void {
  if (!root) return;

  // acquireVsCodeApi가 없으면 non-webview 환경 — 명확한 에러 표시
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (globalThis as any).acquireVsCodeApi === 'undefined' && _vsApi === undefined) {
    root.innerHTML = `<div style="padding:12px;color:#f48771;font-size:12px;">
      acquireVsCodeApi not available.<br>This view must run inside VS Code.
    </div>`;
    return;
  }

  // messenger 초기화 전에 먼저 상태 표시 — 초기화 실패해도 "Loading..." 안 남도록
  root.innerHTML = `<div class="sb-layout"><div class="sb-loading">Connecting...</div></div>`;

  let messenger: InstanceType<typeof Messenger>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messenger = new Messenger(_vsApi as any);
  } catch (err) {
    root.innerHTML = `<div class="sb-layout"><div class="sb-error-card card">
      <div class="sb-error-icon">&#9888;</div>
      <div class="sb-error-msg">Messenger init failed</div>
      <div class="sb-error-sub">${err instanceof Error ? err.message : String(err)}</div>
    </div></div>`;
    return;
  }

  const MAX_SB_HISTORY = 288;
  const sbFhHistory: PollPoint[] = [];
  const sbSdHistory: PollPoint[] = [];
  let lastError: PollerError | null = null;
  let lastSnapshot: RateLimitSnapshot | null = null;
  let lastUsage: UsageSummary | null = null;

  function recordSbHistory(snapshot: RateLimitSnapshot): void {
    const t = new Date(snapshot.generatedAt);
    sbFhHistory.push({ t, v: snapshot.fiveHour.utilization });
    sbSdHistory.push({ t, v: snapshot.sevenDay.utilization });
    if (sbFhHistory.length > MAX_SB_HISTORY) sbFhHistory.shift();
    if (sbSdHistory.length > MAX_SB_HISTORY) sbSdHistory.shift();
  }

  messenger.onNotification(PushRateLimit, (snapshot) => {
    lastError = null;
    lastSnapshot = snapshot;
    recordSbHistory(snapshot);
    renderSidebar(snapshot, null);
  });

  messenger.onNotification(PushPollerError, (error) => {
    lastError = error;
    renderSidebar(null, error);
  });

  messenger.onNotification(PushUsageSummary, (usage) => {
    lastUsage = usage;
    renderSidebar(lastSnapshot, lastError);
  });

  try {
    messenger.start();
  } catch (err) {
    root.innerHTML = `<div class="sb-layout"><div class="sb-error-card card">
      <div class="sb-error-icon">&#9888;</div>
      <div class="sb-error-msg">Messenger start failed</div>
      <div class="sb-error-sub">${err instanceof Error ? err.message : String(err)}</div>
    </div></div>`;
    return;
  }

  // 초기 데이터 병렬 요청
  void messenger.sendRequest(GetUsageSummary, HOST_EXTENSION, undefined)
    .then((usage) => { if (usage) lastUsage = usage; })
    .catch(() => undefined);

  messenger.sendRequest(GetRateLimit, HOST_EXTENSION, undefined)
    .then((snapshot) => {
      lastSnapshot = snapshot;
      recordSbHistory(snapshot);
      renderSidebar(snapshot, null);
    })
    .catch(() => renderSidebar(null, lastError));

  function renderSidebar(snapshot: RateLimitSnapshot | null, error: PollerError | null): void {
    root!.innerHTML = buildSidebarHtml(snapshot, error, sbFhHistory, sbSdHistory, lastUsage);
    // JS로 진행바 width 설정 (innerHTML 내 inline style은 CSP 안전망으로 차단될 수 있음)
    if (snapshot) {
      const fhBar = root!.querySelector<HTMLElement>('#sb-fh-bar');
      const sdBar = root!.querySelector<HTMLElement>('#sb-sd-bar');
      const ovBar = root!.querySelector<HTMLElement>('#sb-ov-bar');
      if (fhBar) fhBar.style.width = `${Math.min(100, snapshot.fiveHour.utilization * 100)}%`;
      if (sdBar) sdBar.style.width = `${Math.min(100, snapshot.sevenDay.utilization * 100)}%`;
      if (ovBar && snapshot.overage) {
        ovBar.style.width = `${Math.min(100, snapshot.overage.utilization * 100)}%`;
      }
    }
    root!.querySelectorAll<HTMLButtonElement>('.js-refresh').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestRefresh, HOST_EXTENSION));
    });
    root!.querySelectorAll<HTMLButtonElement>('.js-login').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestLogin, HOST_EXTENSION));
    });
    root!.querySelectorAll<HTMLSelectElement>('.js-lang-select').forEach(sel => {
      sel.addEventListener('change', () => {
        setLang(sel.value as Parameters<typeof setLang>[0]);
        messenger.sendNotification(RequestSetLang, HOST_EXTENSION, sel.value);
        renderSidebar(lastSnapshot, lastError);
      });
    });
    root!.querySelectorAll<HTMLButtonElement>('.js-open-dashboard').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestOpenDashboard, HOST_EXTENSION));
    });
    root!.querySelectorAll<HTMLButtonElement>('.js-open-billing').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestOpenBillingSettings, HOST_EXTENSION));
    });
  }
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function modelShortName(model: string): string {
  if (model.includes('fable')) return 'Fable';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model.split('-').slice(-2).join('-');
}

function modelAccentClass(model: string): string {
  if (model.includes('fable')) return 'fable';
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  return 'slate';
}

function buildUsageRowHtml(usage: UsageSummary | null): string {
  if (!usage) return '';
  const { today, modelBreakdown, cacheStats, todayToolCounts, activeBranch, branchBreakdown } = usage;
  if (today.totalTokens === 0 && today.costUsd === 0) {
    return `<div class="sb-usage-row">${t('no_usage_today')}</div>`;
  }

  const topModel = modelBreakdown[0];
  const modelChip = topModel
    ? `<span class="sb-chip sb-chip--model ${modelAccentClass(topModel.model)}">${escapeHtml(modelShortName(topModel.model))}</span>`
    : '';

  const cacheChip = cacheStats.hitRate > 0
    ? `<span class="sb-chip sb-chip--cache" title="캐시 절약 ${fmtCost(cacheStats.savedUsd)}">⚡ ${(cacheStats.hitRate * 100).toFixed(0)}%</span>`
    : '';

  // 브랜치 칩: 활성 브랜치 + 해당 브랜치 누적 비용
  let branchChip = '';
  if (activeBranch) {
    const branchData = branchBreakdown.find(b => b.branch === activeBranch);
    const branchCost = branchData ? ` · ${fmtCost(branchData.costUsd)}` : '';
    branchChip = `<span class="sb-chip sb-chip--branch" title="${t('branch_cost')}">`
      + `⎇ ${escapeHtml(activeBranch)}${branchCost}</span>`;
  }

  // 도구 칩 행: 오늘 사용된 도구만 표시
  const toolChips: string[] = [];
  if (todayToolCounts) {
    if (todayToolCounts.edit > 0) {
      toolChips.push(`<span class="sb-chip sb-chip--tool tool-edit" title="Edit/MultiEdit">Edit ${todayToolCounts.edit}</span>`);
    }
    if (todayToolCounts.write > 0) {
      toolChips.push(`<span class="sb-chip sb-chip--tool tool-write" title="Write">Write ${todayToolCounts.write}</span>`);
    }
    if (todayToolCounts.bash > 0) {
      toolChips.push(`<span class="sb-chip sb-chip--tool tool-bash" title="Bash">Bash ${todayToolCounts.bash}</span>`);
    }
    if (todayToolCounts.read > 0) {
      toolChips.push(`<span class="sb-chip sb-chip--tool" title="Read">Read ${todayToolCounts.read}</span>`);
    }
    if (todayToolCounts.grep > 0) {
      toolChips.push(`<span class="sb-chip sb-chip--tool" title="Grep/Glob">Grep ${todayToolCounts.grep}</span>`);
    }
    if (todayToolCounts.webSearch > 0) {
      toolChips.push(`<span class="sb-chip sb-chip--tool tool-search" title="WebSearch">🔍 ${todayToolCounts.webSearch}</span>`);
    }
    if (todayToolCounts.webFetch > 0) {
      toolChips.push(`<span class="sb-chip sb-chip--tool" title="WebFetch">🌐 ${todayToolCounts.webFetch}</span>`);
    }
    if (todayToolCounts.mcp > 0) {
      toolChips.push(`<span class="sb-chip sb-chip--tool" title="MCP 도구">MCP ${todayToolCounts.mcp}</span>`);
    }
  }
  const toolRow = toolChips.length > 0
    ? `<div class="sb-chip-row sb-tool-row">${toolChips.join('')}</div>`
    : '';

  // 이번달 비용 칩
  let monthlyChip = '';
  const histDays = usage.historicalDays ?? [];
  if (histDays.length > 0) {
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7);
    const thisMonthDays = histDays.filter(d => d.date.startsWith(monthPrefix));
    const thisMonthCost = thisMonthDays.reduce((sum, d) => sum + d.costUsd, 0);
    if (thisMonthCost >= 0.01) {
      const dayOfMonth = now.getUTCDate();
      const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
      const projectedCost = dayOfMonth > 0 ? (thisMonthCost / dayOfMonth) * daysInMonth : 0;
      monthlyChip = `<div class="sb-chip-row sb-monthly-row">
        <span class="sb-chip sb-chip--monthly" title="${t('this_month')} ${fmtCost(thisMonthCost)} / ${t('projected')} ${fmtCost(projectedCost)}">
          ◑ ${t('this_month')} ${fmtCost(thisMonthCost)} / ≈${fmtCost(projectedCost)}
        </span>
      </div>`;
    }
  }

  return `<div class="sb-usage-row">
    <span class="sb-usage-icon">◎</span>
    <span class="sb-usage-tokens">${fmtTokens(today.totalTokens)} ${t('tokens')}</span>
    <span class="sb-usage-sep">·</span>
    <span class="sb-usage-cost mono">${fmtCost(today.costUsd)}</span>
  </div>
  ${(modelChip || cacheChip) ? `<div class="sb-chip-row">${modelChip}${cacheChip}</div>` : ''}
  ${toolRow}
  ${branchChip ? `<div class="sb-chip-row sb-branch-row">${branchChip}</div>` : ''}
  ${monthlyChip}`;
}

function buildLangSelect(currentLang: string): string {
  const langs = [
    { code: 'ko', label: '한국어' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'zh', label: '中文' },
  ];
  const options = langs.map(l =>
    `<option value="${l.code}"${currentLang === l.code ? ' selected' : ''}>${l.label}</option>`
  ).join('');
  return `<select class="lang-select js-lang-select" aria-label="Language">${options}</select>`;
}

function buildSidebarHtml(
  snapshot: RateLimitSnapshot | null,
  error: PollerError | null,
  fhHist: PollPoint[],
  sdHist: PollPoint[],
  usage: UsageSummary | null
): string {
  if (!snapshot) {
    const needsLogin = error === 'credentials_missing' || error === 'token_expired';
    const icon = needsLogin ? '🔑' : '⚠';
    const title = error === 'credentials_missing' ? t('login_required')
      : error === 'token_expired' ? t('session_expired')
      : error === 'network_error' ? t('network_error')
      : t('connecting');
    const sub = error === 'credentials_missing'
      ? t('login_sub_missing')
      : error === 'token_expired'
      ? t('login_sub_expired')
      : error === 'network_error'
      ? t('login_sub_network')
      : t('connecting_sub');
    const lang = getLang();

    return `
      <div class="sb-layout">
        <div class="sb-header">
          ${buildLangSelect(lang)}
          <div class="sb-header-spacer"></div>
          <button class="sb-icon-btn js-refresh" title="Refresh">↻</button>
        </div>
        ${buildUsageRowHtml(usage)}
        <div class="sb-error-card card">
          <div class="sb-error-icon">${icon}</div>
          <div class="sb-error-msg">${title}</div>
          <div class="sb-error-sub">${sub}</div>
          ${needsLogin
            ? `<button class="login-btn js-login">${t('login_with_claude')}</button>
               <div class="login-hint">${t('login_hint')}</div>`
            : `<button class="btn-ghost js-refresh" style="margin-top:8px;">${t('retry')}</button>`
          }
        </div>
      </div>`;
  }

  const fh = snapshot.fiveHour;
  const sd = snapshot.sevenDay;
  const overall = snapshot.overallStatus;
  const timestamp = fmtTime(new Date(snapshot.generatedAt));

  const fhBurnRow = buildBurnRow(fhHist, fh.utilization, fh.msUntilReset);
  const sdBurnRow = buildBurnRow(sdHist, sd.utilization, sd.msUntilReset);

  // 병목 윈도우 카드 하이라이트
  const isFhBottleneck = snapshot.representativeClaim === 'five_hour';
  const isSdBottleneck = snapshot.representativeClaim === 'seven_day';

  // Plan 배지
  const planBadge = snapshot.plan?.subscriptionType
    ? `<span class="plan-badge">${escapeHtml(fmtPlanTier(snapshot.plan.subscriptionType, snapshot.plan.rateLimitTier))}</span>`
    : '';

  // Fallback 배너
  const fallbackBanner = (snapshot.fallback?.available === 'unavailable')
    ? `<div class="fallback-banner">⚠ Fallback: ${snapshot.fallback.percentage !== undefined ? `${Math.round(snapshot.fallback.percentage * 100)}% speed` : 'throttled'}</div>`
    : '';

  // 7d 임계값 배지
  const thresholdBadge = snapshot.sevenDaySurpassedThreshold !== undefined
    ? `<span class="threshold-badge">>${Math.round(snapshot.sevenDaySurpassedThreshold * 100)}%</span>`
    : '';

  // Overage 섹션
  const overageSection = snapshot.overage
    ? (() => {
        const ov = snapshot.overage!;
        const ovPct = fmtPct(ov.utilization);
        const ovColor = ov.status === 'rejected' ? 'var(--c-danger)' : 'var(--c-warn)';
        const ovDataStatus = ov.status === 'rejected' ? 'blocked' : 'allowed';
        return `<div class="sb-overage-wrap">
          <div class="sb-section-hdr">
            <span class="sb-section-dot" style="background:${ovColor};"></span>
            <span class="sb-section-label">${t('overage')}</span>
            <span class="sb-section-right">
              <span class="mono" style="color:${ovColor};">${ovPct}</span>
              <span class="sb-section-sep">·</span>
              <span class="overage-status-chip ${ov.status}">${ov.status === 'allowed' ? t('overage_active') : t('overage_blocked')}</span>
            </span>
          </div>
          <div class="sb-rate-card">
            <div class="rate-bar">
              <div class="rate-bar-fill" id="sb-ov-bar" data-status="${ovDataStatus}"></div>
            </div>
            <button class="overage-billing-link js-open-billing">${t('billing_settings')}</button>
          </div>
        </div>`;
      })()
    : '';

  const lang = getLang();

  return `
    <div class="sb-layout">
      <!-- 헤더 -->
      <div class="sb-header">
        ${planBadge}
        <span class="status-badge ${overall}">${statusLabel(overall)}</span>
        ${buildLangSelect(lang)}
        <div class="sb-header-spacer"></div>
        <span class="sb-gen-time mono">${timestamp}</span>
        <button class="sb-icon-btn js-refresh" aria-label="Refresh" title="Refresh">↻</button>
      </div>

      ${buildUsageRowHtml(usage)}
      ${fallbackBanner}

      <!-- 5h 세션 섹션 -->
      <div class="sb-section-hdr">
        <span class="sb-section-dot" style="background:${statusColor(fh.status)};"></span>
        <span class="sb-section-label">${t('session_5h')}</span>
        <span class="sb-section-right">
          <span class="mono" style="color:${statusColor(fh.status)};">${fmtPct(fh.utilization)}</span>
          <span class="sb-section-sep">·</span>
          <span class="mono" style="color:${statusColor(fh.status)};">${fmtPct(1 - fh.utilization)} ${t('left')}</span>
        </span>
      </div>
      <div class="sb-rate-card${isFhBottleneck ? ' is-bottleneck' : ''}">
        <div class="rate-bar">
          <div class="rate-bar-fill" id="sb-fh-bar" data-status="${fh.status}"></div>
        </div>
        <div class="rate-meta-row">
          <span class="rate-reset-label">${t('resets_in')} <span class="mono">${fmtReset(fh.msUntilReset)}</span></span>
        </div>
        ${fhBurnRow}
      </div>

      <!-- 7d 주간 섹션 -->
      <div class="sb-section-hdr">
        <span class="sb-section-dot" style="background:${statusColor(sd.status)};"></span>
        <span class="sb-section-label">${t('weekly_7d')}${thresholdBadge}</span>
        <span class="sb-section-right">
          <span class="mono" style="color:${statusColor(sd.status)};">${fmtPct(sd.utilization)}</span>
          <span class="sb-section-sep">·</span>
          <span class="mono" style="color:${statusColor(sd.status)};">${fmtPct(1 - sd.utilization)} ${t('left')}</span>
        </span>
      </div>
      <div class="sb-rate-card${isSdBottleneck ? ' is-bottleneck' : ''}">
        <div class="rate-bar">
          <div class="rate-bar-fill" id="sb-sd-bar" data-status="${sd.status}"></div>
        </div>
        <div class="rate-meta-row">
          <span class="rate-reset-label">${t('resets_in')} <span class="mono">${fmtReset(sd.msUntilReset)}</span></span>
        </div>
        ${sdBurnRow}
      </div>

      ${overageSection}
      <div class="sb-spacer"></div>
      <div class="sb-dashboard-wrap">
        <button class="sb-dashboard-btn js-open-dashboard">⚡ ${t('open_dashboard')}</button>
      </div>

    </div>`;
}

// ──────────────────────────────────────────────
// PANEL
// ──────────────────────────────────────────────

// 폴링 이력 (메모리 내, 최대 288포인트 = 5분 × 288 = 24h)
const MAX_HISTORY = 288;
const fhHistory: PollPoint[] = [];
const sdHistory: PollPoint[] = [];

let trendChart: Chart | null = null;
let dailyChart: Chart | null = null;
let modelChart: Chart | null = null;
let toolChart: Chart | null = null;
let longTermChart: Chart | null = null;
let monthlyChart: Chart | null = null;
let chartScopeMin = 120; // 기본 2h
let longTermScopeDays = 30;
let panelUsage: UsageSummary | null = null;
let lastPanelSnapshot: RateLimitSnapshot | null = null;

function destroyCharts(): void {
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  if (dailyChart) { dailyChart.destroy(); dailyChart = null; }
  if (modelChart) { modelChart.destroy(); modelChart = null; }
  if (toolChart) { toolChart.destroy(); toolChart = null; }
  if (longTermChart) { longTermChart.destroy(); longTermChart = null; }
  if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
}

function wirePanelButtons(messenger: InstanceType<typeof Messenger>): void {
  document.querySelectorAll<HTMLButtonElement>('.js-refresh').forEach(btn => {
    btn.addEventListener('click', () => messenger.sendNotification(RequestRefresh, HOST_EXTENSION));
  });
  document.querySelectorAll<HTMLButtonElement>('.scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chartScopeMin = Number(btn.dataset.scope) || 120;
      document.querySelectorAll('.scope-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateTrendChart();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('.lt-scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      longTermScopeDays = Number(btn.dataset.scope) || 30;
      document.querySelectorAll('.lt-scope-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateLongTermSection();
    });
  });
}

function rebuildPanelDom(messenger: InstanceType<typeof Messenger>): void {
  destroyCharts();
  if (root) root.innerHTML = buildPanelShell();
  wirePanelButtons(messenger);
}

function initPanel(): void {
  if (!root) return;
  root.innerHTML = buildPanelShell();

  let messenger: InstanceType<typeof Messenger>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messenger = new Messenger(_vsApi as any);
  } catch (err) {
    const el = document.getElementById('panel-status');
    if (el) el.innerHTML = `<span style="color:#f48771">Messenger init failed: ${err instanceof Error ? err.message : String(err)}</span>`;
    return;
  }

  messenger.onNotification(PushRateLimit, (snapshot) => {
    lastPanelSnapshot = snapshot;
    recordHistory(snapshot);
    updatePanel(snapshot);
  });

  messenger.onNotification(PushUsageSummary, (usage) => {
    panelUsage = usage;
    updateUsageSection();
  });

  messenger.onNotification(PushLang, (lang) => {
    setLang(lang as Parameters<typeof setLang>[0]);
    rebuildPanelDom(messenger);
    if (lastPanelSnapshot) updatePanel(lastPanelSnapshot);
    if (panelUsage) updateUsageSection();
  });

  try {
    messenger.start();
  } catch (err) {
    const el = document.getElementById('panel-status');
    if (el) el.innerHTML = `<span style="color:#f48771">Messenger start failed: ${err instanceof Error ? err.message : String(err)}</span>`;
    return;
  }

  // 초기 언어 동기화: extension 저장값 우선
  void messenger.sendRequest(GetLang, HOST_EXTENSION, undefined)
    .then((lang) => {
      if (lang && lang !== 'auto') {
        setLang(lang as Parameters<typeof setLang>[0]);
        rebuildPanelDom(messenger);
      }
    })
    .catch(() => undefined);

  void messenger.sendRequest(GetUsageSummary, HOST_EXTENSION, undefined)
    .then((usage) => {
      if (usage) { panelUsage = usage; updateUsageSection(); }
    })
    .catch(() => undefined);

  void messenger.sendRequest(GetPollHistory, HOST_EXTENSION, undefined)
    .then((history) => {
      history.forEach(p => {
        fhHistory.push({ t: new Date(p.t), v: p.fh });
        sdHistory.push({ t: new Date(p.t), v: p.sd });
      });
      if (fhHistory.length > MAX_HISTORY) fhHistory.splice(0, fhHistory.length - MAX_HISTORY);
      if (sdHistory.length > MAX_HISTORY) sdHistory.splice(0, sdHistory.length - MAX_HISTORY);
      return messenger.sendRequest(GetRateLimit, HOST_EXTENSION, undefined);
    })
    .then((snapshot) => {
      lastPanelSnapshot = snapshot;
      recordHistory(snapshot);
      updatePanel(snapshot);
    })
    .catch(() => {
      const el = document.getElementById('panel-status');
      if (el) el.innerHTML = `<span style="color:#8a8a8a;font-size:12px;">${t('waiting_poll')}</span>`;
    });

  wirePanelButtons(messenger);
}

function recordHistory(snapshot: RateLimitSnapshot): void {
  const t = new Date(snapshot.generatedAt);
  fhHistory.push({ t, v: snapshot.fiveHour.utilization });
  sdHistory.push({ t, v: snapshot.sevenDay.utilization });
  if (fhHistory.length > MAX_HISTORY) fhHistory.shift();
  if (sdHistory.length > MAX_HISTORY) sdHistory.shift();
}

function buildPanelShell(): string {
  return `
    <div class="panel-root">
      <div class="panel-header">
        <span class="panel-title">Claude Code Gauge</span>
        <span id="panel-plan-badge"></span>
        <span class="status-badge" id="panel-status"></span>
        <div class="panel-header-spacer"></div>
        <button class="sb-icon-btn js-refresh" title="Refresh">↻</button>
      </div>
      <div id="panel-fallback-banner"></div>

      <!-- 4-카드 메트릭 그리드 -->
      <div class="panel-metric-grid">
        <div class="card panel-metric-card" id="panel-fh-card">
          <div class="panel-metric-label">${t('session_5h')}</div>
          <div class="panel-metric-value" id="fh-remaining">—</div>
          <div class="panel-metric-bar">
            <div class="rate-bar">
              <div class="rate-bar-fill" id="fh-bar-fill"></div>
            </div>
          </div>
          <div class="panel-metric-sub" id="fh-reset">—</div>
        </div>
        <div class="card panel-metric-card" id="panel-sd-card">
          <div class="panel-metric-label">${t('weekly_7d')}</div>
          <div class="panel-metric-value" id="sd-remaining">—</div>
          <div class="panel-metric-bar">
            <div class="rate-bar">
              <div class="rate-bar-fill" id="sd-bar-fill"></div>
            </div>
          </div>
          <div class="panel-metric-sub" id="sd-reset">—</div>
        </div>
        <div class="card panel-metric-card">
          <div class="panel-metric-label">${t('burn_rate')}</div>
          <div class="panel-metric-value" id="burn-rate-val">—</div>
          <div class="panel-metric-sub" id="burn-rate-hr">${t('collecting_data')}</div>
        </div>
        <div class="card panel-metric-card">
          <div class="panel-metric-label">${t('safe_until_label')}</div>
          <div class="panel-metric-value" id="safe-until-val">—</div>
          <div class="panel-metric-sub" id="safe-until-proj">${t('collecting_data')}</div>
        </div>
      </div>

      <!-- 추세 차트 -->
      <div class="card panel-trend-card">
        <div class="panel-chart-header">${t('util_trend')}</div>
        <div class="chart-scope-row">
          <span class="chart-scope-label">${t('scope_label')}:</span>
          <button class="scope-btn" data-scope="30">30m</button>
          <button class="scope-btn active" data-scope="120">2h</button>
          <button class="scope-btn" data-scope="1440">24h</button>
        </div>
        <div class="panel-trend-wrap">
          <canvas id="chart-trend"></canvas>
          <div class="panel-empty" id="trend-empty" style="display:none">${t('collecting_data')}</div>
        </div>
      </div>

      <!-- 7일 사용량 바 차트 -->
      <div class="card panel-trend-card" id="panel-daily-card">
        <div class="panel-chart-header">${t('daily_cost')}</div>
        <div class="panel-trend-wrap">
          <canvas id="chart-daily" style="display:none"></canvas>
          <div class="panel-loading" id="daily-empty">${t('collecting_data')}</div>
        </div>
      </div>

      <!-- 모델별 사용량 -->
      <div class="card panel-trend-card" id="panel-model-card">
        <div class="panel-chart-header">${t('model_breakdown')}</div>
        <div class="panel-model-body" id="panel-model-body">
          <div class="panel-loading">${t('collecting_data')}</div>
        </div>
      </div>

      <!-- 캐시 효율 -->
      <div class="card panel-cache-card" id="panel-cache-card">
        <div class="panel-chart-header">${t('cache_efficiency')}</div>
        <div class="panel-cache-body" id="panel-cache-body">
          <div class="panel-loading">${t('collecting_data')}</div>
        </div>
      </div>

      <!-- 도구 사용 히스토그램 -->
      <div class="card panel-trend-card" id="panel-tool-card">
        <div class="panel-chart-header">${t('tool_usage')}</div>
        <div class="panel-trend-wrap" style="height:160px;">
          <canvas id="chart-tools" style="display:none"></canvas>
          <div class="panel-loading" id="tools-empty">${t('collecting_data')}</div>
        </div>
      </div>

      <!-- 최근 편집 파일 -->
      <div class="card panel-files-card" id="panel-files-card">
        <div class="panel-chart-header">${t('recently_edited')}</div>
        <div id="panel-files-list"><div class="panel-loading">${t('collecting_data')}</div></div>
      </div>

      <!-- 세션 목록 -->
      <div class="card panel-session-card" id="panel-session-card">
        <div class="panel-chart-header">${t('recent_sessions')}</div>
        <div id="panel-session-list"><div class="panel-loading">${t('collecting_data')}</div></div>
      </div>

      <!-- Git ROI — 브랜치별 비용 -->
      <div class="card panel-branch-card" id="panel-branch-card">
        <div class="panel-chart-header">${t('git_roi')}</div>
        <div id="panel-branch-list"><div class="panel-loading">${t('collecting_data')}</div></div>
      </div>

      <!-- 비용 귀속 — 스킬별 비용 + 서브에이전트 소비 -->
      <div class="card panel-skill-card" id="panel-skill-card">
        <div class="panel-chart-header">${t('skill_attribution')}</div>
        <div id="panel-skill-list"><div class="panel-loading">${t('collecting_data')}</div></div>
      </div>

      <!-- 장기 비용 트렌드 -->
      <div class="card panel-trend-card" id="panel-longterm-card">
        <div class="panel-chart-header">${t('long_term_trend')}</div>
        <div class="chart-scope-row">
          <span class="chart-scope-label">${t('scope_label')}:</span>
          <button class="lt-scope-btn active" data-scope="30">${t('scope_30d')}</button>
          <button class="lt-scope-btn" data-scope="90">${t('scope_90d')}</button>
          <button class="lt-scope-btn" data-scope="180">${t('scope_180d')}</button>
        </div>
        <div class="panel-trend-wrap">
          <canvas id="chart-longterm" style="display:none"></canvas>
          <div class="panel-loading" id="longterm-empty">${t('collecting_data')}</div>
        </div>
      </div>

      <!-- 월별 비용 -->
      <div class="card panel-trend-card" id="panel-monthly-card">
        <div class="panel-chart-header">${t('monthly_cost')}</div>
        <div class="panel-trend-wrap">
          <canvas id="chart-monthly" style="display:none"></canvas>
          <div class="panel-loading" id="monthly-empty">${t('collecting_data')}</div>
        </div>
      </div>
    </div>`;
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function updateUsageSection(): void {
  updateDailyChart();
  updateModelBreakdown();
  updateCacheSection();
  updateToolChart();
  updateFilesList();
  updateSessionList();
  updateBranchSection();
  updateSkillSection();
  updateLongTermSection();
  updateMonthlyChart();
}

function updateDailyChart(): void {
  const canvas = document.getElementById('chart-daily') as HTMLCanvasElement | null;
  const emptyEl = document.getElementById('daily-empty');
  if (!canvas) return;

  const days = panelUsage?.last7Days ?? [];
  const hasData = days.some(d => d.costUsd > 0);

  if (!hasData) {
    canvas.style.display = 'none';
    if (emptyEl) { emptyEl.className = 'panel-empty'; emptyEl.textContent = t('collecting_data'); emptyEl.style.display = ''; }
    if (dailyChart) { dailyChart.destroy(); dailyChart = null; }
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const labels = days.map(d => d.date.slice(5)); // MM-DD
  const data = days.map(d => Number(d.costUsd.toFixed(4)));
  const barColor = getCssVar('--c-sonnet');
  const axisColor = getCssVar('--vscode-descriptionForeground');
  const gridColor = getCssVar('--vscode-panel-border');

  const datasets = [{
    label: 'Cost (USD)',
    data,
    backgroundColor: barColor + 'bb',
    borderColor: barColor,
    borderWidth: 1,
    borderRadius: 3,
  }];

  if (dailyChart) {
    dailyChart.data.labels = labels;
    dailyChart.data.datasets = datasets;
    dailyChart.update();
  } else {
    dailyChart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: axisColor, font: { size: 10 } }, grid: { color: gridColor } },
          y: {
            ticks: { color: axisColor, font: { size: 10 }, callback: (v) => `$${Number(v).toFixed(2)}` },
            grid: { color: gridColor },
          },
        },
      },
    });
  }
}

function modelColor(model: string): string {
  if (model.includes('fable')) return getCssVar('--c-fable');
  if (model.includes('opus')) return getCssVar('--c-opus');
  if (model.includes('sonnet')) return getCssVar('--c-sonnet');
  if (model.includes('haiku')) return getCssVar('--c-haiku');
  return getCssVar('--c-slate');
}

function updateModelBreakdown(): void {
  const bodyEl = document.getElementById('panel-model-body');
  if (!bodyEl) return;

  const breakdown = panelUsage?.modelBreakdown ?? [];
  if (breakdown.length === 0) {
    bodyEl.innerHTML = `<div class="panel-empty">${t('no_usage_today2')}</div>`;
    if (modelChart) { modelChart.destroy(); modelChart = null; }
    return;
  }

  const axisColor = getCssVar('--vscode-descriptionForeground');
  const borderColor = getCssVar('--vscode-panel-border');

  const labels = breakdown.map(b => modelShortName(b.model));
  const data = breakdown.map(b => Number(b.costUsd.toFixed(4)));
  const colors = breakdown.map(b => modelColor(b.model));

  // 모델 바 목록 렌더
  const barsHtml = breakdown.map(b => `
    <div class="model-bar-row">
      <span class="model-bar-label">${escapeHtml(modelShortName(b.model))}</span>
      <div class="model-bar-track">
        <div class="model-bar-fill" style="width:${(b.share * 100).toFixed(1)}%;background:${modelColor(b.model)};"></div>
      </div>
      <span class="model-bar-cost mono">${fmtCost(b.costUsd)}</span>
      <span class="model-bar-pct mono">${(b.share * 100).toFixed(0)}%</span>
    </div>`).join('');

  const canvasId = 'chart-model';
  bodyEl.innerHTML = `
    <div class="panel-model-layout">
      <div class="panel-model-donut">
        <canvas id="${canvasId}" width="100" height="100"></canvas>
      </div>
      <div class="panel-model-bars">${barsHtml}</div>
    </div>`;

  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;

  if (modelChart) { modelChart.destroy(); modelChart = null; }
  modelChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 1,
      }],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${fmtCost(ctx.parsed as number)}`,
          },
        },
      },
      cutout: '65%',
      borderColor: borderColor,
      color: axisColor,
    } as Parameters<typeof Chart>[1]['options'],
  });
}

function updateCacheSection(): void {
  const bodyEl = document.getElementById('panel-cache-body');
  if (!bodyEl) return;

  const cache = panelUsage?.cacheStats;
  const last7 = panelUsage?.last7Days ?? [];

  if (!cache || cache.hitRate === 0) {
    bodyEl.innerHTML = `<div class="panel-empty">${t('no_cache_data')}</div>`;
    return;
  }

  const hitPct = (cache.hitRate * 100).toFixed(1);
  const savedStr = fmtCost(cache.savedUsd);

  // 일별 캐시 히트율 스파크라인 데이터
  const sparkLabels = last7.map(d => d.date.slice(5));
  const sparkData = last7.map(d => Number((d.cacheHitRate * 100).toFixed(1)));
  const hasSparkData = sparkData.some(v => v > 0);

  bodyEl.innerHTML = `
    <div class="cache-kpi-row">
      <div class="cache-kpi-item">
        <div class="cache-kpi-label">${t('hit_rate_today')}</div>
        <div class="cache-kpi-value mono">${hitPct}%</div>
      </div>
      <div class="cache-kpi-item">
        <div class="cache-kpi-label">${t('saved_today')}</div>
        <div class="cache-kpi-value mono" style="color:var(--c-haiku);">${savedStr}</div>
      </div>
    </div>
    ${hasSparkData ? `
    <div class="cache-spark-wrap">
      <div class="panel-chart-header" style="font-size:var(--fs-label);margin-bottom:var(--sp-1);">${t('seven_day_rate')}</div>
      <div style="height:60px;position:relative;">
        <canvas id="chart-cache-spark"></canvas>
      </div>
    </div>` : ''}`;

  if (hasSparkData) {
    const canvas = document.getElementById('chart-cache-spark') as HTMLCanvasElement | null;
    if (!canvas) return;
    const axisColor = getCssVar('--vscode-descriptionForeground');
    const gridColor = getCssVar('--vscode-panel-border');
    const lineColor = getCssVar('--c-warn');
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: sparkLabels,
        datasets: [{
          data: sparkData,
          borderColor: lineColor,
          backgroundColor: lineColor + '22',
          borderWidth: 1.5,
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: axisColor, font: { size: 9 } }, grid: { color: gridColor } },
          y: {
            min: 0,
            max: 100,
            ticks: { color: axisColor, font: { size: 9 }, callback: (v) => `${v}%` },
            grid: { color: gridColor },
          },
        },
      },
    });
  }
}

function updateToolChart(): void {
  const canvas = document.getElementById('chart-tools') as HTMLCanvasElement | null;
  const emptyEl = document.getElementById('tools-empty');
  if (!canvas) return;

  const days = panelUsage?.last7DaysTools ?? [];
  const hasData = days.some(d => d.edit > 0 || d.write > 0 || d.bash > 0 || d.webSearch > 0);

  if (!hasData) {
    canvas.style.display = 'none';
    if (emptyEl) { emptyEl.className = 'panel-empty'; emptyEl.textContent = t('no_tool_data'); emptyEl.style.display = ''; }
    if (toolChart) { toolChart.destroy(); toolChart = null; }
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const labels = days.map(d => d.date.slice(5));
  const axisColor = getCssVar('--vscode-descriptionForeground');
  const gridColor = getCssVar('--vscode-panel-border');

  const datasets = [
    {
      label: 'Edit',
      data: days.map(d => d.edit),
      backgroundColor: getCssVar('--c-slate') + 'cc',
      stack: 'tools',
    },
    {
      label: 'Write',
      data: days.map(d => d.write),
      backgroundColor: getCssVar('--c-sonnet') + 'cc',
      stack: 'tools',
    },
    {
      label: 'Bash',
      data: days.map(d => d.bash),
      backgroundColor: getCssVar('--c-warn') + 'cc',
      stack: 'tools',
    },
    {
      label: 'Search',
      data: days.map(d => d.webSearch),
      backgroundColor: getCssVar('--c-haiku') + 'cc',
      stack: 'tools',
    },
  ];

  if (toolChart) {
    toolChart.data.labels = labels;
    toolChart.data.datasets = datasets;
    toolChart.update();
  } else {
    toolChart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: axisColor, boxWidth: 10, font: { size: 10 }, padding: 8 },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: axisColor, font: { size: 10 } },
            grid: { color: gridColor },
          },
          y: {
            stacked: true,
            ticks: { color: axisColor, font: { size: 10 }, stepSize: 1 },
            grid: { color: gridColor },
          },
        },
      },
    });
  }
}

function updateFilesList(): void {
  const listEl = document.getElementById('panel-files-list');
  if (!listEl) return;

  const files = panelUsage?.recentEditedFiles ?? [];
  if (files.length === 0) {
    listEl.innerHTML = `<div class="panel-empty">${t('no_files_yet')}</div>`;
    return;
  }

  listEl.innerHTML = files.map(fp => {
    const parts = fp.split(/[/\\]/);
    const fileName = parts[parts.length - 1] ?? fp;
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    return `<div class="file-row">
      <div class="file-info">
        <span class="file-name" title="${escapeHtml(fp)}">${escapeHtml(fileName)}</span>
        ${dir ? `<span class="file-dir" title="${escapeHtml(fp)}">${escapeHtml(dir)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function updateSessionList(): void {
  const listEl = document.getElementById('panel-session-list');
  if (!listEl) return;

  const sessions = panelUsage?.recentSessions ?? [];
  if (sessions.length === 0) {
    listEl.innerHTML = `<div class="panel-empty">${t('no_sessions_yet')}</div>`;
    return;
  }

  listEl.innerHTML = sessions.map(s => buildSessionRow(s)).join('');
}

function updateBranchSection(): void {
  const listEl = document.getElementById('panel-branch-list');
  if (!listEl) return;

  const branches = panelUsage?.branchBreakdown ?? [];
  if (branches.length === 0) {
    listEl.innerHTML = `<div class="panel-empty">${t('no_branch_data')}</div>`;
    return;
  }

  const headerRow = `<div class="branch-row branch-header">
    <span class="branch-name">${t('branch_label')}</span>
    <span class="branch-cost mono">${t('daily_cost').split(' ')[0]}</span>
    <span class="branch-tokens mono">${t('tokens')}</span>
    <span class="branch-sessions mono">${t('sessions_label')}</span>
    <span class="branch-last mono">${t('last_active')}</span>
  </div>`;

  const rows = branches.map(b => {
    const lastDate = new Date(b.lastActive);
    const lastStr = lastDate.toISOString().slice(0, 10);
    return `<div class="branch-row">
      <span class="branch-name" title="${escapeHtml(b.branch)}">⎇ ${escapeHtml(b.branch)}</span>
      <span class="branch-cost mono">${fmtCost(b.costUsd)}</span>
      <span class="branch-tokens mono">${fmtTokens(b.totalTokens)}</span>
      <span class="branch-sessions mono">${b.sessionCount}</span>
      <span class="branch-last mono">${escapeHtml(lastStr)}</span>
    </div>`;
  }).join('');

  listEl.innerHTML = headerRow + rows;
}

function updateSkillSection(): void {
  const listEl = document.getElementById('panel-skill-list');
  if (!listEl) return;

  const skills = panelUsage?.skillBreakdown ?? [];
  const sub = panelUsage?.subagentStats;

  // 서브에이전트 소비 요약 라인 (#8)
  let subLine = '';
  if (sub && sub.subagentCostUsd > 0) {
    const pct = (sub.subagentShare * 100).toFixed(0);
    subLine = `<div class="skill-subagent-line">
      <span>${t('subagent_consumption')}</span>
      <span class="mono">${pct}% · ${fmtCost(sub.subagentCostUsd)} · ${sub.subagentCount} ${t('agents_label')}</span>
    </div>`;
  }

  if (skills.length === 0) {
    listEl.innerHTML = subLine || `<div class="panel-empty">${t('no_skill_data')}</div>`;
    return;
  }

  // 비용 비중 바 (단일 액센트 — 6+1 cap 준수)
  const top = skills.slice(0, 8);
  const maxShare = top[0]?.share || 1;
  const rows = top.map(s => {
    const w = Math.max(2, (s.share / maxShare) * 100);
    return `<div class="skill-row" title="${escapeHtml(s.skill)} · ${(s.share * 100).toFixed(1)}%">
      <span class="skill-name">${escapeHtml(s.skill)}</span>
      <span class="skill-bar-wrap"><span class="skill-bar" style="width:${w}%"></span></span>
      <span class="skill-cost mono">${fmtCost(s.costUsd)}</span>
    </div>`;
  }).join('');

  listEl.innerHTML = subLine + rows;
}

function updateLongTermSection(): void {
  const canvas = document.getElementById('chart-longterm') as HTMLCanvasElement | null;
  const emptyEl = document.getElementById('longterm-empty');
  if (!canvas) return;

  const allDays = panelUsage?.historicalDays ?? [];
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - longTermScopeDays);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const filtered = allDays.filter(d => d.date >= cutoffKey);
  const hasData = filtered.some(d => d.costUsd > 0);

  if (!hasData) {
    canvas.style.display = 'none';
    if (emptyEl) { emptyEl.className = 'panel-empty'; emptyEl.textContent = t('no_history_data'); emptyEl.style.display = ''; }
    if (longTermChart) { longTermChart.destroy(); longTermChart = null; }
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const labels = filtered.map(d => d.date.slice(5));
  const data = filtered.map(d => Number(d.costUsd.toFixed(4)));
  const lineColor = getCssVar('--c-sonnet');
  const axisColor = getCssVar('--vscode-descriptionForeground');
  const gridColor = getCssVar('--vscode-panel-border');

  const datasets = [{
    label: 'Cost (USD)',
    data,
    borderColor: lineColor,
    backgroundColor: lineColor + '22',
    borderWidth: 1.5,
    fill: true,
    tension: 0.2,
    pointRadius: filtered.length <= 30 ? 2 : 0,
  }];

  if (longTermChart) {
    longTermChart.data.labels = labels;
    longTermChart.data.datasets = datasets;
    longTermChart.update();
  } else {
    longTermChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: axisColor, font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 },
            grid: { color: gridColor },
          },
          y: {
            ticks: { color: axisColor, font: { size: 10 }, callback: (v) => `$${Number(v).toFixed(2)}` },
            grid: { color: gridColor },
          },
        },
      },
    });
  }
}

function updateMonthlyChart(): void {
  const canvas = document.getElementById('chart-monthly') as HTMLCanvasElement | null;
  const emptyEl = document.getElementById('monthly-empty');
  if (!canvas) return;

  const allDays = panelUsage?.historicalDays ?? [];
  if (allDays.length === 0) {
    canvas.style.display = 'none';
    if (emptyEl) { emptyEl.className = 'panel-loading'; emptyEl.textContent = t('collecting_data'); emptyEl.style.display = ''; }
    if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
    return;
  }

  // 월별 집계
  const byMonth = new Map<string, number>();
  for (const d of allDays) {
    const monthKey = d.date.slice(0, 7); // YYYY-MM
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + d.costUsd);
  }
  const sortedMonths = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const hasData = sortedMonths.some(([, v]) => v > 0);

  if (!hasData) {
    canvas.style.display = 'none';
    if (emptyEl) { emptyEl.className = 'panel-empty'; emptyEl.textContent = t('no_history_data'); emptyEl.style.display = ''; }
    if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const labels = sortedMonths.map(([k]) => k);
  const data = sortedMonths.map(([, v]) => Number(v.toFixed(4)));
  const barColor = getCssVar('--c-opus');
  const axisColor = getCssVar('--vscode-descriptionForeground');
  const gridColor = getCssVar('--vscode-panel-border');

  const datasets = [{
    label: 'Monthly Cost (USD)',
    data,
    backgroundColor: barColor + 'bb',
    borderColor: barColor,
    borderWidth: 1,
    borderRadius: 3,
  }];

  if (monthlyChart) {
    monthlyChart.data.labels = labels;
    monthlyChart.data.datasets = datasets;
    monthlyChart.update();
  } else {
    monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: axisColor, font: { size: 10 } }, grid: { color: gridColor } },
          y: {
            ticks: { color: axisColor, font: { size: 10 }, callback: (v) => `$${Number(v).toFixed(0)}` },
            grid: { color: gridColor },
          },
        },
      },
    });
  }
}

function buildSessionRow(s: SessionSummary): string {
  const startTime = new Date(s.startTime);
  const timeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;
  const dateStr = startTime.toISOString().slice(0, 10);
  const cwdShort = s.cwd.split('/').pop() ?? s.cwd;
  return `<div class="session-row">
    <span class="session-cwd" title="${escapeHtml(s.cwd)}">${escapeHtml(cwdShort)}</span>
    <span class="session-time mono">${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</span>
    <span class="session-tokens mono">${fmtTokens(s.totalTokens)}</span>
    <span class="session-cost mono">${fmtCost(s.costUsd)}</span>
  </div>`;
}

function updatePanel(snapshot: RateLimitSnapshot): void {
  const fh = snapshot.fiveHour;
  const sd = snapshot.sevenDay;

  // 상태 배지
  const statusEl = document.getElementById('panel-status');
  if (statusEl) {
    statusEl.className = `status-badge ${snapshot.overallStatus}`;
    statusEl.textContent = statusLabel(snapshot.overallStatus);
  }

  // Plan 배지
  const planBadgeEl = document.getElementById('panel-plan-badge');
  if (planBadgeEl && snapshot.plan?.subscriptionType) {
    planBadgeEl.innerHTML = `<span class="plan-badge">${escapeHtml(fmtPlanTier(snapshot.plan.subscriptionType, snapshot.plan.rateLimitTier))}</span>`;
  }

  // Fallback 배너
  const fallbackEl = document.getElementById('panel-fallback-banner');
  if (fallbackEl) {
    fallbackEl.innerHTML = (snapshot.fallback?.available === 'unavailable')
      ? `<div class="fallback-banner" style="margin:0 0 var(--sp-2);">⚠ Fallback active: ${snapshot.fallback.percentage !== undefined ? `${Math.round(snapshot.fallback.percentage * 100)}% speed` : 'throttled'}</div>`
      : '';
  }

  // SESSION (5h) 카드 — 병목 하이라이트
  const fhCard = document.getElementById('panel-fh-card');
  if (fhCard) fhCard.classList.toggle('is-bottleneck', snapshot.representativeClaim === 'five_hour');

  const fhRemEl = document.getElementById('fh-remaining');
  const fhBarFill = document.getElementById('fh-bar-fill') as HTMLElement | null;
  const fhResetEl = document.getElementById('fh-reset');
  if (fhRemEl) fhRemEl.textContent = `${fmtPct(1 - fh.utilization)} ${t('remaining_label')}`;
  if (fhBarFill) {
    fhBarFill.style.cssText = barFillWidth(fh.utilization);
    fhBarFill.dataset.status = fh.status;
  }
  if (fhResetEl) fhResetEl.textContent = `${t('resets_in')} ${fmtReset(fh.msUntilReset)} · ${t('used_label')} ${fmtPct(fh.utilization)}`;

  // WEEKLY (7d) 카드 — 병목 하이라이트 + 임계값 배지
  const sdCard = document.getElementById('panel-sd-card');
  if (sdCard) sdCard.classList.toggle('is-bottleneck', snapshot.representativeClaim === 'seven_day');

  const sdRemEl = document.getElementById('sd-remaining');
  const sdBarFill = document.getElementById('sd-bar-fill') as HTMLElement | null;
  const sdResetEl = document.getElementById('sd-reset');
  if (sdRemEl) sdRemEl.textContent = `${fmtPct(1 - sd.utilization)} ${t('remaining_label')}`;
  if (sdBarFill) {
    sdBarFill.style.cssText = barFillWidth(sd.utilization);
    sdBarFill.dataset.status = sd.status;
  }
  if (sdResetEl) {
    const thBadge = snapshot.sevenDaySurpassedThreshold !== undefined
      ? ` <span class="threshold-badge">&gt;${Math.round(snapshot.sevenDaySurpassedThreshold * 100)}%</span>`
      : '';
    sdResetEl.innerHTML = `${t('resets_in')} ${fmtReset(sd.msUntilReset)} · ${t('used_label')} ${fmtPct(sd.utilization)}${thBadge}`;
  }

  // BURN RATE 카드
  const FH_WINDOW_MS = 5 * 60 * 60 * 1000; // 5h
  const burnRate = calcBurnRate(fhHistory)
    ?? calcBurnRateEstimate(fh.utilization, fh.msUntilReset, FH_WINDOW_MS);
  const isEstimate = calcBurnRate(fhHistory) === null && burnRate !== null;
  const burnRateEl = document.getElementById('burn-rate-val');
  const burnHrEl = document.getElementById('burn-rate-hr');
  if (burnRate !== null && burnRate > 0) {
    if (burnRateEl) burnRateEl.textContent = `${(burnRate * 100).toFixed(2)}%/min`;
    if (burnHrEl) burnHrEl.textContent = isEstimate
      ? `${(burnRate * 100 * 60).toFixed(1)}%/hr (${t('est_label')})`
      : `${(burnRate * 100 * 60).toFixed(1)}%/hr`;
  } else {
    if (burnRateEl) burnRateEl.textContent = '—';
    if (burnHrEl) burnHrEl.textContent = fh.utilization === 0 ? t('no_usage_yet') : t('collecting_data');
  }

  // SAFE UNTIL 카드
  const safeEl = document.getElementById('safe-until-val');
  const safeProjEl = document.getElementById('safe-until-proj');
  if (burnRate !== null && burnRate > 0) {
    const resetAt = new Date(Date.now() + fh.msUntilReset);
    const safeUntil = calcSafeUntil(fh.utilization, burnRate, resetAt);
    const projRemaining = calcProjAtReset(fh.utilization, burnRate, fh.msUntilReset);
    if (safeEl) safeEl.textContent = safeUntil ? fmtTime(safeUntil) : t('after_reset');
    if (safeProjEl) safeProjEl.textContent = `${t('proj')} ${fmtPct(projRemaining)} ${t('left_at_reset')}${isEstimate ? ` (${t('est_label')})` : ''}`;
  } else {
    if (safeEl) safeEl.textContent = '—';
    if (safeProjEl) safeProjEl.textContent = fh.utilization === 0 ? t('no_usage_yet') : t('collecting_data');
  }

  updateTrendChart();
}

function updateTrendChart(): void {
  const canvas = document.getElementById('chart-trend') as HTMLCanvasElement | null;
  const emptyEl = document.getElementById('trend-empty');
  if (!canvas) return;

  // 스코프 필터: 최근 N분 이내 포인트만
  const cutoff = Date.now() - chartScopeMin * 60000;
  const fhSlice = fhHistory.filter(p => p.t.getTime() >= cutoff);
  const sdSlice = sdHistory.filter(p => p.t.getTime() >= cutoff);

  if (fhSlice.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) {
      emptyEl.style.display = '';
      emptyEl.textContent = fhHistory.length < 2 ? t('collecting_poll') : t('no_scope_data');
    }
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const labels = fhSlice.map(p => {
    const d = new Date(p.t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  });

  const fhColor = getCssVar('--c-sonnet');
  const sdColor = getCssVar('--c-opus');
  const axisColor = getCssVar('--vscode-descriptionForeground');
  const gridColor = getCssVar('--vscode-panel-border');

  const datasets = [
    {
      label: 'Session (5h)',
      data: fhSlice.map(p => p.v * 100),
      borderColor: fhColor,
      backgroundColor: fhColor + '22',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: fhSlice.length <= 10 ? 3 : 0,
    },
    {
      label: 'Weekly (7d)',
      data: sdSlice.map(p => p.v * 100),
      borderColor: sdColor,
      backgroundColor: sdColor + '22',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: sdSlice.length <= 10 ? 3 : 0,
    },
  ];

  if (trendChart) {
    trendChart.data.labels = labels;
    trendChart.data.datasets = datasets;
    // 스코프 변경 시 x축 tick 수도 갱신
    const xScale = trendChart.options.scales?.['x'] as Record<string, unknown> | undefined;
    if (xScale?.['ticks'] && typeof xScale['ticks'] === 'object') {
      (xScale['ticks'] as Record<string, unknown>)['maxTicksLimit'] =
        chartScopeMin <= 30 ? 6 : chartScopeMin <= 120 ? 8 : 12;
    }
    trendChart.update();
  } else {
    trendChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: axisColor, boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: {
            ticks: {
              color: axisColor,
              font: { size: 10 },
              maxTicksLimit: chartScopeMin <= 30 ? 6 : chartScopeMin <= 120 ? 8 : 12,
              maxRotation: 0,
            },
            grid: { color: gridColor },
          },
          y: {
            min: 0,
            max: 100,
            ticks: { color: axisColor, font: { size: 10 }, callback: (v) => `${v}%` },
            grid: { color: gridColor },
          },
        },
      },
    });
  }
}
