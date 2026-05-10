/**
 * Claude Code는 프로젝트 경로를 폴더명으로 인코딩하여 ~/.claude/projects/ 하위에 저장.
 * 예: "/mnt/d/workspace" → "-mnt-d-workspace"
 *     "C:\Users\foo\proj" → "C--Users-foo-proj"
 *
 * 인코딩 규칙(관찰 기반):
 *  - 슬래시(/) · 백슬래시(\) → "-"
 *  - 콜론(:) → "-"
 *  - 선두 슬래시 → "-" (즉 절대경로 prefix)
 */
export function decodeProjectPath(encoded: string): string {
  // 단순 역변환 — 실제 jsonl의 cwd 메타가 더 정확하다면 그것을 우선해야 한다.
  // TODO: jsonl 첫 user 메시지의 cwd 필드를 우선 채택, 폴백으로 본 디코딩 사용
  return encoded.replace(/-/g, '/');
}

export function encodeProjectPath(absolute: string): string {
  return absolute.replace(/[/\\:]/g, '-');
}
