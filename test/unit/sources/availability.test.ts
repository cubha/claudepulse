import { describe, it, expect } from 'vitest';
import { classifyAvailability } from '../../../src/sources/availability';

describe('classifyAvailability — 3단 빈 상태 판정(양 프로바이더 공통, 사용자 지시)', () => {
  it('홈 디렉토리 자체가 없으면 not_installed', () => {
    expect(classifyAvailability({ homeDirExists: false, authValid: false, hasRecords: false })).toBe('not_installed');
  });

  it('홈은 있지만 인증이 안 되면 not_authenticated', () => {
    expect(classifyAvailability({ homeDirExists: true, authValid: false, hasRecords: false })).toBe('not_authenticated');
  });

  it('인증은 됐지만 세션 기록이 0건이면 no_records(에러 아님)', () => {
    expect(classifyAvailability({ homeDirExists: true, authValid: true, hasRecords: false })).toBe('no_records');
  });

  it('전부 충족하면 ready', () => {
    expect(classifyAvailability({ homeDirExists: true, authValid: true, hasRecords: true })).toBe('ready');
  });

  it('판정 순서 — 홈 부재가 인증 상태보다 우선한다(모순 입력 방어)', () => {
    // 홈이 없는데 authValid가 true로 잘못 들어와도 not_installed가 이긴다 — "설치 안 됐는데 로그인 버튼"을 막는다
    expect(classifyAvailability({ homeDirExists: false, authValid: true, hasRecords: true })).toBe('not_installed');
  });
});
