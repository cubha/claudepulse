// Webview 진입점.
// data-mode={sidebar|panel} 속성으로 두 컨텍스트 분기.
import { Chart, registerables } from 'chart.js';
import { Messenger } from 'vscode-messenger-webview';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import { GetRateLimit, PushPollerError, PushRateLimit, RequestLogin, RequestRefresh } from '../messaging/contracts';
import type { PollerError, RateLimitSnapshot, UnifiedWindow } from '../types';

Chart.register(...registerables);

// VS Code webview 글로벌 — 비webview 환경에서는 undefined
declare function acquireVsCodeApi(): unknown;

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

function barFillStyle(utilization: number, status: UnifiedWindow['status']): string {
  const color = statusColor(status);
  const pct = Math.min(100, Math.max(0, utilization * 100));
  return `width:${pct}%;background:${color};`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ──────────────────────────────────────────────
// SIDEBAR
// ──────────────────────────────────────────────

function initSidebar(): void {
  if (!root) return;

  // acquireVsCodeApi가 없으면 non-webview 환경 — 명확한 에러 표시
  if (typeof acquireVsCodeApi === 'undefined') {
    root.innerHTML = `<div style="padding:12px;color:#f48771;font-size:12px;">
      acquireVsCodeApi not available.<br>This view must run inside VS Code.
    </div>`;
    return;
  }

  const messenger = new Messenger();

  let lastError: PollerError | null = null;

  messenger.onNotification(PushRateLimit, (snapshot) => {
    lastError = null;
    renderSidebar(snapshot, null);
  });

  messenger.onNotification(PushPollerError, (error) => {
    lastError = error;
    renderSidebar(null, error);
  });

  messenger.start();

  root.innerHTML = `<div class="sb-layout"><div class="sb-loading">Connecting to Anthropic API…</div></div>`;

  messenger.sendRequest(GetRateLimit, HOST_EXTENSION, undefined)
    .then((snapshot) => renderSidebar(snapshot, null))
    .catch(() => renderSidebar(null, lastError));

  function renderSidebar(snapshot: RateLimitSnapshot | null, error: PollerError | null): void {
    root!.innerHTML = buildSidebarHtml(snapshot, error);
    root!.querySelectorAll<HTMLButtonElement>('.js-refresh').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestRefresh, HOST_EXTENSION));
    });
    root!.querySelectorAll<HTMLButtonElement>('.js-login').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestLogin, HOST_EXTENSION));
    });
  }
}

