// Webview 진입점.
// data-mode={sidebar|panel} 속성으로 두 컨텍스트 분기.
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

import { Messenger } from 'vscode-messenger-webview';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import { GetSnapshot, GetSessionDetail, GetSessions, PushSnapshot, RequestRefresh } from '../messaging/contracts';
import type { SessionDetail, SessionSummary, SnapshotPayload } from '../types';
import { fmtTokens, fmtUsd, fmtDuration } from '../utils/format';

const mode = (document.body.dataset.mode ?? 'panel') as 'sidebar' | 'panel';
const root = document.getElementById('root');

if (mode === 'sidebar') {
  initSidebar();
} else {
  initPanel();
}

// ──────────────────────────────────────────────
// SIDEBAR — messenger 연결 + 렌더링
// ──────────────────────────────────────────────

function initSidebar(): void {
  if (!root) return;

  const messenger = new Messenger();

  // 실시간 push 수신 등록 (start() 전에 등록해야 함)
  messenger.onNotification(PushSnapshot, (snapshot: SnapshotPayload) => {
    renderSidebar(snapshot);
  });

  // messenger 시작
  messenger.start();

  // 초기 로딩 placeholder
  root.innerHTML = renderSidebarSkeleton();

  // 초기 snapshot 요청
  messenger.sendRequest(GetSnapshot, HOST_EXTENSION, { range: 'today' })
    .then((snapshot: SnapshotPayload) => {
      renderSidebar(snapshot);
    })
    .catch(() => {
      renderSidebar(null);
    });

  function renderSidebar(snapshot: SnapshotPayload | null): void {
    root!.innerHTML = buildSidebarHtml(snapshot);

    // 새로고침 버튼 이벤트 바인딩 (헤더 + footer 두 버튼 모두)
    root!.querySelectorAll<HTMLButtonElement>('.js-refresh').forEach(btn => {
      btn.addEventListener('click', () => {
        console.log('[Claudepulse] RequestRefresh sent');
        messenger.sendNotification(RequestRefresh, HOST_EXTENSION);
      });
    });
  }
}

