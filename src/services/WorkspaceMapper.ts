import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export class WorkspaceMapper {
  private readonly projectsDir: string;

  constructor(claudeDir?: string) {
    this.projectsDir = path.join(claudeDir ?? path.join(os.homedir(), '.claude'), 'projects');
  }

  /**
   * 워크스페이스 경로를 인코딩하여 ~/.claude/projects/<encoded> 디렉토리를 찾는다.
   * 경로 인코딩은 lossy (/, \, _ → -) 이므로 decode 방향은 불가 → encode-then-match 필수.
   */
  getProjectDir(workspacePath: string): string | null {
    const encoded = this.encode(workspacePath);
    const candidate = path.join(this.projectsDir, encoded);
    if (fs.existsSync(candidate)) return candidate;

    // prefix 매칭 폴백: 인코딩 결과가 일부 다를 수 있는 경우
    try {
      const entries = fs.readdirSync(this.projectsDir);
      const match = entries.find(e => e === encoded || e.startsWith(encoded));
      if (match) return path.join(this.projectsDir, match);
    } catch {
      // projectsDir 없으면 null
    }
    return null;
  }

  /**
   * cwd(jsonl 엔트리의 작업 디렉토리)가 주어진 워크스페이스에 속하는지 확인.
   * cwd가 workspacePath 또는 하위 디렉토리이면 true.
   */
  cwdMatchesWorkspace(cwd: string, workspacePath: string): boolean {
    if (!cwd || !workspacePath) return false;
    const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '');
    const nc = norm(cwd);
    const nw = norm(workspacePath);
    return nc === nw || nc.startsWith(nw + '/');
  }

  /** ~/.claude/projects 하위 모든 jsonl 파일 경로를 반환. */
  getAllJsonlFiles(): string[] {
    const results: string[] = [];
    try {
      const projects = fs.readdirSync(this.projectsDir, { withFileTypes: true });
      for (const entry of projects) {
        if (!entry.isDirectory() && !entry.isFile()) continue;
        const projectPath = path.join(this.projectsDir, entry.name);
        try {
          const files = fs.readdirSync(projectPath);
          for (const f of files) {
            if (f.endsWith('.jsonl')) {
              results.push(path.join(projectPath, f));
            }
          }
        } catch {
          // 개별 프로젝트 디렉토리 접근 실패 무시
        }
      }
    } catch {
      // projectsDir 자체가 없으면 빈 배열
    }
    return results;
  }

  private encode(workspacePath: string): string {
    return workspacePath
      .replace(/[/\\]/g, '-')
      .replace(/_/g, '-');
  }
}
