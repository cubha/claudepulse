import * as path from 'node:path';
import { findPricing, resolvePricing } from '../utils/pricing';
import type { PricingSource } from '../utils/pricing';
import { calcContextUsageRatio, findContextWindow } from '../utils/contextWindow';
import { cwdMatchesWorkspace } from '../utils/workspaceMatch';
import { emptyToolCounts } from './JsonlParser';
import type { AttributionScope, BranchUsage, CacheStats, ContextSessionSummary, DailyToolStats, DailyUsage, McpServerUsage, ModelBreakdown, ModelShareBasis, SessionContextUsage, SessionRecord, SessionSummary, SkillUsage, SubagentStats, ToolUseCounts, UsageSummary } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 스킬·서브에이전트·MCP attribution 계산 — 24h/7d/전체 스코프에 동일 로직 재사용.
 * share 분모는 항상 grand-total(스킬 Σ + 미귀속 버킷 / MCP는 스코프 내 총 호출수), 이중계산 없음.
 */
function computeAttribution(records: SessionRecord[]): AttributionScope {
  const bySkill = new Map<string, { costUsd: number; totalTokens: number }>();
  const skillUnattributed = { costUsd: 0, totalTokens: 0 };
  let mainCostUsd = 0;
  let subagentCostUsd = 0;
  const subagentIds = new Set<string>();
  const byMcpServer = new Map<string, number>();

  for (const r of records) {
    const tokens = r.usage.input_tokens + r.usage.output_tokens
      + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens;

    // 스킬별 집계 (#7) — 메인체인만(!isSidechain). 사이드체인은 subagentStats로 별도(이중계산 금지)
    if (!r.isSidechain) {
      if (r.attributionSkill) {
        const sk = bySkill.get(r.attributionSkill) ?? { costUsd: 0, totalTokens: 0 };
        sk.costUsd += r.costUsd;
        sk.totalTokens += tokens;
        bySkill.set(r.attributionSkill, sk);
      } else {
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

    // MCP 서버별 호출수 (v0.1.48) — 메인/서브 구분 없이 전부 집계(도구 사용은 체인 유형과 무관)
    if (r.mcpServerCounts) {
      for (const [server, count] of Object.entries(r.mcpServerCounts)) {
        byMcpServer.set(server, (byMcpServer.get(server) ?? 0) + count);
      }
    }
  }

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

  const totalAttributedCost = mainCostUsd + subagentCostUsd;
  const subagentStats: SubagentStats = {
    mainCostUsd,
    subagentCostUsd,
    subagentShare: totalAttributedCost > 0 ? subagentCostUsd / totalAttributedCost : 0,
    subagentCount: subagentIds.size,
  };

  const mcpTotalCalls = [...byMcpServer.values()].reduce((sum, v) => sum + v, 0);
  const mcpServerBreakdown: McpServerUsage[] = [...byMcpServer.entries()]
    .map(([server, callCount]) => ({
      server,
      callCount,
      share: mcpTotalCalls > 0 ? callCount / mcpTotalCalls : 0,
    }))
    .sort((a, b) => b.callCount - a.callCount);

  return { skillBreakdown, skillUnattributed, subagentStats, mcpServerBreakdown };
}

/**
 * 레코드의 실제 컨텍스트 창 점유량(S2) — contextTokens(JsonlParser가 iterations 기준으로 계산)를
 * 우선하고, 없으면(손으로 만든 레거시 테스트 픽스처 등) 기존 usage 합계로 폴백한다.
 */
function resolveContextTokens(r: SessionRecord): number {
  return r.contextTokens ?? (r.usage.input_tokens + r.usage.cache_read_input_tokens + r.usage.cache_creation_input_tokens);
}

export class UsageAggregator {
  aggregate(records: SessionRecord[], workspaceRoots?: string | string[], knownOneMillionModels?: Set<string>, pinnedSessionId?: string | null): UsageSummary {
    const now = new Date();
    const todayKey = toUtcDateKey(now);

    const byDay = new Map<string, DailyUsage>();
    const bySession = new Map<string, SessionSummary>();
    const byModel = new Map<string, { tokens: number; costUsd: number; pricingSource: PricingSource }>();
    const byDayTools = new Map<string, DailyToolStats>();
    const byBranch = new Map<string, BranchUsage>();
    const branchSessionSets = new Map<string, Set<string>>();

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

      // 세션 집계 — cwd는 최초 레코드 기준 고정(세션 시작 위치 표시용, recentSessions/대시보드
      // "최근 세션" 테이블 소비). contextSessionMap(아래, 세션 선택기 전용)은 반대로 최신 레코드의
      // cwd를 쓴다 — 목적이 다른 별개 계산이라 의도적으로 통일하지 않는다(scope-critic 검토 확인).
      if (!bySession.has(r.sessionId)) {
        bySession.set(r.sessionId, {
          sessionId: r.sessionId,
          startTime: r.timestamp,
          cwd: r.cwd,
          totalTokens: 0,
          costUsd: 0,
          messageCount: 0,
          lastActivity: r.timestamp,
          model: r.model,
          contextTokens: resolveContextTokens(r),
          branch: r.gitBranch,
        });
      }
      const s = bySession.get(r.sessionId)!;
      if (r.timestamp < s.startTime) s.startTime = r.timestamp;
      // lastActivity/model/contextTokens/branch는 세션 선택기(QuickPick)의 정렬·배지 기준 —
      // 입력 배열 순서 무관하게 timestamp 최대인 레코드 1건만 반영(누적 금지, sessionContext와 동일 원칙).
      // 동일 timestamp 타이브레이크는 브랜치 루프(byBranch.lastActive, 아래 `>`)와 동일하게 선입력 우선.
      if (r.timestamp > s.lastActivity) {
        s.lastActivity = r.timestamp;
        s.model = r.model;
        s.contextTokens = resolveContextTokens(r);
        s.branch = r.gitBranch;
      }
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
        const existing = byModel.get(r.model) ?? { tokens: 0, costUsd: 0, pricingSource: resolvePricing(r.model).source };
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

    // 모델별 분해.
    //
    // share 기준이 비용 고정이면 안 된다: 가격표에 없는 모델의 costUsd는 0인데, 그 0이 **측정된
    // 0처럼** 분모·분자에 들어간다. 그러면 가격이 남아있는 레거시 모델 한 건이 100%를 독식하고
    // (사용자 실측: 토큰의 97%인 sonnet이 0%, 나머지가 100%) 총액은 실제의 1~2%로 찍힌다.
    // 전 모델의 가격을 아는 경우에만 비용 기준을 쓰고, 하나라도 모르면 **토큰 기준으로 바꾸고
    // 그 사실을 modelShareBasis로 밝힌다**. 정렬 기준도 같이 바꾼다 — 아니면 1위 행과 최대
    // share 행이 어긋난다.
    //
    // ⚠️ 트리거는 `totalCost === 0`이 아니다. 미가격 모델과 가격 모델이 섞인 실제 사고 상황에서는
    // totalCost > 0이라 그 조건은 발화하지 않는다(advisor 지적, 2026-09-02).
    const unpricedModels = [...byModel.entries()]
      .filter(([, v]) => v.pricingSource === 'none' && v.tokens > 0)
      .map(([model]) => model)
      .sort();
    const totalCost = [...byModel.values()].reduce((sum, v) => sum + v.costUsd, 0);
    const totalModelTokens = [...byModel.values()].reduce((sum, v) => sum + v.tokens, 0);
    const modelShareBasis: ModelShareBasis = unpricedModels.length > 0 || totalCost <= 0 ? 'tokens' : 'cost';
    const shareDenom = modelShareBasis === 'cost' ? totalCost : totalModelTokens;
    const shareOf = (v: { tokens: number; costUsd: number }): number =>
      shareDenom > 0 ? (modelShareBasis === 'cost' ? v.costUsd : v.tokens) / shareDenom : 0;
    const modelBreakdown: ModelBreakdown[] = [...byModel.entries()]
      // 사용량이 전혀 없는 유사모델은 뺀다 — Claude Code는 도구 결과 등을 `<synthetic>` 레코드로
      // 남기는데 토큰이 전부 0이다. 가격표에 없으니 pricingSource='none'이 되어, 걸러내지 않으면
      // 실제로 쓰지도 않은 항목이 "가격 미상" 행으로 상시 노출된다(ST9가 새로 만들 뻔한 오탐).
      .filter(([, v]) => v.tokens > 0 || v.costUsd > 0)
      .map(([model, v]) => ({
        model,
        tokens: v.tokens,
        costUsd: v.costUsd,
        share: shareOf(v),
        pricingSource: v.pricingSource,
      }))
      .sort((a, b) => b.share - a.share || b.tokens - a.tokens);

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

    // 세션 컨텍스트 점유율(근사치, #④) — 마지막 레코드 1건만(누적합 금지, 타당한 이유는 SessionContextUsage 문서 참조)
    // workspaceRoots 지정 시 그중 어느 폴더든 하위 cwd 레코드면 후보로 스코핑(v0.1.51, 멀티루트 워크스페이스
    // 전체를 합집합으로 — v0.1.50 B의 단일 workspaceRoot는 이 배열의 1개짜리 상위집합). 미지정이면 기존처럼
    // 전체(records)에서 선택. 문자열 하나만 넘겨도(하위호환) 동작한다.
    // isSidechain 제외(S3, 2026-08-03) — 배경/자동 실행된 서브에이전트 세션이 사용자가 열지도 않은
    // 워크스페이스의 게이지를 가로채는 것을 방지(project_context_gauge_overcount 메모리 RC3).
    const workspaceRootList = workspaceRoots === undefined
      ? undefined
      : (Array.isArray(workspaceRoots) ? workspaceRoots : [workspaceRoots]);
    const contextCandidates = (workspaceRootList
      ? records.filter(r => workspaceRootList.some(root => cwdMatchesWorkspace(r.cwd, root)))
      : records
    ).filter(r => !r.isSidechain);

    // 분모 3단 계단(S1) 공용 계산 — ①관측증명: records 전체(워크스페이스 스코프 무관, isSidechain
    // 무관 — 이 모델이 어디서든 200K를 넘긴 적 있다는 사실 자체가 1M 활성의 물리적 증거)에서 어느
    // 모델이든 200K를 초과한 레코드가 하나라도 있으면 그 모델은 1M 확정. ②~/.claude.json의 [1m]
    // 흔적(knownOneMillionModels, 호출부가 미리 읽어 전달). sessionContext(선택된 세션 1건)와
    // contextSessions(목록 전체, 아래) 양쪽이 동일 판정을 공유해 "목록에서 본 %와 선택 후 게이지 %가
    // 다르다"는 불일치가 나지 않게 한다 — 세션마다 반복 스캔하지 않고 Set 1회 구성으로 상각.
    const observedOneMillionModels = new Set<string>();
    for (const r of records) {
      if (resolveContextTokens(r) > 200_000) observedOneMillionModels.add(r.model);
    }
    const forceOneMillionModels = new Set<string>([
      ...observedOneMillionModels,
      ...(knownOneMillionModels ?? []),
    ]);

    // contextSessions(v0.1.51) — 세션 선택기(QuickPick) 후보 목록. contextCandidates를 세션별로
    // 그룹핑 — bySession(cross-project, sidechain 포함, cwd=최초 레코드 고정)과는 별개 계산이다.
    // recentSessions를 재사용/스코핑하지 않는 이유: recentSessions는 main.ts의 "워크스페이스
    // 매칭 0건" vs "세션 기록 자체가 없음" 구분(v0.1.49)에 cross-project 그대로 쓰인다 — 여기서
    // 스코핑하면 그 구분이 무너진다(SubTask1에서 scope-critic이 동일 이유로 지적한 회귀).
    const contextSessionMap = new Map<string, SessionSummary>();
    for (const r of contextCandidates) {
      if (!contextSessionMap.has(r.sessionId)) {
        contextSessionMap.set(r.sessionId, {
          sessionId: r.sessionId,
          startTime: r.timestamp,
          cwd: r.cwd,
          totalTokens: 0,
          costUsd: 0,
          messageCount: 0,
          lastActivity: r.timestamp,
          model: r.model,
          contextTokens: resolveContextTokens(r),
          branch: r.gitBranch,
        });
      }
      const cs = contextSessionMap.get(r.sessionId)!;
      if (r.timestamp < cs.startTime) cs.startTime = r.timestamp;
      if (r.timestamp > cs.lastActivity) {
        cs.lastActivity = r.timestamp;
        cs.model = r.model;
        cs.cwd = r.cwd;
        cs.contextTokens = resolveContextTokens(r);
        cs.branch = r.gitBranch;
      }
      cs.totalTokens += r.usage.input_tokens + r.usage.output_tokens
        + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens;
      cs.costUsd += r.costUsd;
      cs.messageCount += 1;
    }
    const contextSessions: ContextSessionSummary[] = [...contextSessionMap.values()]
      .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
      .map(s => {
        const forceOneMillion = forceOneMillionModels.has(s.model);
        return {
          ...s,
          maxWindow: findContextWindow(s.model, forceOneMillion),
          ratio: calcContextUsageRatio(s.contextTokens, s.model, forceOneMillion),
        };
      });

    // 고정(pin) 모드(v0.1.51) — pinnedSessionId가 후보 풀에 있으면 자동 최신값 대신 그 세션의 최신
    // 레코드를 쓴다. 스코프 밖이거나 풀에서 사라진 경우(세션 종료 등)는 "찾지 못함"으로 auto 폴백하고
    // pinMissing=true로 신호해, 호출측(extension.ts)이 죽은 pin을 저장소에서 정리하도록 한다.
    const pinnedCandidates = pinnedSessionId
      ? contextCandidates.filter(r => r.sessionId === pinnedSessionId)
      : [];
    const pinMissing = !!pinnedSessionId && pinnedCandidates.length === 0;
    const mode: 'auto' | 'pinned' = pinnedCandidates.length > 0 ? 'pinned' : 'auto';
    const autoPool = pinnedCandidates.length > 0 ? pinnedCandidates : contextCandidates;
    const contextLastRecord = autoPool.length > 0
      ? autoPool.reduce((a, b) => a.timestamp > b.timestamp ? a : b)
      : null;
    const sessionContext: SessionContextUsage | null = contextLastRecord
      ? (() => {
          const model = contextLastRecord.model;
          const tokens = resolveContextTokens(contextLastRecord);
          // 분모 3단 계단(S1) — 위에서 구성한 forceOneMillionModels 공용 Set 조회(③ 둘 다 없으면
          // findContextWindow의 기존 200K 테이블로 폴백).
          const forceOneMillion = forceOneMillionModels.has(model);
          return {
            tokens,
            model,
            maxWindow: findContextWindow(model, forceOneMillion),
            ratio: calcContextUsageRatio(tokens, model, forceOneMillion),
            cwd: contextLastRecord.cwd,
            repoName: path.basename(contextLastRecord.cwd),
            timestamp: contextLastRecord.timestamp,
            sessionId: contextLastRecord.sessionId,
            mode,
            ...(pinMissing ? { pinMissing: true } : {}),
          };
        })()
      : null;

    // 스킬·서브에이전트·MCP attribution — 전체 스코프 + 24h/7d 스코프(v0.1.48 ②)
    const nowMs = now.getTime();
    const last24hRecords = records.filter(r => nowMs - new Date(r.timestamp).getTime() <= DAY_MS);
    const last7dRecords = records.filter(r => nowMs - new Date(r.timestamp).getTime() <= 7 * DAY_MS);
    const allAttribution = computeAttribution(records);
    const attributionScopes = {
      last24h: computeAttribution(last24hRecords),
      last7d: computeAttribution(last7dRecords),
    };

    return {
      today,
      last7Days,
      recentSessions,
      modelBreakdown,
      unpricedModels,
      modelShareBasis,
      cacheStats,
      todayToolCounts: todayTools,
      last7DaysTools,
      recentEditedFiles,
      branchBreakdown,
      skillBreakdown: allAttribution.skillBreakdown,
      skillUnattributed: allAttribution.skillUnattributed,
      subagentStats: allAttribution.subagentStats,
      mcpServerBreakdown: allAttribution.mcpServerBreakdown,
      attributionScopes,
      activeBranch,
      sessionContext,
      contextSessions,
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
