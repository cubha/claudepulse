import * as path from 'node:path';
import { AggregatedStats, BillingWindow, DailyStats, ProjectSummary, SessionDetail, SessionSummary, SnapshotPayload, UsageRecord } from '../types';

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const TOP_PROJECTS_CAP = 5;

/**
 * UsageRecord[] → SnapshotPayload 산출.
 *
 * - messageId 기준 Map 저장으로 parser 외 추가 dedup 방어
 * - today / monthToDate / topProjects / 5h billingWindow 계산
 * - 5h Window 시간 기준만 정확. estimatedPctRemaining은 V1 undefined (Anthropic 한도 비공개)
 */
export class UsageAggregator {
  private readonly recordsById = new Map<string, UsageRecord>();

  ingest(records: UsageRecord[]): void {
    for (const r of records) {
      if (!this.recordsById.has(r.messageId)) {
        this.recordsById.set(r.messageId, r);
      }
    }
  }

  buildSnapshot(now: Date = new Date(), currentWorkspacePaths: string[] = []): SnapshotPayload {
    const all = Array.from(this.recordsById.values());

    const todayRecords = all.filter((r) => isSameCalendarDay(r.timestamp, now));
    const mtdRecords = all.filter((r) => isSameCalendarMonth(r.timestamp, now));

    const currentWorkspaceProject = currentWorkspacePaths.length > 0
      ? buildCurrentWorkspaceProject(all, currentWorkspacePaths)
      : undefined;

    return {
      today: aggregate(todayRecords, formatDateBucket(now)),
      monthToDate: aggregate(mtdRecords, formatMonthBucket(now)),
      topProjects: buildTopProjects(all),
      billingWindow: buildBillingWindow(all, now),
      generatedAt: now,
      currentWorkspaceProject,
      dailyBreakdown: buildDailyBreakdown(all, now, 30),
    };
  }

  listSessions(range: '7d' | '30d' | 'all' = '30d', now: Date = new Date()): SessionSummary[] {
    const all = Array.from(this.recordsById.values());
    const cutoff = getRangeCutoff(range, now);
    const filtered = cutoff ? all.filter((r) => r.timestamp >= cutoff) : all;

    const bySession = new Map<string, UsageRecord[]>();
    for (const r of filtered) {
      const bucket = bySession.get(r.sessionId) ?? [];
      bucket.push(r);
      bySession.set(r.sessionId, bucket);
    }

    const summaries: SessionSummary[] = [];
    for (const [sessionId, records] of bySession) {
      summaries.push(buildSessionSummary(sessionId, records));
    }
    summaries.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return summaries;
  }

  getSessionDetail(sessionId: string): SessionDetail | null {
    const records = Array.from(this.recordsById.values()).filter((r) => r.sessionId === sessionId);
    if (records.length === 0) return null;

    const summary = buildSessionSummary(sessionId, records);
    const bucketMs = 5 * 60 * 1000;
    const bucketMap = new Map<number, { tokens: number; costUSD: number }>();

    for (const r of records) {
      const key = Math.floor(r.timestamp.getTime() / bucketMs) * bucketMs;
      const existing = bucketMap.get(key) ?? { tokens: 0, costUSD: 0 };
      existing.tokens += r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
      existing.costUSD += r.costUSD;
      bucketMap.set(key, existing);
    }

    const timeSeries = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([bucketStart, data]) => ({ bucketStart: new Date(bucketStart), ...data }));

    return { ...summary, timeSeries };
  }

  reset(): void {
    this.recordsById.clear();
  }
}

function getRangeCutoff(range: '7d' | '30d' | 'all', now: Date): Date | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function buildSessionSummary(sessionId: string, records: UsageRecord[]): SessionSummary {
  records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const startedAt = records[0].timestamp;
  const endedAt = records[records.length - 1].timestamp;
  let totalTokens = 0;
  let costUSD = 0;
  const modelBreakdown: Record<string, number> = {};
  for (const r of records) {
    const t = r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    totalTokens += t;
    costUSD += r.costUSD;
    modelBreakdown[r.model] = (modelBreakdown[r.model] ?? 0) + t;
  }
  const projectPath = records[0].projectPath;
  return {
    sessionId,
    projectPath,
    displayName: path.basename(projectPath) || projectPath,
    startedAt,
    endedAt,
    durationMs: endedAt.getTime() - startedAt.getTime(),
    totalTokens,
    costUSD,
    modelBreakdown,
  };
}

