import * as fs from 'fs';
import * as path from 'path';

/**
 * Claude Code는 프로젝트 경로를 폴더명으로 인코딩하여 ~/.claude/projects/ 하위에 저장.
 * 예: "/mnt/d/workspace" → "-mnt-d-workspace"
 *     "C:\Users\foo\proj" → "C--Users-foo-proj"
 *
 * 인코딩 규칙(관찰 기반):
 *  - 슬래시(/) · 백슬래시(\) → "-"
 *  - 콜론(:) → "-"
 *  - 선두 슬래시 → "-" (즉 절대경로 prefix)
 *
 * cwd 우선 전략:
 *  jsonl 파일의 첫 user 라인에 cwd 필드가 존재하면 그것을 우선 사용.
 *  폴백: encoded 문자열을 단순 역변환 (replace('-', '/'))
 */

/**
 * jsonl 파일에서 첫 번째 user 라인의 cwd를 동기적으로 읽어온다.
 * 최대 64KB만 읽어 성능 보호.
 */
function readCwdFromJsonlSync(jsonlPath: string): string | null {
  try {
    const fd = fs.openSync(jsonlPath, 'r');
    const buf = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buf, 0, 65536, 0);
    fs.closeSync(fd);

    const text = buf.slice(0, bytesRead).toString('utf8');
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed['type'] === 'user' && typeof parsed['cwd'] === 'string' && parsed['cwd']) {
          return parsed['cwd'] as string;
        }
      } catch {
        // invalid JSON — skip
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 동기 버전 (기존 호출처 호환 — WorkspaceMapper 등).
 * encoded 단순 역변환만 수행 (cwd 미사용).
 *
 * @deprecated jsonl cwd 우선이 필요하면 decodeProjectPathWithCwd() 또는
 *             decodeProjectPathFromJsonlPath() 사용.
 */
export function decodeProjectPath(encoded: string): string {
  return decodeProjectPathSync(encoded);
}

/**
 * 동기 폴백: encoded → 단순 역변환.
 * encoded 시작이 '-'인 경우 절대경로('/')로 복원 시도.
 */
export function decodeProjectPathSync(encoded: string): string {
  if (encoded.startsWith('-')) {
    return '/' + encoded.slice(1).replace(/-/g, '/');
  }
  return encoded.replace(/-/g, '/');
}

/**
 * cwd 우선 디코딩 (async 비필요 — 내부에서 동기 fs API 사용).
 * jsonlSamplePath가 주어지면 해당 파일의 첫 user 라인 cwd를 우선 사용.
 * 폴백: 단순 역변환.
 */
export function decodeProjectPathWithCwd(encoded: string, jsonlSamplePath?: string): string {
  if (jsonlSamplePath) {
    const cwd = readCwdFromJsonlSync(jsonlSamplePath);
    if (cwd) return cwd;
  }
  return decodeProjectPathSync(encoded);
}

/**
 * jsonl 파일 경로에서 encoded 폴더명을 추출하여 디코딩.
 * parseIncremental 내부에서 사용.
 */
export function decodeProjectPathFromJsonlPath(jsonlFilePath: string): string {
  const encoded = path.basename(path.dirname(jsonlFilePath));
  return decodeProjectPathWithCwd(encoded, jsonlFilePath);
}

export function encodeProjectPath(absolute: string): string {
  return absolute.replace(/[/\\:]/g, '-');
}
