import { Messenger } from 'vscode-messenger';
import { BROADCAST } from 'vscode-messenger-common';
import type { CodexBucketHistoryPoint } from '../webview/codexBucketHistory';
import type { AgentProvider, CodexRateLimitSnapshot, PollHistoryPoint, ProviderAvailability, RateLimitSnapshot, RetroSummary, UsageSummary } from '../types';
import { GetActiveProvider, GetCodexPollHistory, GetCodexRateLimit, GetLang, GetPollHistory, GetProviderAvailability, GetRateLimit, GetRetroSummary, GetUsageSummary, PushLang, RequestClearPinnedSession, RequestLogin, RequestLoginCodex, RequestOpenBillingSettings, RequestOpenDashboard, RequestOpenSessionPicker, RequestRefresh, RequestSetLang, RequestSetProvider } from './contracts';

export function registerHandlers(
  messenger: Messenger,
  getSnapshot: () => RateLimitSnapshot | null,
  getPollHistory: () => PollHistoryPoint[],
  getUsageSummary: () => UsageSummary | null,
  onRefresh: () => void,
  onLogin: () => void,
  onLoginCodex: () => void,
  onOpenDashboard: () => void,
  onOpenBillingSettings: () => void,
  getLang: () => string,
  setLang: (lang: string) => void,
  getRetroSummary: () => Promise<RetroSummary | null>,
  onOpenSessionPicker: () => void,
  onClearPinnedSession: () => void,
  getActiveProvider: () => AgentProvider,
  onSetProvider: (provider: AgentProvider) => void,
  getProviderAvailability: () => ProviderAvailability,
  getCodexRateLimit: () => CodexRateLimitSnapshot | null,
  getCodexPollHistory: () => CodexBucketHistoryPoint[]
): void {
  messenger.onRequest(GetPollHistory, () => getPollHistory());
  messenger.onRequest(GetRateLimit, () => {
    const snap = getSnapshot();
    if (!snap) throw new Error('not_ready');
    return snap;
  });
  messenger.onRequest(GetCodexRateLimit, () => getCodexRateLimit());
  messenger.onRequest(GetCodexPollHistory, () => getCodexPollHistory());
  messenger.onRequest(GetUsageSummary, () => getUsageSummary());
  messenger.onRequest(GetRetroSummary, () => getRetroSummary());
  messenger.onRequest(GetLang, () => getLang());
  messenger.onRequest(GetActiveProvider, () => getActiveProvider());
  messenger.onRequest(GetProviderAvailability, () => getProviderAvailability());
  messenger.onNotification(RequestRefresh, () => { void onRefresh(); });
  messenger.onNotification(RequestLogin, () => { onLogin(); });
  messenger.onNotification(RequestLoginCodex, () => { onLoginCodex(); });
  messenger.onNotification(RequestOpenDashboard, () => { onOpenDashboard(); });
  messenger.onNotification(RequestOpenBillingSettings, () => { onOpenBillingSettings(); });
  messenger.onNotification(RequestOpenSessionPicker, () => { onOpenSessionPicker(); });
  messenger.onNotification(RequestClearPinnedSession, () => { onClearPinnedSession(); });
  const ALLOWED_PROVIDERS = new Set(['claude', 'codex']);
  messenger.onNotification(RequestSetProvider, (provider) => {
    if (!ALLOWED_PROVIDERS.has(provider)) return;
    onSetProvider(provider);
  });
  const ALLOWED_LANGS = new Set(['ko', 'en', 'ja', 'zh', 'auto']);
  messenger.onNotification(RequestSetLang, (lang) => {
    if (!ALLOWED_LANGS.has(lang)) return;
    setLang(lang);
    messenger.sendNotification(PushLang, BROADCAST, lang);
  });
}
