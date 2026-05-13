// Webview 진입점.
// data-mode={sidebar|panel} 속성으로 두 컨텍스트 분기.
import { Chart, registerables } from 'chart.js';
import { Messenger } from 'vscode-messenger-webview';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import { GetRateLimit, PushPollerError, PushRateLimit, RequestLogin, RequestRefresh } from '../messaging/contracts';
import type { PollerError, RateLimitSnapshot, UnifiedWindow } from '../types';

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
  console.error('[Claudepulse] webview init failed:', err);
  if (root) {
    root.innerHTML = `<div style="padding:12px;color:#f48771;font-size:12px;font-family:monospace;">
      Claudepulse webview error:<br>${msg}<br><br>
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
  if (status === 'blocked') return 'var(--c-danger)';
  if (status === 'allowed_warning') return 'var(--c-warn)';
  return 'var(--c-haiku)';
}

function statusLabel(status: UnifiedWindow['status']): string {
  if (status === 'blocked') return 'Blocked';
  if (status === 'allowed_warning') return 'Warning';
  return 'OK';
}

function barFillWidth(utilization: number): string {
  const pct = Math.min(100, Math.max(0, utilization * 100));
  return `width:${pct}%;`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function buildBurnRow(history: PollPoint[], utilization: number, msUntilReset: number): string {
  const rate = calcBurnRate(history);
  if (rate === null || rate <= 0) return '';
  const resetAt = new Date(Date.now() + msUntilReset);
  const safeUntil = calcSafeUntil(utilization, rate, resetAt);
  const projRemaining = calcProjAtReset(utilization, rate, msUntilReset);
  const rateStr = `${(rate * 100).toFixed(2)}%/min`;
  const safeStr = safeUntil ? ` · Safe until ${fmtTime(safeUntil)} (proj ${fmtPct(projRemaining)} left)` : '';
  return `<div class="rate-burn-row">
    <span class="rate-burn-label">Burn ${rateStr}${safeStr}</span>
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

  function recordSbHistory(snapshot: RateLimitSnapshot): void {
    const t = new Date(snapshot.generatedAt);
    sbFhHistory.push({ t, v: snapshot.fiveHour.utilization });
    sbSdHistory.push({ t, v: snapshot.sevenDay.utilization });
    if (sbFhHistory.length > MAX_SB_HISTORY) sbFhHistory.shift();
    if (sbSdHistory.length > MAX_SB_HISTORY) sbSdHistory.shift();
  }

  messenger.onNotification(PushRateLimit, (snapshot) => {
    lastError = null;
    recordSbHistory(snapshot);
    renderSidebar(snapshot, null);
  });

  messenger.onNotification(PushPollerError, (error) => {
    lastError = error;
    renderSidebar(null, error);
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

  messenger.sendRequest(GetRateLimit, HOST_EXTENSION, undefined)
    .then((snapshot) => {
      recordSbHistory(snapshot);
      renderSidebar(snapshot, null);
    })
    .catch(() => renderSidebar(null, lastError));

  function renderSidebar(snapshot: RateLimitSnapshot | null, error: PollerError | null): void {
    root!.innerHTML = buildSidebarHtml(snapshot, error, sbFhHistory, sbSdHistory);
    root!.querySelectorAll<HTMLButtonElement>('.js-refresh').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestRefresh, HOST_EXTENSION));
    });
    root!.querySelectorAll<HTMLButtonElement>('.js-login').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestLogin, HOST_EXTENSION));
    });
  }
}