function buildSidebarHtml(snapshot: RateLimitSnapshot | null, error: PollerError | null): string {
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
        <span class="sb-gen-time">updated just now</span>
      </div>

      <!-- 5h 세션 섹션 -->
      <div class="sb-section-hdr">
        <span class="sb-section-dot" style="background:var(--c-sonnet);"></span>
        <span class="sb-section-label">Session (5h)</span>
        <span class="sb-section-right mono">${fmtPct(fh.utilization)}</span>
      </div>
      <div class="sb-rate-card card">
        <div class="rate-bar">
          <div class="rate-bar-fill" style="${barFillStyle(fh.utilization, fh.status)}"></div>
        </div>
        <div class="rate-meta-row">
          <span class="rate-status-chip" style="background:${statusColor(fh.status)}22;color:${statusColor(fh.status)};">${statusLabel(fh.status)}</span>
          <span class="rate-reset-label">resets in <span class="mono">${fmtReset(fh.msUntilReset)}</span></span>
        </div>
      </div>

      <!-- 7d 주간 섹션 -->
      <div class="sb-section-hdr">
        <span class="sb-section-dot" style="background:var(--c-opus);"></span>
        <span class="sb-section-label">Weekly (7d)</span>
        <span class="sb-section-right mono">${fmtPct(sd.utilization)}</span>
      </div>
      <div class="sb-rate-card card">
        <div class="rate-bar">
          <div class="rate-bar-fill" style="${barFillStyle(sd.utilization, sd.status)}"></div>
        </div>
        <div class="rate-meta-row">
          <span class="rate-status-chip" style="background:${statusColor(sd.status)}22;color:${statusColor(sd.status)};">${statusLabel(sd.status)}</span>
          <span class="rate-reset-label">resets in <span class="mono">${fmtReset(sd.msUntilReset)}</span></span>
        </div>
      </div>

      <!-- Footer -->
      <div class="sb-footer">
        <button class="btn-ghost sb-refresh-btn js-refresh" aria-label="Refresh data">
          <span>↻</span><span>Refresh</span>
        </button>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────
// PANEL
// ──────────────────────────────────────────────

// 폴링 이력 (메모리 내, 최대 288포인트 = 5분 × 288 = 24h)
const MAX_HISTORY = 288;
const fhHistory: Array<{ t: Date; v: number }> = [];
const sdHistory: Array<{ t: Date; v: number }> = [];

let fhGauge: Chart | null = null;
let sdGauge: Chart | null = null;
let trendChart: Chart | null = null;

function initPanel(): void {
  if (!root) return;
  root.innerHTML = buildPanelShell();

  const messenger = new Messenger();
  messenger.onNotification(PushRateLimit, (snapshot) => {
    recordHistory(snapshot);
    updatePanel(snapshot);
  });
  messenger.start();

  messenger.sendRequest(GetRateLimit, HOST_EXTENSION, undefined)
    .then((snapshot) => {
      recordHistory(snapshot);
      updatePanel(snapshot);
    })
    .catch(() => {
      const el = document.getElementById('panel-status');
      if (el) el.textContent = 'Unable to load — check credentials';
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

      <!-- 게이지 그리드 -->
      <div class="panel-gauge-grid">
        <div class="card panel-gauge-card">
          <div class="panel-gauge-label">Session (5h)</div>
          <div class="panel-gauge-wrap">
            <canvas id="chart-fh-gauge"></canvas>
            <div class="panel-gauge-center" id="fh-pct">—</div>
          </div>
          <div class="panel-gauge-sub" id="fh-reset">—</div>
        </div>
        <div class="card panel-gauge-card">
          <div class="panel-gauge-label">Weekly (7d)</div>
          <div class="panel-gauge-wrap">
            <canvas id="chart-sd-gauge"></canvas>
            <div class="panel-gauge-center" id="sd-pct">—</div>
          </div>
          <div class="panel-gauge-sub" id="sd-reset">—</div>
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

  // 상태 표시
  const statusEl = document.getElementById('panel-status');
  if (statusEl) {
    const color = statusColor(snapshot.overallStatus);
    statusEl.innerHTML = `<span class="status-badge" style="background:${color}22;color:${color};border-color:${color}44;">${statusLabel(snapshot.overallStatus)}</span>`;
  }

  // 5h 게이지
  document.getElementById('fh-pct')!.textContent = fmtPct(fh.utilization);
  document.getElementById('fh-reset')!.textContent = `resets in ${fmtReset(fh.msUntilReset)}`;
  updateGauge('chart-fh-gauge', fh, 'fhGauge');

  // 7d 게이지
  document.getElementById('sd-pct')!.textContent = fmtPct(sd.utilization);
  document.getElementById('sd-reset')!.textContent = `resets in ${fmtReset(sd.msUntilReset)}`;
  updateGauge('chart-sd-gauge', sd, 'sdGauge');

  // 추세 차트
  updateTrendChart();
}

function updateGauge(canvasId: string, window: UnifiedWindow, chartVar: 'fhGauge' | 'sdGauge'): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;

  const used = window.utilization;
  const remaining = Math.max(0, 1 - used);
  const color = statusColor(window.status);
  const trackColor = getCssVar('--vscode-panel-border') || '#333';

  const data = {
    datasets: [{
      data: [used, remaining],
      backgroundColor: [color, trackColor],
      borderWidth: 0,
      circumference: 270,
      rotation: -135,
    }],
  };

  const existing = chartVar === 'fhGauge' ? fhGauge : sdGauge;
  if (existing) {
    existing.data = data;
    existing.update();
  } else {
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 400 },
      },
    });
    if (chartVar === 'fhGauge') fhGauge = chart;
    else sdGauge = chart;
  }
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
