import { describe, it, expect } from 'vitest';
import {
  modelKind,
  modelShortName,
  CODEX_MODEL_FAMILY_SLOTS,
  matchLongestFamily,
} from '../../src/webview/webviewShared';

// v0.2.1 ST9 — Codex 모델 색상 분기(v0.2.0에서 신설, 회귀보호 0건이었음. ANALYSIS #9) 사후보강.
// ST5(codex-mini-latest 버그)·ST6(longest-prefix 통일)의 RED 테스트를 겸한다.

describe('modelKind — Claude(무변경 확인, 기존 동작 회귀잠금)', () => {
  it('fable/opus/sonnet/haiku 문자열 포함 여부로 분류한다', () => {
    expect(modelKind('claude-fable-4-20260101')).toBe('fable');
    expect(modelKind('claude-opus-4-20260101')).toBe('opus');
    expect(modelKind('claude-sonnet-5-20260101')).toBe('sonnet');
    expect(modelKind('claude-haiku-4-5-20260101')).toBe('haiku');
  });

  it('미등록 모델명은 other로 폴백한다', () => {
    expect(modelKind('claude-unknown-model')).toBe('other');
  });

  it('provider 인자 생략 시 기본값 claude로 동작한다', () => {
    expect(modelKind('claude-opus-4')).toBe('opus');
  });
});

describe('modelKind — Codex(CODEX_MODEL_FAMILY_SLOTS 패밀리 배정)', () => {
  it('codex 패밀리는 sonnet 슬롯에 배정된다', () => {
    expect(modelKind('gpt-5-codex', 'codex')).toBe('sonnet');
    expect(modelKind('gpt-5.3-codex', 'codex')).toBe('sonnet');
    expect(modelKind('codex-mini-latest', 'codex')).toBe('sonnet');
  });

  it('terra 패밀리는 fable 슬롯에 배정된다', () => {
    expect(modelKind('gpt-5.6-terra', 'codex')).toBe('fable');
  });

  it('미등록 패밀리는 other(slate 폴백)로 떨어진다 — 색을 추측해 지어내지 않는다', () => {
    expect(modelKind('gpt-6-nova', 'codex')).toBe('other');
  });

  it('CODEX_MODEL_FAMILY_SLOTS는 codex→sonnet, terra→fable을 명시 등록한다', () => {
    expect(CODEX_MODEL_FAMILY_SLOTS['codex']).toBe('sonnet');
    expect(CODEX_MODEL_FAMILY_SLOTS['terra']).toBe('fable');
  });
});

describe('matchLongestFamily — longest-prefix 매칭 전략(ANALYSIS #6, codexPricing.findCodexPricing과 통일)', () => {
  it('여러 family가 동시에 매칭되면 더 긴(구체적인) family가 우선한다(키 순서 무관)', () => {
    // 'codex'와 'codex-mini' 둘 다 model에 포함되는 상황 — 순서를 뒤집어도 결과가 같아야
    // "테이블 순서 의존"이 아니라 "문자열 길이 의존"임이 증명된다.
    const tableA: Record<string, 'sonnet' | 'haiku'> = { codex: 'sonnet', 'codex-mini': 'haiku' };
    const tableB: Record<string, 'sonnet' | 'haiku'> = { 'codex-mini': 'haiku', codex: 'sonnet' };
    expect(matchLongestFamily('codex-mini-latest', tableA)).toBe('haiku');
    expect(matchLongestFamily('codex-mini-latest', tableB)).toBe('haiku');
  });

  it('짧은 family만 매칭되면 그대로 반환한다', () => {
    const table: Record<string, 'sonnet' | 'haiku'> = { codex: 'sonnet', 'codex-mini': 'haiku' };
    expect(matchLongestFamily('gpt-5-codex', table)).toBe('sonnet');
  });

  it('아무 family도 매칭되지 않으면 undefined', () => {
    const table: Record<string, 'sonnet'> = { codex: 'sonnet' };
    expect(matchLongestFamily('gpt-6-nova', table)).toBeUndefined();
  });
});

describe('modelShortName — Claude(무변경 확인)', () => {
  it('알려진 kind는 Capitalize된 이름을 반환한다', () => {
    expect(modelShortName('claude-opus-4-20260101')).toBe('Opus');
    expect(modelShortName('claude-sonnet-5-20260101')).toBe('Sonnet');
  });

  it('미등록 모델은 마지막 두 세그먼트를 반환한다', () => {
    expect(modelShortName('claude-unknown-model-x')).toBe('model-x');
  });
});

describe('modelShortName — Codex(ST5: codex-mini-latest "Latest" 오표시 버그 수정)', () => {
  it('gpt-5-codex → Codex', () => {
    expect(modelShortName('gpt-5-codex', 'codex')).toBe('Codex');
  });

  it('gpt-5.6-terra → Terra', () => {
    expect(modelShortName('gpt-5.6-terra', 'codex')).toBe('Terra');
  });

  it('codex-mini-latest → Mini (버그 수정 전: "Latest"가 그대로 노출됐다)', () => {
    expect(modelShortName('codex-mini-latest', 'codex')).toBe('Mini');
  });

  it('Claude 모델명을 그대로 노출하지 않는다(색 슬롯 이름 sonnet과 라벨은 분리)', () => {
    expect(modelShortName('gpt-5-codex', 'codex')).not.toBe('Sonnet');
  });
});
