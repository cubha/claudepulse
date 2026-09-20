// 대시보드 패널(WebviewPanel) 전용 렌더링 (v0.1.54 ST5 — main.ts에서 기계적 추출).
import { Chart, registerables, type ChartDataset } from 'chart.js';
import { Messenger } from 'vscode-messenger-webview';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import {
  GetActiveProvider, GetCodexRateLimit, GetLang, GetPollHistory, GetRateLimit, GetRetroSummary, GetUsageSummary,
  PushActiveProvider, PushCodexRateLimit, PushLang, PushRateLimit, PushRetroSummary, PushUsageSummary, RequestRefresh,
} from '../messaging/contracts';
import type { AgentProvider, CodexRateLimitSnapshot, RateLimitSnapshot, SessionSummary, UsageSummary } from '../types';
import { setLang, t } from './i18n';
import { escapeHtml, fmtCost, formatErrorHtml } from './format';
import { renderRetro } from './retroView';
import { calcSafeUntil, calcProjAtReset, deriveBurnState, burnStateLabelKey, type PollPoint } from './burnRate';
import {
  median, THRESHOLD_LOW, THRESHOLD_HIGH, classifyCacheHitRate,
  filterQualifyingCostDays, calcCostAnomalyPct, calcPaceBaseline,
} from './metricCalc';
import { vsApi } from './webviewApi';
import {
  createCalendarScrollState, captureCalendarScroll, applyCalendarScroll,
} from './calendarScroll';
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
// 프로바이더 인지(ST6 부분, v0.2.0) — panelView.ts는 Codex 전용 게이지 위젯이 없다(burn
// rate·trend 차트가 5h/7d 고정 의미론에 깊이 결합돼 있어 이번 범위에서 재작업하지 않기로
// 결정, PLAN §7 ST6 항목 참조). 대신 Claude 전용 카드를 Codex 활성 시 숨긴다 — 잘못된
// 라벨(예: Codex 버킷을 "5H"로 표시)로 반쯤 맞는 화면을 보여주는 것보다 정직한 gap이 낫다.
let activePanelProvider: AgentProvider = 'claude';
// Codex 한도 스냅샷(verify-impl B-V1/B-V2 보완, v0.2.0) — sidebarView.ts와 동일 별도 채널
// (PushCodexRateLimit). panelView.ts는 이 메시지를 지금까지 구독하지 않고 있었다(축B가 지적한
// "지표밴드 통째 누락"의 배선 원인 — 코드 자체가 없던 게 아니라 요청조차 안 했다).
let panelCodexSnapshot: CodexRateLimitSnapshot | null = null;
// 회고 섹션은 extension에 lazy 요청(GetRetroSummary)하므로 messenger 참조 보관
let panelMessenger: InstanceType<typeof Messenger> | null = null;
/** Usage Calendar 가로 스크롤 계약 상태 — 이 모듈이 단독 소유한다(v0.1.55 결함 A). */
const panelCalendarScroll = createCalendarScrollState();

/**
 * costUsd===0이 "실측 0"인지 "가격표에 없어 계산 불가"인지 fmtCost는 구분 못한다(defer #9,
 * v0.1.55 거짓초록과 동일 부류). 세션/브랜치/스킬/서브에이전트 목록의 비용 셀에서 공용으로 쓴다
 * — 캐시절약액(updateCacheSection)·오늘비용(sidebarView.ts)은 각자의 today 스코프 판정을
 * 그대로 쓰므로 이 헬퍼를 쓰지 않는다(스코프가 다름, hasUnpricedRecords 문서 참조).
 */
function costCellHtml(costUsd: number, hasUnpriced: boolean, className: string): string {
  return hasUnpriced && costUsd === 0
    ? `<span class="${className}" title="${escapeHtml(t('pricing_unknown_note'))}">${t('pricing_unknown')}</span>`
    : `<span class="${className}">${fmtCost(costUsd)}</span>`;
}

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
  wireListMoreDelegation();
}

/**
 * "더보기/접기" 클릭 위임 (v0.1.55).
 *
 * 이 버튼은 목록 innerHTML 안에 있고 목록은 push마다 통째로 교체되므로, 버튼에 직접 리스너를
 * 걸면 첫 갱신에서 사라진다. 그래서 문서 레벨 위임 1회로 처리한다. wirePanelButtons는 셸
 * 재빌드마다 호출되므로 중복 등록을 플래그로 막는다 — 안 막으면 클릭 1회에 토글이 N번 일어나
 * 짝수 번째 재빌드부터 버튼이 먹통이 된다.
 */
