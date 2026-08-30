// 사이드바 뷰(WebviewViewProvider) 전용 렌더링 (v0.1.54 ST5 — main.ts에서 기계적 추출).
import { Messenger } from 'vscode-messenger-webview';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import {
  GetRateLimit, GetUsageSummary, PushPollerError, PushRateLimit, PushUsageSummary,
  RequestClearPinnedSession, RequestLogin, RequestOpenBillingSettings, RequestOpenDashboard,
  RequestOpenSessionPicker, RequestRefresh, RequestSetLang,
} from '../messaging/contracts';
import type { PollerError, RateLimitSnapshot, UsageSummary } from '../types';
import { getLang, setLang, t } from './i18n';
import { escapeHtml, fmtCost, formatErrorHtml } from './format';
import { resolveContextGaugeState } from './contextGaugeState';
import type { CalendarDay } from './calendarView';
import type { PollPoint } from './burnRate';
import { vsApi } from './webviewApi';
import {
  FH_WINDOW_MS, SD_WINDOW_MS, fmtPct, fmtReset, fmtTime, statusColor, statusLabel,
  fmtPlanTier, buildBurnRow, fmtTokens, modelKind, modelShortName, buildCalendarHtml,
  SIDEBAR_CALENDAR_WINDOW_DAYS,
} from './webviewShared';

const root = document.getElementById('root');

