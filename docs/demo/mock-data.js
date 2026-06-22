// Shared mock data for sidebar.html and panel.html
const now = new Date();
const resetAt5h = new Date(now.getTime() + 71 * 60 * 1000); // +71 min
const resetAt7d = new Date(now.getTime() + 39 * 3600 * 1000); // +39h

window.MOCK_RATE_LIMIT = {
  fiveHour: {
    utilization: 0.36,
    resetAt: resetAt5h.toISOString(),
    msUntilReset: 71 * 60 * 1000,
    status: 'allowed_warning'
  },
  sevenDay: {
    utilization: 0.26,
    resetAt: resetAt7d.toISOString(),
    msUntilReset: 39 * 3600 * 1000,
    status: 'allowed'
  },
  overallStatus: 'allowed_warning',
  generatedAt: now.toISOString(),
  plan: { subscriptionType: 'max', rateLimitTier: 'default_claude_max_5x', organizationUuid: 'demo' },
  representativeClaim: 'five_hour',
  overage: {
    status: 'allowed',
    utilization: 0.42
  }
};

const todayStr = now.toISOString().slice(0, 10);
window.MOCK_USAGE = {
  today: {
    date: todayStr,
    inputTokens: 38412,
    outputTokens: 8881,
    cacheCreationTokens: 12400,
    cacheReadTokens: 31200,
    totalTokens: 47293,
    costUsd: 2.14,
    cacheHitRate: 0.68
  },
  last7Days: (() => {
    const costs   = [0.38, 1.12, 0.95, 2.41, 1.87, 0.73, 2.14];
    const hitRates= [0.55, 0.61, 0.63, 0.70, 0.67, 0.72, 0.68];
    return costs.map((costUsd, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - i));
      const tokens = Math.round(costUsd * 22000);
      return {
        date: d.toISOString().slice(0, 10),
        inputTokens: Math.round(tokens * 0.8),
        outputTokens: Math.round(tokens * 0.18),
        cacheCreationTokens: Math.round(tokens * 0.25),
        cacheReadTokens: Math.round(tokens * 0.65),
        totalTokens: tokens,
        costUsd,
        cacheHitRate: hitRates[i]
      };
    });
  })(),
  recentSessions: [
    { sessionId: 's1', startTime: new Date(now.getTime() - 2*60*60*1000).toISOString(), cwd: '/mnt/d/workspace/claudepulse', totalTokens: 12841, costUsd: 0.61, messageCount: 23 },
    { sessionId: 's2', startTime: new Date(now.getTime() - 5*60*60*1000).toISOString(), cwd: '/mnt/d/workspace/claudepulse', totalTokens: 18294, costUsd: 0.87, messageCount: 31 },
    { sessionId: 's3', startTime: new Date(now.getTime() - 9*60*60*1000).toISOString(), cwd: '/mnt/d/workspace/myproject',   totalTokens: 9158,  costUsd: 0.43, messageCount: 18 },
    { sessionId: 's4', startTime: new Date(now.getTime() - 13*60*60*1000).toISOString(),cwd: '/mnt/d/workspace/claudepulse', totalTokens: 7000,  costUsd: 0.23, messageCount: 12 },
  ],
  modelBreakdown: [
    { model: 'claude-sonnet-4-5-20251022', tokens: 40199, costUsd: 1.83, share: 0.855 },
    { model: 'claude-opus-4-5-20251022',   tokens: 4730,  costUsd: 0.24, share: 0.112 },
    { model: 'claude-haiku-4-5-20251001',  tokens: 2364,  costUsd: 0.07, share: 0.033 },
  ],
  cacheStats: { hitRate: 0.68, savedUsd: 0.89 },
  todayToolCounts: { edit: 31, write: 12, bash: 156, read: 248, grep: 14, webSearch: 3, webFetch: 9, mcp: 41, other: 7 },
  // share 분모 = grand-total(Σskill + 스킬 외 버킷). 버킷이 최대(실측 커버리지 ~33% → 외부 ~67%)
  skillBreakdown: [
    { skill: 'sh-dev-loop',     costUsd: 4.82, totalTokens: 980000, share: 0.153 },
    { skill: 'ship',            costUsd: 2.10, totalTokens: 410000, share: 0.067 },
    { skill: 'deep-research',   costUsd: 1.34, totalTokens: 260000, share: 0.043 },
    { skill: 'plan',            costUsd: 0.88, totalTokens: 170000, share: 0.028 },
    { skill: 'security-review', costUsd: 0.62, totalTokens: 120000, share: 0.020 },
    { skill: 'refactoring',     costUsd: 0.41, totalTokens: 80000,  share: 0.013 },
    { skill: 'debugger',        costUsd: 0.33, totalTokens: 64000,  share: 0.010 },
  ],
  skillUnattributed: { costUsd: 21.00, totalTokens: 4200000 },
  subagentStats: { mainCostUsd: 7.31, subagentCostUsd: 3.19, subagentShare: 0.304, subagentCount: 12 },
  branchBreakdown: [],
  activeBranch: 'main',
  historicalDays: [],
  generatedAt: now.toISOString(),
  last7DaysTools: (() => {
    const edits  = [12, 23, 18, 31, 27, 15, 89];
    const writes = [2,  4,  1,  5,  3,  2,  12];
    const bashes = [18, 31, 24, 47, 38, 22, 156];
    const search = [0,  1,  0,  2,  0,  1,  3];
    return edits.map((edit, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - i));
      return { date: d.toISOString().slice(0, 10), edit, write: writes[i], bash: bashes[i], webSearch: search[i] };
    });
  })(),
  recentEditedFiles: [
    'src/providers/SidebarViewProvider.ts',
    'src/webview/main.ts',
    'src/panel/DashboardPanel.ts',
    'src/services/UsageAggregator.ts',
    'src/webview/i18n.ts',
    'src/webview/styles.css',
    'src/messaging/contracts.ts',
    'src/services/JsonlParser.ts',
  ]
};

// Mock acquireVsCodeApi — intercepts messenger requests, responds with static data
window.acquireVsCodeApi = function() {
  return {
    postMessage: function(msg) {
      if (!msg || !msg.id) return;
      let result;
      if      (msg.method === 'getRateLimit')    result = window.MOCK_RATE_LIMIT;
      else if (msg.method === 'getUsageSummary') result = window.MOCK_USAGE;
      else if (msg.method === 'getLang')         result = 'en';
      else return;
      const resp = { id: msg.id, receiver: msg.sender, result };
      setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: resp })), 40);
    },
    getState: () => ({}),
    setState: () => {}
  };
};

// Auto-push data via notifications after main.js initializes
function pushMockData() {
  const dispatch = (method, params) =>
    window.dispatchEvent(new MessageEvent('message', {
      data: { method, receiver: { type: 'broadcast' }, params }
    }));
  dispatch('pushRateLimit',    window.MOCK_RATE_LIMIT);
  dispatch('pushUsageSummary', window.MOCK_USAGE);
}
// Push once immediately after scripts load, then again after a short delay
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(pushMockData, 300);
  setTimeout(pushMockData, 800);
});
