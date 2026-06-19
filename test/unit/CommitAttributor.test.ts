import { describe, it, expect } from 'vitest';
import { CommitAttributor } from '../../src/services/CommitAttributor';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import type { CommitMeta, SessionRecord } from '../../src/types';

function rec(p: Partial<SessionRecord> & { costUsd: number; timestamp: string }): SessionRecord {
  return {
    messageId: Math.random().toString(36),
    requestId: Math.random().toString(36),
    sessionId: 's1',
    model: 'claude-opus-4-8',
    cwd: '/repo',
    gitBranch: 'main',
    usage: {
      input_tokens: 100, output_tokens: 50,
      cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0,
      cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0,
    },
    toolCounts: emptyToolCounts(),
    editedFiles: [],
    isSidechain: false,
    ...p,
  } as SessionRecord;
}

function commit(p: Partial<CommitMeta> & { sha: string; committedAt: string }): CommitMeta {
  return {
    branch: 'main',
    subject: 'c',
    files: [],
    repoRoot: '/repo',
    ...p,
  } as CommitMeta;
}

describe('CommitAttributor — 근사조인', () => {
  it('레코드는 timestamp 이상인 최초 커밋에 귀속 — 윈도 (prev, commit]', () => {
    const c1 = commit({ sha: 'aaa', committedAt: '2026-06-10T10:00:00.000Z' });
    const c2 = commit({ sha: 'bbb', committedAt: '2026-06-10T12:00:00.000Z' });
    const r = new CommitAttributor().attribute(
      [
        rec({ costUsd: 1, timestamp: '2026-06-10T09:00:00.000Z' }), // → c1
        rec({ costUsd: 2, timestamp: '2026-06-10T11:00:00.000Z' }), // → c2 (c1보다 늦음)
        rec({ costUsd: 4, timestamp: '2026-06-10T10:00:00.000Z' }), // → c1 (경계 포함)
      ],
      [c1, c2],
    );
    const byCommit = new Map(r.commits.map(c => [c.commit.sha, c]));
    expect(byCommit.get('aaa')!.costUsd).toBe(5);  // 1 + 4
    expect(byCommit.get('bbb')!.costUsd).toBe(2);
    expect(r.unattributed.costUsd).toBe(0);
  });

  it('마지막 커밋 이후 레코드 → 미귀속(post-last-commit)', () => {
    const c1 = commit({ sha: 'aaa', committedAt: '2026-06-10T10:00:00.000Z' });
    const r = new CommitAttributor().attribute(
      [rec({ costUsd: 3, timestamp: '2026-06-10T11:00:00.000Z' })],
      [c1],
    );
    expect(r.commits.length).toBe(0);
    expect(r.unattributed.costUsd).toBe(3);
    expect(r.unattributed.postLastCommitCostUsd).toBe(3);
    expect(r.unattributed.noWindowMatchCostUsd).toBe(0);
  });

  it('repo 미매치 레코드 → 미귀속(no-window-match)', () => {
    const c1 = commit({ sha: 'aaa', committedAt: '2026-06-10T10:00:00.000Z', repoRoot: '/repo' });
    const r = new CommitAttributor().attribute(
      [rec({ costUsd: 7, timestamp: '2026-06-10T09:00:00.000Z', cwd: '/elsewhere' })],
      [c1],
    );
    expect(r.commits.length).toBe(0);
    expect(r.unattributed.noWindowMatchCostUsd).toBe(7);
    expect(r.unattributed.postLastCommitCostUsd).toBe(0);
  });

  it('브랜치 불일치라도 repo+윈도가 맞으면 귀속 — 브랜치는 join 키 아님', () => {
    // git log는 과거 커밋의 당시 브랜치를 복원 못 함(전부 현재 브랜치 태깅) → 브랜치 매칭은 노이즈.
    // 1차 키는 repo+윈도. feature 레코드도 같은 repo 타임라인 커밋에 귀속되어야 미귀속 폭발을 막는다.
    const c1 = commit({ sha: 'aaa', committedAt: '2026-06-10T10:00:00.000Z', branch: 'main' });
    const r = new CommitAttributor().attribute(
      [rec({ costUsd: 5, timestamp: '2026-06-10T09:00:00.000Z', gitBranch: 'feature/x', cwd: '/repo' })],
      [c1],
    );
    expect(r.commits.length).toBe(1);
    expect(r.commits[0].commit.sha).toBe('aaa');
    expect(r.unattributed.costUsd).toBe(0);
  });

  it('UTC 정규화 — tz offset 커밋과 Z 레코드 경계 정확', () => {
    // 커밋 09:00+09:00 == 00:00Z. 레코드 23:30Z(전날)는 그 이전 → 귀속.
    const c1 = commit({ sha: 'aaa', committedAt: '2026-06-10T09:00:00+09:00' });
    const r = new CommitAttributor().attribute(
      [rec({ costUsd: 1, timestamp: '2026-06-09T23:30:00.000Z' })],
      [c1],
    );
    expect(r.commits[0].commit.sha).toBe('aaa');
    expect(r.unattributed.costUsd).toBe(0);
  });

  it('costUsd는 r.costUsd 합산 — 재계산 안 함', () => {
    const c1 = commit({ sha: 'aaa', committedAt: '2026-06-10T10:00:00.000Z' });
    const r = new CommitAttributor().attribute(
      [rec({ costUsd: 99.99, timestamp: '2026-06-10T09:00:00.000Z' })],
      [c1],
    );
    expect(r.commits[0].costUsd).toBe(99.99);
  });

  it('커밋은 비용 내림차순 정렬 + totalCostUsd 전체 합', () => {
    const c1 = commit({ sha: 'low', committedAt: '2026-06-10T10:00:00.000Z' });
    const c2 = commit({ sha: 'high', committedAt: '2026-06-10T12:00:00.000Z' });
    const r = new CommitAttributor().attribute(
      [
        rec({ costUsd: 1, timestamp: '2026-06-10T09:00:00.000Z' }),  // → low
        rec({ costUsd: 10, timestamp: '2026-06-10T11:00:00.000Z' }), // → high
        rec({ costUsd: 3, timestamp: '2026-06-10T13:00:00.000Z' }),  // → 미귀속
      ],
      [c1, c2],
    );
    expect(r.commits.map(c => c.commit.sha)).toEqual(['high', 'low']);
    expect(r.totalCostUsd).toBeCloseTo(14, 5);
    expect(r.approximate).toBe(true);
  });

  it('고유 세션 수집 + recordCount 기반 confidence', () => {
    const c1 = commit({ sha: 'aaa', committedAt: '2026-06-10T23:00:00.000Z' });
    const recs = [];
    for (let i = 0; i < 5; i++) {
      recs.push(rec({ costUsd: 1, timestamp: '2026-06-10T10:00:00.000Z', sessionId: i < 3 ? 'sA' : 'sB' }));
    }
    const r = new CommitAttributor().attribute(recs, [c1]);
    expect(r.commits[0].recordCount).toBe(5);
    expect(r.commits[0].sessionIds.sort()).toEqual(['sA', 'sB']);
    expect(r.commits[0].confidence).toBe('high'); // >=5
  });
});
