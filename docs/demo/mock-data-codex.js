// Codex 프로바이더 목업 데이터(P2, v0.2.0) — mock-data.js(Claude)와 짝을 이루는 provider 축.
//
// 숫자 출처(추측 금지, advisor 지적 — "Build it from the real fixture's numbers, not invented ones"):
// - "오늘" 총량은 test/fixtures/codex/real-free-exec-1turn-cli0.155.1.jsonl **실물** 그대로다:
//   모델 gpt-5.6-terra(2026-09-19 자체 실측에서 발견한 미등재 신모델 — 의도적으로 비가격 상태를 재현),
//   input 12,787 / cached 9,984 / output 5 / total 12,792, free 플랜 단일 30일 버킷.
// - 최근 7일·달력 시계열은 test/fixtures/codex/synth-plus-2turn-replay.jsonl(🟡 합성, 소스 확정 규칙
//   기반)의 total 3,120 패턴을 요일별로 소폭 변주해 반복한 것 — 실 데이터가 1건뿐이라 시계열 자체는
//   합성이지만 단위 수치(3,120/1,500/120/35)는 그 fixture의 실측값이다.
// - 가격 모델(gpt-5-codex)은 codexPricing.ts CODEX_PRICING의 실제 요율로 계산했다(추측 요율 아님).
//
// CODEX_CAPABILITIES(src/sources/AgentSource.ts)에 따라 skillAttribution/subagentAttribution/
// mcpAttribution은 false다 — 그래서 skillBreakdown·subagentStats·mcpServerBreakdown을 "숨길 예정"이
// 아니라 **실제로 비웠다**(추정으로 채우지 않는다, PLAN §8 불변식 6). ST6이 이 빈 배열을 보고 섹션
// 자체를 렌더 안 하게 만들기 전까지는, 기존 Claude용 렌더 함수가 빈 배열을 어떻게 다루는지(이미
// 있는 empty-state 경로)를 그대로 통과시켜 캡처한다 — 이게 이번 P2가 "byte-identical 캡처"가 아니라
// 실질 신호를 갖는 이유다.
const now = new Date();

// Codex rate_limits는 버킷 개수·기간이 가변이라(D9) — MOCK_CODEX_RATE_LIMIT(하단, buckets 배열)이
// 실제 데이터 계약이다(CodexRateLimitSnapshot, ST5/ST7 구현 완료분). free 플랜=30일 단일 버킷.
// sidebarView.ts의 buildCodexSidebarHtml은 이 buckets 계약만 읽는다.
const codexBucketResetAt = new Date(now.getTime() + 18 * 24 * 3600 * 1000); // 30일 버킷 잔여 18일


const todayStr = now.toISOString().slice(0, 10);
window.MOCK_USAGE_CODEX = {
  today: {
    date: todayStr,
    inputTokens: 12787,
    outputTokens: 5,
    cacheCreationTokens: 0,
    cacheReadTokens: 9984,
    totalTokens: 12792,
    costUsd: 0, // gpt-5.6-terra 미등재 — unpricedModels가 이 0을 "측정값"이 아니라 "미상"으로 표시해야 한다
    cacheHitRate: 9984 / (12787 - 9984 + 9984), // = cache_read / (input+cache_read), 비중첩 정규화 기준
  },
  last7Days: (() => {
    // synth-plus-2turn(total 3,120)을 요일별 ±20% 변주 — 실 데이터가 1건이라 추세선은 합성.
    const variance = [0.6, 0.85, 1.0, 1.2, 0.7, 0.5, 1.0];
    return variance.map((v, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - i));
      const input = Math.round(3000 * v), cached = Math.round(1500 * v), output = Math.round(120 * v);
      const total = input + output;
      return {
        date: d.toISOString().slice(0, 10),
        inputTokens: input - cached, outputTokens: output,
        cacheCreationTokens: 0, cacheReadTokens: cached,
        totalTokens: total,
        costUsd: ((input - cached) * 1.25 + cached * 0.125 + output * 10.0) / 1_000_000, // CODEX_PRICING['gpt-5-codex']
        cacheHitRate: cached / total,
      };
    });
  })(),
  recentSessions: [
    { sessionId: 'codex:01a0b70f-3d01-7d80-a21e-1a6ec4317cd4', startTime: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(), cwd: '/home/user/fixture-repo', totalTokens: 12792, costUsd: 0, messageCount: 1 },
  ],
  modelBreakdown: [
    { model: 'gpt-5.6-terra', tokens: 12792, costUsd: 0, share: 1.0, pricingSource: 'none' },
  ],
  unpricedModels: ['gpt-5.6-terra'],
  modelShareBasis: 'tokens', // 가격 미상 모델이 있으므로 비용 기준을 쓸 수 없다(기존 규약 그대로)
  todayReasoningTokens: 0, // 실 fixture(real-free-exec-1turn) 그대로 — reasoning_output_tokens 전부 0 (verify-impl B-V2 보완)
  cacheStats: { hitRate: 9984 / 12787, savedUsd: 0 }, // savedUsd도 가격 미상이라 0(측정 불가, 과대계상 방지)
  todayToolCounts: { edit: 0, write: 0, bash: 0, read: 0, grep: 0, webSearch: 0, webFetch: 0, mcp: 0, other: 0 },
  // CODEX_CAPABILITIES: skillAttribution=false, subagentAttribution=false, mcpAttribution=false
  // → 추정 채움 금지(PLAN §8 불변식6). 실제로 빈 상태로 둔다.
  skillBreakdown: [],
  skillUnattributed: { costUsd: 0, totalTokens: 0 },
  subagentStats: { mainCostUsd: 0, subagentCostUsd: 0, subagentShare: 0, subagentCount: 0 },
  mcpServerBreakdown: [],
  branchBreakdown: [
    { branch: 'feat/codex-fixture-test', costUsd: 0, totalTokens: 12792, sessionCount: 1, lastActive: now.toISOString() },
  ],
  activeBranch: 'feat/codex-fixture-test',
  historicalDays: Array.from({ length: 40 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (39 - i));
    const v = 0.5 + (i % 5) * 0.15;
    const input = Math.round(3000 * v), cached = Math.round(1500 * v), output = Math.round(120 * v);
    return {
      date: d.toISOString().slice(0, 10),
      inputTokens: input - cached, outputTokens: output, cacheCreationTokens: 0, cacheReadTokens: cached,
      totalTokens: input + output,
      costUsd: ((input - cached) * 1.25 + cached * 0.125 + output * 10.0) / 1_000_000,
      cacheHitRate: cached / (input + output),
    };
  }),
  sessionContext: null, // Codex의 컨텍스트 점유율 계측은 이번 범위 밖(S2 계열, Claude 전용 유지) — 추정 금지
  generatedAt: now.toISOString(),
  last7DaysTools: Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().slice(0, 10), edit: 0, write: 0, bash: 0, webSearch: 0 };
  }),
  recentEditedFiles: [],
};

