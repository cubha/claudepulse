import type { AgentAvailability } from './AgentSource';

export interface AvailabilityProbe {
  homeDirExists: boolean;
  authValid: boolean;
  hasRecords: boolean;
}

/**
 * 3단 빈 상태 판정(v0.2.0, 사용자 지시 — 양 프로바이더 공통).
 *
 * Claude 현행(`credentials_missing` 하나로 뭉쳐 문구가 "설치 안 됐거나 로그인 안 됨"으로 갈라지는
 * 상태)도 이 판정으로 교체한다. 판정 순서가 중요하다 — 미설치 사용자에게 로그인 버튼을 주면
 * 눌러도 CLI가 없어 아무 일도 안 일어난다(§6). `homeDirExists`를 최우선으로 봐서 그 상황 자체를
 * 만들지 않는다.
 *
 * `no_records`는 `PollerError`가 아니다 — 인증은 성공했고 데이터가 빈 상태다(에러 축과
 * 데이터-부재 축을 분리하라는 사용자 지시). 0%·$0을 그리지 않는 이유가 여기서 나온다.
 */
export function classifyAvailability(probe: AvailabilityProbe): AgentAvailability {
  if (!probe.homeDirExists) return 'not_installed';
  if (!probe.authValid) return 'not_authenticated';
  if (!probe.hasRecords) return 'no_records';
  return 'ready';
}
