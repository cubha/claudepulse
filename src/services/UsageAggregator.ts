import { findPricing } from '../utils/pricing';
import type { CacheStats, DailyUsage, ModelBreakdown, SessionRecord, SessionSummary, UsageSummary } from '../types';

export class UsageAggregator {
  aggregate(records: SessionRecord[]): UsageSummary {
    const now = new Date();
    const todayKey = toUtcDateKey(now);

    const byDay = new Map<string, DailyUsage>();
    const bySession = new Map<string, SessionSummary>();
    const byModel = new Map<string, { tokens: number; costUsd: number }>();

    // 오늘 캐시 집계용
    let todayCacheRead = 0;
    let todayCacheCreation = 0;
    let todayInput = 0;
    let todaySavedUsd = 0;

    for (const r of records) {
      const day = r.timestamp.slice(0, 10);

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

      // 오늘 전용 집계
      if (day === todayKey) {
        // 모델별 집계
        const existing = byModel.get(r.model) ?? { tokens: 0, costUsd: 0 };
        existing.tokens += r.usage.input_tokens + r.usage.output_tokens
          + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens;
        existing.costUsd += r.costUsd;
        byModel.set(r.model, existing);

        // 캐시 집계
        todayCacheRead += r.usage.cache_read_input_tokens;
        todayCacheCreation += r.usage.cache_creation_input_tokens;
        todayInput += r.usage.input_tokens;

        // 캐시 절약 비용: cache_read 대신 input 요금을 냈을 때의 차이
        const pricing = findPricing(r.model);
        if (pricing && r.usage.cache_read_input_tokens > 0) {
          todaySavedUsd += r.usage.cache_read_input_tokens
            * (pricing.input - pricing.cache_read) / 1_000_000;
        }
      }
    }

    // 일별 캐시 히트율 계산
    for (const d of byDay.values()) {
      const denom = d.inputTokens + d.cacheCreationTokens + d.cacheReadTokens;
      d.cacheHitRate = denom > 0 ? d.cacheReadTokens / denom : 0;
    }

    const today = byDay.get(todayKey) ?? emptyDay(todayKey);

    const last7Days = last7DayKeys(now)
      .map(k => byDay.get(k) ?? emptyDay(k));

    const recentSessions = [...bySession.values()]
      .sort((a, b) => b.startTime.localeCompare(a.startTime))
      .slice(0, 20);

    // 모델별 분해 (비용 내림차순)
    const totalCost = [...byModel.values()].reduce((sum, v) => sum + v.costUsd, 0);
    const modelBreakdown: ModelBreakdown[] = [...byModel.entries()]
      .map(([model, v]) => ({
        model,
        tokens: v.tokens,
        costUsd: v.costUsd,
        share: totalCost > 0 ? v.costUsd / totalCost : 0,
      }))
      .sort((a, b) => b.costUsd - a.costUsd);

    // 오늘 캐시 효율
    const cacheDenom = todayInput + todayCacheCreation + todayCacheRead;
    const cacheStats: CacheStats = {
      hitRate: cacheDenom > 0 ? todayCacheRead / cacheDenom : 0,
      savedUsd: todaySavedUsd,
    };

    return {
      today,
      last7Days,
      recentSessions,
      modelBreakdown,
      cacheStats,
      generatedAt: now.toISOString(),
    };
  }
}

function emptyDay(date: string): DailyUsage {
  return {
    date,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    cacheHitRate: 0,
  };
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
