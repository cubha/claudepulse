import { describe, expect, it } from 'vitest';
import { appendCodexBucketHistory, flattenCodexBucketHistory, hydrateCodexBucketHistory } from '../../src/webview/codexBucketHistory';
import { buildCodexSidebarHtml } from '../../src/webview/sidebarView';
import type { RateLimitBucket } from '../../src/sources/codex/codexRollout';
import type { PollPoint } from '../../src/webview/burnRate';

// v0.2.1 ST10의 이월 항목(PLAN-v0.2.1 §7 "후속 과제로 남김") 종결.
// 원래 버그: 버킷 이력을 배열 인덱스로 키잉해, 버킷 개수·순서가 바뀌면 이전 버킷의 이력이
// 다른 버킷에 이어 붙어 "확신 있게 표시되는 틀린 burn rate"가 나왔다. 아래 두 describe는
// 기록 측(정체성 키잉)과 소비 측(조회 키잉)을 각각 잠근다 — 둘 중 하나만 인덱스로 되돌려도
// RED가 난다(실측 확인함).

function bucket(windowMinutes: number, usedPercent: number): RateLimitBucket {
  return { windowMinutes, usedPercent, resetsAt: Math.floor(Date.now() / 1000) + 3600, labelKey: null };
}

describe('appendCodexBucketHistory — windowMinutes 정체성 키잉(기록 측)', () => {
  it('폴 사이에 버킷 순서가 뒤집혀도 이력이 원래 버킷에 남는다', () => {
    const store = new Map<number, PollPoint[]>();
    const t1 = new Date('2026-09-21T00:00:00Z');
    const t2 = new Date('2026-09-21T00:05:00Z');

    appendCodexBucketHistory(store, [bucket(300, 10), bucket(10080, 50)], t1, 288);
    // CLI가 순서를 바꿔 돌려준 경우 — 인덱스 키잉이었다면 5h 이력에 7d 값이 붙는다.
    appendCodexBucketHistory(store, [bucket(10080, 55), bucket(300, 12)], t2, 288);

    expect(store.get(300)!.map(p => p.v)).toEqual([0.10, 0.12]);
    expect(store.get(10080)!.map(p => p.v)).toEqual([0.50, 0.55]);
  });

  it('버킷 개수가 바뀌어도(free 1개 ↔ 유료 2개) 기존 버킷 이력이 오염되지 않는다', () => {
    const store = new Map<number, PollPoint[]>();
    appendCodexBucketHistory(store, [bucket(43200, 20)], new Date('2026-09-21T00:00:00Z'), 288);
    // 플랜 전환: 30일 단일 버킷 → 5h + 7d. 인덱스 키잉이면 30일 이력이 5h에 이어 붙는다.
    appendCodexBucketHistory(store, [bucket(300, 1), bucket(10080, 2)], new Date('2026-09-21T00:05:00Z'), 288);

    expect([...store.keys()].sort((a, b) => a - b)).toEqual([300, 10080, 43200]);
    expect(store.get(43200)!.map(p => p.v)).toEqual([0.20]);
    expect(store.get(300)!.map(p => p.v)).toEqual([0.01]);
    expect(store.get(10080)!.map(p => p.v)).toEqual([0.02]);
  });

  it('usedPercent(0~100)를 utilization(0~1)로 정규화하고 상한에서 오래된 점을 버린다', () => {
    const store = new Map<number, PollPoint[]>();
    for (let i = 0; i < 5; i++) {
      appendCodexBucketHistory(store, [bucket(300, i)], new Date(Date.UTC(2026, 8, 21, 0, i)), 3);
    }
    expect(store.get(300)!.map(p => p.v)).toEqual([0.02, 0.03, 0.04]);
  });
});

