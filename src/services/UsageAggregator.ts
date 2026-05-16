import type { DailyUsage, SessionRecord, SessionSummary, UsageSummary } from '../types';

export class UsageAggregator {
  /**
   * 전체 레코드 목록에서 UsageSummary를 생성한다.
   * records는 이미 dedup된 상태여야 한다.
   */
  aggregate(records: SessionRecord[]): UsageSummary {
    const now = new Date();
    const todayKey = toUtcDateKey(now);

    const byDay = new Map<string, DailyUsage>();
    const bySession = new Map<string, SessionSummary>();

    for (const r of records) {
      const day = r.timestamp.slice(0, 10); // YYYY-MM-DD UTC 기준

      // 일별 집계
      if (!byDay.has(day)) {
        byDay.set(day, emptyDay(day));
      }
      const d = byDay.get(day)!;
      d.inputTokens += r.usage.input_tokens;
      d.outputTokens += r.usage.output_tokens;
      d.cacheCreationTokens += r.usage.cache_creation_input_tokens;
      d.cacheReadTokens += r.usage.cache_read_input_tokens;
      d.totalTokens += r.usage.input_tokens + r.usage.output_tokens
        + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens;
      d.costUsd += r.costUsd;

      // 세션 집계
      if (!bySession.has(r.sessionId)) {
        bySession.set(r.sessionId, {
          sessionId: r.sessionId,
          startTime: r.timestamp,
          cwd: r.cwd,
          totalTokens: 0,
          costUsd: 0,
          messageCount: 0,
        });
      }
      const s = bySession.get(r.sessionId)!;
      if (r.timestamp < s.startTime) s.startTime = r.timestamp;
      s.totalTokens += r.usage.input_tokens + r.usage.output_tokens
        + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens;
      s.costUsd += r.costUsd;
      s.messageCount += 1;
    }

    const today = byDay.get(todayKey) ?? emptyDay(todayKey);

    // 최근 7일 (오늘 포함, 오래된 날짜 오름차순)
    const last7Days = last7DayKeys(now)
      .map(k => byDay.get(k) ?? emptyDay(k));

    // 최근 세션 20개 (최신 먼저)
    const recentSessions = [...bySession.values()]
      .sort((a, b) => b.startTime.localeCompare(a.startTime))
      .slice(0, 20);

    return {
      today,
      last7Days,
      recentSessions,
      generatedAt: now.toISOString(),
    };
  }
}

function emptyDay(date: string): DailyUsage {
  return { date, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, costUsd: 0 };
}

function toUtcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function last7DayKeys(now: Date): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}
