import { describe, it, expect } from 'vitest';
import { PROVIDERS, isProvider, makeRecordKey, providerOfKey, synthesizeRecordKey } from '../../../src/sources/recordKey';

describe('PROVIDERS — 프로바이더 집합', () => {
  it('claude와 codex를 포함한다', () => {
    expect(PROVIDERS).toContain('claude');
    expect(PROVIDERS).toContain('codex');
  });

  it('isProvider가 미지의 문자열을 거부한다', () => {
    expect(isProvider('claude')).toBe(true);
    expect(isProvider('codex')).toBe(true);
    expect(isProvider('cursor')).toBe(false);
    expect(isProvider('')).toBe(false);
  });
});

describe('makeRecordKey — provider 스코프 dedup 키', () => {
  it('claude는 message.id를 가공 없이 쓴다(기존 동작 보존 — billing-critical)', () => {
    // 기존 dedup 키가 바뀌면 이미 저장된 인덱스와 충돌해 재집계가 어긋난다.
    expect(makeRecordKey('claude', 'msg_01ABC')).toBe('msg_01ABC');
  });

  it('codex는 네임스페이스를 붙인다', () => {
    expect(makeRecordKey('codex', 'resp_030111')).toBe('codex:resp_030111');
  });

  it('서로 다른 프로바이더의 같은 원본 id가 충돌하지 않는다', () => {
    const a = makeRecordKey('claude', 'same-id');
    const b = makeRecordKey('codex', 'same-id');
    expect(a).not.toBe(b);
  });

  it('빈 원본 id는 null — 호출측이 레코드를 버릴 수 있게 한다', () => {
    expect(makeRecordKey('claude', '')).toBeNull();
    expect(makeRecordKey('codex', '')).toBeNull();
  });
});

describe('synthesizeRecordKey — 원본 id가 없는 레코드를 버리지 않는다', () => {
  // Codex rollout은 대개 response_id를 주지만(token_usage_record), 버전 편차로 빠질 수 있다.
  // Claude 경로는 message.id가 없으면 잘못된 레코드라 버리는 게 맞다(기존 동작 보존).
  // Codex는 버리면 사용량이 통째로 소실되므로 다른 필드로 합성한다.
  const parts = { sessionId: 'sess-1', turnId: 'turn-1', timestamp: '2026-09-19T10:00:00.000Z', ordinal: 3 };

  it('구성요소가 같으면 같은 키(재실행·replay가 같은 키로 모인다)', () => {
    expect(synthesizeRecordKey('codex', parts)).toBe(synthesizeRecordKey('codex', { ...parts }));
  });

  it('ordinal이 다르면 다른 키(같은 턴의 연속 레코드가 뭉개지지 않는다)', () => {
    expect(synthesizeRecordKey('codex', parts)).not.toBe(synthesizeRecordKey('codex', { ...parts, ordinal: 4 }));
  });

  it('turn이 다르면 다른 키', () => {
    expect(synthesizeRecordKey('codex', parts)).not.toBe(synthesizeRecordKey('codex', { ...parts, turnId: 'turn-2' }));
  });

  it('합성 키도 provider 네임스페이스를 유지해 역판정된다', () => {
    const key = synthesizeRecordKey('codex', parts);
    expect(providerOfKey(key)).toBe('codex');
  });

  it('구성요소가 전부 비어도 키를 만든다(드랍 금지 — 사용량 소실 방지)', () => {
    const key = synthesizeRecordKey('codex', { sessionId: '', turnId: '', timestamp: '', ordinal: 0 });
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan('codex:'.length);
  });
});

describe('providerOfKey — 키에서 프로바이더 역판정', () => {
  it('네임스페이스가 없으면 claude(레거시 키 호환)', () => {
    expect(providerOfKey('msg_01ABC')).toBe('claude');
  });

  it('네임스페이스가 있으면 해당 프로바이더', () => {
    expect(providerOfKey('codex:resp_030111')).toBe('codex');
  });

  it('미지의 네임스페이스는 claude로 폴백하지 않고 null', () => {
    // 모르는 프로바이더를 claude로 읽으면 남의 비용이 Claude 집계에 섞인다.
    expect(providerOfKey('cursor:abc')).toBeNull();
  });

  it('makeRecordKey와 왕복한다', () => {
    for (const p of PROVIDERS) {
      const key = makeRecordKey(p, 'raw-1');
      expect(key).not.toBeNull();
      expect(providerOfKey(key as string)).toBe(p);
    }
  });
});