function buildSidebarHtml(snapshot: SnapshotPayload | null): string {
  const today = snapshot?.today;
  const mtd = snapshot?.monthToDate;
  const billing = snapshot?.billingWindow;
  const topProjects = snapshot?.topProjects ?? [];
  const currentWs = snapshot?.currentWorkspaceProject;

  // 5h Window 계산
  const pctRemaining = billing?.pctTimeRemaining ?? 0;
  const msRemaining = billing?.msRemaining ?? 0;
  const windowExpired = pctRemaining === 0;

  // KPI 값
  const tokensVal = today ? fmtTokens(today.totalTokens) : '—';
  const sessionCostVal = today ? fmtUsd(today.cost) : '—';
  const monthCostVal = mtd ? fmtUsd(mtd.cost) : '—';
  const sessionCountVal = today ? String(today.sessionCount) : '—';

  // 날짜 표시 (Date 직렬화 방지 — generatedAt은 postMessage 후 string이 될 수 있음)
  const todayLabel = formatTodayLabel();

  return `
    <div class="sb-layout">
      <!-- 헤더 -->
      <div class="sb-header">
        <span class="sb-header-title">Clausight</span>
        <div class="sb-header-spacer"></div>
        <button class="sb-icon-btn js-refresh" aria-label="Refresh" title="Refresh">
          <span class="sb-ico-refresh">↻</span>
        </button>
      </div>

      <!-- 현재 워크스페이스 마이크로 카드 -->
      ${currentWs ? buildWorkspaceCard(currentWs) : ''}

      <!-- Today 섹션 헤더 -->
      <div class="sb-section-hdr">
        <span class="sb-section-arrow">›</span>
        <span class="sb-section-label">Today</span>
        <span class="sb-section-right">${todayLabel}</span>
      </div>

      <!-- KPI 2x2 그리드 -->
      <div class="sb-kpi-grid">
        ${buildKpiCard('Tokens', tokensVal, 'var(--c-sonnet)')}
        ${buildKpiCard('Session $', sessionCostVal, 'var(--c-warn)')}
        ${buildKpiCard('Month $', monthCostVal, 'var(--c-opus)')}
        ${buildKpiCard('Sessions', sessionCountVal, 'var(--c-haiku)')}
      </div>

      <!-- 5h Window 카드 -->
      <div class="sb-window-wrap">
        <div class="card sb-window-card">
          <div class="sb-window-row-top">
            <span class="sb-window-dot" style="background:var(--c-sonnet);"></span>
            <span class="kpi-label">5h Window</span>
            <span class="sb-window-reset-label">${windowExpired ? 'expired' : 'resets in'}</span>
          </div>
          ${windowExpired
            ? `<div class="sb-window-expired">Window expired</div>`
            : `<div class="sb-window-row-mid">
                <span class="mono sb-window-pct">${pctRemaining.toFixed(1)}%</span>
                <span class="sb-window-rem-label">remaining</span>
                <span class="mono sb-window-duration">${fmtDuration(msRemaining)}</span>
              </div>`
          }
          <div class="progress sb-window-progress">
            <div style="width:${Math.min(100, Math.max(0, pctRemaining))}%;"></div>
          </div>
        </div>
      </div>

      <!-- Top Projects 섹션 헤더 -->
      <div class="sb-section-hdr">
        <span class="sb-section-arrow">›</span>
        <span class="sb-section-label">Top Projects</span>
        <span class="sb-section-right">today</span>
      </div>

      <!-- Top Projects 목록 -->
      <div class="sb-projects">
        ${buildProjectsList(topProjects)}
      </div>

      <!-- Footer -->
      <div class="sb-footer">
        <button class="btn-ghost sb-refresh-btn js-refresh" aria-label="Refresh data">
          <span>↻</span>
          <span>Refresh</span>
        </button>
      </div>
    </div>
  `;
}

function buildWorkspaceCard(ws: { displayName: string; cost: number }): string {
  return `
    <div class="sb-ws-card card">
      <span class="sb-ws-accent-bar"></span>
      <span class="sb-ws-name" title="${escapeHtml(ws.displayName)}">${escapeHtml(ws.displayName)}</span>
      <span class="mono sb-ws-cost">${fmtUsd(ws.cost)} this month</span>
    </div>
  `;
}

function buildKpiCard(label: string, value: string, accent: string): string {
  return `
    <div class="card sb-kpi-card">
      <div class="sb-kpi-row-top">
        <span class="sb-kpi-dot" style="background:${accent};"></span>
        <span class="kpi-label">${label}</span>
      </div>
      <div class="mono kpi-value sb-kpi-value">${value}</div>
    </div>
  `;
}

