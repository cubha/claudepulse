import { describe, it, expect } from 'vitest';
import { getNonce } from '../../src/utils/nonce';

// v0.1.44: CSP nonce 공통 유틸 — Math.random() 기반 중복 구현(DashboardPanel/SidebarViewProvider)을
// crypto.randomBytes 기반 단일 유틸로 통합. nonce는 암호학적 무작위성이 목적이므로 형식·유일성을 잠근다.
describe('getNonce', () => {
  it('32자 hex 문자열을 반환한다 (randomBytes(16).toString("hex"))', () => {
    const nonce = getNonce();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it('호출마다 다른 값을 반환한다', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(getNonce());
    expect(seen.size).toBe(100);
  });
});
