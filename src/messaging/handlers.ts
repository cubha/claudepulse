import { Messenger } from 'vscode-messenger';
import { BROADCAST } from 'vscode-messenger-common';
import type { RateLimitSnapshot, UsageSummary } from '../types';
import { GetLang, GetRateLimit, GetUsageSummary, PushLang, RequestLogin, RequestOpenBillingSettings, RequestOpenDashboard, RequestRefresh, RequestSetLang } from './contracts';

export function registerHandlers(
  messenger: Messenger,
  getSnapshot: () => RateLimitSnapshot | null,
  getUsageSummary: () => UsageSummary | null,
  onRefresh: () => void,
  onLogin: () => void,
  onOpenDashboard: () => void,
  onOpenBillingSettings: () => void,
  getLang: () => string,
  setLang: (lang: string) => void
): void {
  messenger.onRequest(GetRateLimit, () => {
    const snap = getSnapshot();
    if (!snap) throw new Error('not_ready');
    return snap;
  });
  messenger.onRequest(GetUsageSummary, () => getUsageSummary());
  messenger.onRequest(GetLang, () => getLang());
  messenger.onNotification(RequestRefresh, () => { void onRefresh(); });
  messenger.onNotification(RequestLogin, () => { onLogin(); });
  messenger.onNotification(RequestOpenDashboard, () => { onOpenDashboard(); });
  messenger.onNotification(RequestOpenBillingSettings, () => { onOpenBillingSettings(); });
  messenger.onNotification(RequestSetLang, (lang) => {
    setLang(lang);
    messenger.sendNotification(PushLang, BROADCAST, lang);
  });
}