function buildProjectsList(projects: Array<{ displayName: string; cost: number; totalTokens: number }>): string {
  if (projects.length === 0) {
    return `<div class="sb-no-data">No data yet</div>`;
  }

  const accentColors = ['var(--c-sonnet)', 'var(--c-opus)', 'var(--c-haiku)'];

  return projects.slice(0, 3).map((p, i) => {
    const color = accentColors[i] ?? 'var(--c-slate)';
    return `
      <div class="row-strip sb-proj-row">
        <span class="sb-proj-dot" style="background:${color};"></span>
        <div class="sb-proj-info">
          <div class="sb-proj-name" title="${escapeHtml(p.displayName)}">${escapeHtml(p.displayName)}</div>
          <div class="mono sb-proj-meta">${fmtTokens(p.totalTokens)} · ${fmtUsd(p.cost)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSidebarSkeleton(): string {
  return `<div class="sb-layout"><div class="sb-loading">Loading…</div></div>`;
}

function formatTodayLabel(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ──────────────────────────────────────────────
// PANEL (기존 코드 — 건드리지 않음)
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// PANEL — messenger 연결 + Chart.js 렌더링
// ──────────────────────────────────────────────

let stackedChart: Chart | null = null;
let donutChart: Chart | null = null;

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function initPanel(): void {
  if (!root) return;
  root.innerHTML = buildPanelShell();

  const messenger = new Messenger();
  messenger.onNotification(PushSnapshot, (snapshot) => updatePanelData(snapshot));
  messenger.start();

  bindPanelTabs(messenger);

  messenger.sendRequest(GetSnapshot, HOST_EXTENSION, { range: '30d' })
    .then(snapshot => updatePanelData(snapshot))
    .catch(() => { /* no initial data */ });
}

function buildPanelShell(): string {
  return `
    <div class="panel-root">
      <div class="panel-header">
        <span class="panel-title">Claudepulse</span>
      </div>
      <div class="panel-kpi-grid">
        <div class="kpi-big" id="p-tokens">
          <span class="kpi-big-dot" style="background:var(--c-sonnet)"></span>
          <span class="kpi-big-label">Tokens · Today</span>
          <span class="kpi-big-value" id="p-tokens-val">—</span>
          <span class="kpi-big-sub" id="p-tokens-sub">in / out / cache</span>
        </div>
        <div class="kpi-big" id="p-mtd">
          <span class="kpi-big-dot" style="background:var(--c-opus)"></span>
          <span class="kpi-big-label">Month-to-date</span>
          <span class="kpi-big-value" id="p-mtd-val">—</span>
          <span class="kpi-big-sub" id="p-mtd-sub">cost</span>
        </div>
        <div class="kpi-big" id="p-sessions">
          <span class="kpi-big-dot" style="background:var(--c-haiku)"></span>
          <span class="kpi-big-label">Sessions · 30d</span>
          <span class="kpi-big-value" id="p-sessions-val">—</span>
          <span class="kpi-big-sub">unique sessions</span>
        </div>
        <div class="kpi-big" id="p-window">
          <span class="kpi-big-dot" style="background:var(--c-warn)"></span>
          <span class="kpi-big-label">5h Window</span>
          <span class="kpi-big-value" id="p-window-val">—%</span>
          <span class="kpi-big-sub" id="p-window-sub">resets in --:--:--</span>
        </div>
      </div>
      <div class="panel-tabs-bar">
        <button class="panel-tab active" data-tab="overview">Overview</button>
        <button class="panel-tab" data-tab="sessions">Sessions</button>
      </div>
      <div class="panel-tab-content" id="tab-overview">
        <div class="panel-charts-grid">
          <div class="card panel-chart-card">
            <div class="panel-chart-header">Token usage · 30 days</div>
            <div class="panel-chart-wrap" id="stacked-wrap">
              <canvas id="chart-stacked"></canvas>
              <div class="panel-empty" id="stacked-empty" style="display:none">No data yet</div>
            </div>
          </div>
          <div class="card panel-chart-card">
            <div class="panel-chart-header">Projects · 30d</div>
            <div class="panel-chart-wrap" id="donut-wrap">
              <canvas id="chart-donut"></canvas>
              <div class="panel-empty" id="donut-empty" style="display:none">No data yet</div>
            </div>
          </div>
        </div>
      </div>
      <div class="panel-tab-content hidden" id="tab-sessions">
        <div id="sessions-list" class="sessions-list">
          <div class="panel-empty" style="padding:40px 0">Loading sessions…</div>
        </div>
        <div id="session-detail" class="session-detail" style="display:none">
          <div id="session-detail-header" class="session-detail-header"></div>
          <div class="session-detail-canvas-wrap">
            <canvas id="chart-session-detail"></canvas>
            <div class="panel-empty" id="session-detail-empty" style="display:none">No data</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

let sessionsLoaded = false;
let sessionDetailChart: Chart | null = null;

function bindPanelTabs(messenger: Messenger): void {
  document.querySelectorAll('.panel-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab ?? '';
      document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.panel-tab-content').forEach(c => c.classList.add('hidden'));
      const target = document.getElementById(`tab-${tab}`);
      if (target) target.classList.remove('hidden');
      if (tab === 'sessions' && !sessionsLoaded) {
        loadSessions(messenger);
      }
    });
  });
}

