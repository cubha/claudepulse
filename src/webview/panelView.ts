// 대시보드 패널(WebviewPanel) 전용 렌더링 (v0.1.54 ST5 — main.ts에서 기계적 추출).
import { Chart, registerables } from 'chart.js';
import { Messenger } from 'vscode-messenger-webview';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import {
  GetLang, GetPollHistory, GetRateLimit, GetRetroSummary, GetUsageSummary, PushLang,
  PushRateLimit, PushRetroSummary, PushUsageSummary, RequestRefresh,
} from '../messaging/contracts';
import type { RateLimitSnapshot, SessionSummary, UsageSummary } from '../types';
import { setLang, t } from './i18n';
import { escapeHtml, fmtCost, formatErrorHtml } from './format';
import { renderRetro } from './retroView';
import { calcSafeUntil, calcProjAtReset, deriveBurnState, burnStateLabelKey, type PollPoint } from './burnRate';
import { vsApi } from './webviewApi';
import {
  fmtPct, fmtReset, fmtTime, statusLabel, fmtPlanTier, fmtTokens, modelKind, modelShortName,
  barFillWidth, buildCalendarHtml, CALENDAR_WINDOW_DAYS, FH_WINDOW_MS,
} from './webviewShared';

Chart.register(...registerables);

const root = document.getElementById('root');

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
let cacheSparkChart: Chart | null = null;
let chartScopeMin = 120; // 기본 2h
let longTermScopeDays = 30;
let attrScope: 'all' | '24h' | '7d' = 'all';
let panelUsage: UsageSummary | null = null;
let lastPanelSnapshot: RateLimitSnapshot | null = null;
// 회고 섹션은 extension에 lazy 요청(GetRetroSummary)하므로 messenger 참조 보관
let panelMessenger: InstanceType<typeof Messenger> | null = null;

function destroyCharts(): void {
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  if (dailyChart) { dailyChart.destroy(); dailyChart = null; }
  if (modelChart) { modelChart.destroy(); modelChart = null; }
  if (toolChart) { toolChart.destroy(); toolChart = null; }
  if (longTermChart) { longTermChart.destroy(); longTermChart = null; }
  if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
  if (cacheSparkChart) { cacheSparkChart.destroy(); cacheSparkChart = null; }
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
  document.querySelectorAll<HTMLButtonElement>('.attr-scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      attrScope = (btn.dataset.scope as 'all' | '24h' | '7d') || 'all';
      document.querySelectorAll('.attr-scope-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSkillSection();
    });
  });
}

function rebuildPanelDom(messenger: InstanceType<typeof Messenger>): void {
  destroyCharts();
  if (root) root.innerHTML = buildPanelShell();
  // buildPanelShell()은 항상 scope 토글을 기본값(active)으로 그린다 — 재빌드 후에도
  // 이전 선택이 남아있으면 active 표시(전체)와 실제 렌더 데이터(예: 7d)가 어긋난다.
  chartScopeMin = 120;
  longTermScopeDays = 30;
  attrScope = 'all';
  wirePanelButtons(messenger);
}

