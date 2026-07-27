/**
 * cwd(jsonl 엔트리의 작업 디렉토리)가 주어진 워크스페이스 루트 또는 그 하위 디렉토리인지 확인.
 * WorkspaceMapper.cwdMatchesWorkspace()와 UsageAggregator.aggregate()의 sessionContext
 * 스코핑이 동일 로직을 공유한다(v0.1.50).
 */
export function cwdMatchesWorkspace(cwd: string, workspaceRoot: string): boolean {
  if (!cwd || !workspaceRoot) return false;
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '');
  const nc = norm(cwd);
  const nw = norm(workspaceRoot);
  return nc === nw || nc.startsWith(nw + '/');
}