function updatePanelData(snapshot: SnapshotPayload): void {
  // KPI
  const tokensEl = document.getElementById('p-tokens-val');
  const tokensSub = document.getElementById('p-tokens-sub');
  if (tokensEl) tokensEl.textContent = fmtTokens(snapshot.today.totalTokens);
  if (tokensSub) {
    const m = snapshot.today.byModel;
    const models = Object.keys(m).map(k => `${k.split('-')[1] ?? k}: ${fmtTokens(m[k])}`).join(' · ');
    tokensSub.textContent = models || 'no usage today';
  }

  const mtdEl = document.getElementById('p-mtd-val');
  if (mtdEl) mtdEl.textContent = fmtUsd(snapshot.monthToDate.cost);

  const sessEl = document.getElementById('p-sessions-val');
  if (sessEl) sessEl.textContent = String(snapshot.monthToDate.sessionCount);

  const winEl = document.getElementById('p-window-val');
  const winSub = document.getElementById('p-window-sub');
  if (winEl) winEl.textContent = `${snapshot.billingWindow.pctTimeRemaining.toFixed(1)}%`;
  if (winSub) winSub.textContent = `resets in ${fmtDuration(snapshot.billingWindow.msRemaining)}`;

  // Charts
  updateStackedChart(snapshot.dailyBreakdown ?? []);
  updateDonutChart(snapshot.topProjects);
}

function updateStackedChart(daily: import('../types').DailyStats[]): void {
  const canvas = document.getElementById('chart-stacked') as HTMLCanvasElement | null;
  const emptyEl = document.getElementById('stacked-empty');
  if (!canvas) return;

  if (daily.length === 0) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = '';
    if (stackedChart) { stackedChart.destroy(); stackedChart = null; }
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const labels = daily.map(d => d.date.slice(5)); // MM-DD
  const allModels = [...new Set(daily.flatMap(d => Object.keys(d.byModel)))];
  const modelColors: Record<string, string> = {
    opus: getCssVar('--c-opus'),
    sonnet: getCssVar('--c-sonnet'),
    haiku: getCssVar('--c-haiku'),
  };

  const datasets = allModels.map(model => {
    const shortKey = Object.keys(modelColors).find(k => model.includes(k)) ?? 'slate';
    const color = modelColors[shortKey] ?? getCssVar('--c-slate');
    return {
      label: model,
      data: daily.map(d => d.byModel[model] ?? 0),
      backgroundColor: color + '66',
      borderColor: color,
      borderWidth: 1,
      fill: true,
    };
  });

  const axisColor = getCssVar('--vscode-descriptionForeground');
  const gridColor = getCssVar('--vscode-panel-border');

  if (stackedChart) {
    stackedChart.data.labels = labels;
    stackedChart.data.datasets = datasets;
    stackedChart.update();
  } else {
    stackedChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: axisColor, boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { stacked: true, ticks: { color: axisColor, font: { size: 10 } }, grid: { color: gridColor } },
          y: { stacked: true, ticks: { color: axisColor, font: { size: 10 } }, grid: { color: gridColor } },
        },
      },
    });
  }
}

