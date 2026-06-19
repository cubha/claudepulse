import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { GitLogReader } from '../../src/services/GitLogReader';
import { CommitAttributor } from '../../src/services/CommitAttributor';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import type { SessionRecord } from '../../src/types';

/**
 * 실 파이프라인 검증 — GitLogReader(실제 git)에서 읽은 커밋을 CommitAttributor에 통과.
 * CommitAttributor.test.ts가 commit.branch를 손으로 맞춰 스텁하는 것과 달리, 여기선
 * GitLogReader의 실제 브랜치 태깅 + repo+윈도 조인이 프로덕션처럼 동작하는지 확인한다.
 * (git 미설치/비-repo 환경에서는 graceful no-op로 통과.)
 */
describe('Retro 실 파이프라인 (GitLogReader → CommitAttributor)', () => {
  const reader = new GitLogReader();
  const repoRoot = reader.getRepoRoot(process.cwd());

  it('실제 커밋을 읽어 repo+윈도로 귀속 — 브랜치 무관하게 매칭', () => {
    if (!repoRoot) return; // git 없으면 스킵(graceful)
    const commits = reader.readCommits(repoRoot);
    expect(commits.length).toBeGreaterThan(0);

    // 커밋 시각 범위 중앙에 레코드를 합성 — feature 브랜치명을 일부러 부여(현실 모사).
    const sorted = [...commits].sort((a, b) => Date.parse(a.committedAt) - Date.parse(b.committedAt));
    const first = Date.parse(sorted[0].committedAt);
    const last = Date.parse(sorted[sorted.length - 1].committedAt);
    const midIso = new Date((first + last) / 2).toISOString();

    const cwd = path.join(repoRoot, 'src');
    const records: SessionRecord[] = [
      mkRec(cwd, midIso, 'feature/historical-only', 1.0),
      mkRec(cwd, midIso, 'main', 2.0),
    ];

    const summary = new CommitAttributor().attribute(records, commits);

    // 핵심: feature 브랜치 레코드가 미귀속으로 폭발하지 않고 커밋에 붙어야 한다.
    expect(summary.commits.length).toBeGreaterThan(0);
    expect(summary.unattributed.costUsd).toBeLessThan(summary.totalCostUsd);
    expect(summary.totalCostUsd).toBeCloseTo(3.0, 5);
  });
});

function mkRec(cwd: string, timestamp: string, gitBranch: string, costUsd: number): SessionRecord {
  return {
    messageId: `${timestamp}-${gitBranch}`,
    requestId: `${timestamp}-${gitBranch}`,
    sessionId: 's1',
    model: 'claude-opus-4-8',
    timestamp,
    cwd,
    gitBranch,
    usage: {
      input_tokens: 100, output_tokens: 50,
      cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0,
      cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0,
    },
    toolCounts: emptyToolCounts(),
    editedFiles: [],
    isSidechain: false,
    costUsd,
  };
}
