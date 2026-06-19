import { describe, it, expect } from 'vitest';
import { parseGitLog } from '../../src/services/GitLogReader';

const RS = '\x1e';
const US = '\x1f';

function line(sha: string, date: string, refs: string, subject: string): string {
  return `${RS}${sha}${US}${date}${US}${refs}${US}${subject}`;
}

describe('parseGitLog — 순수 파서', () => {
  it('단일 커밋 + 파일목록 파싱', () => {
    const out = `${line('aaa', '2026-06-10T10:00:00+09:00', '', 'feat: x')}\nsrc/a.ts\nsrc/b.ts\n`;
    const commits = parseGitLog(out, '/repo', 'main');
    expect(commits.length).toBe(1);
    expect(commits[0]).toMatchObject({
      sha: 'aaa',
      committedAt: '2026-06-10T10:00:00+09:00',
      subject: 'feat: x',
      branch: 'main',
      repoRoot: '/repo',
      files: ['src/a.ts', 'src/b.ts'],
    });
  });

  it('%D decorate에서 HEAD -> branch 추출, 없으면 폴백', () => {
    const out =
      `${line('aaa', '2026-06-10T10:00:00Z', 'HEAD -> feature/y, origin/feature/y', 'a')}\n` +
      `${line('bbb', '2026-06-09T10:00:00Z', '', 'b')}\nx.ts\n`;
    const commits = parseGitLog(out, '/repo', 'main');
    expect(commits[0].branch).toBe('feature/y'); // decorate
    expect(commits[1].branch).toBe('main');       // 폴백
  });

  it('빈 출력 → 빈 배열', () => {
    expect(parseGitLog('', '/repo', 'main')).toEqual([]);
  });

  it('파일 없는 커밋(merge 등)도 안전 파싱', () => {
    const out = `${line('aaa', '2026-06-10T10:00:00Z', '', 'merge')}\n`;
    const commits = parseGitLog(out, '/repo', 'main');
    expect(commits[0].files).toEqual([]);
  });
});