let listMoreWired = false;
function wireListMoreDelegation(): void {
  if (listMoreWired) return;
  listMoreWired = true;
  document.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    const btn = target?.closest?.('.js-list-more') as HTMLElement | null;
    if (!btn) return;
    const key = btn.dataset.list;
    if (!key) return;
    listExpanded[key] = !listExpanded[key];
    LIST_UPDATERS[key]?.();
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

  messenger.onNotification(PushActiveProvider, (provider) => {
    activePanelProvider = provider;
    applyProviderVisibility();
  });

  messenger.onNotification(PushCodexRateLimit, (snapshot) => {
    panelCodexSnapshot = snapshot;
    updateCodexBandSection();
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

  void messenger.sendRequest(GetActiveProvider, HOST_EXTENSION, undefined)
    .then((provider) => { activePanelProvider = provider; applyProviderVisibility(); })
    .catch(() => undefined);

  void messenger.sendRequest(GetCodexRateLimit, HOST_EXTENSION, undefined)
    .then((snapshot) => { panelCodexSnapshot = snapshot; updateCodexBandSection(); })
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

/**
 * Claude 전용 카드를 Codex 활성 시 숨긴다(ST6 부분). 대상 6개는 전부 `RateLimitSnapshot`
 * 고정 fiveHour/sevenDay 의미론이나 회고(git)처럼 Codex가 이번 범위에서 못 채우는 데이터다 —
 * 나머지(daily/calendar/model/cache/tools/files/sessions/branch)는 UsageSummary 기반이라
 * provider 무관하게 이미 정상 동작한다(P2 codex axis 골든 캡처로 확인됨).
 */
const CLAUDE_ONLY_PANEL_IDS = [
  'panel-fh-card', 'panel-sd-card', 'panel-burn-card', 'panel-safe-card',
  'panel-util-trend-card', 'panel-skill-card', 'panel-retro-card',
] as const;

/** Codex 활성 시에만 보이는 대체 컨테이너(verify-impl B-V1/B-V2 보완) — 위 배열의 역방향. */
const CODEX_ONLY_PANEL_IDS = [
  'panel-codex-band-grid', 'panel-codex-band-note', 'panel-codex-extra-card',
] as const;

function applyProviderVisibility(): void {
  const isCodex = activePanelProvider === 'codex';
  // .provider-codex.theme-dark/.theme-light(styles.css ST9) 활성화 스위치 — sidebarView.ts와
  // 동일 이유(클래스 안 붙으면 팔레트 CSS가 죽은 채 게이트만 그린).
  document.body.classList.toggle('provider-codex', isCodex);
  for (const id of CLAUDE_ONLY_PANEL_IDS) {
    const el = document.getElementById(id);
    if (el) el.style.display = isCodex ? 'none' : '';
  }
  for (const id of CODEX_ONLY_PANEL_IDS) {
    const el = document.getElementById(id);
    if (el) el.style.display = isCodex ? '' : 'none';
  }
  // plan 배지는 fmtPlanTier(Claude subscriptionType/rateLimitTier 형식) 전용 포맷터라
  // Codex plan_type 문자열을 넣으면 형식이 안 맞는다 — Codex 전용 배지는 별건(ST9).
  const planBadgeEl = document.getElementById('panel-plan-badge');
  if (planBadgeEl && isCodex) planBadgeEl.innerHTML = '';
  updateCodexBandSection();
}

/**
 * Codex 전용 지표밴드+신규패널 렌더(verify-impl B-V1/B-V2 보완, v0.2.0). panel-fh-card류와
 * 달리 버킷 개수가 가변(window_minutes 기반, free=1개/유료=2개)이라 정적 마크업이 아니라
 * 여기서 매번 다시 그린다 — sidebarView.ts의 bucketCards 루프와 동일 라벨링 원칙 재사용
 * (KNOWN_WINDOWS 매핑값을 그대로 쓰고 새 하드코딩을 만들지 않는다).
 */
function updateCodexBandSection(): void {
  if (activePanelProvider !== 'codex') return;

  const snapshot = panelCodexSnapshot;
  const buckets = snapshot?.buckets ?? [];

  const gridEl = document.getElementById('panel-codex-band-grid');
  if (gridEl) {
    gridEl.innerHTML = buckets.map((b) => {
      const status: 'allowed' | 'allowed_warning' | 'danger' =
        b.usedPercent >= 90 ? 'danger' : b.usedPercent >= 70 ? 'allowed_warning' : 'allowed';
      const color = status === 'danger' ? 'var(--c-danger)' : status === 'allowed_warning' ? 'var(--c-warn)' : 'var(--c-sonnet)';
      const label = b.labelKey ? t(b.labelKey) : `${b.windowMinutes}min`;
      const resetMs = Math.max(0, b.resetsAt * 1000 - Date.now());
      return `
        <div class="panel-metric-card">
          <div class="panel-metric-label">${escapeHtml(label)}</div>
          <div class="panel-metric-value" style="color:${color};">${b.usedPercent.toFixed(0)}%</div>
          <div class="panel-metric-bar">
            <div class="rate-bar"><div class="rate-bar-fill" data-status="${status}" style="width:${barFillWidth(b.usedPercent / 100)};"></div></div>
          </div>
          <div class="panel-metric-sub">${t('resets_in')} ${fmtReset(resetMs)}</div>
        </div>`;
    }).join('');
  }

  // "지표 밴드도 가변" 안내(Main/Gauge-Plans.dc.html 의도) — 버킷이 실제로 있을 때만 의미가
  // 있다(스냅샷 자체가 없으면 §6 no_records 분기가 이미 화면 전체를 대체한다).
  const noteEl = document.getElementById('panel-codex-band-note');
  if (noteEl) noteEl.textContent = buckets.length > 0 ? t('codex_variable_bucket_note') : '';

  // 신규 패널 3행 — 빈 값과 0 값을 같게 그리지 않는다: 컨텍스트창은 null이면 행 자체를 숨기고,
  // 추론 토큰은 오늘 활동이 있으면 0이어도 측정값으로 보여준다(panelUsage 유무로 "오늘 활동
  // 있음"을 판정 — sidebarView.ts의 codexReasoningRow와 동일 게이트).
  const extraListEl = document.getElementById('panel-codex-extra-list');
  if (extraListEl) {
    const rows: string[] = [];
    if (panelUsage && (panelUsage.today.totalTokens > 0 || panelUsage.today.costUsd > 0)) {
      rows.push(`<div class="panel-mcp-row"><span>${t('reasoning_tokens')}</span><span class="mono">${panelUsage.todayReasoningTokens.toLocaleString()}</span></div>`);
    }
    if (snapshot?.modelContextWindow != null) {
      rows.push(`<div class="panel-mcp-row"><span>${t('codex_context_window')}</span><span class="mono">${snapshot.modelContextWindow.toLocaleString()}</span></div>`);
    }
    if (snapshot?.planType) {
      rows.push(`<div class="panel-mcp-row"><span>${t('plan_label')}</span><span class="mono">${escapeHtml(snapshot.planType.toUpperCase())}</span></div>`);
    }
    extraListEl.innerHTML = rows.length > 0 ? rows.join('') : `<div class="panel-loading">${t('collecting_data')}</div>`;
  }

  // 헤더 플랜 배지(Claude의 fmtPlanTier 배지와 동일 위치/클래스 — planType 원본 문자열만
  // 대문자화, 값별 분기 없음).
  const planBadgeEl = document.getElementById('panel-plan-badge');
  if (planBadgeEl && snapshot?.planType) {
    planBadgeEl.innerHTML = `<span class="plan-badge">${escapeHtml(snapshot.planType.toUpperCase())}</span>`;
  }
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
        <span class="panel-title">AgentVitals</span>
        <span id="panel-plan-badge"></span>
        <span class="status-badge" id="panel-status"></span>
        <div class="panel-header-spacer"></div>
        <button class="sb-icon-btn js-refresh" title="Refresh">↻</button>
      </div>
      <div id="panel-fallback-banner"></div>

      <!-- 4-카드 메트릭 그리드 -->
      <div class="panel-metric-grid">
        <div class="panel-metric-card" id="panel-fh-card">
          <div class="panel-metric-label">${t('session_5h')}</div>
          <div class="panel-metric-value" id="fh-remaining">—</div>
          <div class="panel-metric-bar">
            <div class="rate-bar">
              <div class="rate-bar-fill" id="fh-bar-fill"></div>
            </div>
          </div>
          <div class="panel-metric-sub" id="fh-reset">—</div>
        </div>
        <div class="panel-metric-card" id="panel-sd-card">
          <div class="panel-metric-label">${t('weekly_7d')}</div>
          <div class="panel-metric-value" id="sd-remaining">—</div>
          <div class="panel-metric-bar">
            <div class="rate-bar">
              <div class="rate-bar-fill" id="sd-bar-fill"></div>
            </div>
          </div>
          <div class="panel-metric-sub" id="sd-reset">—</div>
        </div>
        <div class="panel-metric-card" id="panel-burn-card">
          <div class="panel-metric-label">${t('burn_rate')}</div>
          <div class="panel-metric-value" id="burn-rate-val">—</div>
          <div class="panel-metric-sub" id="burn-rate-hr">${t('collecting_data')}</div>
        </div>
        <div class="panel-metric-card" id="panel-safe-card">
          <div class="panel-metric-label">${t('safe_until_label')}</div>
          <div class="panel-metric-value" id="safe-until-val">—</div>
          <div class="panel-metric-sub" id="safe-until-proj">${t('collecting_data')}</div>
        </div>
      </div>

      <!-- Codex 전용 가변 버킷 지표밴드(verify-impl B-V1 보완, v0.2.0) — window_minutes 개수만큼
           JS가 채운다(updateCodexBandSection). burn-rate/trend 차트 같은 이력 의존 위젯이 아니라
           panel-fh-card류와 동형인 값+bar+sub 카드라 ST6이 보류한 범위(§7) 밖이다. -->
      <div class="panel-metric-grid" id="panel-codex-band-grid" style="display:none;"></div>
      <div class="panel-codex-band-note" id="panel-codex-band-note" style="display:none;"></div>

      <!-- 추세 차트 -->
      <div class="panel-trend-card panel-flush" id="panel-util-trend-card">
        <div class="panel-chart-header">${t('util_trend')}<span class="panel-chart-readout" id="trend-readout"></span></div>
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
        <div class="pace-caption" id="pace-caption"></div>
      </div>

      <!-- 7일 사용량 바 차트 -->
      <div class="card panel-trend-card" id="panel-daily-card">
        <div class="panel-chart-header">${t('daily_cost')}<span class="panel-chart-readout" id="daily-readout"></span></div>
        <!-- 게이지 밖 ③ — 오늘 · 평소(30일 중앙값) · 편차를 나란히(C3-CostAnomaly 보드). 비교 기준을
             안 보여주면 "+N%"가 무엇 대비인지 화면에서 알 수 없다. -->
        <div class="cost-anomaly-row" id="daily-anomaly-row"></div>
        <div class="panel-trend-wrap">
          <canvas id="chart-daily" style="display:none"></canvas>
          <div class="panel-loading" id="daily-empty">${t('collecting_data')}</div>
        </div>
        <div class="cost-median-legend" id="daily-median-legend"></div>
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
      <div class="panel-files-card panel-flush" id="panel-files-card">
        <div class="panel-chart-header">${t('recently_edited')}</div>
        <div id="panel-files-list"><div class="panel-loading">${t('collecting_data')}</div></div>
      </div>

      <!-- 세션 목록 -->
      <div class="panel-session-card panel-flush" id="panel-session-card">
        <div class="panel-chart-header">${t('recent_sessions')}</div>
        <div id="panel-session-list"><div class="panel-loading">${t('collecting_data')}</div></div>
      </div>

      <!-- Git ROI — 브랜치별 비용 -->
      <div class="panel-branch-card panel-flush" id="panel-branch-card">
        <div class="panel-chart-header">${t('git_roi')}</div>
        <div id="panel-branch-list"><div class="panel-loading">${t('collecting_data')}</div></div>
      </div>

      <!-- usage×git 회고 — 커밋별 비용 귀속 (근사치·미귀속 버킷 1급) -->
      <div class="panel-retro-card panel-flush" id="panel-retro-card">
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

      <!-- Codex 대체 패널(verify-impl B-V2 보완, v0.2.0) — panel-skill-card가 숨겨지는 자리에
           들어간다(CLAUDE_ONLY_PANEL_IDS). 추론토큰·컨텍스트창실측·플랜배지 3행, 추정 없이
           실측치만(빈 값은 행 자체를 숨김, updateCodexBandSection). -->
      <div class="panel-codex-extra-card" id="panel-codex-extra-card" style="display:none;">
        <div class="panel-chart-header"><span>${t('codex_extra_panel_title')}</span></div>
        <div id="panel-codex-extra-list"></div>
      </div>

      <!-- 장기 비용 트렌드 -->
      <div class="panel-trend-card panel-flush" id="panel-longterm-card">
        <div class="panel-chart-header">${t('long_term_trend')}<span class="panel-chart-readout" id="longterm-readout"></span></div>
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
        <div id="longterm-cost-note"></div>
      </div>

      <!-- 월별 비용 -->
      <div class="panel-trend-card panel-flush" id="panel-monthly-card">
        <div class="panel-chart-header">${t('monthly_cost')}<span class="panel-chart-readout" id="monthly-readout"></span></div>
        <div class="panel-trend-wrap">
          <canvas id="chart-monthly" style="display:none"></canvas>
          <div class="panel-loading" id="monthly-empty">${t('collecting_data')}</div>
        </div>
        <div id="monthly-cost-note"></div>
      </div>
    </div>`;
}

function getCssVar(name: string): string {
  // document.documentElement(<html>)이 아니라 document.body에서 읽는다 — .theme-dark/.theme-light와
  // ST9의 .provider-codex는 전부 <body>에 붙는 클래스(DashboardPanel.ts HTML shell + applyProviderVisibility
  // 토글)라, --c-sonnet/--c-warn/--c-danger처럼 그 블록 "안"에서만 선언된 토큰은 <html> 기준으로는
  // 안 보인다(커스텀 프로퍼티는 조상 방향으로만 상속 — <html>은 <body>의 조상이라 자식 선언이 안 보임).
  // v0.2.0 전에는 이 토큰들이 :root(<html>)에 직접 있어서 우연히 맞았다 — 프로바이더별로 값이
  // 갈라지면서(ST9) 이 우연이 깨져 차트가 검정으로 렌더되는 무성 실패가 났다(실측: 헤드리스 스크린샷).
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

/**
 * 막대 위에 값 라벨을 그리는 공용 Chart.js 플러그인 팩토리(신규 의존성 없음, canvas 직접 draw).
 * 눈금만으로는 정확한 값을 읽기 위해 축과 막대를 오가야 한다 — 라벨을 막대에 직접 붙이면
 * 그 동작이 없어진다. 색은 항상 getCssVar 경유(§3#5 — .ts 파일에 색 리터럴 금지).
 */
function barValueLabelPlugin(formatValue: (v: number) => string) {
  return {
    id: 'barValueLabel',
    afterDatasetsDraw(chart: Chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const data = chart.data.datasets[0]?.data as (number | null)[] | undefined;
      if (!data) return;
      const textColor = getCssVar('--vscode-descriptionForeground');
      const monoFont = getCssVar('--ff-mono') || 'monospace';
      ctx.save();
      ctx.fillStyle = textColor;
      ctx.font = `10px ${monoFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      meta.data.forEach((bar, i) => {
        const v = data[i];
        if (v === null || v === undefined || v <= 0) return;
        const pos = bar.tooltipPosition(true);
        if (pos.x === null || pos.y === null) return;
        ctx.fillText(formatValue(v), pos.x, pos.y - 4);
      });
      ctx.restore();
    },
  };
}

/**
 * 게이지 밖 ③ 비용 이상 감지 — "가는 선 = 평소 수준"(C3-CostAnomaly 보드). 값을 dataset이 아니라
 * chart.options.plugins.medianLine.value로 읽어, 기존 인스턴스 재사용 시(update('none'))에도
 * 매 리프레시마다 mixed dataset 타입 없이 갱신 가능하게 한다.
 */
function medianLinePlugin() {
  return {
    id: 'medianLine',
    afterDatasetsDraw(chart: Chart) {
      const opts = (chart.options.plugins as Record<string, { value?: number | null }> | undefined)?.['medianLine'];
      const value = opts?.value;
      if (value === null || value === undefined) return;
      const yScale = chart.scales['y'];
      const xScale = chart.scales['x'];
      if (!yScale || !xScale) return;
      const y = yScale.getPixelForValue(value);
      const { ctx } = chart;
      ctx.save();
      ctx.strokeStyle = getCssVar('--vscode-descriptionForeground') + '77';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xScale.left, y);
      ctx.lineTo(xScale.right, y);
      ctx.stroke();
      ctx.restore();
    },
  };
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
  updateCodexBandSection();
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

  const readoutEl = document.getElementById('daily-readout');
  if (readoutEl) readoutEl.textContent = fmtCost(days[days.length - 1].costUsd);

  // 게이지 밖 ③ 비용 이상 감지 — 30일 중앙값 대비 오늘(C3-CostAnomaly 보드). 표본<7이면 비교 블록 숨김.
  const anomalyRowEl = document.getElementById('daily-anomaly-row');
  const medianLegendEl = document.getElementById('daily-median-legend');
  const todayCost = panelUsage?.today.costUsd ?? 0;
  const todayDateKey = panelUsage?.today.date ?? '';
  const qualifyingDays = filterQualifyingCostDays(panelUsage?.historicalDays ?? [], todayDateKey);
  const qualifyingCosts = qualifyingDays.map(d => d.costUsd);
  const anomalyPct = calcCostAnomalyPct(todayCost, qualifyingCosts);
  const medianCost = anomalyPct !== null ? median(qualifyingCosts) : null;
  if (anomalyRowEl) {
    if (anomalyPct === null || medianCost === null) {
      anomalyRowEl.innerHTML = '';
    } else {
      const sign = anomalyPct >= 0 ? '+' : '';
      const elevated = anomalyPct > 0.15;
      anomalyRowEl.innerHTML = `
        <div class="cost-anomaly-item">
          <div class="cost-anomaly-label">${t('cost_today_label')}</div>
          <div class="cost-anomaly-value mono">${fmtCost(todayCost)}</div>
        </div>
        <div class="cost-anomaly-item">
          <div class="cost-anomaly-label">${escapeHtml(t('cost_usual_label'))}</div>
          <div class="cost-anomaly-value mono muted">${fmtCost(medianCost)}</div>
        </div>
        <div class="cost-anomaly-item">
          <div class="cost-anomaly-label">${t('cost_anomaly_vs_median')}</div>
          <div class="cost-anomaly-delta mono${elevated ? ' elevated' : ''}" title="${escapeHtml(t('cost_anomaly_hint'))}">${sign}${(anomalyPct * 100).toFixed(0)}%</div>
        </div>`;
    }
  }
  if (medianLegendEl) {
    medianLegendEl.textContent = medianCost === null ? '' : t('cost_median_line_legend');
  }

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
    const plugins = dailyChart.options.plugins as Record<string, { value?: number | null }> | undefined;
    if (plugins?.['medianLine']) plugins['medianLine'].value = medianCost;
    dailyChart.update('none');   // 주기 리프레시마다 재애니메이션되지 않도록(첫 렌더만 애니메이션)
  } else {
    dailyChart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      plugins: [barValueLabelPlugin((v) => `$${v.toFixed(2)}`), medianLinePlugin()],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 14 } },
        plugins: { legend: { display: false }, medianLine: { value: medianCost } },
        scales: {
          x: { ticks: { color: axisColor, font: { size: 10 } }, grid: { color: gridColor } },
          y: {
            ticks: { color: axisColor, font: { size: 10 }, callback: (v) => `$${Number(v).toFixed(2)}` },
            grid: { color: gridColor },
          },
        },
      } as ConstructorParameters<typeof Chart>[1]['options'],
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
  // 소유·판정은 calendarScroll.ts가 한다(v0.1.55 — 좌표 역추론이 클램프된 잘못된 위치를
  // '의도적 과거 탐색'으로 오인해 영구 고착시키던 결함 A).
  captureCalendarScroll(bodyEl.querySelector('.calendar-grid-area'), panelCalendarScroll);

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
  applyCalendarScroll(bodyEl.querySelector('.calendar-grid-area'), panelCalendarScroll);
}

