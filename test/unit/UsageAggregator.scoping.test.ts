import { describe, it, expect } from 'vitest';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import type { SessionRecord } from '../../src/types';

/**
 * v0.2.3 R6 — 워크스페이스 스코핑 잔여 3필드.
 *
 * 이 확장의 차별점 #1은 "워크스페이스 ↔ 세션 자동 매핑"(CLAUDE.md §6)인데, v0.2.2까지
 * `activeBranch` · `branchBreakdown` · `recentEditedFiles`는 **열려 있는 프로젝트와 무관하게**
 * 전체 기록을 집계했다. 다른 저장소에서 작업하던 브랜치가 사이드바 칩에 뜨고, 남의 파일이
 * "최근 편집"에 섞인다.
 *
 * ⚠️ `recentSessions`는 여기서 **의도적으로 제외**한다 — UsageAggregator.ts:392와
 * types/index.ts:391의 v0.1.49 계약("워크스페이스 매칭 0건" vs "세션 기록 자체가 없음"을
 * sidebarView.ts:660이 이 길이로 구분한다)을 깨뜨리기 때문이다. 그 회귀는 과거 scope-critic이
 * 이미 지적한 적이 있다. 아래 마지막 테스트가 그 제외를 잠근다.
 */

const HERE = '/work/this-project';
const OTHER = '/work/other-project';

function rec(p: Partial<SessionRecord> & { costUsd: number }): SessionRecord {
  return {
    messageId: Math.random().toString(36),
    requestId: Math.random().toString(36),
    sessionId: 's1',
    model: 'claude-opus-4-8',
    timestamp: '2026-06-12T10:00:00.000Z',
    cwd: HERE,
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
  };
}

const RECORDS = [
  rec({ costUsd: 1, cwd: HERE, gitBranch: 'feature/here', sessionId: 'a', editedFiles: ['/work/this-project/a.ts'], timestamp: '2026-06-12T10:00:00.000Z' }),
  rec({ costUsd: 5, cwd: OTHER, gitBranch: 'feature/elsewhere', sessionId: 'b', editedFiles: ['/work/other-project/b.ts'], timestamp: '2026-06-12T11:00:00.000Z' }),
];

describe('UsageAggregator 워크스페이스 스코핑 (v0.2.3 R6)', () => {
  const agg = new UsageAggregator();

  it('branchBreakdown이 현재 워크스페이스 브랜치만 담는다', () => {
    const r = agg.aggregate(RECORDS, HERE);
    expect(r.branchBreakdown.map(b => b.branch)).toEqual(['feature/here']);
  });

  it('activeBranch가 타 워크스페이스의 더 최근 레코드에 오염되지 않는다', () => {
    // OTHER 레코드가 1시간 더 최근이다 — 스코핑 전에는 이게 activeBranch였다.
    const r = agg.aggregate(RECORDS, HERE);
    expect(r.activeBranch).toBe('feature/here');
  });

  it('activeBranch와 branchBreakdown이 함께 움직인다 (sidebarView.ts:293 join이 깨지지 않는다)', () => {
    const r = agg.aggregate(RECORDS, HERE);
    // 한쪽만 스코핑하면 이 find가 조용히 undefined가 되어 브랜치 칩의 비용이 사라진다.
    expect(r.branchBreakdown.find(b => b.branch === r.activeBranch)).toBeDefined();
  });

  it('recentEditedFiles가 현재 워크스페이스 파일만 담는다', () => {
    const r = agg.aggregate(RECORDS, HERE);
    expect(r.recentEditedFiles).toEqual(['/work/this-project/a.ts']);
  });

  it('멀티루트 워크스페이스는 두 루트의 합집합이다', () => {
    const r = agg.aggregate(RECORDS, [HERE, OTHER]);
    expect(r.branchBreakdown.map(b => b.branch).sort()).toEqual(['feature/elsewhere', 'feature/here']);
    expect(r.recentEditedFiles).toHaveLength(2);
  });

  it('workspaceRoots 미지정이면 기존대로 전체를 집계한다 (하위호환 — 무행위변경)', () => {
    const r = agg.aggregate(RECORDS);
    expect(r.branchBreakdown).toHaveLength(2);
    expect(r.recentEditedFiles).toHaveLength(2);
    expect(r.activeBranch).toBe('feature/elsewhere');   // 가장 최근 레코드
  });

  it('recentSessions는 스코핑하지 않는다 — v0.1.49 계약(제외 합의 X2)', () => {
    const r = agg.aggregate(RECORDS, HERE);
    // 길이가 0이 되면 sidebarView.ts:660이 "세션 기록 자체가 없음"으로 오판한다.
    expect(r.recentSessions.map(s => s.sessionId).sort()).toEqual(['a', 'b']);
  });
});
