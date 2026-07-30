import { describe, it, expect } from 'vitest';
import { cwdMatchesWorkspace } from '../../src/utils/workspaceMatch';

describe('cwdMatchesWorkspace — 기존 동작(회귀 잠금)', () => {
  it('동일 경로면 true', () => {
    expect(cwdMatchesWorkspace('/repo/a', '/repo/a')).toBe(true);
  });

  it('하위 디렉토리면 true', () => {
    expect(cwdMatchesWorkspace('/repo/a/src/webview', '/repo/a')).toBe(true);
  });

  it('형제 디렉토리면 false', () => {
    expect(cwdMatchesWorkspace('/repo/b', '/repo/a')).toBe(false);
  });

  it('접두사만 겹치는 다른 경로는 false (repo vs repo-2)', () => {
    expect(cwdMatchesWorkspace('/repo/a-2', '/repo/a')).toBe(false);
  });

  it('빈 값은 false', () => {
    expect(cwdMatchesWorkspace('', '/repo/a')).toBe(false);
    expect(cwdMatchesWorkspace('/repo/a', '')).toBe(false);
  });

  it('POSIX 경로는 대소문자를 구분한다 (파일시스템 의미론 보존)', () => {
    expect(cwdMatchesWorkspace('/repo/A', '/repo/a')).toBe(false);
  });
});

describe('cwdMatchesWorkspace — Windows 드라이브 경로 대소문자 폴딩 (v0.1.49)', () => {
  // VS Code의 uri.fsPath는 드라이브 문자를 소문자로 강제(vscode-uri uriToFsPath)하는 반면
  // Claude Code는 process.cwd()를 그대로(PowerShell 기준 대문자) jsonl에 기록한다.
  // 폴딩이 없으면 Windows 네이티브 환경에서 sessionContext가 항상 null이 됐다(v0.1.48 회귀).
  it('드라이브 문자 대소문자만 다른 동일 경로는 매칭된다', () => {
    expect(
      cwdMatchesWorkspace(
        'C:\\_project\\lxhausys\\_workspace\\REPO-SHARED-B2B-WINA-APP-FE',
        'c:\\_project\\lxhausys\\_workspace\\REPO-SHARED-B2B-WINA-APP-FE',
      ),
    ).toBe(true);
  });

  it('드라이브 문자가 다른 하위 디렉토리도 매칭된다', () => {
    expect(cwdMatchesWorkspace('C:\\ws\\repo\\src', 'c:\\ws\\repo')).toBe(true);
  });

  it('경로 세그먼트의 대소문자 차이도 매칭된다 (Windows는 대소문자 비구분 FS)', () => {
    expect(cwdMatchesWorkspace('C:\\WS\\Repo', 'c:\\ws\\repo')).toBe(true);
  });

  it('폴딩해도 다른 repo는 여전히 false', () => {
    expect(cwdMatchesWorkspace('C:\\ws\\other', 'c:\\ws\\repo')).toBe(false);
  });

  it('폴딩해도 접두사만 겹치는 경로는 false', () => {
    expect(cwdMatchesWorkspace('C:\\ws\\repo-2', 'c:\\ws\\repo')).toBe(false);
  });

  it('한쪽만 Windows 드라이브 경로면 폴딩하지 않는다 (POSIX 의미론 오염 방지)', () => {
    expect(cwdMatchesWorkspace('C:\\ws\\repo', '/ws/repo')).toBe(false);
  });
});