function updateDonutChart(projects: import('../types').ProjectSummary[]): void {
  const canvas = document.getElementById('chart-donut') as HTMLCanvasElement | null;
  const emptyEl = document.getElementById('donut-empty');
  if (!canvas) return;

  if (projects.length === 0) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = '';
    if (donutChart) { donutChart.destroy(); donutChart = null; }
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const palette = [
    getCssVar('--c-opus'),
    getCssVar('--c-sonnet'),
    getCssVar('--c-haiku'),
    getCssVar('--c-warn'),
    getCssVar('--c-slate'),
    getCssVar('--c-danger'),
  ];

  const top5 = projects.slice(0, 5);
  const labels = top5.map(p => p.displayName);
  const data = top5.map(p => p.cost);
  const backgroundColor = top5.map((_, i) => palette[i % palette.length]);

  const axisColor = getCssVar('--vscode-descriptionForeground');

  if (donutChart) {
    donutChart.data.labels = labels;
    (donutChart.data.datasets[0] as { data: number[]; backgroundColor: string[] }).data = data;
    (donutChart.data.datasets[0] as { data: number[]; backgroundColor: string[] }).backgroundColor = backgroundColor;
    donutChart.update();
  } else {
    donutChart = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: axisColor, boxWidth: 10, font: { size: 11 } } },
        },
      },
    });
  }
}

// ──────────────────────────────────────────────
// SESSIONS — lazy load + drilldown
// ──────────────────────────────────────────────

function loadSessions(messenger: Messenger): void {
  sessionsLoaded = true;
  const listEl = document.getElementById('sessions-list');
  if (!listEl) return;

  messenger.sendRequest(GetSessions, HOST_EXTENSION, { range: '30d' })
    .then((sessions: SessionSummary[]) => {
      listEl.innerHTML = buildSessionsList(sessions);
      listEl.querySelectorAll<HTMLElement>('[data-session-id]').forEach(row => {
        row.addEventListener('click', () => {
          const sid = row.dataset.sessionId ?? '';
          showSessionDetail(messenger, sid);
        });
        row.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const sid = (e.currentTarget as HTMLElement).dataset.sessionId ?? '';
            showSessionDetail(messenger, sid);
          }
        });
      });
    })
    .catch(() => {
      listEl.innerHTML = '<div class="panel-empty">Failed to load sessions</div>';
    });
}

function showSessionDetail(messenger: Messenger, sessionId: string): void {
  const listEl = document.getElementById('sessions-list');
  const detailEl = document.getElementById('session-detail');
  const headerEl = document.getElementById('session-detail-header');
  if (!listEl || !detailEl || !headerEl) return;

  listEl.style.display = 'none';
  detailEl.style.display = '';
  headerEl.innerHTML = `
    <button class="session-back-btn" id="session-back">← Back</button>
    <span class="session-detail-loading">Loading…</span>
  `;
  document.getElementById('session-back')?.addEventListener('click', () => {
    detailEl.style.display = 'none';
    listEl.style.display = '';
  });

  messenger.sendRequest(GetSessionDetail, HOST_EXTENSION, { sessionId })
    .then((detail: SessionDetail | null) => {
      if (!detail) {
        headerEl.innerHTML = `<button class="session-back-btn" id="session-back2">← Back</button>`;
        document.getElementById('session-detail-empty')!.style.display = '';
        document.getElementById('session-back2')?.addEventListener('click', () => {
          detailEl.style.display = 'none';
          listEl.style.display = '';
        });
        return;
      }
      renderSessionDetailHeader(headerEl, detail, listEl, detailEl);
      renderSessionDetailChart(detail);
    })
    .catch(() => {
      headerEl.innerHTML = `<button class="session-back-btn" id="session-back3">← Back</button><span style="color:var(--vscode-errorForeground)">Failed to load</span>`;
      document.getElementById('session-back3')?.addEventListener('click', () => {
        detailEl.style.display = 'none';
        listEl.style.display = '';
      });
    });
}

function renderSessionDetailHeader(
  headerEl: HTMLElement,
  detail: SessionDetail,
  listEl: HTMLElement,
  detailEl: HTMLElement
): void {
  const start = new Date(detail.startedAt); // may be string after postMessage
  const timeStr = start.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  headerEl.innerHTML = `
    <button class="session-back-btn" id="session-back-detail">← Back</button>
    <div class="session-detail-meta">
      <span class="session-detail-proj">${escapeHtml(detail.displayName)}</span>
      <span class="session-detail-time">${timeStr}</span>
      <span class="mono session-detail-cost">${fmtUsd(detail.costUSD)}</span>
      <span class="mono session-detail-tokens">${fmtTokens(detail.totalTokens)}</span>
    </div>
  `;
  document.getElementById('session-back-detail')?.addEventListener('click', () => {
    detailEl.style.display = 'none';
    listEl.style.display = '';
  });
}