// activeProvider='codex'로 강제 — panelView.ts가 이제 provider를 알아 Claude 전용 카드
// (fh/sd/burn/safe/trend/skill/retro)를 직접 숨기므로(applyProviderVisibility), getRateLimit/
// pushRateLimit(Claude 전용 고정 fiveHour/sevenDay 구조)은 더 이상 배선하지 않는다 — 프로덕션
// extension.ts도 activeProvider==='codex'일 때 PushRateLimit을 보내지 않는다(동일 계약).
window.MOCK_ACTIVE_PROVIDER = 'codex';
window.MOCK_PROVIDER_AVAILABILITY = { claude: 'ready', codex: 'ready' };
// buckets는 codexRollout.ts extractRateLimitBuckets 계약 그대로: free=단일 30일 버킷.
window.MOCK_CODEX_RATE_LIMIT = {
  buckets: [{ windowMinutes: 43200, usedPercent: 12, resetsAt: Math.floor(codexBucketResetAt.getTime() / 1000), labelKey: 'codex_bucket_30d' }],
  planType: 'free',
  generatedAt: now.toISOString(),
  modelContextWindow: 258400, // 실 fixture(real-free-exec-1turn) model_context_window 실측값 그대로 (verify-impl B-V1/B-V2 보완)
};

// mock-data.js와 동일한 목업 배선(acquireVsCodeApi + push) — MOCK_*_CODEX를 소비한다.
window.acquireVsCodeApi = function() {
  return {
    postMessage: function(msg) {
      if (!msg || !msg.id) return;
      let result;
      if      (msg.method === 'getUsageSummary') result = window.MOCK_USAGE_CODEX;
      else if (msg.method === 'getLang')         result = 'en';
      else if (msg.method === 'getActiveProvider')       result = window.MOCK_ACTIVE_PROVIDER;
      else if (msg.method === 'getProviderAvailability') result = window.MOCK_PROVIDER_AVAILABILITY;
      else if (msg.method === 'getCodexRateLimit')       result = window.MOCK_CODEX_RATE_LIMIT;
      else return;
      const resp = { id: msg.id, receiver: msg.sender, result };
      setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: resp })), 40);
    },
    getState: () => ({}),
    setState: () => {}
  };
};

function pushMockData() {
  const dispatch = (method, params) =>
    window.dispatchEvent(new MessageEvent('message', {
      data: { method, receiver: { type: 'broadcast' }, params }
    }));
  dispatch('pushUsageSummary', window.MOCK_USAGE_CODEX);
  dispatch('pushActiveProvider',       window.MOCK_ACTIVE_PROVIDER);
  dispatch('pushProviderAvailability', window.MOCK_PROVIDER_AVAILABILITY);
  dispatch('pushCodexRateLimit',       window.MOCK_CODEX_RATE_LIMIT);
}
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(pushMockData, 300);
  setTimeout(pushMockData, 800);
});
