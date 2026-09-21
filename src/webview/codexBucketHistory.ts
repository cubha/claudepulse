// Codex 버킷별 사용률 이력 누적(v0.2.1 ST10 → v0.2.2에서 순수 모듈로 분리).
//
// 왜 별도 모듈인가: v0.2.1에서 이 로직은 sidebarView.ts의 initSidebar() 안쪽 클로저였고,
// 그 파일이 모듈 최상단에서 document를 만지는 바람에 **테스트로 잠글 수단이 없었다**
// (PLAN-v0.2.1 §7에 "후속 과제로 남김"으로 기록된 이월 항목). 동일 상태를 읽는 소비 지점이
// 둘 이상이면 분기를 순수함수 한 곳으로 모으고 거기에 회귀 잠금을 건다 — v0.1.47 갭A의 교훈.
import type { RateLimitBucket } from '../sources/codex/codexRollout';
import type { PollPoint } from './burnRate';

/**
 * 버킷 이력을 **`windowMinutes`(버킷 정체성)** 로 키잉해 누적한다.
 *
 * 배열 인덱스로 키를 잡으면 안 되는 이유: Codex 버킷은 개수·순서가 가변이다(D9 — free는 30일
 * 단일 버킷, 유료는 5h+7d). 세션 도중 플랜이 바뀌거나 CLI가 순서를 다르게 반환하면 인덱스 키잉은
 * 이전 버킷의 이력을 **다른 버킷에 그대로 이어 붙인다** — 그리고 그 결과는 빈 화면이 아니라
 * "확신 있게 표시되는 틀린 burn rate"라 눈으로 잡히지 않는다.
 *
 * `usedPercent`(0~100)를 utilization(0~1)로 정규화해 저장한다 — Claude의 sbFhHistory와 같은 단위.
 */
export function appendCodexBucketHistory(
  store: Map<number, PollPoint[]>,
  buckets: readonly RateLimitBucket[],
  at: Date,
  maxPoints: number,
): Map<number, PollPoint[]> {
  for (const b of buckets) {
    const hist = store.get(b.windowMinutes) ?? [];
    hist.push({ t: at, v: b.usedPercent / 100 });
    while (hist.length > maxPoints) hist.shift();
    store.set(b.windowMinutes, hist);
  }
  return store;
}
