/** Windows 드라이브 경로 판별 (`C:\...` / `c:/...`) */
const WIN_DRIVE_RE = /^[a-zA-Z]:/;

/**
 * cwd(jsonl 엔트리의 작업 디렉토리)가 주어진 워크스페이스 루트 또는 그 하위 디렉토리인지 확인.
 * WorkspaceMapper.cwdMatchesWorkspace()와 UsageAggregator.aggregate()의 sessionContext
 * 스코핑이 동일 로직을 공유한다(v0.1.50).
 *
 * 양쪽이 모두 Windows 드라이브 경로일 때만 대소문자를 무시한다(v0.1.49) — VS Code의
 * `uri.fsPath`는 드라이브 문자를 소문자로 강제하는데(vscode-uri `uriToFsPath`) Claude Code는
 * `process.cwd()`를 그대로(PowerShell 기준 대문자) jsonl에 기록해, 폴딩이 없으면 Windows
 * 네이티브 환경에서 매칭이 항상 0건이 된다(v0.1.48 회귀). Windows FS가 대소문자 비구분이므로
 * 드라이브 문자뿐 아니라 경로 전체를 폴딩한다. 한쪽만 드라이브 경로거나 POSIX 경로면 폴딩하지
 * 않는다 — 리눅스 FS의 대소문자 구분 의미론을 오염시키지 않기 위함.
 */
export function cwdMatchesWorkspace(cwd: string, workspaceRoot: string): boolean {
  if (!cwd || !workspaceRoot) return false;
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '');
  let nc = norm(cwd);
  let nw = norm(workspaceRoot);
  if (WIN_DRIVE_RE.test(nc) && WIN_DRIVE_RE.test(nw)) {
    nc = nc.toLowerCase();
    nw = nw.toLowerCase();
  }
  return nc === nw || nc.startsWith(nw + '/');
}
