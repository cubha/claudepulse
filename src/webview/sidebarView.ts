// 사이드바 뷰(WebviewViewProvider) 전용 렌더링 (v0.1.54 ST5 — main.ts에서 기계적 추출).
import { Messenger } from 'vscode-messenger-webview';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import {
  GetActiveProvider, GetCodexRateLimit, GetProviderAvailability, GetRateLimit, GetUsageSummary,
  PushActiveProvider, PushCodexRateLimit, PushPollerError, PushProviderAvailability, PushRateLimit, PushUsageSummary,
  RequestClearPinnedSession, RequestLogin, RequestLoginCodex, RequestOpenBillingSettings, RequestOpenDashboard,
  RequestOpenSessionPicker, RequestRefresh, RequestSetLang, RequestSetProvider,
} from '../messaging/contracts';
import type { AgentProvider, CodexRateLimitSnapshot, PollerError, ProviderAvailability, RateLimitSnapshot, UsageSummary } from '../types';
import { getLang, setLang, t } from './i18n';
import { escapeHtml, fmtCost, formatErrorHtml } from './format';
import { resolveContextGaugeState } from './contextGaugeState';
import type { CalendarDay } from './calendarView';
import type { PollPoint } from './burnRate';
import { filterQualifyingCostDays, calcCostAnomalyPct } from './metricCalc';
import { vsApi } from './webviewApi';
import {
  createCalendarScrollState, captureCalendarScroll, applyCalendarScroll,
} from './calendarScroll';
import {
  FH_WINDOW_MS, SD_WINDOW_MS, fmtPct, fmtReset, fmtTime, statusColor, statusLabel,
  fmtPlanTier, buildBurnRow, fmtTokens, modelKind, modelShortName, buildCalendarHtml,
  SIDEBAR_CALENDAR_WINDOW_DAYS,
} from './webviewShared';

const root = document.getElementById('root');

/**
 * 사이드바 미니 Usage Calendar의 가로 스크롤 계약 상태(v0.1.55).
 * v0.1.54까지 사이드바에는 스크롤 정렬 코드가 아예 없어, 폭이 고정 그리드(196px)보다
 * 좁으면(실측 ≤220px) 왼쪽 끝=과거만 보이고 오늘 셀이 잘렸다. 기존 검증기 둘 다
 * "오버플로가 존재하는가"만 단언하고 "오늘이 보이는가"는 단언하지 않아 통과했다.
 */
