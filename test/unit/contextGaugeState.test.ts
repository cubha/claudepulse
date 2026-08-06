import { describe, it, expect } from 'vitest';
import { resolveContextGaugeState } from '../../src/webview/contextGaugeState';
import type { SessionContextUsage } from '../../src/types';

function ctx(p: Partial<SessionContextUsage>): SessionContextUsage {
  return {
    tokens: 100_000,
    model: 'claude-sonnet-4-6',
    maxWindow: 200_000,
    ratio: 0.5,
    cwd: '/repo/APP-FE',
    repoName: 'APP-FE',
    timestamp: '2026-08-06T09:55:00.000Z',
    sessionId: 's1',
    mode: 'auto',
    ...p,
  };
}

const NOW = new Date('2026-08-06T10:00:00.000Z').getTime();
const STALE_MS = 4 * 60 * 60 * 1000;

describe('resolveContextGaugeState — 사이드바 배지·색상·경고링크 판정(순수함수)', () => {
  it('ratio<0.80이면 allowed(기본 sonnet 색)', () => {
    const s = resolveContextGaugeState(ctx({ ratio: 0.41 }), NOW, STALE_MS);
    expect(s.colorStatus).toBe('allowed');
  });

  it('0.80<=ratio<0.90이면 allowed_warning', () => {
    const s = resolveContextGaugeState(ctx({ ratio: 0.85 }), NOW, STALE_MS);
    expect(s.colorStatus).toBe('allowed_warning');
  });

  it('ratio>=0.90이면 danger', () => {
    const s = resolveContextGaugeState(ctx({ ratio: 0.95 }), NOW, STALE_MS);
    expect(s.colorStatus).toBe('danger');
  });

  it('auto 모드 + 오래된 timestamp — isStale=true지만 색상은 ratio 기준 그대로(경고 오버라이드 없음)', () => {
    const s = resolveContextGaugeState(
      ctx({ mode: 'auto', ratio: 0.41, timestamp: '2026-08-04T14:00:00.000Z' }), // 1d19h 전
      NOW, STALE_MS,
    );
    expect(s.isStale).toBe(true);
    expect(s.colorStatus).toBe('allowed'); // 41%는 그대로 allowed — auto는 revert 링크 대상이 아님
    expect(s.showRevertLink).toBe(false);
  });

  it('pinned 모드 + 오래된 timestamp — ratio가 낮아도(allowed 구간) allowed_warning으로 오버라이드 + revert 링크 노출', () => {
    const s = resolveContextGaugeState(
      ctx({ mode: 'pinned', ratio: 0.63, timestamp: '2026-08-06T04:00:00.000Z' }), // 6시간 전
      NOW, STALE_MS,
    );
    expect(s.isStale).toBe(true);
    expect(s.colorStatus).toBe('allowed_warning');
    expect(s.showRevertLink).toBe(true);
  });

  it('pinned 모드 + 오래됨 + ratio가 이미 danger 구간이면 danger 유지(더 나쁜 상태가 이긴다)', () => {
    const s = resolveContextGaugeState(
      ctx({ mode: 'pinned', ratio: 0.95, timestamp: '2026-08-06T04:00:00.000Z' }),
      NOW, STALE_MS,
    );
    expect(s.colorStatus).toBe('danger');
    expect(s.showRevertLink).toBe(true);
  });

  it('pinned 모드 + 신선함(임계 이내) — isStale=false, revert 링크 없음, 오버라이드 없음', () => {
    const s = resolveContextGaugeState(
      ctx({ mode: 'pinned', ratio: 0.63, timestamp: '2026-08-06T09:55:00.000Z' }),
      NOW, STALE_MS,
    );
    expect(s.isStale).toBe(false);
    expect(s.colorStatus).toBe('allowed'); // ratio 0.63은 allowed 구간(0.80 미만)
    expect(s.showRevertLink).toBe(false);
  });
});
