import * as vscode from 'vscode';
import { decodeProjectPath } from '../utils/pathDecoder';

/**
 * 차별점 1 — IDE 독점 기능.
 *
 * 현재 열린 워크스페이스(`vscode.workspace.workspaceFolders`)와
 * `~/.claude/projects/<encoded>/` 디렉토리를 매핑하여
 * "지금 작업 중인 프로젝트의 비용"을 즉시 산출 가능.
 *
 * CLI 도구는 워크스페이스 컨텍스트를 알 수 없으므로 구조적으로 구현 불가.
 */
export class WorkspaceMapper {
  /**
   * 현재 워크스페이스에 매칭되는 Claude 프로젝트 경로 후보 반환.
   * 정확 일치 우선, 없으면 prefix 일치 fallback.
   */
  resolveCurrentProjectPaths(claudeProjectFolders: string[]): string[] {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) return [];

    const decoded = claudeProjectFolders.map((enc) => ({
      encoded: enc,
      decoded: decodeProjectPath(enc)
    }));

    const matches: string[] = [];
    for (const folder of folders) {
      const ws = folder.uri.fsPath;
      // 1) exact match
      const exact = decoded.find((d) => d.decoded === ws);
      if (exact) {
        matches.push(exact.encoded);
        continue;
      }
      // 2) prefix match (워크스페이스가 Claude 기록보다 깊거나 얕은 경우)
      const prefix = decoded.find((d) => ws.startsWith(d.decoded) || d.decoded.startsWith(ws));
      if (prefix) matches.push(prefix.encoded);
    }
    return matches;
  }
}
