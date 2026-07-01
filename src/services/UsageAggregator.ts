import { findPricing } from '../utils/pricing';
import { emptyToolCounts } from './JsonlParser';
import type { BranchUsage, CacheStats, DailyToolStats, DailyUsage, ModelBreakdown, SessionRecord, SessionSummary, SkillUsage, SubagentStats, ToolUseCounts, UsageSummary } from '../types';

export class UsageAggregator {
  aggregate(records: SessionRecord[]): UsageSummary {
    const now = new Date();
    const todayKey = toUtcDateKey(now);

    const byDay = new Map<string, DailyUsage>();
    const bySession = new Map<string, SessionSummary>();
    const byModel = new Map<string, { tokens: number; costUsd: number }>();
    const byDayTools = new Map<string, DailyToolStats>();
    const byBranch = new Map<string, BranchUsage>();
    const branchSessionSets = new Map<string, Set<string>>();
    const bySkill = new Map<string, { costUsd: number; totalTokens: number }>();
    // "스킬 외 작업" 버킷 — !isSidechain && !attributionSkill (사이드체인 제외 = 이중계산 금지)
    const skillUnattributed = { costUsd: 0, totalTokens: 0 };

    // 서브에이전트 분리 집계
    let mainCostUsd = 0;
    let subagentCostUsd = 0;
    const subagentIds = new Set<string>();

    // 오늘 집계용
    let todayCacheRead = 0;
    let todayCacheCreation = 0;
    let todayInput = 0;
    let todaySavedUsd = 0;
    const todayTools: ToolUseCounts = emptyToolCounts();

    // 편집 파일 최근순 수집 (파일 경로 → 최근 timestamp)
    const fileLastSeen = new Map<string, string>();

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

      // 일별 도구 집계
      if (!byDayTools.has(day)) {
        byDayTools.set(day, { date: day, edit: 0, write: 0, bash: 0, webSearch: 0 });
      }
      const dt = byDayTools.get(day)!;
      dt.edit += r.toolCounts.edit;
      dt.write += r.toolCounts.write;
      dt.bash += r.toolCounts.bash;
      dt.webSearch += r.toolCounts.webSearch;

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

      // 브랜치별 집계
      if (r.gitBranch) {
        const b = byBranch.get(r.gitBranch) ?? {
          branch: r.gitBranch,
          costUsd: 0,
          totalTokens: 0,
          sessionCount: 0,
          lastActive: r.timestamp,
        };
        b.costUsd += r.costUsd;
        b.totalTokens += r.usage.input_tokens + r.usage.output_tokens
          + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens;
        if (r.timestamp > b.lastActive) b.lastActive = r.timestamp;
        byBranch.set(r.gitBranch, b);

        // 브랜치별 고유 세션 수집 (메인 루프 통합 — 별도 재순회 제거)
        const set = branchSessionSets.get(r.gitBranch) ?? new Set<string>();
        set.add(r.sessionId);
        branchSessionSets.set(r.gitBranch, set);
      }

      // 스킬별 집계 (#7) — 메인체인만(!isSidechain). 사이드체인은 subagentStats로 별도(이중계산 금지)
      if (!r.isSidechain) {
        const tokens = r.usage.input_tokens + r.usage.output_tokens
          + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens;
        if (r.attributionSkill) {
          const sk = bySkill.get(r.attributionSkill) ?? { costUsd: 0, totalTokens: 0 };
          sk.costUsd += r.costUsd;
          sk.totalTokens += tokens;
          bySkill.set(r.attributionSkill, sk);
        } else {
          // 스킬 외 작업 버킷 (1급) — 활성 스킬 없던 메인 작업
          skillUnattributed.costUsd += r.costUsd;
          skillUnattributed.totalTokens += tokens;
        }
      }

      // 서브에이전트 vs 메인 분리 (#8)
      if (r.isSidechain) {
        subagentCostUsd += r.costUsd;
        if (r.agentId) subagentIds.add(r.agentId);
      } else {
        mainCostUsd += r.costUsd;
      }

      // 편집 파일 추적
      for (const fp of r.editedFiles) {
        const prev = fileLastSeen.get(fp);
        if (!prev || r.timestamp > prev) {
          fileLastSeen.set(fp, r.timestamp);
        }
      }

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

        // 캐시 절약 비용
        const pricing = findPricing(r.model);
        if (pricing && r.usage.cache_read_input_tokens > 0) {
          todaySavedUsd += r.usage.cache_read_input_tokens
            * (pricing.input - pricing.cache_read) / 1_000_000;
        }

        // 오늘 도구 집계
        todayTools.edit += r.toolCounts.edit;
        todayTools.write += r.toolCounts.write;
        todayTools.bash += r.toolCounts.bash;
        todayTools.read += r.toolCounts.read;
        todayTools.grep += r.toolCounts.grep;
        todayTools.webSearch += r.toolCounts.webSearch;
        todayTools.webFetch += r.toolCounts.webFetch;
        todayTools.mcp += r.toolCounts.mcp;
        todayTools.other += r.toolCounts.other;
      }
    }

    // 브랜치별 세션 수 반영 (수집은 메인 루프에서 완료)
    for (const [branch, sessions] of branchSessionSets) {
      const b = byBranch.get(branch);
      if (b) b.sessionCount = sessions.size;
    }

    // 일별 캐시 히트율 계산
    for (const d of byDay.values()) {
      const denom = d.inputTokens + d.cacheCreationTokens + d.cacheReadTokens;
      d.cacheHitRate = denom > 0 ? d.cacheReadTokens / denom : 0;
    }

    const today = byDay.get(todayKey) ?? emptyDay(todayKey);
    const last7Days = last7DayKeys(now).map(k => byDay.get(k) ?? emptyDay(k));
    const last7DaysTools: DailyToolStats[] = last7DayKeys(now)
      .map(k => byDayTools.get(k) ?? { date: k, edit: 0, write: 0, bash: 0, webSearch: 0 });

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

    // 최근 편집 파일 (최근 활동 순 top 20)
    const recentEditedFiles = [...fileLastSeen.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, 20)
      .map(([fp]) => fp);

    // 브랜치별 집계 (비용 내림차순)
    const branchBreakdown = [...byBranch.values()]
      .sort((a, b) => b.costUsd - a.costUsd);

    // 가장 최근 활성 브랜치 (마지막 레코드의 gitBranch)
    const lastRecord = records.length > 0
      ? records.reduce((a, b) => a.timestamp > b.timestamp ? a : b)
      : null;
    const activeBranch = lastRecord?.gitBranch ?? '';

    // 스킬별 비용 분해 (#7) — 비용 내림차순.
    // share 분모 = grand-total(Σskill + 스킬 외 버킷) = 전체 메인체인 비용. 거짓 정밀도 회피.
    const skillTotalCost = [...bySkill.values()].reduce((sum, v) => sum + v.costUsd, 0);
    const skillGrandTotal = skillTotalCost + skillUnattributed.costUsd;
    const skillBreakdown: SkillUsage[] = [...bySkill.entries()]
      .map(([skill, v]) => ({
        skill,
        costUsd: v.costUsd,
        totalTokens: v.totalTokens,
        share: skillGrandTotal > 0 ? v.costUsd / skillGrandTotal : 0,
      }))
      .sort((a, b) => b.costUsd - a.costUsd);

    // 서브에이전트 vs 메인 소비 분리 (#8)
    const totalAttributedCost = mainCostUsd + subagentCostUsd;
    const subagentStats: SubagentStats = {
      mainCostUsd,
      subagentCostUsd,
      subagentShare: totalAttributedCost > 0 ? subagentCostUsd / totalAttributedCost : 0,
      subagentCount: subagentIds.size,
    };

    return {
      today,
      last7Days,
      recentSessions,
      modelBreakdown,
      cacheStats,
      todayToolCounts: todayTools,
      last7DaysTools,
      recentEditedFiles,
      branchBreakdown,
      skillBreakdown,
      skillUnattributed,
      subagentStats,
      activeBranch,
      // jsonl이 보유한 전체 범위(회전 천장 ~30일)를 반환 — extension.ts가 이를 CacheStore에
      // merge해 last7Days 이후로도 영구 보존한다(v0.1.43 히트맵 backfill). 신규 파싱/dedup 경로
      // 없음 — allRecords가 이미 JsonlParser의 message.id/requestId dedup을 거친 값이다.
      historicalDays: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
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