export function initPanel(): void {
  if (!root) return;
  root.innerHTML = buildPanelShell();

  let messenger: InstanceType<typeof Messenger>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messenger = new Messenger(vsApi as any);
  } catch (err) {
    const el = document.getElementById('panel-status');
    if (el) el.innerHTML = `<span style="color:var(--vscode-errorForeground)">Messenger init failed: ${formatErrorHtml(err)}</span>`;
    return;
  }
  panelMessenger = messenger;

  messenger.onNotification(PushRateLimit, (snapshot) => {
    lastPanelSnapshot = snapshot;
    recordHistory(snapshot);
    updatePanel(snapshot);
  });

  messenger.onNotification(PushUsageSummary, (usage) => {
    panelUsage = usage;
    updateUsageSection();
  });

  // 회고 push 수신(주 경로). pull(updateRetroSection)은 first-paint fallback로 유지 —
  // 락다운 환경에서 요청 라운드트립 불발해도 push로 "수집 중" 고착을 푼다.
  messenger.onNotification(PushRetroSummary, (retro) => {
    const listEl = document.getElementById('panel-retro-list');
    if (listEl) renderRetro(listEl, retro);
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
    if (el) el.innerHTML = `<span style="color:var(--vscode-errorForeground)">Messenger start failed: ${formatErrorHtml(err)}</span>`;
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
      if (el) el.innerHTML = `<span style="color:var(--vscode-descriptionForeground);font-size:12px;">${t('waiting_poll')}</span>`;
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

      <!-- Usage Calendar 히트맵 (v0.1.43) — 고정 1년(53주) 뷰, 토글 없음(GitHub 관례) -->
      <div class="card panel-trend-card" id="panel-calendar-card">
        <div class="panel-chart-header">${t('usage_calendar')}</div>
        <div id="panel-calendar-body"><div class="panel-loading">${t('collecting_data')}</div></div>
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

      <!-- usage×git 회고 — 커밋별 비용 귀속 (근사치·미귀속 버킷 1급) -->
      <div class="card panel-retro-card" id="panel-retro-card">
        <div class="panel-chart-header">
          <span>${t('usage_git_retro')}</span>
          <span class="retro-approx-badge" title="${t('retro_disclaimer')}">${t('retro_approx_badge')}</span>
        </div>
        <div id="panel-retro-list"><div class="panel-loading">${t('collecting_data')}</div></div>
      </div>

      <!-- 비용 귀속 — 스킬별 비용 + 서브에이전트 소비 + MCP 서버별 호출 -->
      <div class="card panel-skill-card" id="panel-skill-card">
        <div class="panel-chart-header">
          <span>${t('skill_attribution')}</span>
          <span class="retro-approx-badge" title="${t('skill_scope_disclaimer')}">${t('skill_scope_badge')}</span>
        </div>
        <div class="chart-scope-row">
          <span class="chart-scope-label">${t('scope_label')}:</span>
          <button class="attr-scope-btn active" data-scope="all">${t('attr_scope_all')}</button>
          <button class="attr-scope-btn" data-scope="24h">${t('attr_scope_24h')}</button>
          <button class="attr-scope-btn" data-scope="7d">${t('attr_scope_7d')}</button>
        </div>
        <div id="panel-skill-list"><div class="panel-loading">${t('collecting_data')}</div></div>
        <div class="panel-mcp-header">${t('mcp_attribution')}</div>
        <div id="panel-mcp-list"><div class="panel-loading">${t('collecting_data')}</div></div>
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
  updateUsageCalendar();
  updateModelBreakdown();
  updateCacheSection();
  updateToolChart();
  updateFilesList();
  updateSessionList();
  updateBranchSection();
  updateSkillSection();
  updateRetroSection();
  updateLongTermSection();
  updateMonthlyChart();
}

/**
 * 회고 섹션 — extension에 GetRetroSummary lazy 요청 후 렌더.
 * git log는 HEAD SHA로 캐시되므로 반복 호출이 저렴하다.
 */
function updateRetroSection(): void {
  const listEl = document.getElementById('panel-retro-list');
  if (!listEl || !panelMessenger) return;
  void panelMessenger.sendRequest(GetRetroSummary, HOST_EXTENSION, undefined)
    .then((retro) => renderRetro(listEl, retro))
    .catch(() => { listEl.innerHTML = `<div class="panel-empty">${t('no_retro_data')}</div>`; });
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


/**
 * 대시보드 Usage Calendar — 고정 1년 그리드를 오늘 기준으로 항상 렌더한다. 실제 데이터 범위로
 * 트림하면 카드 폭 대비 그리드가 작아 보여 "안 하느니만 못한" 인상을 준다(GitHub 등 실제 캘린더
 * 관행과 동일하게 데이터 없는 날은 heat-0로 채워 고정 폭을 유지).
 */
function updateUsageCalendar(): void {
  const bodyEl = document.getElementById('panel-calendar-body');
  if (!bodyEl) return;

  // 재렌더(innerHTML 교체)는 스크롤 상태를 지운다 — 사용자가 과거로 스크롤해둔 위치는 보존하고,
  // 우측 끝(기본)에 있었거나 첫 렌더면 갱신 후에도 우측 끝(오늘)을 유지한다.
  const prevArea = bodyEl.querySelector('.calendar-grid-area');
  const prevScrollLeft = prevArea && prevArea.scrollLeft < prevArea.scrollWidth - prevArea.clientWidth - 2
    ? prevArea.scrollLeft
    : null;

  const allDays = panelUsage?.historicalDays ?? [];
  const hasData = allDays.some(d => d.costUsd > 0 || d.totalTokens > 0);
  if (!hasData) {
    bodyEl.innerHTML = `<div class="panel-loading">${t('collecting_data')}</div>`;
    return;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  bodyEl.innerHTML = buildCalendarHtml(allDays, CALENDAR_WINDOW_DAYS, todayKey, true);

  // 카드 폭 < 그리드 고정폭이면 좌측(과거)부터 보이는 게 기본인데, 최신 주가 화면 밖으로
  // 밀려 "사용내역 없음"처럼 보인다 — 기본 스크롤을 오른쪽 끝(오늘)으로 정렬(GitHub 관례).
  const gridArea = bodyEl.querySelector('.calendar-grid-area');
  if (gridArea) gridArea.scrollLeft = prevScrollLeft ?? gridArea.scrollWidth;
}

function modelColor(model: string): string {
  const k = modelKind(model);
  return getCssVar(k === 'other' ? '--c-slate' : `--c-${k}`);
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
            label: (ctx: { parsed: unknown }) => ` ${fmtCost(ctx.parsed as number)}`,
          },
        },
      },
      cutout: '65%',
      borderColor: borderColor,
      color: axisColor,
    } as ConstructorParameters<typeof Chart>[1]['options'],
  });
}

