import { describe, expect, it } from 'vitest';
import { appendCodexBucketHistory } from '../../src/webview/codexBucketHistory';
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
    // 5h는 10분에 +10%p(=1%/min), 7d는 10분에 +1%p(=0.1%/min) — 두 자릿수로 구분된다.
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

    const rates = [...html.matchAll(/([\d.]+)%\/min/g)].map(m => m[1]);
    expect(rates).toEqual(['1.00', '0.10']);
  });
});
