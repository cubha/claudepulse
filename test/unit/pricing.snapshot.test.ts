import { describe, it, expect } from 'vitest';
import { PRICING } from '../../src/utils/pricing';
import snapshot from '../../pricing/litellm-snapshot.json';

/**
 * PRICING(코드) ↔ litellm-snapshot.json(문서) 동치 잠금.
 *
 * 스냅샷은 코드가 import하지 않는 참조용 문서라, 어긋나도 빌드·타입체크·기존 테스트가 전부
 * 통과한다. 실제로 v0.1.54까지 스냅샷이 현행 세대 모델을 통째로 빠뜨린 채 "가격 진실원"을
 * 자처하고 있었다. 강제하지 않는 이중 소스는 반드시 갈라진다 — 그래서 게이트로 묶는다.
 */
describe('PRICING ↔ litellm-snapshot.json', () => {
  const snapModels = snapshot.models as Record<string, Record<string, number>>;

  it('키 집합이 정확히 일치한다', () => {
    expect(Object.keys(snapModels).sort()).toEqual(Object.keys(PRICING).sort());
  });

  it('모든 모델의 5개 요율이 일치한다', () => {
    for (const [model, price] of Object.entries(PRICING)) {
      expect(snapModels[model], `${model} 스냅샷 누락`).toBeDefined();
      expect(snapModels[model], model).toEqual({
        input: price.input,
        output: price.output,
        cache_creation: price.cache_creation,
        cache_creation_1h: price.cache_creation_1h,
        cache_read: price.cache_read,
      });
    }
  });
});