function updateCacheSection(): void {
  const bodyEl = document.getElementById('panel-cache-body');
  if (!bodyEl) return;

  // innerHTML 재설정으로 기존 canvas가 제거되므로 이전 차트를 먼저 정리(누수 방지).
  if (cacheSparkChart) { cacheSparkChart.destroy(); cacheSparkChart = null; }

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
    cacheSparkChart = new Chart(canvas, {
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

  const scoped = attrScope === '24h' ? panelUsage?.attributionScopes.last24h
    : attrScope === '7d' ? panelUsage?.attributionScopes.last7d
    : undefined;
  const skills = scoped?.skillBreakdown ?? panelUsage?.skillBreakdown ?? [];
  const sub = scoped?.subagentStats ?? panelUsage?.subagentStats;
  const unattr = scoped?.skillUnattributed ?? panelUsage?.skillUnattributed;
  const mcpServers = scoped?.mcpServerBreakdown ?? panelUsage?.mcpServerBreakdown ?? [];

  const mcpListEl = document.getElementById('panel-mcp-list');
  if (mcpListEl) {
    if (mcpServers.length === 0) {
      mcpListEl.innerHTML = `<div class="panel-empty">${t('no_mcp_data')}</div>`;
    } else {
      const maxMcpShare = mcpServers[0]?.share || 1;
      mcpListEl.innerHTML = mcpServers.map(m => {
        const w = Math.max(2, (m.share / maxMcpShare) * 100);
        return `<div class="skill-row" title="${escapeHtml(m.server)} · ${(m.share * 100).toFixed(1)}%">
          <span class="skill-name">${escapeHtml(m.server)}</span>
          <span class="skill-bar-wrap"><span class="skill-bar" style="width:${w}%"></span></span>
          <span class="skill-cost mono">${m.callCount}</span>
        </div>`;
      }).join('');
    }
  }

  // 서브에이전트 소비 요약 라인 (#8)
  let subLine = '';
  if (sub && sub.subagentCostUsd > 0) {
    const pct = (sub.subagentShare * 100).toFixed(0);
    subLine = `<div class="skill-subagent-line">
      <span>${t('subagent_consumption')}</span>
      <span class="mono">${pct}% · ${fmtCost(sub.subagentCostUsd)} · ${sub.subagentCount} ${t('agents_label')}</span>
    </div>`;
  }

  // 스킬 외 작업 버킷 (1급) — !isSidechain && !attributionSkill
  const hasBucket = !!unattr && unattr.costUsd > 0;
  if (skills.length === 0 && !hasBucket) {
    listEl.innerHTML = subLine || `<div class="panel-empty">${t('no_skill_data')}</div>`;
    return;
  }

  // share 분모(grand-total)는 aggregator에서 반영됨. 버킷 share는 동일 분모로 webview 산출.
  const grandTotal = skills.reduce((s, x) => s + x.costUsd, 0) + (hasBucket ? unattr!.costUsd : 0);
  const bucketShare = grandTotal > 0 && hasBucket ? unattr!.costUsd / grandTotal : 0;

  // 비용 비중 바 (단일 액센트 — 6+1 cap 준수). 바 스케일은 버킷 포함 최대치 기준.
  const top = skills.slice(0, 8);
  const maxShare = Math.max(top[0]?.share || 0, bucketShare) || 1;
  const rows = top.map(s => {
    const w = Math.max(2, (s.share / maxShare) * 100);
    return `<div class="skill-row" title="${escapeHtml(s.skill)} · ${(s.share * 100).toFixed(1)}%">
      <span class="skill-name">${escapeHtml(s.skill)}</span>
      <span class="skill-bar-wrap"><span class="skill-bar" style="width:${w}%"></span></span>
      <span class="skill-cost mono">${fmtCost(s.costUsd)}</span>
    </div>`;
  }).join('');

  // 버킷 행은 스킬 행과 동등(1급)하되 muted — "Other" 관례상 마지막 배치. 숨김/0표시 금지.
  const bucketRow = hasBucket ? `<div class="skill-row skill-row-other" title="${t('skill_unattributed_tip')} · ${(bucketShare * 100).toFixed(1)}%">
      <span class="skill-name">${t('skill_unattributed')}</span>
      <span class="skill-bar-wrap"><span class="skill-bar skill-bar-other" style="width:${Math.max(2, (bucketShare / maxShare) * 100)}%"></span></span>
      <span class="skill-cost mono">${fmtCost(unattr!.costUsd)}</span>
    </div>` : '';

  listEl.innerHTML = subLine + rows + bucketRow;
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

  // BURN RATE 카드 — deriveBurnState()로 idle/window_reset을 "수집 중" 고착과 구분
  const burnState = deriveBurnState(fhHistory, fh.utilization, fh.msUntilReset, FH_WINDOW_MS);
  const burnRateEl = document.getElementById('burn-rate-val');
  const burnHrEl = document.getElementById('burn-rate-hr');
  if (burnState.rate !== null) {
    const estSuffix = burnState.isEstimate ? ` (${t('est_label')})` : '';
    const idleSuffix = burnState.kind === 'idle' ? ` · ${t('idle_label')}` : '';
    if (burnRateEl) burnRateEl.textContent = `${(burnState.rate * 100).toFixed(2)}%/min`;
    if (burnHrEl) burnHrEl.textContent = `${(burnState.rate * 100 * 60).toFixed(1)}%/hr${estSuffix}${idleSuffix}`;
  } else {
    if (burnRateEl) burnRateEl.textContent = '—';
    if (burnHrEl) burnHrEl.textContent = t(burnStateLabelKey(burnState.kind));
  }

  // SAFE UNTIL 카드
  const safeEl = document.getElementById('safe-until-val');
  const safeProjEl = document.getElementById('safe-until-proj');
  if (burnState.rate !== null && burnState.rate > 0) {
    const resetAt = new Date(Date.now() + fh.msUntilReset);
    const safeUntil = calcSafeUntil(fh.utilization, burnState.rate, resetAt);
    const projRemaining = calcProjAtReset(fh.utilization, burnState.rate, fh.msUntilReset);
    if (safeEl) safeEl.textContent = safeUntil ? fmtTime(safeUntil) : t('after_reset');
    if (safeProjEl) safeProjEl.textContent = `${t('proj')} ${fmtPct(projRemaining)} ${t('left_at_reset')}${burnState.isEstimate ? ` (${t('est_label')})` : ''}`;
  } else {
    if (safeEl) safeEl.textContent = '—';
    // idle(rate=0)도 이 분기로 온다 — 소모가 없으니 소진 시각이 없을 뿐 "수집 중"이 아니다.
    if (safeProjEl) safeProjEl.textContent = t(burnStateLabelKey(burnState.kind));
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
