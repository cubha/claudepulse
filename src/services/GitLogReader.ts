import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CommitMeta } from '../types';

const execFileAsync = promisify(execFile);

/** git 셸아웃 상한(ms) — 동기 블로킹 방지(v0.1.39). 진단 아닌 방어 보험. */
const GIT_TIMEOUT_MS = 5000;

/**
 * GitLogReader — 코드베이스 첫 child_process 사용.
 *
 * git log를 읽어 CommitMeta[]를 추출한다. 회고 뷰 오픈 시 lazy 호출하고
 * repo별 HEAD SHA로 캐시한다(매 refresh 셸아웃 금지 — 성능).
 *
 * git 미설치 / non-repo cwd → graceful degradation(null/[] 반환, throw 없음).
 *
 * ⚠️ 정확도 한계(§2): git commit은 세션 jsonl에 안 잡혀 정확조인 불가.
 * 또 commit→branch는 "읽은 시점의 현재 브랜치" 근사이며 rebase/squash 시 부정확.
 */

/** git log 출력 단위 구분자 (RS / US — 커밋 메시지에 등장 불가). */
const REC_SEP = '\x1e';
const FIELD_SEP = '\x1f';

/** git log 조회 범위 상한 (성능 — jsonl 30일 + RetroStore 누적 보완). */
const SINCE = '180.days.ago';

const PRETTY = `${REC_SEP}%H${FIELD_SEP}%cI${FIELD_SEP}%D${FIELD_SEP}%s`;

interface RepoCacheEntry {
  headSha: string;
  commits: CommitMeta[];
}

export class GitLogReader {
  private readonly cache = new Map<string, RepoCacheEntry>();
  private readonly repoRootCache = new Map<string, string | null>();

  /** cwd가 속한 git repo 루트. non-repo이면 null. cwd당 1회만 셸아웃(캐시). */
  async getRepoRoot(cwd: string): Promise<string | null> {
    if (this.repoRootCache.has(cwd)) return this.repoRootCache.get(cwd)!;
    const out = await this.run(cwd, ['rev-parse', '--show-toplevel']);
    const root = out === null ? null : (out.trim().length > 0 ? out.trim() : null);
    this.repoRootCache.set(cwd, root);
    return root;
  }

  /** repo의 현재 HEAD SHA. 실패 시 null. */
  async getHeadSha(repoRoot: string): Promise<string | null> {
    const out = await this.run(repoRoot, ['rev-parse', 'HEAD']);
    if (out === null) return null;
    const sha = out.trim();
    return sha.length > 0 ? sha : null;
  }

  /** repo의 현재 브랜치명(abbrev-ref). detached/실패 시 빈 문자열. */
  async getCurrentBranch(repoRoot: string): Promise<string> {
    const out = await this.run(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (out === null) return '';
    const branch = out.trim();
    return branch === 'HEAD' ? '' : branch; // detached HEAD
  }

  /**
   * repo 커밋 목록을 읽는다. HEAD SHA가 캐시와 같으면 캐시 반환(셸아웃 생략).
   * non-repo / git 미설치 / 빈 히스토리 → [].
   */
  async readCommits(repoRoot: string): Promise<CommitMeta[]> {
    const headSha = await this.getHeadSha(repoRoot);
    if (headSha === null) return [];

    const cached = this.cache.get(repoRoot);
    if (cached && cached.headSha === headSha) return cached.commits;

    const branch = await this.getCurrentBranch(repoRoot);
    // v0.1.39: --name-only 드롭. files 미소비인데 대형 repo서 거대 출력 → 동기 git 33초 블로킹의 97%.
    const out = await this.run(repoRoot, [
      'log',
      `--since=${SINCE}`,
      '--no-color',
      `--pretty=format:${PRETTY}`,
    ]);
    if (out === null) return [];

    const commits = parseGitLog(out, repoRoot, branch);
    this.cache.set(repoRoot, { headSha, commits });
    return commits;
  }

  /** 테스트/재집계용 캐시 무효화. */
  clearCache(): void {
    this.cache.clear();
    this.repoRootCache.clear();
  }

  /**
   * git 서브커맨드 실행. 성공 시 stdout, 실패(비-0 종료/미설치/타임아웃)는 null.
   * v0.1.39: spawnSync→execFile(비동기). shell 미사용 — 인젝션 안전. timeout으로 호스트 블로킹 차단.
   */
  private async run(cwd: string, args: string[]): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024, // 대형 repo 대비
        windowsHide: true,
        timeout: GIT_TIMEOUT_MS,
      });
      return stdout;
    } catch {
      // 비-0 종료 / git 미설치 / 타임아웃(killed) → graceful null
      return null;
    }
  }
}

/**
 * git log 출력 파서 — 순수 함수(결정론, 단위테스트 대상).
 *
 * 입력: PRETTY 포맷 stdout (v0.1.39: --name-only 드롭 → 헤더-only).
 * 각 레코드: REC_SEP + "HASH US DATE US REFS US SUBJECT". 파일줄 없음.
 */
export function parseGitLog(stdout: string, repoRoot: string, branch: string): CommitMeta[] {
  const commits: CommitMeta[] = [];
  const chunks = stdout.split(REC_SEP);
  for (const chunk of chunks) {
    if (chunk.trim().length === 0) continue;
    // 헤더는 첫 줄. --name-only 드롭으로 후속 파일줄은 없으나, 방어적으로 첫 줄만 파싱.
    const header = chunk.split('\n')[0];
    const fields = header.split(FIELD_SEP);
    if (fields.length < 4) continue;
    const [sha, committedAt, refs, subject] = fields;
    if (!sha || !committedAt) continue;

    commits.push({
      sha: sha.trim(),
      committedAt: committedAt.trim(),
      branch: deriveBranch(refs, branch),
      subject: subject ?? '',
      repoRoot,
    });
  }
  return commits;
}

/**
 * %D(decorate)에서 브랜치를 추출, 없으면 현재 브랜치 폴백.
 * 대부분 커밋은 %D가 비어 현재 브랜치로 귀속된다(근사 — §2 한계).
 */
function deriveBranch(refs: string, fallback: string): string {
  if (!refs || refs.trim().length === 0) return fallback;
  // "HEAD -> main, origin/main, tag: v1" 형태
  const parts = refs.split(',').map(p => p.trim());
  for (const p of parts) {
    const arrow = p.indexOf('-> ');
    if (arrow >= 0) return p.slice(arrow + 3).trim();
  }
  for (const p of parts) {
    if (p.startsWith('tag:')) continue;
    if (p.startsWith('origin/') || p.startsWith('remotes/')) continue;
    if (p === 'HEAD') continue;
    return p;
  }
  return fallback;
}
