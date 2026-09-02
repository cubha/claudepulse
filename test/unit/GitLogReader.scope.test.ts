import { describe, it, expect } from 'vitest';
import { escapeGitAuthorPattern } from '../../src/services/GitLogReader';

/**
 * `git log --author=<pattern>`의 pattern은 정규식이다. 이메일을 그대로 넘기면 메타문자가
 * 의미를 갖는다 — 특히 `+`(앞 문자 1회 이상)는 gmail의 `user+tag@` 주소를 통째로 다른
 * 패턴으로 만든다. 이건 무성 실패다: 매칭이 0건이 되면 회고가 "커밋 없음"으로 보일 뿐
 * 오류가 나지 않는다.
 */
describe('escapeGitAuthorPattern', () => {
  it('정규식 메타문자를 이스케이프한다', () => {
    expect(escapeGitAuthorPattern('user+tag@example.com')).toBe('user\\+tag@example\\.com');
    expect(escapeGitAuthorPattern('a.b@c.io')).toBe('a\\.b@c\\.io');
  });

  it('메타문자가 없으면 원본 그대로', () => {
    expect(escapeGitAuthorPattern('okesh@gmail')).toBe('okesh@gmail');
  });

  it('이스케이프 결과가 원래 이메일을 실제로 매칭한다', () => {
    for (const email of ['user+tag@example.com', 'a.b@c.io', 'x_y-z@sub.domain.co.kr']) {
      expect(new RegExp(escapeGitAuthorPattern(email)).test(email), email).toBe(true);
      // 그리고 '.'가 임의문자로 새지 않는다
      expect(new RegExp(escapeGitAuthorPattern('a.b@c.io')).test('axb@c.io')).toBe(false);
    }
  });
});
