import { describe, it, expect } from 'vitest';
import {
  CONFIG_KEYS,
  CONFIG_SECTION,
  DEFAULT_USAGE_REFRESH_INTERVAL_MS,
  MIN_USAGE_REFRESH_INTERVAL_MS,
  clampRefreshInterval,
  fullConfigKey,
} from '../../src/constants';

/**
 * v0.1.56: `affectsConfiguration()`은 **전체 키**를 요구한다.
 *
 * 상대 키('pollIntervalMs')를 넘기면 그런 섹션이 없으니 예외 없이 항상 false다 — 설정을 바꿔도
 * 리스너 본문이 한 번도 실행되지 않고, 빌드·타입체크·린트는 전부 초록이다. 실제로
 * credentialsPath·pollIntervalMs가 이 상태로 살아 있었다. 값이 아니라 **모양**을 잠근다.
 */
describe('fullConfigKey — affectsConfiguration 전체 키', () => {
  it('섹션을 앞에 붙인다', () => {
    expect(fullConfigKey(CONFIG_KEYS.pollIntervalMs)).toBe('claudeCodeGauge.pollIntervalMs');
  });

  it('모든 설정 키가 섹션 접두사를 갖는다 (상대 키 직접 사용 금지)', () => {
    for (const key of Object.values(CONFIG_KEYS)) {
      const full = fullConfigKey(key);
      expect(full).toBe(`${CONFIG_SECTION}.${key}`);
      expect(full.startsWith(`${CONFIG_SECTION}.`)).toBe(true);
      expect(full).not.toBe(key);   // 상대 키와 같아지면 그 순간 무성 실패로 되돌아간다
    }
  });

  it('package.json의 contributes.configuration 키와 일치한다', async () => {
    const pkg = await import('../../package.json');
    const declared: string[] = Object.keys(
      pkg.contributes.configuration.properties as Record<string, unknown>
    );
    for (const key of Object.values(CONFIG_KEYS)) {
      expect(declared).toContain(fullConfigKey(key));
    }
  });
});

/**
 * package.json의 `type`·`minimum`은 설정 **UI**에서만 강제된다. settings.json을 직접 편집하면
 * 무엇이든 도착하고, 그 값이 스로틀 간격이 된다. 특히 NaN은 조용하다 — `elapsed >= NaN`이
 * 언제나 false라 스로틀이 열린 채로 남고, 에러는 나지 않는다.
 */
describe('clampRefreshInterval — 설정값 방어', () => {
  it('정상 값은 그대로', () => {
    expect(clampRefreshInterval(30000)).toBe(30000);
  });

  it('하한 미만은 하한으로', () => {
    expect(clampRefreshInterval(0)).toBe(MIN_USAGE_REFRESH_INTERVAL_MS);
    expect(clampRefreshInterval(-5000)).toBe(MIN_USAGE_REFRESH_INTERVAL_MS);
  });

  it('미설정은 기본값', () => {
    expect(clampRefreshInterval(undefined)).toBe(DEFAULT_USAGE_REFRESH_INTERVAL_MS);
  });

  it('수치가 아니면 기본값 — Math.max만으로는 NaN이 새어나간다', () => {
    for (const bad of ['15000', NaN, null, {}, [], true, Infinity]) {
      const v = clampRefreshInterval(bad);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(MIN_USAGE_REFRESH_INTERVAL_MS);
    }
  });
});
