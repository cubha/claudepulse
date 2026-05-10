import { Messenger } from 'vscode-messenger';
import { SnapshotPayload, AggregatedStats, BillingWindow } from '../types';
import { GetSnapshot, GetSessionDetail, GetSessions, RequestRefresh } from './contracts';
import { UsageAggregator } from '../services/UsageAggregator';

function emptySnapshot(): SnapshotPayload {
  const now = new Date();
  const empty: AggregatedStats = { bucket: '', totalTokens: 0, byModel: {}, cost: 0, sessionCount: 0 };
  const window: BillingWindow = { windowStart: now, windowEnd: now, msRemaining: 0, pctTimeRemaining: 0, tokensInWindow: 0 };
  return { today: empty, monthToDate: empty, topProjects: [], billingWindow: window, generatedAt: now };
}

export function registerHandlers(
  messenger: Messenger,
  getSnapshot: () => SnapshotPayload | null,
  onRefresh: () => Promise<void>,
  aggregator: UsageAggregator
): void {
  messenger.onRequest(GetSnapshot, () => getSnapshot() ?? emptySnapshot());
  messenger.onNotification(RequestRefresh, () => { void onRefresh(); });
  messenger.onRequest(GetSessions, ({ range }) => aggregator.listSessions(range));
  messenger.onRequest(GetSessionDetail, ({ sessionId }) => aggregator.getSessionDetail(sessionId));
}