function buildSidebarHtml(
  snapshot: RateLimitSnapshot | null,
  error: PollerError | null,
  fhHist: PollPoint[],
  sdHist: PollPoint[]
): string {
  if (!snapshot) {
    const needsLogin = error === 'credentials_missing' || error === 'token_expired';
    const icon = needsLogin ? '🔑' : '⚠';
    const title = error === 'credentials_missing' ? 'Login Required'
      : error === 'token_expired' ? 'Session Expired'
      : error === 'network_error' ? 'Network Error'
      : 'Connecting…';
    const sub = error === 'credentials_missing'
      ? 'Claude Code CLI가 설치되어 있지 않거나<br>로그인되지 않았습니다.'
      : error === 'token_expired'
      ? 'OAuth 토큰이 만료됐습니다.<br>다시 로그인해 주세요.'
      : error === 'network_error'
      ? 'Anthropic API에 연결할 수 없습니다.<br>네트워크를 확인하세요.'
      : 'Anthropic API에서 Rate Limit 정보를<br>가져오는 중…';

    return `
      <div class="sb-layout">
        <div class="sb-header">
          <span class="sb-header-title">Clausight</span>
          <div class="sb-header-spacer"></div>
          <button class="sb-icon-btn js-refresh" title="Refresh">↻</button>
        </div>
        <div class="sb-error-card card">
          <div class="sb-error-icon">${icon}</div>
          <div class="sb-error-msg">${title}</div>
          <div class="sb-error-sub">${sub}</div>
          ${needsLogin
            ? `<button class="login-btn js-login">Login with Claude</button>
               <div class="login-hint">로그인 후 ↻ 버튼을 눌러 새로고침하세요</div>`
            : `<button class="btn-ghost js-refresh" style="margin-top:8px;">↻ Retry</button>`
          }
        </div>
      </div>`;
  }

  const fh = snapshot.fiveHour;
  const sd = snapshot.sevenDay;
  const overall = snapshot.overallStatus;
  const overallColor = statusColor(overall);
  const timestamp = fmtTime(new Date(snapshot.generatedAt));

  const fhBurnRow = buildBurnRow(fhHist, fh.utilization, fh.msUntilReset);
  const sdBurnRow = buildBurnRow(sdHist, sd.utilization, sd.msUntilReset);

  return `
    <div class="sb-layout">
      <!-- 헤더 -->
      <div class="sb-header">
        <span class="sb-header-title">Clausight</span>
        <div class="sb-header-spacer"></div>
        <button class="sb-icon-btn js-refresh" aria-label="Refresh" title="Refresh">↻</button>
      </div>

      <!-- 상태 뱃지 -->
      <div class="sb-status-row">
        <span class="status-badge" style="background:${overallColor}22;color:${overallColor};border-color:${overallColor}44;">
          ${statusLabel(overall)}
        </span>
        <span class="sb-gen-time mono">${timestamp}</span>
      </div>

      <!-- 5h 세션 섹션 -->
      <div class="sb-section-hdr">
        <span class="sb-section-dot" style="background:var(--c-sonnet);"></span>
        <span class="sb-section-label">Session (5h)</span>
        <span class="sb-section-right">
          <span class="mono">${fmtPct(fh.utilization)}</span>
          <span class="sb-section-sep">·</span>
          <span class="mono" style="color:${statusColor(fh.status)};">${fmtPct(1 - fh.utilization)} left</span>
        </span>
      </div>
      <div class="sb-rate-card card">
        <div class="rate-bar">
          <div class="rate-bar-fill" data-status="${fh.status}" style="${barFillWidth(fh.utilization)}"></div>
        </div>
        <div class="rate-meta-row">
          <span class="rate-status-chip" style="background:${statusColor(fh.status)}22;color:${statusColor(fh.status)};">${statusLabel(fh.status)}</span>
          <span class="rate-reset-label">resets in <span class="mono">${fmtReset(fh.msUntilReset)}</span></span>
        </div>
        ${fhBurnRow}
      </div>

      <!-- 7d 주간 섹션 -->
      <div class="sb-section-hdr">
        <span class="sb-section-dot" style="background:var(--c-opus);"></span>
        <span class="sb-section-label">Weekly (7d)</span>
        <span class="sb-section-right">
          <span class="mono">${fmtPct(sd.utilization)}</span>
          <span class="sb-section-sep">·</span>
          <span class="mono" style="color:${statusColor(sd.status)};">${fmtPct(1 - sd.utilization)} left</span>
        </span>
      </div>
      <div class="sb-rate-card card">
        <div class="rate-bar">
          <div class="rate-bar-fill" data-status="${sd.status}" style="${barFillWidth(sd.utilization)}"></div>
        </div>
        <div class="rate-meta-row">
          <span class="rate-status-chip" style="background:${statusColor(sd.status)}22;color:${statusColor(sd.status)};">${statusLabel(sd.status)}</span>
          <span class="rate-reset-label">resets in <span class="mono">${fmtReset(sd.msUntilReset)}</span></span>
        </div>
        ${sdBurnRow}
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
    recordHistory(snapshot);
    updatePanel(snapshot);
  });

  try {
    messenger.start();
  } catch (err) {
    const el = document.getElementById('panel-status');
    if (el) el.innerHTML = `<span style="color:#f48771">Messenger start failed: ${err instanceof Error ? err.message : String(err)}</span>`;
    return;
  }

  messenger.sendRequest(GetRateLimit, HOST_EXTENSION, undefined)
    .then((snapshot) => {
      recordHistory(snapshot);
      updatePanel(snapshot);
    })
    .catch(() => {
      const el = document.getElementById('panel-status');
      if (el) el.innerHTML = `<span style="color:#8a8a8a;font-size:12px;">Waiting for first poll... (≈5 min) or click ↻</span>`;
    });

  document.querySelectorAll<HTMLButtonElement>('.js-refresh').forEach(btn => {
    btn.addEventListener('click', () => messenger.sendNotification(RequestRefresh, HOST_EXTENSION));
  });
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
        <span class="panel-title">Claudepulse</span>
        <div class="panel-header-spacer"></div>
        <button class="sb-icon-btn js-refresh" title="Refresh">↻</button>
      </div>

      <div id="panel-status" class="panel-status-row"></div>

      <!-- 4-카드 메트릭 그리드 -->
      <div class="panel-metric-grid">
        <div class="card panel-metric-card">
          <div class="panel-metric-label">Session (5h)</div>
          <div class="panel-metric-value" id="fh-remaining">—</div>
          <div class="panel-metric-bar">
            <div class="rate-bar">
              <div class="rate-bar-fill" id="fh-bar-fill"></div>
            </div>
          </div>
          <div class="panel-metric-sub" id="fh-reset">—</div>
        </div>
        <div class="card panel-metric-card">
          <div class="panel-metric-label">Weekly (7d)</div>
          <div class="panel-metric-value" id="sd-remaining">—</div>
          <div class="panel-metric-bar">
            <div class="rate-bar">
              <div class="rate-bar-fill" id="sd-bar-fill"></div>
            </div>
          </div>
          <div class="panel-metric-sub" id="sd-reset">—</div>
        </div>
        <div class="card panel-metric-card">
          <div class="panel-metric-label">Burn Rate</div>
          <div class="panel-metric-value" id="burn-rate-val">—</div>
          <div class="panel-metric-sub" id="burn-rate-hr">Collecting data…</div>
        </div>
        <div class="card panel-metric-card">
          <div class="panel-metric-label">Safe Until</div>
          <div class="panel-metric-value" id="safe-until-val">—</div>
          <div class="panel-metric-sub" id="safe-until-proj">Collecting data…</div>
        </div>
      </div>

      <!-- 추세 차트 -->
      <div class="card panel-trend-card">
        <div class="panel-chart-header">Utilization Trend</div>
        <div class="panel-trend-wrap">
          <canvas id="chart-trend"></canvas>
          <div class="panel-empty" id="trend-empty" style="display:none">Collecting data…</div>
        </div>
      </div>
    </div>`;
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function updatePanel(snapshot: RateLimitSnapshot): void {
  const fh = snapshot.fiveHour;
  const sd = snapshot.sevenDay;

  // 상태 배지
  const statusEl = document.getElementById('panel-status');
  if (statusEl) {
    const color = statusColor(snapshot.overallStatus);
    statusEl.innerHTML = `<span class="status-badge" style="background:${color}22;color:${color};border-color:${color}44;">${statusLabel(snapshot.overallStatus)}</span>`;
  }

  // SESSION (5h) 카드
  const fhRemEl = document.getElementById('fh-remaining');
  const fhBarFill = document.getElementById('fh-bar-fill') as HTMLElement | null;
  const fhResetEl = document.getElementById('fh-reset');
  if (fhRemEl) fhRemEl.textContent = `${fmtPct(1 - fh.utilization)} remaining`;
  if (fhBarFill) {
    fhBarFill.style.cssText = barFillWidth(fh.utilization);
    fhBarFill.dataset.status = fh.status;
  }
  if (fhResetEl) fhResetEl.textContent = `Resets in ${fmtReset(fh.msUntilReset)} · used ${fmtPct(fh.utilization)}`;

  // WEEKLY (7d) 카드
  const sdRemEl = document.getElementById('sd-remaining');
  const sdBarFill = document.getElementById('sd-bar-fill') as HTMLElement | null;
  const sdResetEl = document.getElementById('sd-reset');
  if (sdRemEl) sdRemEl.textContent = `${fmtPct(1 - sd.utilization)} remaining`;
  if (sdBarFill) {
    sdBarFill.style.cssText = barFillWidth(sd.utilization);
    sdBarFill.dataset.status = sd.status;
  }
  if (sdResetEl) sdResetEl.textContent = `Resets in ${fmtReset(sd.msUntilReset)} · used ${fmtPct(sd.utilization)}`;

  // BURN RATE 카드
  const burnRate = calcBurnRate(fhHistory);
  const burnRateEl = document.getElementById('burn-rate-val');
  const burnHrEl = document.getElementById('burn-rate-hr');
  if (burnRate !== null && burnRate > 0) {
    if (burnRateEl) burnRateEl.textContent = `${(burnRate * 100).toFixed(2)}%/min`;
    if (burnHrEl) burnHrEl.textContent = `${(burnRate * 100 * 60).toFixed(1)}%/hr`;
  } else {
    if (burnRateEl) burnRateEl.textContent = '—';
    if (burnHrEl) burnHrEl.textContent = 'Collecting data…';
  }

  // SAFE UNTIL 카드
  const safeEl = document.getElementById('safe-until-val');
  const safeProjEl = document.getElementById('safe-until-proj');
  if (burnRate !== null && burnRate > 0) {
    const resetAt = new Date(Date.now() + fh.msUntilReset);
    const safeUntil = calcSafeUntil(fh.utilization, burnRate, resetAt);
    const projRemaining = calcProjAtReset(fh.utilization, burnRate, fh.msUntilReset);
    if (safeEl) safeEl.textContent = safeUntil ? fmtTime(safeUntil) : 'After reset';
    if (safeProjEl) safeProjEl.textContent = `proj ${fmtPct(projRemaining)} left at reset`;
  } else {
    if (safeEl) safeEl.textContent = '—';
    if (safeProjEl) safeProjEl.textContent = 'Collecting data…';
  }

  updateTrendChart();
}

function updateTrendChart(): void {
  const canvas = document.getElementById('chart-trend') as HTMLCanvasElement | null;
  const emptyEl = document.getElementById('trend-empty');
  if (!canvas) return;

  if (fhHistory.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = '';
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const labels = fhHistory.map(p => {
    const d = new Date(p.t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  const fhColor = getCssVar('--c-sonnet');
  const sdColor = getCssVar('--c-opus');
  const axisColor = getCssVar('--vscode-descriptionForeground');
  const gridColor = getCssVar('--vscode-panel-border');

  const datasets = [
    {
      label: 'Session (5h)',
      data: fhHistory.map(p => p.v * 100),
      borderColor: fhColor,
      backgroundColor: fhColor + '22',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
    },
    {
      label: 'Weekly (7d)',
      data: sdHistory.map(p => p.v * 100),
      borderColor: sdColor,
      backgroundColor: sdColor + '22',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
    },
  ];

  if (trendChart) {
    trendChart.data.labels = labels;
    trendChart.data.datasets = datasets;
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
          x: { ticks: { color: axisColor, font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: gridColor } },
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