describe('buildCodexSidebarHtml — 버킷별 burn 행이 자기 이력으로 계산된다(소비 측)', () => {
  it('버킷 배열 순서와 이력 Map 삽입 순서가 달라도 각 버킷이 제 소모율을 보인다', () => {
    const now = Date.now();
    const pts = (from: number, to: number): PollPoint[] => [
      { t: new Date(now - 10 * 60_000), v: from },
      { t: new Date(now), v: to },
    ];
    // 5h는 10분에 +10%p(=1%/min), 7d는 10분에 +1%p(=0.1%/min=6%/hr) — 자릿수로 구분된다.
    const history = new Map<number, PollPoint[]>();
    history.set(10080, pts(0.20, 0.21));
    history.set(300, pts(0.30, 0.40));

    const html = buildCodexSidebarHtml(
      {
        buckets: [bucket(300, 40), bucket(10080, 21)],
        planType: 'plus', generatedAt: new Date(now).toISOString(), modelContextWindow: null,
      },
      { claude: 'ready', codex: 'ready' } as never,
      null,
      'codex',
      history,
    );

    // v0.2.3 R3에서 표기 단위가 창 길이에 따라 갈린다(pickBurnUnit) — 5h는 %/min, 7d는 %/hr.
    // 단위까지 함께 단언해 ①버킷 키 혼선 ②단위 선택 회귀를 한 번에 잡는다.
    const rates = [...html.matchAll(/([\d.]+)%\/(min|hr|day)/g)].map(m => [m[1], m[2]]);
    expect(rates).toEqual([['1.00', 'min'], ['6.00', 'hr']]);
  });
});

/**
 * v0.2.3 — 확장이 소유한 이력을 웹뷰가 받아 출발하는 경로.
 *
 * 왜 필요해졌나: 웹뷰마다 이력을 따로 쌓으면 **열린 시점이 다른 만큼 쌓인 양이 다르고**,
 * 그래서 같은 버킷의 소모율이 사이드바와 대시보드에서 다르게 보인다(사이드바는 활성화부터,
 * 대시보드는 사용자가 열 때부터). scope-critic이 v0.2.3 구현 중 지적한 경계다.
 * Claude는 이 문제를 snapshotHistory + GetPollHistory pre-hydrate로 이미 풀어 뒀다.
 */
describe('flatten/hydrate — 확장↔웹뷰 이력 전송 (v0.2.3)', () => {
  const pt = (min: number, v: number): PollPoint => ({ t: new Date(Date.UTC(2026, 8, 23, 0, min)), v });

  it('평탄화 → 복원이 원본과 같다 (버킷 키가 섞이지 않는다)', () => {
    const src = new Map<number, PollPoint[]>([
      [300, [pt(0, 0.1), pt(5, 0.2)]],
      [10080, [pt(0, 0.01)]],
    ]);
    const restored = hydrateCodexBucketHistory(new Map(), flattenCodexBucketHistory(src), 100);
    expect(restored.get(300)!.map(p => p.v)).toEqual([0.1, 0.2]);
    expect(restored.get(10080)!.map(p => p.v)).toEqual([0.01]);
  });

  it('hydrate 전에 push가 먼저 도착해도 그 점이 살아남는다 (경쟁 상황)', () => {
    // 웹뷰가 요청을 보낸 뒤 응답이 오기 전에 브로드캐스트를 먼저 받는 순서는 실제로 가능하다.
    // 통째로 갈아치우면 방금 받은 **최신** 점이 사라진다.
    const store = new Map<number, PollPoint[]>([[300, [pt(9, 0.9)]]]);
    hydrateCodexBucketHistory(store, flattenCodexBucketHistory(new Map([[300, [pt(0, 0.1), pt(5, 0.5)]]])), 100);
    expect(store.get(300)!.map(p => p.v)).toEqual([0.1, 0.5, 0.9]);   // 시각 순 병합
  });

  it('같은 (버킷, 시각)은 중복으로 쌓지 않는다', () => {
    const wire = flattenCodexBucketHistory(new Map([[300, [pt(0, 0.1)]]]));
    const store = new Map<number, PollPoint[]>([[300, [pt(0, 0.1)]]]);
    hydrateCodexBucketHistory(store, wire, 100);
    expect(store.get(300)).toHaveLength(1);
  });

  it('상한을 넘기면 오래된 점부터 버린다', () => {
    const wire = flattenCodexBucketHistory(new Map([[300, [pt(0, 0.1), pt(1, 0.2), pt(2, 0.3)]]]));
    const store = hydrateCodexBucketHistory(new Map(), wire, 2);
    expect(store.get(300)!.map(p => p.v)).toEqual([0.2, 0.3]);
  });
});