function renderSessionDetailChart(detail: SessionDetail): void {
  const canvas = document.getElementById('chart-session-detail') as HTMLCanvasElement | null;
  const emptyEl = document.getElementById('session-detail-empty');
  if (!canvas) return;

  if (sessionDetailChart) { sessionDetailChart.destroy(); sessionDetailChart = null; }

  if (!detail.timeSeries || detail.timeSeries.length === 0) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const labels = detail.timeSeries.map(b => {
    const d = new Date(b.bucketStart);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const data = detail.timeSeries.map(b => b.tokens);
  const color = getCssVar('--c-sonnet');
  const axisColor = getCssVar('--vscode-descriptionForeground');
  const gridColor = getCssVar('--vscode-panel-border');

  sessionDetailChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Tokens',
        data,
        backgroundColor: color + '33',
        borderColor: color,
        borderWidth: 2,
        fill: true,
        pointRadius: 3,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: axisColor, font: { size: 10 } }, grid: { color: gridColor } },
        y: { ticks: { color: axisColor, font: { size: 10 } }, grid: { color: gridColor } },
      },
    },
  });
}

function buildSessionsList(sessions: SessionSummary[]): string {
  if (sessions.length === 0) {
    return '<div class="panel-empty" style="padding:40px 0">No sessions in the last 30 days</div>';
  }
  return sessions.map(s => {
    const start = new Date(s.startedAt);
    const timeStr = start.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="session-row" data-session-id="${escapeHtml(s.sessionId)}" role="button" tabindex="0" aria-label="Session from ${timeStr}">
        <div class="session-row-left">
          <div class="session-time">${timeStr}</div>
          <div class="session-proj">${escapeHtml(s.displayName)}</div>
        </div>
        <div class="session-row-mid">
          ${buildModelMiniBar(s.modelBreakdown, s.totalTokens)}
        </div>
        <div class="session-row-right">
          <div class="mono session-tokens">${fmtTokens(s.totalTokens)}</div>
          <div class="mono session-cost">${fmtUsd(s.costUSD)}</div>
          <div class="session-duration">${fmtDuration(s.durationMs)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function buildModelMiniBar(modelBreakdown: Record<string, number>, totalTokens: number): string {
  if (totalTokens === 0) return '<div class="model-mini-bar"></div>';
  const colorMap: Record<string, string> = {
    opus: 'var(--c-opus)',
    sonnet: 'var(--c-sonnet)',
    haiku: 'var(--c-haiku)',
  };
  const segs = Object.entries(modelBreakdown).map(([model, tokens]) => {
    const pct = (tokens / totalTokens) * 100;
    const key = Object.keys(colorMap).find(k => model.includes(k)) ?? '';
    const color = colorMap[key] ?? 'var(--c-slate)';
    return `<div class="model-mini-bar-seg" style="width:${pct.toFixed(1)}%;background:${color};" title="${model}"></div>`;
  });
  return `<div class="model-mini-bar">${segs.join('')}</div>`;
}

function kpiBigCard(label: string, value: string, sub: string, accent: string): string {
  return `
    <div class="card" style="padding:16px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${accent};display:inline-block;"></span>
        <span style="font-size:11px;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.04em;">${label}</span>
      </div>
      <div class="mono" style="font-size:28px;margin-top:10px;font-weight:600;color:var(--vscode-foreground);letter-spacing:-.02em;">${value}</div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px;font-family:var(--ff-mono);">${sub}</div>
    </div>
  `;
}
