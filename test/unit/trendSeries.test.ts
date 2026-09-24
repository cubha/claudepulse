import { describe, it, expect } from 'vitest';
import { buildTrendSeries, TREND_ACCENT_VARS } from '../../src/webview/trendSeries';
import type { PollPoint } from '../../src/webview/burnRate';

/**
 * v0.2.3 R4 — Utilization Trend 차트의 N버킷 일반화.
 *
 * v0.2.2까지 updateTrendChart는 데이터셋 2개(5H/7D)를 **손으로 적어** 놨고, 그래서
 * panel-util-trend-card는 Codex 활성 시 통째로 숨는 카드(CLAUDE_ONLY_PANEL_IDS)였다.
 * Codex는 버킷 개수가 가변이라(free=30일 1개, 유료=5h+7d) 2개 고정 전제가 성립하지 않는다.
 *
 * 시리즈 선택만 순수함수로 떼어내 잠근다 — Chart.js 렌더는 여전히 panelView 소관이다.
 */

const now = Date.now();
const p = (minutesAgo: number, v: number): PollPoint => ({ t: new Date(now - minutesAgo * 60_000), v });

const claudeArgs = {
  fhHistory: [p(30, 0.1), p(20, 0.2), p(10, 0.3)],
  sdHistory: [p(30, 0.05), p(20, 0.06), p(10, 0.07)],
  codexHistory: new Map<number, PollPoint[]>(),
  codexBuckets: [] as Array<{ windowMinutes: number; labelKey: string | null }>,
  cutoffMs: now - 60 * 60_000,
};

describe('buildTrendSeries (v0.2.3 R4)', () => {
  it('Claude는 5H·7D 두 시리즈를 기존 액센트 그대로 낸다', () => {
    const s = buildTrendSeries({ ...claudeArgs, provider: 'claude' });
    expect(s.map(x => x.key)).toEqual(['fh', 'sd']);
    expect(s[0].accentVar).toBe('--c-sonnet');
    expect(s[1].accentVar).toBe('--c-opus');
  });

  it('cutoff 이전 포인트는 시리즈에서 제외된다', () => {
    const s = buildTrendSeries({ ...claudeArgs, provider: 'claude', cutoffMs: now - 15 * 60_000 });
    expect(s[0].points).toHaveLength(1);
  });

  it('Codex 버킷 1개(free 30일)면 시리즈도 1개다', () => {
    const s = buildTrendSeries({
      ...claudeArgs,
      provider: 'codex',
      codexBuckets: [{ windowMinutes: 43200, labelKey: 'codex_bucket_30d' }],
      codexHistory: new Map([[43200, [p(30, 0.1), p(10, 0.12)]]]),
    });
    expect(s).toHaveLength(1);
    expect(s[0].source).toEqual({ kind: 'codex', windowMinutes: 43200, labelKey: 'codex_bucket_30d' });
  });

  it('Codex 버킷 3개면 시리즈 3개, 색은 서로 다르다', () => {
    const buckets = [
      { windowMinutes: 300, labelKey: 'codex_bucket_5h' },
      { windowMinutes: 10080, labelKey: 'codex_bucket_7d' },
      { windowMinutes: 43200, labelKey: 'codex_bucket_30d' },
    ];
    const hist = new Map(buckets.map(b => [b.windowMinutes, [p(20, 0.1), p(10, 0.2)]]));
    const s = buildTrendSeries({ ...claudeArgs, provider: 'codex', codexBuckets: buckets, codexHistory: hist });
    expect(s).toHaveLength(3);
    expect(new Set(s.map(x => x.accentVar)).size).toBe(3);
  });

  it('버킷이 액센트 수보다 많으면 순환한다 — 8번째 액센트를 만들지 않는다(§3#6 7+1 cap)', () => {
    const buckets = Array.from({ length: 6 }, (_, i) => ({ windowMinutes: (i + 1) * 100, labelKey: null }));
    const hist = new Map(buckets.map(b => [b.windowMinutes, [p(20, 0.1), p(10, 0.2)]]));
    const s = buildTrendSeries({ ...claudeArgs, provider: 'codex', codexBuckets: buckets, codexHistory: hist });
    expect(s).toHaveLength(6);
    for (const x of s) expect(TREND_ACCENT_VARS).toContain(x.accentVar);
    // 순환이므로 N번째는 (N mod cap)번째와 같은 색
    expect(s[TREND_ACCENT_VARS.length].accentVar).toBe(s[0].accentVar);
  });

  it('이력이 없는 버킷도 시리즈는 내되 포인트가 비어 있다 (빈 값을 0으로 지어내지 않는다)', () => {
    const s = buildTrendSeries({
      ...claudeArgs,
      provider: 'codex',
      codexBuckets: [{ windowMinutes: 300, labelKey: 'codex_bucket_5h' }],
      codexHistory: new Map(),
    });
    expect(s).toHaveLength(1);
    expect(s[0].points).toEqual([]);
  });

  it('Codex일 때 Claude 이력은 섞이지 않는다', () => {
    const s = buildTrendSeries({
      ...claudeArgs,
      provider: 'codex',
      codexBuckets: [{ windowMinutes: 300, labelKey: 'codex_bucket_5h' }],
      codexHistory: new Map([[300, [p(20, 0.4)]]]),
    });
    expect(s.every(x => x.source.kind === 'codex')).toBe(true);
  });
});