const sidebarCalendarScroll = createCalendarScrollState();

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
  // Codex 버킷별 히스토리(ST10, verify-impl V1 보완) — 버킷 개수가 가변(D9: free=1개/유료=2개)이라
  // windowMinutes(버킷 정체성)로 키를 잡는다. 배열 인덱스로 키를 잡으면 세션 도중 버킷 구성이
  // 바뀔 때(예: free↔paid 전환, CLI가 순서를 다르게 반환) 이전 버킷의 이력이 다른 버킷에 잘못
  // 붙어 틀린 burn rate를 확신 있게 표시하게 된다.
  // Claude의 sbFhHistory/sbSdHistory와 같은 원리(클라이언트 측 누적, PollPoint[]).
  const sbCodexHistory = new Map<number, PollPoint[]>();
  let lastError: PollerError | null = null;
  let lastSnapshot: RateLimitSnapshot | null = null;
  let lastUsage: UsageSummary | null = null;
  // 프로바이더 스위처(ST7) — PushUsageSummary는 '활성 프로바이더' 단일 채널이라 lastUsage는
  // 그대로 재사용하지만, 한도 스냅샷은 Claude/Codex가 구조가 달라(overage·fallback 없음, 버킷
  // 개수 가변) 별도 채널(PushCodexRateLimit)로 온다 — lastSnapshot과 나란히 별도 보관한다.
  let activeProvider: AgentProvider = 'claude';
  let providerAvailability: ProviderAvailability = { claude: 'ready', codex: 'not_installed' };
  let lastCodexSnapshot: CodexRateLimitSnapshot | null = null;

  function recordSbHistory(snapshot: RateLimitSnapshot): void {
    const t = new Date(snapshot.generatedAt);
    sbFhHistory.push({ t, v: snapshot.fiveHour.utilization });
    sbSdHistory.push({ t, v: snapshot.sevenDay.utilization });
    if (sbFhHistory.length > MAX_SB_HISTORY) sbFhHistory.shift();
    if (sbSdHistory.length > MAX_SB_HISTORY) sbSdHistory.shift();
  }

  /** Codex 버킷별 히스토리 누적(ST10) — usedPercent(0~100)를 utilization(0~1)로 정규화해 저장한다. */
  function recordCodexSbHistory(snapshot: CodexRateLimitSnapshot): void {
    const t = new Date(snapshot.generatedAt);
    snapshot.buckets.forEach((b) => {
      const key = b.windowMinutes;
      const hist = sbCodexHistory.get(key) ?? [];
      hist.push({ t, v: b.usedPercent / 100 });
      if (hist.length > MAX_SB_HISTORY) hist.shift();
      sbCodexHistory.set(key, hist);
    });
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

  messenger.onNotification(PushActiveProvider, (provider) => {
    activeProvider = provider;
    renderSidebar(lastSnapshot, lastError);
  });

  messenger.onNotification(PushProviderAvailability, (availability) => {
    providerAvailability = availability;
    renderSidebar(lastSnapshot, lastError);
  });

  messenger.onNotification(PushCodexRateLimit, (snapshot) => {
    lastCodexSnapshot = snapshot;
    if (snapshot) recordCodexSbHistory(snapshot);
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

  void messenger.sendRequest(GetActiveProvider, HOST_EXTENSION, undefined)
    .then((provider) => { activeProvider = provider; renderSidebar(lastSnapshot, lastError); })
    .catch(() => undefined);

  void messenger.sendRequest(GetProviderAvailability, HOST_EXTENSION, undefined)
    .then((availability) => { providerAvailability = availability; renderSidebar(lastSnapshot, lastError); })
    .catch(() => undefined);

  void messenger.sendRequest(GetCodexRateLimit, HOST_EXTENSION, undefined)
    .then((snapshot) => { lastCodexSnapshot = snapshot; if (snapshot) recordCodexSbHistory(snapshot); renderSidebar(lastSnapshot, lastError); })
    .catch(() => undefined);

  function renderSidebar(snapshot: RateLimitSnapshot | null, error: PollerError | null): void {
    // .provider-codex.theme-dark/.theme-light(styles.css ST9)이 실제 적용되려면 body에 이 클래스가
    // 있어야 한다(D-2 무성실패와 같은 부류 — 클래스 안 붙으면 게이트는 그린인데 CSS는 죽어있다).
    // .theme-dark/.theme-light 자체는 DashboardPanel.ts/SidebarViewProvider.ts HTML shell이
    // 고정 부여하므로 여기서는 provider 토글만 담당한다.
    document.body.classList.toggle('provider-codex', activeProvider === 'codex');
    const CAL_AREA = '.sb-calendar-wrap .calendar-grid-area';
    captureCalendarScroll(root!.querySelector(CAL_AREA), sidebarCalendarScroll);
    root!.innerHTML = buildSidebarHtml(snapshot, error, sbFhHistory, sbSdHistory, lastUsage, activeProvider, providerAvailability, lastCodexSnapshot, sbCodexHistory);
    // 좁은 사이드바에서 오늘 셀이 잘리지 않도록 우측 끝 정렬(대시보드와 동일 계약).
    applyCalendarScroll(root!.querySelector(CAL_AREA), sidebarCalendarScroll);
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
    // Codex 버킷 바 — 배열 길이만큼 동적 생성된 id를 순회한다(고정 id 목록이 없다, ST6 계약).
    (lastCodexSnapshot?.buckets ?? []).forEach((b, i) => {
      const bar = root!.querySelector<HTMLElement>(`#sb-codex-bucket-${i}`);
      if (bar) bar.style.width = `${Math.min(100, b.usedPercent)}%`;
    });
    root!.querySelectorAll<HTMLButtonElement>('.js-refresh').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestRefresh, HOST_EXTENSION));
    });
    root!.querySelectorAll<HTMLButtonElement>('.js-login').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestLogin, HOST_EXTENSION));
    });
    root!.querySelectorAll<HTMLButtonElement>('.js-login-codex').forEach(btn => {
      btn.addEventListener('click', () => messenger.sendNotification(RequestLoginCodex, HOST_EXTENSION));
    });
    root!.querySelectorAll<HTMLButtonElement>('.js-set-provider').forEach(btn => {
      btn.addEventListener('click', () => {
        const provider = btn.dataset.provider as AgentProvider | undefined;
        if (provider) messenger.sendNotification(RequestSetProvider, HOST_EXTENSION, provider);
      });
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
function modelAccentClass(model: string, provider: AgentProvider): string {
  const k = modelKind(model, provider);
  return k === 'other' ? 'slate' : k;
}

function buildUsageRowHtml(usage: UsageSummary | null, provider: AgentProvider): string {
  if (!usage) return '';
  const { today, modelBreakdown, cacheStats, todayToolCounts, activeBranch, branchBreakdown, historicalDays } = usage;
  if (today.totalTokens === 0 && today.costUsd === 0) {
    return `<div class="sb-usage-row">${t('no_usage_today')}</div>`;
  }

  // 게이지 밖 ③ 비용 이상 감지 — 사이드탭 유일 항목(P1-Placement: "$ 오늘" 옆 칩 하나뿐).
  // 대시보드(panelView.ts updateDailyChart)와 동일한 calcCostAnomalyPct/filterQualifyingCostDays 재사용.
  const qualifyingCosts = filterQualifyingCostDays(historicalDays, today.date).map(d => d.costUsd);
  const anomalyPct = calcCostAnomalyPct(today.costUsd, qualifyingCosts);
  const anomalyChip = anomalyPct !== null && anomalyPct > 0.15
    ? `<span class="sb-chip sb-chip--anomaly" title="${escapeHtml(t('cost_anomaly_median_note'))}">${t('cost_anomaly_vs_median')} +${(anomalyPct * 100).toFixed(0)}%</span>`
    : '';

  // modelBreakdown은 share 내림차순이고 share 기준은 가격을 다 알 때만 비용이다(v0.1.55).
  // 그래서 여기서 다시 정렬하지 않는다 — 예전엔 비용 정렬이라, 가격표에 없는 모델이 실제
  // 대부분을 차지해도 레거시 모델이 대표 칩으로 올라왔다.
  const topModel = modelBreakdown[0];
  const modelUnpriced = topModel !== undefined && topModel.pricingSource === 'none';
  const modelChip = topModel
    ? `<span class="sb-chip sb-chip--model ${modelAccentClass(topModel.model, provider)}"${modelUnpriced ? ` title="${escapeHtml(t('pricing_unknown_note'))}"` : ''}>`
      + `${escapeHtml(modelShortName(topModel.model, provider))}${modelUnpriced ? ' ⚠' : ''}</span>`
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

  // costUsd===0이 "$0 측정값"인지 "전부 미가격이라 계산 불가"인지 fmtCost는 구분 못 한다(그대로
  // 두면 '<$0.01'로 찍혀 실측값처럼 보인다 — panelView.ts의 model-bar-cost--unknown과 같은 부류의
  // 거짓초록, v0.1.55 원칙). 오늘 토큰이 전부 미가격 모델이면 비용 대신 '가격 미상'을 보여준다.
  const todayAllUnpriced = today.costUsd === 0 && usage.unpricedModels.length > 0
    && modelBreakdown.every(m => m.pricingSource === 'none');
  const costDisplay = todayAllUnpriced
    ? `<span class="sb-usage-cost mono" title="${escapeHtml(t('pricing_unknown_note'))}">${t('pricing_unknown')}</span>`
    : `<span class="sb-usage-cost mono">${fmtCost(today.costUsd)}</span>`;

  return `<div class="sb-usage-row">
    <span class="sb-usage-icon">◎</span>
    <span class="sb-usage-tokens">${fmtTokens(today.totalTokens)} ${t('tokens')}</span>
    <span class="sb-usage-sep">·</span>
    ${costDisplay}
    ${anomalyChip}
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
/**
 * 프로바이더 스위처(ST7) — Codex가 not_installed면 전환할 대상이 없으므로 스위처 자체를 숨긴다
 * (사용자 확정 사양: 죽은 UI를 만들지 않는다). 그 외에는 항상 두 탭을 보여준다 — Free/유료
 * 플랜 차이는 레이아웃이 아니라 탭 내부 배지·비활성화로 표현한다(사용자 확정 사양).
 */
function buildProviderSwitcherHtml(active: AgentProvider, availability: ProviderAvailability): string {
  if (availability.codex === 'not_installed') return '';
  // Main.dc.html Case C("미감지" — 설치됐지만 세션 0건) 의도: 토글은 유지하되 흐리게 표시,
  // 클릭하면 no_records 안내로 이동한다(기능은 이미 있었음 — 이번엔 시각 신호만 추가, verify-impl B-V12 보완).
  const dim = (p: AgentProvider) => p === 'codex' && availability.codex === 'no_records' ? ' is-unavailable' : '';
  const tab = (p: AgentProvider, label: string) =>
    `<button class="sb-provider-btn${p === active ? ' is-active' : ''}${dim(p)} js-set-provider" data-provider="${p}" role="tab" aria-selected="${p === active}">${label}</button>`;
  return `<div class="sb-provider-switch" role="tablist">${tab('claude', t('provider_claude'))}${tab('codex', t('provider_codex'))}</div>`;
}

/**
 * 사이드바 footer(ST9 신설) — `.sb-footer`는 이전까지 CSS만 있고 렌더 소비자가 없었다(PLAN §5).
 * 활성 프로바이더 아이덴티티(점 색=--identity-accent, provider-codex 스코프에서 자동 교체)·
 * plan·마지막 갱신시각을 담는다. Codex 경로는 지금까지 plan_type·generatedAt을 어디에도
 * 렌더하지 않고 있었다(header가 Claude 전용 planBadge/timestamp만 그림) — 이 footer가 그 첫
 * 소비자다. planLabel은 원본 문자열을 그대로 쓴다(§8 불변식3, plan_type 하드코딩 분기 금지).
 */
function buildFooterHtml(provider: AgentProvider, planLabel: string | null, generatedAt: string | Date | null): string {
  const providerLabel = provider === 'codex' ? t('provider_codex') : t('provider_claude');
  // ANALYSIS #4 — Codex는 헤더 배지(.toUpperCase(), panelView.ts와 동일 관례)와 footer가 서로
  // 다른 대소문자로 같은 planType 값을 렌더하던 버그. Claude는 기존 Title Case를 그대로 유지한다
  // (§8 불변식1 "Claude 경로 행위 변경 금지" — provider 분기만 추가).
  const plan = planLabel
    ? escapeHtml(provider === 'codex' ? planLabel.toUpperCase() : planLabel.charAt(0).toUpperCase() + planLabel.slice(1))
    : t('plan_unknown');
  const time = generatedAt ? fmtTime(new Date(generatedAt)) : '—';
  return `<div class="sb-footer">
    <span class="sb-footer-dot" aria-hidden="true"></span>
    <span class="sb-footer-provider">${providerLabel}</span>
    <span class="sb-footer-sep">·</span>
    <span class="sb-footer-plan">${plan}</span>
    <span class="sb-footer-sep">·</span>
    <span class="sb-footer-time mono">${time}</span>
  </div>`;
}

/** 3단 빈 상태(ST8) — not_installed 전용 카드. 양 프로바이더 공용 골격, 문구·명령만 다르다. */
function buildNotInstalledCard(
  provider: AgentProvider,
  active: AgentProvider,
  availability: ProviderAvailability,
  title: string,
  sub: string,
  installCmd: string
): string {
  return `
    <div class="sb-layout">
      <div class="sb-header">
        ${buildProviderSwitcherHtml(active, availability)}
        ${buildLangSelect(getLang())}
        <div class="sb-header-spacer"></div>
        <button class="sb-icon-btn js-refresh" title="Refresh">↻</button>
      </div>
      <div class="sb-error-card card">
        <div class="sb-error-icon">⛔</div>
        <div class="sb-error-msg">${title}</div>
        <div class="sb-error-sub">${sub}</div>
        <code class="sb-install-cmd mono">${escapeHtml(installCmd)}</code>
      </div>
    </div>`;
}

function buildSidebarHtml(
  snapshot: RateLimitSnapshot | null,
  error: PollerError | null,
  fhHist: PollPoint[],
  sdHist: PollPoint[],
  usage: UsageSummary | null,
  activeProvider: AgentProvider,
  providerAvailability: ProviderAvailability,
  codexSnapshot: CodexRateLimitSnapshot | null,
  codexBucketHistory: Map<number, PollPoint[]> = new Map()
): string {
  if (activeProvider === 'codex') {
    return buildCodexSidebarHtml(codexSnapshot, providerAvailability, usage, activeProvider, codexBucketHistory);
  }

  // Claude — not_installed는 기존 PollerError 분기보다 우선한다(§6, classifyAvailability와 동일
  // 우선순위: 미설치면 로그인 버튼을 주지 않는다). 그 외(not_authenticated류·no_records·ready)는
  // 기존에 이미 잘 동작하던 PollerError 기반 로직을 무변경으로 유지한다(회귀 위험 최소화).
  if (providerAvailability.claude === 'not_installed') {
    return buildNotInstalledCard(
      'claude', activeProvider, providerAvailability,
      t('not_installed_title'), t('login_sub_not_installed'), t('install_claude_cmd')
    );
  }

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
          ${buildProviderSwitcherHtml(activeProvider, providerAvailability)}
          ${buildLangSelect(lang)}
          <div class="sb-header-spacer"></div>
          <button class="sb-icon-btn js-refresh" title="Refresh">↻</button>
        </div>
        ${buildUsageRowHtml(usage, activeProvider)}
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
        ${buildProviderSwitcherHtml(activeProvider, providerAvailability)}
        ${planBadge}
        <span class="status-badge ${overall}">${statusLabel(overall)}</span>
        ${buildLangSelect(lang)}
        <div class="sb-header-spacer"></div>
        <span class="sb-gen-time mono">${timestamp}</span>
        <button class="sb-icon-btn js-refresh" aria-label="Refresh" title="Refresh">↻</button>
      </div>

      ${buildUsageRowHtml(usage, activeProvider)}
      ${fallbackBanner}

      <!-- 5h 세션 섹션 — hero(사이드바에서 유일하게 22px로 격상되는 지표) -->
      <div class="sb-section-hdr">
        <span class="sb-section-dot" style="background:${statusColor(fh.status)};"></span>
        <span class="sb-section-label">${t('session_5h')}</span>
        <span class="sb-section-right">
          <span class="mono" style="color:${statusColor(fh.status)};">${fmtPct(1 - fh.utilization)} ${t('left')}</span>
        </span>
      </div>
      <div class="sb-rate-card${isFhBottleneck ? ' is-bottleneck' : ''}">
        <div class="sb-hero-value mono" style="color:${statusColor(fh.status)};">${fmtPct(fh.utilization)}</div>
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
      ${buildFooterHtml(activeProvider, snapshot.plan?.subscriptionType ?? null, snapshot.generatedAt)}
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

/**
 * Codex 전용 사이드바 렌더(ST6/ST7/ST8). Claude와 레이아웃 문법(sb-section-hdr/sb-rate-card)은
 * 공유하되 데이터 계약이 다르다: overage·fallback·plan 배지가 없고, 한도는 **버킷 배열**로 와서
 * 개수·라벨이 런타임에 정해진다(D9 — free=1개/유료=2개, 5H/7D 하드코딩 금지). buckets가 비어있으면
 * (세션에 rate_limits 자체가 없음, API key 모드 등) 게이지 섹션 자체를 생략한다(§8 불변식5).
 * skillBreakdown·subagentStats·mcpServerBreakdown은 렌더하지 않는다(CODEX_CAPABILITIES=false,
 * §8 불변식6 — 추정으로 빈 섹션을 채우지 않는다. 사이드바는 원래 그 섹션들을 안 그리므로 이는
 * "숨김"이 아니라 panelView.ts ST6 몫이라는 점을 남겨둔다).
 */
function buildCodexSidebarHtml(
  snapshot: CodexRateLimitSnapshot | null,
  providerAvailability: ProviderAvailability,
  usage: UsageSummary | null,
  activeProvider: AgentProvider,
  bucketHistory: Map<number, PollPoint[]> = new Map()
): string {
  const avail = providerAvailability.codex;

  if (avail === 'not_installed') {
    return buildNotInstalledCard(
      'codex', activeProvider, providerAvailability,
      t('codex_not_installed_title'), t('codex_not_installed_sub'), t('install_codex_cmd')
    );
  }

  // Plan 배지(verify-impl B-V5/B-V6 보완) — Claude의 planBadge(subscriptionType)와 동일 위치·
  // 클래스 재사용. planType은 원본 문자열 그대로 대문자화만 한다(값별 분기 없음, §8 불변식5).
  const codexPlanBadge = snapshot?.planType
    ? `<span class="plan-badge">${escapeHtml(snapshot.planType.toUpperCase())}</span>`
    : '';

  const header = `
    <div class="sb-header">
      ${buildProviderSwitcherHtml(activeProvider, providerAvailability)}
      ${codexPlanBadge}
      ${buildLangSelect(getLang())}
      <div class="sb-header-spacer"></div>
      <button class="sb-icon-btn js-refresh" aria-label="Refresh" title="Refresh">↻</button>
    </div>`;

  if (avail === 'not_authenticated') {
    return `
      <div class="sb-layout">
        ${header}
        <div class="sb-error-card card">
          <div class="sb-error-icon">🔑</div>
          <div class="sb-error-msg">${t('codex_not_authenticated_title')}</div>
          <div class="sb-error-sub">${t('codex_not_authenticated_sub')}</div>
          <button class="login-btn js-login-codex">${t('login_cmd_codex')}</button>
          <div class="login-hint">${t('login_hint')}</div>
        </div>
      </div>`;
  }

  if (avail === 'no_records') {
    // 0%·$0을 그리지 않는다(§6) — "아직 안 씀"과 "한도 소진"을 같은 화면으로 만들지 않는다.
    return `
      <div class="sb-layout">
        ${header}
        <div class="sb-context-empty" style="margin-top:8px;">${t('codex_no_records_sub')}</div>
      </div>`;
  }

  // 컨텍스트 창 실측 + 추론 토큰(verify-impl B-V6 보완). model_context_window는 사용률(%) 계산
  // 근거가 없어(PLAN §7 — Codex는 context 점유율 계측 범위 밖) 크기만 실측치로 노출한다(추정 금지).
  // 추론 토큰은 today 스코프 실측 합계 — usage가 있고(오늘 활동 있음) 0이어도 측정된 0이라 표시한다.
  const codexContextRow = snapshot?.modelContextWindow != null
    ? `<div class="sb-section-hdr">
        <span class="sb-section-label">${t('codex_context_window')}</span>
        <span class="sb-section-right">
          <span class="mono" title="${escapeHtml(t('codex_context_window_note'))}">${snapshot.modelContextWindow.toLocaleString()}</span>
        </span>
      </div>`
    : '';
  const codexReasoningRow = (usage && (usage.today.totalTokens > 0 || usage.today.costUsd > 0))
    ? `<div class="sb-section-hdr">
        <span class="sb-section-label">${t('reasoning_tokens')}</span>
        <span class="sb-section-right">
          <span class="mono">${usage.todayReasoningTokens.toLocaleString()}</span>
        </span>
      </div>`
    : '';

  const buckets = snapshot?.buckets ?? [];
  const bucketCards = buckets.map((b, i) => {
    const status: 'allowed' | 'allowed_warning' | 'danger' =
      b.usedPercent >= 90 ? 'danger' : b.usedPercent >= 70 ? 'allowed_warning' : 'allowed';
    const color = status === 'danger' ? 'var(--c-danger)' : status === 'allowed_warning' ? 'var(--c-warn)' : 'var(--c-sonnet)';
    const label = b.labelKey ? t(b.labelKey) : `${b.windowMinutes}min`;
    const resetMs = Math.max(0, b.resetsAt * 1000 - Date.now());
    // ST10 — buildBurnRow는 이미 provider/window에 무관한 순수 함수(reference_codex_integration D13).
    // 버킷별 windowMinutes를 그대로 windowMs로 넘겨 하드코딩 없이 재사용한다(§8 불변식2).
    const bucketWindowMs = b.windowMinutes * 60_000;
    const burnRow = buildBurnRow(bucketHistory.get(b.windowMinutes) ?? [], b.usedPercent / 100, resetMs, bucketWindowMs);
    return `
      <div class="sb-section-hdr">
        <span class="sb-section-dot" style="background:${color};"></span>
        <span class="sb-section-label">${escapeHtml(label)}</span>
        <span class="sb-section-meta">window ${b.windowMinutes}</span>
        <span class="sb-section-right">
          <span class="mono" style="color:${color};">${b.usedPercent.toFixed(0)}%</span>
        </span>
      </div>
      <div class="sb-rate-card">
        <div class="rate-bar">
          <div class="rate-bar-fill" id="sb-codex-bucket-${i}" data-status="${status}"></div>
        </div>
        <div class="rate-meta-row">
          <span class="rate-reset-label">${t('resets_in')} <span class="mono">${fmtReset(resetMs)}</span></span>
        </div>
        ${burnRow}
      </div>`;
  }).join('');

  return `
    <div class="sb-layout">
      ${header}
      ${buildUsageRowHtml(usage, activeProvider)}
      ${bucketCards}
      ${codexContextRow}
      ${codexReasoningRow}
      ${buildSidebarCalendarHtml(usage)}
      <div class="sb-spacer"></div>
      ${buildFooterHtml(activeProvider, snapshot?.planType ?? null, snapshot?.generatedAt ?? null)}
      <div class="sb-dashboard-wrap">
        <button class="sb-dashboard-btn js-open-dashboard">⚡ ${t('open_dashboard')}</button>
      </div>
    </div>`;
}
