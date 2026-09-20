/**
 * 프로바이더 스코프 dedup 키 (v0.2.0).
 *
 * CLAUDE.md §3#1의 `message.id` dedup을 멀티 프로바이더로 확장한다. 두 가지를 동시에 지킨다:
 *
 * 1. **Claude 키는 가공하지 않는다** — 기존 dedup 키가 바뀌면 이미 저장된 인덱스와 어긋나
 *    재집계가 틀어진다(billing-critical). 그래서 claude만 prefix가 없다.
 * 2. **Codex 레코드를 버리지 않는다** — `JsonlParser`는 `message.id`가 없으면 레코드를 버리는데,
 *    Codex엔 `message.id` 개념이 없다. 원본 id(`response_id`)가 있으면 그것을, 없으면
 *    `synthesizeRecordKey`로 합성한다. 버리면 사용량이 통째로 소실된다.
 */

export const PROVIDERS = ['claude', 'codex'] as const;
export type AgentProvider = (typeof PROVIDERS)[number];

const NS_SEP = ':';

export function isProvider(v: string): v is AgentProvider {
  return (PROVIDERS as readonly string[]).includes(v);
}

/** 원본 id가 있을 때의 dedup 키. 빈 id는 null — 호출측이 버릴지 합성할지 정한다. */
export function makeRecordKey(provider: AgentProvider, rawId: string): string | null {
  if (!rawId) return null;
  return provider === 'claude' ? rawId : `${provider}${NS_SEP}${rawId}`;
}

export interface RecordKeyParts {
  sessionId: string;
  turnId: string;
  timestamp: string;
  ordinal: number;
}

/**
 * 원본 id가 없는 레코드의 합성 키. 같은 구성요소 → 같은 키여야 replay가 한 키로 모인다.
 * `ordinal`을 포함하는 이유: 한 턴에 연속한 레코드가 여러 개 나오므로 turn까지만 쓰면 뭉개진다.
 */
export function synthesizeRecordKey(provider: AgentProvider, parts: RecordKeyParts): string {
  const raw = `${parts.sessionId}|${parts.turnId}|${parts.timestamp}|${parts.ordinal}`;
  return `${provider}${NS_SEP}syn${NS_SEP}${raw}`;
}

/** 키가 어느 프로바이더 것인지. 모르는 네임스페이스는 claude로 폴백하지 않는다(집계 오염 방지). */
export function providerOfKey(key: string): AgentProvider | null {
  const sepAt = key.indexOf(NS_SEP);
  if (sepAt < 0) return 'claude';
  const ns = key.slice(0, sepAt);
  return isProvider(ns) ? ns : null;
}
