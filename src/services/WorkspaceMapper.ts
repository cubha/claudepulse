import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { cwdMatchesWorkspace } from '../utils/workspaceMatch';

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
    return cwdMatchesWorkspace(cwd, workspacePath);
  }

  private async subagentFiles(sessionDir: string): Promise<string[]> {
    const dir = path.join(sessionDir, 'subagents');
    try {
      const names = await fs.promises.readdir(dir, { withFileTypes: true });
      return names.filter(n => n.isFile() && n.name.endsWith('.jsonl')).map(n => path.join(dir, n.name));
    } catch {
      return []; // subagents 없는 세션 폴더(tool-results만 있는 경우 등)
    }
  }

  /** ~/.claude/projects 하위 모든 jsonl 파일 경로를 반환(세션별 subagents/*.jsonl 포함). */
  async getAllJsonlFiles(): Promise<string[]> {
    const results: string[] = [];
    try {
      const projects = await fs.promises.readdir(this.projectsDir, { withFileTypes: true });
      for (const entry of projects) {
        if (!entry.isDirectory() && !entry.isFile()) continue;
        const projectPath = path.join(this.projectsDir, entry.name);
        try {
          const entries = await fs.promises.readdir(projectPath, { withFileTypes: true });
          for (const e of entries) {
            // 최상위는 기존 판정(이름만) 보존 — 심볼릭 링크 jsonl도 계속 수집한다.
            if (!e.isDirectory() && e.name.endsWith('.jsonl')) {
              results.push(path.join(projectPath, e.name));
            } else if (e.isDirectory()) {
              // v0.2.5: 서브에이전트 transcript는 `<session>/subagents/*.jsonl`에만 기록된다 —
              // 1단계만 읽으면 사이드체인 비용이 통째로 빠진다. 파일 간 중복은 호출부의
              // mergeRecordsAcrossFiles가 제거한다(부모 이력 사본이 섞여 있다).
              results.push(...await this.subagentFiles(path.join(projectPath, e.name)));
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
