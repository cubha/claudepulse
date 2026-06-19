import type {
  AttributionConfidence,
  CommitMeta,
  CommitUsage,
  RetroSummary,
  SessionRecord,
  UnattributedBucket,
} from '../types';

/**
 * CommitAttributor — usage×git 근사조인 엔진 (순수·결정론).
 *
 * UsageAggregator.aggregate() **밖**의 독립 모듈. records를 post-aggregation으로
 * 소비한다(아키텍처 비협상 — codex-later를 bounded graft로 만드는 단일 결정).
 *
 * ⚠️ 근사조인만 가능(§2): git commit이 jsonl에 tool_use로 안 잡혀 정확조인 불가(실측 11/11 0건).
 * record→commit = **repo(cwd) + timestamp 윈도** 근사. rebase/squash 시 부정확(버그 아님).
 *
 * ⚠️ 브랜치는 join 키가 **아니다**(표시용). 근거: `git log`는 과거 커밋의 *당시* 브랜치를
 * 복원할 수 없어(대부분 %D decoration 없음 → 전부 현재 브랜치로 태깅) 브랜치 매칭은 노이즈다.
 * strict 브랜치 매칭 시 feature-branch 작업이 전부 미귀속으로 빠진다(실측 검증, advisor 지적 2026-06-18).
 * → 1차 키 = repo+윈도. 브랜치는 커밋 라벨로만 노출.
 *
 * 비용: r.costUsd를 그대로 합산한다(이미 cache amortize 반영 — 재계산 금지·이중계산 위험).
 */
export class CommitAttributor {
  attribute(records: SessionRecord[], commits: CommitMeta[]): RetroSummary {
    // repo → 커밋(시각 오름차순). UTC ms 사전계산. 브랜치는 join에 쓰지 않음.
    const byRepo = new Map<string, CommitMeta[]>();
    const repoRoots = new Set<string>();
    const commitMs = new Map<string, number>(); // sha → ms

    for (const c of commits) {
      const ms = Date.parse(c.committedAt);
      if (Number.isNaN(ms)) continue; // 파싱 불가 커밋 제외
      commitMs.set(c.sha, ms);
      repoRoots.add(c.repoRoot);
      const list = byRepo.get(c.repoRoot) ?? [];
      list.push(c);
      byRepo.set(c.repoRoot, list);
    }
    for (const list of byRepo.values()) {
      list.sort((a, b) => commitMs.get(a.sha)! - commitMs.get(b.sha)!);
    }

    interface Acc { commit: CommitMeta; costUsd: number; totalTokens: number; sessionIds: Set<string>; recordCount: number; }
    const acc = new Map<string, Acc>();
    let unattCost = 0, unattTokens = 0, unattCount = 0, postLast = 0, noMatch = 0;
    let totalCost = 0;

    for (const r of records) {
      totalCost += r.costUsd;
      const tokens = tokenSum(r);
      const rms = Date.parse(r.timestamp);

      const repoRoot = Number.isNaN(rms) ? null : longestMatchingRepo(r.cwd, repoRoots);
      const repoCommits = repoRoot ? byRepo.get(repoRoot) : undefined;

      let target: CommitMeta | null = null;
      let reason: 'post' | 'no-window' = 'no-window';

      if (repoCommits && repoCommits.length > 0) {
        // timestamp 이상인 최초 커밋 — 윈도 (prev, commit]. 브랜치 무관(repo+윈도 1차 키)
        target = repoCommits.find(c => commitMs.get(c.sha)! >= rms!) ?? null;
        if (!target) reason = 'post'; // 마지막 커밋 이후 진행중 작업
      }

      if (target) {
        let a = acc.get(target.sha);
        if (!a) { a = { commit: target, costUsd: 0, totalTokens: 0, sessionIds: new Set(), recordCount: 0 }; acc.set(target.sha, a); }
        a.costUsd += r.costUsd;
        a.totalTokens += tokens;
        a.recordCount += 1;
        if (r.sessionId) a.sessionIds.add(r.sessionId);
      } else {
        unattCost += r.costUsd;
        unattTokens += tokens;
        unattCount += 1;
        if (reason === 'post') postLast += r.costUsd; else noMatch += r.costUsd;
      }
    }

    const commitUsages: CommitUsage[] = [...acc.values()]
      .map(a => ({
        commit: a.commit,
        costUsd: a.costUsd,
        totalTokens: a.totalTokens,
        recordCount: a.recordCount,
        sessionIds: [...a.sessionIds],
        confidence: confidenceOf(a.recordCount),
      }))
      .sort((x, y) => y.costUsd - x.costUsd);

    const unattributed: UnattributedBucket = {
      costUsd: unattCost,
      totalTokens: unattTokens,
      recordCount: unattCount,
      postLastCommitCostUsd: postLast,
      noWindowMatchCostUsd: noMatch,
    };

    return {
      commits: commitUsages,
      unattributed,
      totalCostUsd: totalCost,
      approximate: true,
      generatedAt: new Date().toISOString(),
    };
  }
}

function tokenSum(r: SessionRecord): number {
  return r.usage.input_tokens + r.usage.output_tokens
    + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens;
}

function confidenceOf(recordCount: number): AttributionConfidence {
  if (recordCount >= 5) return 'high';
  if (recordCount >= 2) return 'medium';
  return 'low';
}

/** cwd가 repoRoot에 속하면 그 repoRoot, 복수 매치 시 가장 구체적(긴) repoRoot. */
function longestMatchingRepo(cwd: string, repoRoots: Set<string>): string | null {
  if (!cwd) return null;
  const nc = norm(cwd);
  let best: string | null = null;
  for (const root of repoRoots) {
    const nr = norm(root);
    if (nc === nr || nc.startsWith(nr + '/')) {
      if (best === null || nr.length > norm(best).length) best = root;
    }
  }
  return best;
}

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/$/, '');
}
