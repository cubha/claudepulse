import { Messenger } from 'vscode-messenger';
import { BROADCAST } from 'vscode-messenger-common';
import type { PollHistoryPoint, RateLimitSnapshot, RetroSummary, UsageSummary } from '../types';
import { GetLang, GetPollHistory, GetRateLimit, GetRetroSummary, GetUsageSummary, PushLang, RequestLogin, RequestOpenBillingSettings, RequestOpenDashboard, RequestRefresh, RequestSetLang } from './contracts';

export function registerHandlers(
  messenger: Messenger,
  getSnapshot: () => RateLimitSnapshot | null,
  getPollHistory: () => PollHistoryPoint[],
  getUsageSummary: () => UsageSummary | null,
  onRefresh: () => void,
  onLogin: () => void,
  onOpenDashboard: () => void,
  onOpenBillingSettings: () => void,
  getLang: () => string,
  setLang: (lang: string) => void,
  getRetroSummary: () => Promise<RetroSummary | null>
): void {
  messenger.onRequest(GetPollHistory, () => getPollHistory());
  messenger.onRequest(GetRateLimit, () => {
    const snap = getSnapshot();
    if (!snap) throw new Error('not_ready');
    return snap;
  });
  messenger.onRequest(GetUsageSummary, () => getUsageSummary());
  messenger.onRequest(GetRetroSummary, () => getRetroSummary());
  messenger.onRequest(GetLang, () => getLang());
  messenger.onNotification(RequestRefresh, () => { void onRefresh(); });
  messenger.onNotification(RequestLogin, () => { onLogin(); });
  messenger.onNotification(RequestOpenDashboard, () => { onOpenDashboard(); });
  messenger.onNotification(RequestOpenBillingSettings, () => { onOpenBillingSettings(); });
  const ALLOWED_LANGS = new Set(['ko', 'en', 'ja', 'zh', 'auto']);
  messenger.onNotification(RequestSetLang, (lang) => {
    if (!ALLOWED_LANGS.has(lang)) return;
    setLang(lang);
    messenger.sendNotification(PushLang, BROADCAST, lang);
  });
}