export function initSidebar(): void {
  if (!root) return;

  // acquireVsCodeApi가 없으면 non-webview 환경 — 명확한 에러 표시
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (globalThis as any).acquireVsCodeApi === 'undefined' && vsApi === undefined) {
    root.innerHTML = `<div style="padding:12px;color:var(--vscode-errorForeground);font-size:12px;">
      acquireVsCodeApi not available.<br>This view must run inside VS Code.
    </div>`;
    return;
  }

  // messenger 초기화 전에 먼저 상태 표시 — 초기화 실패해도 "Loading..." 안 남도록
  root.innerHTML = `<div class="sb-layout"><div class="sb-loading">Connecting...</div></div>`;

  let messenger: InstanceType<typeof Messenger>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messenger = new Messenger(vsApi as any);
  } catch (err) {
    root.innerHTML = `<div class="sb-layout"><div class="sb-error-card card">
      <div class="sb-error-icon">&#9888;</div>
      <div class="sb-error-msg">Messenger init failed</div>
      <div class="sb-error-sub">${formatErrorHtml(err)}</div>
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
      <div class="sb-error-sub">${formatErrorHtml(err)}</div>
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
      const ctxBar = root!.querySelector<HTMLElement>('#sb-ctx-bar');
      if (fhBar) fhBar.style.width = `${Math.min(100, snapshot.fiveHour.utilization * 100)}%`;
      if (sdBar) sdBar.style.width = `${Math.min(100, snapshot.sevenDay.utilization * 100)}%`;
      if (ovBar && snapshot.overage) {
        ovBar.style.width = `${Math.min(100, snapshot.overage.utilization * 100)}%`;
      }
      if (ctxBar && lastUsage?.sessionContext) {
        ctxBar.style.width = `${Math.min(100, lastUsage.sessionContext.ratio * 100)}%`;
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
    root!.querySelectorAll<HTMLButtonElement>('.js-open-session-picker').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestOpenSessionPicker, HOST_EXTENSION));
    });
    root!.querySelectorAll<HTMLButtonElement>('.js-clear-pinned-session').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestClearPinnedSession, HOST_EXTENSION));
    });
  }
}

/** 경과시간(측정 시각 → 지금) — fmtReset과 동일 포맷이나 "지남" 의미라 별도 함수(S3). */
function fmtAge(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** 경과 4시간 초과 시 stale 표시(S3) — 배경 폴링 간격(15s)보다 훨씬 커, 진짜 오래된 값만 dim. */
const CONTEXT_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;
function modelAccentClass(model: string): string {
  const k = modelKind(model);
  return k === 'other' ? 'slate' : k;
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
    const needsLogin = error === 'credentials_missing' || error === 'token_expired' || error === 'token_stale';
    const icon = error === 'token_stale' ? '🔄' : needsLogin ? '🔑' : '⚠';
    const title = error === 'credentials_missing' ? t('login_required')
      : error === 'token_stale' ? t('token_refresh_needed')
      : error === 'token_expired' ? t('session_expired')
      : error === 'network_error' ? t('network_error')
      : t('connecting');
    const sub = error === 'credentials_missing'
      ? t('login_sub_missing')
      : error === 'token_stale'
      ? t('login_sub_stale')
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

  const fhBurnRow = buildBurnRow(fhHist, fh.utilization, fh.msUntilReset, FH_WINDOW_MS);
  const sdBurnRow = buildBurnRow(sdHist, sd.utilization, sd.msUntilReset, SD_WINDOW_MS);

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
        const ovDisabled = ov.status === 'rejected';
        const ovPct = fmtPct(ov.utilization);
        const ovColor = ovDisabled ? 'var(--c-danger)' : 'var(--c-warn)';
        const ovDataStatus = ovDisabled ? 'blocked' : 'allowed';
        // 비활성(rejected)일 때는 오해 유발하는 "0%" 대신 비활성 칩만 표시.
        // 활성일 때만 overage rate-limit 사용률(%)을 노출 — claude.ai "사용 크레딧"($ 지출)과 다른 지표라 툴팁으로 명시.
        const ovRight = ovDisabled
          ? `<span class="overage-status-chip rejected">${t('overage_disabled')}</span>`
          : `<span class="mono" style="color:${ovColor};">${ovPct}</span>
              <span class="sb-section-sep">·</span>
              <span class="overage-status-chip allowed">${t('overage_active')}</span>`;
        return `<div class="sb-overage-wrap">
          <div class="sb-section-hdr">
            <span class="sb-section-dot" style="background:${ovColor};"></span>
            <span class="sb-section-label" title="${t('overage_tooltip')}" style="cursor:help;">${t('overage')}</span>
            <span class="sb-section-right">
              ${ovRight}
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
      ${buildContextGaugeHtml(usage)}
      ${buildSidebarCalendarHtml(usage)}
      <div class="sb-spacer"></div>
      <div class="sb-dashboard-wrap">
        <button class="sb-dashboard-btn js-open-dashboard">⚡ ${t('open_dashboard')}</button>
      </div>

    </div>`;
}

/**
 * 사이드바 세션 컨텍스트 점유율 미니 게이지(v0.1.49 ④) — 단일 숫자→사이드바 배치 원칙,
 * 기존 overage rate-bar 시각 문법 그대로 재사용. 데이터 없으면(세션 기록 자체가 없음) 섹션 생략.
 * repo 칩(v0.1.50 A) — sessionContext가 워크스페이스 스코핑(B)된 값이므로, 게이트 바만으론
 * "어느 워크스페이스 기준인지" 알 수 없어 헤더 행과 별도 줄로 basename(cwd)을 표기한다
 * (헤더 행은 라벨+%+≈배지로 이미 폭이 빡빡함 — v0.1.46 칩 줄바꿈 버그 이력).
 */
function buildContextGaugeHtml(usage: UsageSummary | null): string {
  const ctx = usage?.sessionContext;
  if (!ctx) {
    // "워크스페이스 매칭 0건"과 "세션 기록 자체가 없음"을 구분한다(v0.1.49). v0.1.48은 두 경우를
    // 모두 무음 삭제해, Windows 경로 대소문자 회귀로 게이지가 사라졌을 때 사용자가 정상 상태와
    // 버그를 구분할 방법이 아예 없었다. 기록이 하나라도 있는데 매칭이 0이면 그 사실을 표시한다.
    if ((usage?.recentSessions?.length ?? 0) === 0) return '';
    return `<div class="sb-context-wrap">
      <div class="sb-section-hdr">
        <span class="sb-section-label" title="${t('context_no_session_tooltip')}" style="cursor:help;">${t('context_usage')}</span>
      </div>
      <div class="sb-context-empty" title="${t('context_no_session_tooltip')}">${t('context_no_session')}</div>
    </div>`;
  }
  // 배지·색상·경고링크 판정은 순수함수(contextGaugeState.ts)에 위임 — 사이드바는 그 결과만 렌더.
  const gauge = resolveContextGaugeState(ctx, Date.now(), CONTEXT_STALE_THRESHOLD_MS);
  const color = gauge.colorStatus === 'danger' ? 'var(--c-danger)' : gauge.colorStatus === 'allowed_warning' ? 'var(--c-warn)' : 'var(--c-sonnet)';
  // 세션 선택기(v0.1.51) — 워크스페이스 칩 클릭으로 QuickPick을 열어 세션을 고정(pin)할 수 있다.
  const isPinned = ctx.mode === 'pinned';
  const repoChipClass = isPinned ? (gauge.showRevertLink ? 'sb-chip--warn' : 'sb-chip--pin') : 'sb-chip--branch';
  const repoIcon = isPinned ? '📌' : '📁';
  const pickerHint = isPinned ? t('context_pinned_tooltip') : t('context_picker_tooltip');
  const repoTitle = `${pickerHint}\n${t('context_repo_label')}: ${ctx.cwd}`;
  // 경과시간(S3) — 배경/자동 세션이 오래전 값을 게이지에 남겨도 사용자가 판별 가능하게.
  const ageMs = Date.now() - new Date(ctx.timestamp).getTime();
  const ageTitle = `${t('context_age_label')}: ${fmtAge(ageMs)}`;
  // 토큰 절대값 병기(S1) — 분모가 200K 폴백 구간이어도 사용자가 실제 규모를 직접 판별 가능.
  const tokensLabel = `(${fmtTokens(ctx.tokens)}/${fmtTokens(ctx.maxWindow)})`;
  return `<div class="sb-context-wrap${gauge.isStale ? ' sb-context-stale' : ''}">
    <div class="sb-section-hdr">
      <span class="sb-section-dot" style="background:${color};"></span>
      <span class="sb-section-label" title="${t('context_gauge_tooltip')}" style="cursor:help;">${t('context_usage')}</span>
      <span class="sb-section-right">
        <span class="mono" style="color:${color};">${fmtPct(ctx.ratio)}</span>
        <span class="sb-context-tokens mono" title="${t('context_gauge_tooltip')}">${tokensLabel}</span>
        <span class="retro-approx-badge" title="${t('context_gauge_tooltip')}">${t('retro_approx_badge')}</span>
      </span>
    </div>
    <div class="sb-rate-card">
      <div class="rate-bar">
        <div class="rate-bar-fill" id="sb-ctx-bar" data-status="${gauge.colorStatus}"></div>
      </div>
    </div>
    <div class="sb-chip-row">
      <button class="sb-chip ${repoChipClass} sb-chip--clickable js-open-session-picker" title="${escapeHtml(repoTitle)}">${repoIcon} ${escapeHtml(ctx.repoName)}<span class="chev">▾</span></button>
      <span class="sb-chip${gauge.showRevertLink ? ' sb-chip--warn' : ''}" title="${escapeHtml(ageTitle)}">${gauge.showRevertLink ? '⚠' : '🕐'} ${fmtAge(ageMs)}</span>
    </div>
    ${gauge.showRevertLink
      ? `<div class="sb-context-revert-row"><button class="sb-context-revert-link js-clear-pinned-session" title="${escapeHtml(t('context_revert_tooltip'))}">${escapeHtml(t('context_revert_link'))}</button></div>`
      : ''}
  </div>`;
}

/**
 * 사이드바 미니 Usage Calendar(v0.1.45) — 최근 3개월(90일) 축소뷰. 대시보드 371일 원본과
 * buildCalendarHtml을 공유하되 windowDays만 다르다(사이드바=차트금지 원칙 예외,
 * feedback_sidebar_vs_dashboard.md 참조). 데이터 없으면 섹션 자체를 생략한다
 * (대시보드처럼 "수집 중…" placeholder를 두면 좁은 폭에서 공간만 차지하고 정보가 없다).
 */
function buildSidebarCalendarHtml(usage: UsageSummary | null): string {
  const allDays: CalendarDay[] = usage?.historicalDays ?? [];
  const hasData = allDays.some(d => d.costUsd > 0 || d.totalTokens > 0);
  if (!hasData) return '';

  const todayKey = new Date().toISOString().slice(0, 10);
  return `<div class="sb-calendar-wrap">
    <div class="sb-section-hdr">
      <span class="sb-section-label">${t('usage_calendar')}</span>
    </div>
    ${buildCalendarHtml(allDays, SIDEBAR_CALENDAR_WINDOW_DAYS, todayKey, false)}
  </div>`;
}
