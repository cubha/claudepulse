import { describe, it, expect } from 'vitest';
import { parseGitLog } from '../../src/services/GitLogReader';

const RS = '\x1e';
const US = '\x1f';

function line(sha: string, date: string, refs: string, subject: string): string {
  return `${RS}${sha}${US}${date}${US}${refs}${US}${subject}`;
}

describe('parseGitLog — 순수 파서', () => {
  // v0.1.39: --name-only 드롭. 출력은 헤더-only(파일줄 없음)이며 CommitMeta.files 제거.
  it('헤더-only 단일 커밋 파싱 — files 필드 없음', () => {
    const out = `${line('aaa', '2026-06-10T10:00:00+09:00', '', 'feat: x')}\n`;
    const commits = parseGitLog(out, '/repo', 'main');
    expect(commits.length).toBe(1);
    expect(commits[0]).toMatchObject({
      sha: 'aaa',
      committedAt: '2026-06-10T10:00:00+09:00',
      subject: 'feat: x',
      branch: 'main',
      repoRoot: '/repo',
    });
    // 죽은 비용 제거: files는 더 이상 존재하지 않는다(소비처 0건).
    expect(commits[0]).not.toHaveProperty('files');
  });

  it('%D decorate에서 HEAD -> branch 추출, 없으면 폴백', () => {
    const out =
      `${line('aaa', '2026-06-10T10:00:00Z', 'HEAD -> feature/y, origin/feature/y', 'a')}\n` +
      `${line('bbb', '2026-06-09T10:00:00Z', '', 'b')}\n`;
    const commits = parseGitLog(out, '/repo', 'main');
    expect(commits[0].branch).toBe('feature/y'); // decorate
    expect(commits[1].branch).toBe('main');       // 폴백
  });

  it('빈 출력 → 빈 배열', () => {
    expect(parseGitLog('', '/repo', 'main')).toEqual([]);
  });

  it('헤더-only 다중 커밋 스트림 — 전부 파싱', () => {
    const out =
      `${line('aaa', '2026-06-10T10:00:00Z', '', 'a')}\n` +
      `${line('bbb', '2026-06-09T10:00:00Z', '', 'b')}\n` +
      `${line('ccc', '2026-06-08T10:00:00Z', '', 'c')}\n`;
    const commits = parseGitLog(out, '/repo', 'main');
    expect(commits.map(c => c.sha)).toEqual(['aaa', 'bbb', 'ccc']);
    expect(commits.every(c => !('files' in c))).toBe(true);
  });
});
