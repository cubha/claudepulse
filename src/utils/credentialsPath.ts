/** vscode.WorkspaceConfiguration.inspect() 반환값 중 이 리졸버가 필요로 하는 부분집합 */
export interface CredentialsPathInspect {
  globalValue?: string;
  workspaceValue?: string;
  workspaceFolderValue?: string;
}

/**
 * credentialsPath를 user(global) 설정에서만 채택한다.
 * workspaceValue/workspaceFolderValue는 의도적으로 읽지 않는다 — package.json의
 * scope:machine이 platform 단에서 이미 이를 무시하지만, 그 방어가 미래에 실수로
 * 제거돼도 이 함수가 2차로 막는다(defense-in-depth).
 */
export function resolveCredentialsPath(
  inspect: CredentialsPathInspect | undefined,
  defaultPath: string
): string {
  return inspect?.globalValue || defaultPath;
}
