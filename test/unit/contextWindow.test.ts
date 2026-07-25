import { describe, it, expect } from 'vitest';
import {
  findContextWindow,
  calcContextUsageRatio,
  DEFAULT_CONTEXT_WINDOW,
} from '../../src/utils/contextWindow';

describe('findContextWindow — 모델별 최대 컨텍스트 윈도 (longest-prefix, findPricing과 동일 패턴)', () => {
  it('정확 매칭', () => {
    expect(findContextWindow('claude-opus-4-8')).toBe(200_000);
    expect(findContextWindow('claude-fable-5')).toBe(1_000_000);
  });

  it('버전 스냅샷 접미사가 붙은 모델명도 최장 접두사로 매칭', () => {
    expect(findContextWindow('claude-opus-4-8-20260115')).toBe(200_000);
    expect(findContextWindow('claude-fable-5-20260601')).toBe(1_000_000);
  });

  it('claude-opus-4-1과 claude-opus-4를 정확히 구분(최장 접두사 우선)', () => {
    expect(findContextWindow('claude-opus-4-1-20250805')).toBe(200_000);
  });

  it('완전히 미지의 모델은 보수적 기본값(200K)으로 폴백', () => {
    expect(findContextWindow('claude-unknown-model-9000')).toBe(200_000);
  });
});

describe('calcContextUsageRatio — 컨텍스트 점유율 (0.0~1.0 클램프)', () => {
  it('토큰수/최대윈도 비율 계산', () => {
    expect(calcContextUsageRatio(100_000, 'claude-opus-4-8')).toBeCloseTo(0.5, 6);
  });

  it('최대윈도 초과 시 1.0으로 클램프', () => {
    expect(calcContextUsageRatio(999_999_999, 'claude-opus-4-8')).toBe(1);
  });

  it('음수 토큰수는 0으로 클램프', () => {
    expect(calcContextUsageRatio(-100, 'claude-opus-4-8')).toBe(0);
  });
});

describe('findContextWindow — 상속 프로퍼티명 방어', () => {
  // 보안 검토(v0.1.47): 직접 인덱싱은 model='constructor'일 때 상속 함수를 반환해
  // number 계약을 깨고 하류에서 NaN%를 노출시킨다.
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    '%s 모델명도 기본 윈도로 폴백한다',
    (evil) => {
      const w = findContextWindow(evil);
      expect(typeof w).toBe('number');
      expect(w).toBe(DEFAULT_CONTEXT_WINDOW);
    }
  );

  it('상속 프로퍼티명 모델로도 ratio가 NaN이 되지 않는다', () => {
    const r = calcContextUsageRatio(100_000, 'constructor');
    expect(Number.isNaN(r)).toBe(false);
    expect(r).toBeCloseTo(0.5, 5);
  });
});