function modelColor(model: string): string {
  const k = modelKind(model, activePanelProvider);
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

  const labels = breakdown.map(b => modelShortName(b.model, activePanelProvider));
  // 도넛도 share와 같은 기준으로 그린다. 비용 기준으로 고정하면 가격 미상 모델이 0으로 들어가
  // 조각이 아예 사라지고, 사용자는 "그 모델을 안 썼다"로 읽는다(실측 사고의 시각적 형태).
  const byTokens = panelUsage?.modelShareBasis === 'tokens';
  const data = breakdown.map(b => byTokens ? b.tokens : Number(b.costUsd.toFixed(4)));
  const colors = breakdown.map(b => modelColor(b.model));

  // 모델 바 목록 렌더 — 비용을 모르는 행은 금액 자리에 '가격 미상'을 쓴다. $0.00을 찍으면
  // 그건 계측된 0으로 읽힌다(v0.1.55가 다루는 거짓초록과 같은 부류).
  const barsHtml = breakdown.map(b => {
    const costCell = b.pricingSource === 'none'
      ? `<span class="model-bar-cost model-bar-cost--unknown" title="${escapeHtml(t('pricing_unknown_note'))}">${escapeHtml(t('pricing_unknown'))}</span>`
      : `<span class="model-bar-cost mono">${fmtCost(b.costUsd)}${b.pricingSource === 'family' ? `<span class="model-approx" title="${escapeHtml(t('pricing_unknown_note'))}">~</span>` : ''}</span>`;
    return `
    <div class="model-bar-row">
      <span class="model-bar-label">${escapeHtml(modelShortName(b.model, activePanelProvider))}</span>
      <div class="model-bar-track">
        <div class="model-bar-fill" style="width:${(b.share * 100).toFixed(1)}%;background:${modelColor(b.model)};"></div>
      </div>
      ${costCell}
      <span class="model-bar-pct mono">${(b.share * 100).toFixed(0)}%</span>
    </div>`;
  }).join('');

  const unpriced = panelUsage?.unpricedModels ?? [];
  const noteHtml = unpriced.length > 0
    ? `<div class="panel-warn-note" title="${escapeHtml(unpriced.join(', '))}">⚠ ${escapeHtml(t('pricing_unknown_note'))}</div>`
    : '';
  const basisHtml = byTokens
    ? `<div class="panel-basis-note">${escapeHtml(t('share_by_tokens'))}</div>`
    : '';

  const canvasId = 'chart-model';
  bodyEl.innerHTML = `
    ${noteHtml}
    <div class="panel-model-layout">
      <div class="panel-model-donut">
        <canvas id="${canvasId}" width="100" height="100"></canvas>
      </div>
      <div class="panel-model-bars">${basisHtml}${barsHtml}</div>
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
      // 컨테이너 innerHTML이 재생성되므로 이 차트는 매 리프레시마다 새로 만들어진다(인스턴스
      // 재사용 불가 → update('none')로는 못 막는다). 애니메이션을 끄지 않으면 데이터가 그대로여도
      // 매번 다시 그려지는 것처럼 보인다.
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            // 도넛 데이터가 토큰으로 바뀌면 툴팁도 같이 바뀌어야 한다 — 토큰 수에 $를 붙이면
            // 그게 가장 눈에 띄는 거짓말이 된다.
            label: (ctx: { parsed: unknown }) =>
              byTokens ? ` ${fmtTokens(ctx.parsed as number)}` : ` ${fmtCost(ctx.parsed as number)}`,
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

  const hitPctNum = cache.hitRate * 100;
  const hitPct = hitPctNum.toFixed(1);
  // savedUsd===0이 "절약 측정값 0"인지 "가격표에 없어 계산 불가"인지 fmtCost는 구분 못한다
  // (sidebarView.ts의 오늘비용과 동일 부류 버그, Codex 미등재 모델로 실사용 캡처 중 재확인).
  const savedStr = (cache.savedUsd === 0 && (panelUsage?.unpricedModels.length ?? 0) > 0)
    ? t('pricing_unknown')
    : fmtCost(cache.savedUsd);

  // 게이지 밖 ① 캐시 정상범위 밴드 — C1-Cache 보드(60/90 밴드, 78.4%=정상·31.2%=급락).
  // 보드의 주장은 "스파크라인은 이미 있다, 없는 건 이 수치가 뭘 뜻하는지다" — 설명 문장을
  // 툴팁이 아니라 본문에 노출한다(툴팁은 화면에서 안 보이므로 보드 요구를 충족하지 못한다).
  const bandKind = classifyCacheHitRate(hitPctNum);
  const bandLabelKey = bandKind === 'normal' ? 'cache_band_normal' : 'cache_band_drop';
  const bandMsgKey = bandKind === 'normal' ? 'cache_band_msg_normal' : 'cache_band_msg_drop';
  const bandBadgeHtml = `<span class="cache-band-status ${bandKind}" title="${escapeHtml(t('cache_band_note'))}">${t(bandLabelKey)}</span>`;
  const bandMsgHtml = `<div class="cache-band-msg ${bandKind}">${escapeHtml(t(bandMsgKey))}</div>`;

  // 일별 캐시 히트율 스파크라인 데이터
  const sparkLabels = last7.map(d => d.date.slice(5));
  const sparkData = last7.map(d => Number((d.cacheHitRate * 100).toFixed(1)));
  const hasSparkData = sparkData.some(v => v > 0);

  bodyEl.innerHTML = `
    <div class="cache-kpi-row">
      <div class="cache-kpi-item">
        <div class="cache-kpi-label">${t('hit_rate_today')}</div>
        <div class="cache-kpi-value mono">${hitPct}%${bandBadgeHtml}</div>
      </div>
      <div class="cache-kpi-item">
        <div class="cache-kpi-label">${t('saved_today')}</div>
        <div class="cache-kpi-value mono" style="color:var(--c-haiku);">${savedStr}</div>
      </div>
    </div>
    ${hasSparkData ? `
    <div class="cache-spark-wrap">
      <div class="panel-chart-header" style="font-size:var(--fs-label);margin-bottom:var(--sp-1);">${t('seven_day_rate')}</div>
      <div style="height:76px;position:relative;">
        <canvas id="chart-cache-spark"></canvas>
      </div>
      ${bandMsgHtml}
    </div>` : bandMsgHtml}`;

  if (hasSparkData) {
    const canvas = document.getElementById('chart-cache-spark') as HTMLCanvasElement | null;
    if (!canvas) return;
    const axisColor = getCssVar('--vscode-descriptionForeground');
    const gridColor = getCssVar('--vscode-panel-border');
    const lineColor = getCssVar('--c-warn');
    const bandColor = getCssVar('--vscode-descriptionForeground');
    // 게이지 밖 ① 정상범위 참조선(60%·90%) — 값이 아니라 밴드 자체를 보여줌(C1-Cache 보드)
    const bandLine = (v: number) => sparkLabels.map(() => v);
    cacheSparkChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: sparkLabels,
        datasets: [
          {
            data: sparkData,
            borderColor: lineColor,
            backgroundColor: lineColor + '22',
            borderWidth: 1.5,
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          },
          {
            data: bandLine(THRESHOLD_HIGH),
            borderColor: bandColor + '55',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
          },
          {
            data: bandLine(THRESHOLD_LOW),
            borderColor: bandColor + '55',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // modelChart와 동일 — 컨테이너 innerHTML 재생성으로 매 리프레시마다 새 인스턴스다.
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: axisColor, font: { size: 9 } }, grid: { color: gridColor } },
          y: {
            min: 0,
            max: 100,
            // 눈금은 밴드 경계(60·90) 둘만 — 보드가 그 둘만 라벨링한다. 0·100까지 넣으면
            // 60px대 스파크라인 높이에서 90과 100 라벨이 겹쳐 오히려 못 읽는다(실캡처로 확인).
            afterBuildTicks: (axis: { ticks: { value: number }[] }) => {
              axis.ticks = [{ value: THRESHOLD_LOW }, { value: THRESHOLD_HIGH }];
            },
            ticks: { color: axisColor, font: { size: 9 }, callback: (v) => `${v}%`, autoSkip: false },
            grid: { color: gridColor },
          },
        },
      } as ConstructorParameters<typeof Chart>[1]['options'],
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
    toolChart.update('none');   // 주기 리프레시마다 재애니메이션되지 않도록(첫 렌더만 애니메이션)
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

/**
 * 목록 기본 노출 행 수 (v0.1.55).
 *
 * 이전에는 상한이 없어 최근 파일 20행·세션 20행·브랜치 전량이 카드를 세로로 밀어냈고,
 * 아래 카드들이 화면 밖으로 나갔다. 잘라내되 **잘랐다는 사실과 남은 개수를 항상 드러낸다** —
 * 조용한 절단은 "그게 전부"로 읽히기 때문이다.
 */
const LIST_COLLAPSED_ROWS = 6;

/** 목록별 펼침 상태. 재렌더(push)마다 innerHTML이 교체되므로 DOM이 아니라 여기서 보존한다. */
const listExpanded: Record<string, boolean> = {};

/** 목록 갱신 함수 — 더보기 클릭 시 해당 목록만 다시 그린다. */
const LIST_UPDATERS: Record<string, () => void> = {};

function cappedListHtml(rows: string[], key: string): string {
  const expanded = listExpanded[key] === true;
  if (rows.length <= LIST_COLLAPSED_ROWS) return rows.join('');
  const visible = expanded ? rows : rows.slice(0, LIST_COLLAPSED_ROWS);
  const hidden = rows.length - visible.length;
  const label = expanded ? escapeHtml(t('show_less')) : `${escapeHtml(t('show_more'))} (+${hidden})`;
  return visible.join('')
    + `<div class="list-more-row"><button class="list-more-btn js-list-more" data-list="${escapeHtml(key)}">${label}</button></div>`;
}

function updateFilesList(): void {
  const listEl = document.getElementById('panel-files-list');
  if (!listEl) return;

  const files = panelUsage?.recentEditedFiles ?? [];
  if (files.length === 0) {
    listEl.innerHTML = `<div class="panel-empty">${t('no_files_yet')}</div>`;
    return;
  }

  const rows = files.map(fp => {
    const parts = fp.split(/[/\\]/);
    const fileName = parts[parts.length - 1] ?? fp;
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    return `<div class="file-row">
      <div class="file-info">
        <span class="file-name" title="${escapeHtml(fp)}">${escapeHtml(fileName)}</span>
        ${dir ? `<span class="file-dir" title="${escapeHtml(fp)}">${escapeHtml(dir)}</span>` : ''}
      </div>
    </div>`;
  });
  listEl.innerHTML = cappedListHtml(rows, 'files');
}

function updateSessionList(): void {
  const listEl = document.getElementById('panel-session-list');
  if (!listEl) return;

  const sessions = panelUsage?.recentSessions ?? [];
  if (sessions.length === 0) {
    listEl.innerHTML = `<div class="panel-empty">${t('no_sessions_yet')}</div>`;
    return;
  }

  listEl.innerHTML = cappedListHtml(sessions.map(s => buildSessionRow(s)), 'sessions');
}

// 더보기 토글이 되돌아올 지점. 선언 순서 때문에 여기서 채운다(함수 선언은 호이스팅되지만
// const 객체 초기화는 안 되므로, 모듈 최상단이 아니라 정의 뒤에 등록한다).
LIST_UPDATERS['files'] = updateFilesList;
LIST_UPDATERS['sessions'] = updateSessionList;

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
      ${costCellHtml(b.costUsd, b.hasUnpricedRecords, 'branch-cost mono')}
      <span class="branch-tokens mono">${fmtTokens(b.totalTokens)}</span>
      <span class="branch-sessions mono">${b.sessionCount}</span>
      <span class="branch-last mono">${escapeHtml(lastStr)}</span>
    </div>`;
  });

  listEl.innerHTML = headerRow + cappedListHtml(rows, 'branches');
}
LIST_UPDATERS['branches'] = updateBranchSection;

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

  // 서브에이전트 소비 요약 라인 (#8) — 비용이 미상(unpriced)이라 0으로 찍혀도 서브에이전트가
  // 실제로 쓰였다면(subagentCount>0) 숨기지 않는다(defer #9, PLAN §8 불변식5 — 0값과 빈값 혼동 금지).
  let subLine = '';
  if (sub && (sub.subagentCostUsd > 0 || (sub.subagentHasUnpriced && sub.subagentCount > 0))) {
    const pct = (sub.subagentShare * 100).toFixed(0);
    subLine = `<div class="skill-subagent-line">
      <span>${t('subagent_consumption')}</span>
      <span class="mono">${pct}% · ${costCellHtml(sub.subagentCostUsd, sub.subagentHasUnpriced, 'mono')} · ${sub.subagentCount} ${t('agents_label')}</span>
    </div>`;
  }

  // 스킬 외 작업 버킷 (1급) — !isSidechain && !attributionSkill. 미가격이라 0으로 찍혀도
  // 토큰 소비가 있었으면 숨기지 않는다(위 서브에이전트 라인과 동일 원칙).
  const hasBucket = !!unattr && (unattr.costUsd > 0 || (unattr.hasUnpricedRecords && unattr.totalTokens > 0));
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
      ${costCellHtml(s.costUsd, s.hasUnpricedRecords, 'skill-cost mono')}
    </div>`;
  }).join('');

  // 버킷 행은 스킬 행과 동등(1급)하되 muted — "Other" 관례상 마지막 배치. 숨김/0표시 금지.
  const bucketRow = hasBucket ? `<div class="skill-row skill-row-other" title="${t('skill_unattributed_tip')} · ${(bucketShare * 100).toFixed(1)}%">
      <span class="skill-name">${t('skill_unattributed')}</span>
      <span class="skill-bar-wrap"><span class="skill-bar skill-bar-other" style="width:${Math.max(2, (bucketShare / maxShare) * 100)}%"></span></span>
      ${costCellHtml(unattr!.costUsd, unattr!.hasUnpricedRecords, 'skill-cost mono')}
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
  // 판정 기준이 비용이면 안 된다: CacheStore에 영구 저장된 과거 일자는 당시 가격표에 그 모델이
  // 없었으면 costUsd가 0인데(토큰 수는 정상), 그걸 "데이터 없음"으로 부르면 실제로는 관측된
  // 사용량이 화면에서 사라진다. jsonl 회전(~30일) 이전 구간은 재계산도 불가능하다 —
  // 그래서 숨기지 않고 그리되, 왜 0인지 아래 note로 밝힌다.
  const hasData = filtered.some(d => d.totalTokens > 0);
  const costUnknownDays = filtered.filter(d => d.totalTokens > 0 && d.costUsd === 0).length;
  const noteEl = document.getElementById('longterm-cost-note');
  if (noteEl) {
    noteEl.innerHTML = costUnknownDays > 0
      ? `<div class="panel-basis-note">⚠ ${escapeHtml(t('cost_unknown_days'))} (${costUnknownDays}d)</div>`
      : '';
  }

  if (!hasData) {
    canvas.style.display = 'none';
    if (emptyEl) { emptyEl.className = 'panel-empty'; emptyEl.textContent = t('no_history_data'); emptyEl.style.display = ''; }
    if (longTermChart) { longTermChart.destroy(); longTermChart = null; }
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const readoutEl = document.getElementById('longterm-readout');
  if (readoutEl) readoutEl.textContent = fmtCost(filtered[filtered.length - 1].costUsd);

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
    pointRadius: filtered.length <= 30
      ? 2
      : (ctx: { dataIndex: number }) => (ctx.dataIndex === filtered.length - 1 ? 4 : 0),
    pointBackgroundColor: lineColor,
  }];

  if (longTermChart) {
    longTermChart.data.labels = labels;
    longTermChart.data.datasets = datasets;
    longTermChart.update('none');   // 주기 리프레시마다 재애니메이션되지 않도록(첫 렌더만 애니메이션)
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
  // 장기 트렌드(updateLongTermSection)와 **같은 기준**이어야 한다. 비용으로만 판정하면 가격표가
  // 낡았던 시기의 일자(비용 0·토큰 정상)만 남은 달이 통째로 "기록 없음"이 되고, 같은 데이터를 두고
  // 장기 트렌드는 그래프를 그리는데 여기서는 없다고 말하는 모순이 생긴다.
  const hasData = allDays.some(d => d.totalTokens > 0);
  const costUnknownDays = allDays.filter(d => d.totalTokens > 0 && d.costUsd === 0).length;
  const monthlyNoteEl = document.getElementById('monthly-cost-note');
  if (monthlyNoteEl) {
    monthlyNoteEl.innerHTML = costUnknownDays > 0
      ? `<div class="panel-basis-note">⚠ ${escapeHtml(t('cost_unknown_days'))} (${costUnknownDays}d)</div>`
      : '';
  }

  if (!hasData) {
    canvas.style.display = 'none';
    if (emptyEl) { emptyEl.className = 'panel-empty'; emptyEl.textContent = t('no_history_data'); emptyEl.style.display = ''; }
    if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const readoutEl = document.getElementById('monthly-readout');
  if (readoutEl) readoutEl.textContent = fmtCost(sortedMonths[sortedMonths.length - 1][1]);

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
    monthlyChart.update('none');   // 주기 리프레시마다 재애니메이션되지 않도록(첫 렌더만 애니메이션)
  } else {
    monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      plugins: [barValueLabelPlugin((v) => `$${v.toFixed(0)}`)],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 14 } },
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
    ${costCellHtml(s.costUsd, s.hasUnpricedRecords, 'session-cost mono')}
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
  // 숫자와 단위 라벨을 분리한다 — 한 덩어리로 두면 CJK에서 "64% 사용"/"됨"으로 2줄 깨진다
  // (한국어 실캡처로 발견. en "64% used"는 1줄이라 영어만 보면 안 드러난다).
  if (fhRemEl) fhRemEl.innerHTML = `${fmtPct(fh.utilization)}<span class="panel-metric-unit">${escapeHtml(t('used_label'))}</span>`;
  if (fhBarFill) {
    fhBarFill.style.cssText = barFillWidth(fh.utilization);
    fhBarFill.dataset.status = fh.status;
  }
  if (fhResetEl) fhResetEl.textContent = `${t('resets_in')} ${fmtReset(fh.msUntilReset)} · ${fmtPct(1 - fh.utilization)} ${t('remaining_label')}`;

  // WEEKLY (7d) 카드 — 병목 하이라이트 + 임계값 배지
  const sdCard = document.getElementById('panel-sd-card');
  if (sdCard) sdCard.classList.toggle('is-bottleneck', snapshot.representativeClaim === 'seven_day');

  const sdRemEl = document.getElementById('sd-remaining');
  const sdBarFill = document.getElementById('sd-bar-fill') as HTMLElement | null;
  const sdResetEl = document.getElementById('sd-reset');
  if (sdRemEl) sdRemEl.innerHTML = `${fmtPct(sd.utilization)}<span class="panel-metric-unit">${escapeHtml(t('used_label'))}</span>`;
  if (sdBarFill) {
    sdBarFill.style.cssText = barFillWidth(sd.utilization);
    sdBarFill.dataset.status = sd.status;
  }
  if (sdResetEl) {
    const thBadge = snapshot.sevenDaySurpassedThreshold !== undefined
      ? ` <span class="threshold-badge">&gt;${Math.round(snapshot.sevenDaySurpassedThreshold * 100)}%</span>`
      : '';
    sdResetEl.innerHTML = `${t('resets_in')} ${fmtReset(sd.msUntilReset)} · ${fmtPct(1 - sd.utilization)} ${t('remaining_label')}${thBadge}`;
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

  const trendReadoutEl = document.getElementById('trend-readout');
  if (trendReadoutEl) {
    const fhNow = fmtPct(fhSlice[fhSlice.length - 1].v);
    const sdNow = fmtPct(sdSlice[sdSlice.length - 1]?.v ?? fhSlice[fhSlice.length - 1].v);
    trendReadoutEl.textContent = `5H ${fhNow} · 7D ${sdNow}`;
  }

  const labels = fhSlice.map(p => {
    const d = new Date(p.t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  });

  const fhColor = getCssVar('--c-sonnet');
  const sdColor = getCssVar('--c-opus');
  const axisColor = getCssVar('--vscode-descriptionForeground');
  const gridColor = getCssVar('--vscode-panel-border');
  const paceColor = getCssVar('--vscode-descriptionForeground');

  const datasets: ChartDataset<'line'>[] = [
    {
      label: 'Session (5h)',
      data: fhSlice.map(p => p.v * 100),
      borderColor: fhColor,
      backgroundColor: fhColor + '22',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: fhSlice.length <= 10
        ? 3
        : (ctx: { dataIndex: number }) => (ctx.dataIndex === fhSlice.length - 1 ? 4 : 0),
      pointBackgroundColor: fhColor,
    },
    {
      label: 'Weekly (7d)',
      data: sdSlice.map(p => p.v * 100),
      borderColor: sdColor,
      backgroundColor: sdColor + '22',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: sdSlice.length <= 10
        ? 3
        : (ctx: { dataIndex: number }) => (ctx.dataIndex === sdSlice.length - 1 ? 4 : 0),
      pointBackgroundColor: sdColor,
    },
  ];

  // 게이지 밖 ④ 페이스 라인 — "기준 페이스"(창 시작→리셋 선형) vs 실제(위 fhSlice) 오버레이(C4-PaceLine 보드).
  // lastPanelSnapshot이 있을 때만(첫 렌더 전 가드). 현재 5h 윈도 밖 포인트는 null로 스킵해
  // 24h 스코프처럼 여러 리셋을 가로지르는 구간에서 단조 기준선이 100%에 눌어붙는 걸 막는다.
  const paceCaptionEl = document.getElementById('pace-caption');
  const fh = lastPanelSnapshot?.fiveHour;
  if (fh) {
    const nowMs = Date.now();
    const resetAtMs = nowMs + fh.msUntilReset;
    const windowStartMs = resetAtMs - FH_WINDOW_MS;
    const baselineData = fhSlice.map(p => {
      const t = p.t.getTime();
      return t < windowStartMs ? null : calcPaceBaseline(t, windowStartMs, resetAtMs);
    });
    datasets.push({
      label: t('pace_baseline_label'),
      data: baselineData,
      borderColor: paceColor + '77',
      borderWidth: 1.5,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false,
      tension: 0,
      spanGaps: false,
    });

    if (paceCaptionEl) {
      const burnState = deriveBurnState(fhHistory, fh.utilization, fh.msUntilReset, FH_WINDOW_MS);
      const resetAt = new Date(resetAtMs);
      const windowStart = new Date(windowStartMs);
      const safeUntil = burnState.rate !== null ? calcSafeUntil(fh.utilization, burnState.rate, resetAt) : null;
      const exhaustText = safeUntil
        ? `<span class="pace-exhaust">${t('pace_exhaust_projected')} ${fmtTime(safeUntil)}</span>`
        : `<span>${t('pace_safe_no_exhaust')}</span>`;
      // C4 보드의 판정 문장 — 점선(기준) 대비 실제선 위치가 곧 "리셋 전에 막히는가"의 답이다.
      // 현재 시점 기준선과 실제 사용률을 직접 비교한다(차트 끝점 = 지금).
      const baselineNow = calcPaceBaseline(nowMs, windowStartMs, resetAtMs);
      const aboveBaseline = fh.utilization * 100 > baselineNow;
      const verdictHtml = `<span class="pace-verdict${aboveBaseline ? ' warn' : ''}">`
        + `${escapeHtml(t(aboveBaseline ? 'pace_above_baseline' : 'pace_below_baseline'))}</span>`;
      paceCaptionEl.innerHTML = `<span>${t('pace_window_start')} ${fmtTime(windowStart)}</span>` +
        `<span>${t('pace_window_reset')} ${fmtTime(resetAt)}</span>${exhaustText}${verdictHtml}`;
    }
  } else if (paceCaptionEl) {
    paceCaptionEl.innerHTML = '';
  }

  if (trendChart) {
    trendChart.data.labels = labels;
    trendChart.data.datasets = datasets;
    // 스코프 변경 시 x축 tick 수도 갱신
    const xScale = trendChart.options.scales?.['x'] as Record<string, unknown> | undefined;
    if (xScale?.['ticks'] && typeof xScale['ticks'] === 'object') {
      (xScale['ticks'] as Record<string, unknown>)['maxTicksLimit'] =
        chartScopeMin <= 30 ? 6 : chartScopeMin <= 120 ? 8 : 12;
    }
    trendChart.update('none');   // 주기 리프레시마다 재애니메이션되지 않도록(첫 렌더만 애니메이션)
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