function buildDailyBreakdown(records: UsageRecord[], now: Date, days: number): DailyStats[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  cutoff.setHours(0, 0, 0, 0);

  const byDate = new Map<string, DailyStats>();

  for (const r of records) {
    if (r.timestamp < cutoff) continue;
    const dateKey = formatDateBucket(r.timestamp);
    let day = byDate.get(dateKey);
    if (!day) {
      day = { date: dateKey, byModel: {}, totalTokens: 0, cost: 0 };
      byDate.set(dateKey, day);
    }
    const tokens = r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    day.totalTokens += tokens;
    day.cost += r.costUSD;
    day.byModel[r.model] = (day.byModel[r.model] ?? 0) + tokens;
  }

  // 날짜 오름차순 정렬
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildCurrentWorkspaceProject(all: UsageRecord[], workspacePaths: string[]): ProjectSummary | undefined {
  const matched = all.filter((r) =>
    workspacePaths.some((wp) => r.projectPath === wp || r.projectPath.startsWith(wp))
  );
  if (matched.length === 0) return undefined;

  let tokens = 0, cost = 0, lastActivity = matched[0].timestamp;
  const sessions = new Set<string>();
  for (const r of matched) {
    tokens += r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    cost += r.costUSD;
    sessions.add(r.sessionId);
    if (r.timestamp.getTime() > lastActivity.getTime()) lastActivity = r.timestamp;
  }
  const projectPath = workspacePaths[0];
  return {
    projectPath,
    displayName: path.basename(projectPath) || projectPath,
    totalTokens: tokens,
    cost,
    sessionCount: sessions.size,
    lastActivity,
  };
}

function aggregate(records: UsageRecord[], bucket: string): AggregatedStats {
  if (records.length === 0) {
    return { bucket, totalTokens: 0, byModel: {}, cost: 0, sessionCount: 0 };
  }

  const byModel: Record<string, number> = {};
  const sessions = new Set<string>();
  let totalTokens = 0;
  let cost = 0;

  for (const r of records) {
    const tokens = r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    totalTokens += tokens;
    cost += r.costUSD;
    sessions.add(r.sessionId);
    byModel[r.model] = (byModel[r.model] ?? 0) + tokens;
  }

  return { bucket, totalTokens, byModel, cost, sessionCount: sessions.size };
}

function buildTopProjects(records: UsageRecord[]): ProjectSummary[] {
  if (records.length === 0) return [];

  const byPath = new Map<string, { tokens: number; cost: number; sessions: Set<string>; lastActivity: Date }>();

  for (const r of records) {
    let entry = byPath.get(r.projectPath);
    if (!entry) {
      entry = { tokens: 0, cost: 0, sessions: new Set(), lastActivity: r.timestamp };
      byPath.set(r.projectPath, entry);
    }
    entry.tokens += r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    entry.cost += r.costUSD;
    entry.sessions.add(r.sessionId);
    if (r.timestamp.getTime() > entry.lastActivity.getTime()) {
      entry.lastActivity = r.timestamp;
    }
  }

  const summaries: ProjectSummary[] = [];
  for (const [projectPath, agg] of byPath) {
    summaries.push({
      projectPath,
      displayName: path.basename(projectPath) || projectPath,
      totalTokens: agg.tokens,
      cost: agg.cost,
      sessionCount: agg.sessions.size,
      lastActivity: agg.lastActivity,
    });
  }

  summaries.sort((a, b) => b.cost - a.cost);
  return summaries.slice(0, TOP_PROJECTS_CAP);
}

function buildBillingWindow(records: UsageRecord[], now: Date): BillingWindow {
  const cutoff = now.getTime() - FIVE_HOURS_MS;
  const within = records.filter((r) => r.timestamp.getTime() >= cutoff);

  if (within.length === 0) {
    return {
      windowStart: now,
      windowEnd: now,
      msRemaining: 0,
      pctTimeRemaining: 0,
      tokensInWindow: 0,
    };
  }

  const oldest = within.reduce((min, r) =>
    r.timestamp.getTime() < min.timestamp.getTime() ? r : min,
  );
  const windowStart = oldest.timestamp;
  const windowEnd = new Date(windowStart.getTime() + FIVE_HOURS_MS);
  const msRemaining = Math.max(0, windowEnd.getTime() - now.getTime());
  const pctTimeRemaining = (msRemaining / FIVE_HOURS_MS) * 100;

  let tokensInWindow = 0;
  for (const r of within) {
    tokensInWindow += r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
  }

  return { windowStart, windowEnd, msRemaining, pctTimeRemaining, tokensInWindow };
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameCalendarMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function formatDateBucket(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatMonthBucket(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
