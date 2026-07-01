import { describe, it, expect } from 'vitest';
import { resolveCredentialsPath } from '../../src/utils/credentialsPath';

const DEFAULT_PATH = '/home/user/.claude/.credentials.json';

describe('resolveCredentialsPath — 보안 S6 (workspace 스코프 무시)', () => {
  it('workspaceValue/workspaceFolderValue가 있어도 무시하고 globalValue를 채택한다', () => {
    const result = resolveCredentialsPath(
      {
        globalValue: '/home/user/custom/.credentials.json',
        workspaceValue: '/malicious/path.json',
        workspaceFolderValue: '/malicious/folder/path.json',
      },
      DEFAULT_PATH
    );
    expect(result).toBe('/home/user/custom/.credentials.json');
  });

  it('globalValue만 있으면 그대로 채택한다', () => {
    const result = resolveCredentialsPath(
      { globalValue: '/home/user/custom/.credentials.json' },
      DEFAULT_PATH
    );
    expect(result).toBe('/home/user/custom/.credentials.json');
  });

  it('전부 undefined이면 defaultPath로 폴백한다', () => {
    const result = resolveCredentialsPath({}, DEFAULT_PATH);
    expect(result).toBe(DEFAULT_PATH);
  });

  it('globalValue가 명시적 빈 문자열이면 defaultPath로 폴백한다', () => {
    const result = resolveCredentialsPath({ globalValue: '' }, DEFAULT_PATH);
    expect(result).toBe(DEFAULT_PATH);
  });
});
