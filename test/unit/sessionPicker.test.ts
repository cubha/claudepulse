import { describe, it, expect } from 'vitest';
import { buildSessionPickerItems } from '../../src/utils/sessionPicker';
import type { ContextSessionSummary } from '../../src/types';

function summary(p: Partial<ContextSessionSummary> & { sessionId: string }): ContextSessionSummary {
  return {
    startTime: '2026-08-06T09:00:00.000Z',
    cwd: '/repo/APP-FE',
    branch: 'main',
    totalTokens: 1000,
    costUsd: 0.1,
    messageCount: 3,
    lastActivity: '2026-08-06T09:00:00.000Z',
    model: 'claude-sonnet-4-6',
    contextTokens: 50_000,
    maxWindow: 200_000,
    ratio: 0.25,
    hasUnpricedRecords: false,
    ...p,
  };
}

const NOW = new Date('2026-08-06T10:00:00.000Z').getTime();
const STALE_MS = 4 * 60 * 60 * 1000;

describe('buildSessionPickerItems — QuickPick 아이템 정렬·라벨(순수함수, VS Code API 비의존)', () => {
  it('lastActivity 내림차순으로 정렬한다(입력 순서 무관)', () => {
    const items = buildSessionPickerItems([
      summary({ sessionId: 'old', lastActivity: '2026-08-06T08:00:00.000Z' }),
      summary({ sessionId: 'newest', lastActivity: '2026-08-06T09:30:00.000Z' }),
      summary({ sessionId: 'mid', lastActivity: '2026-08-06T09:00:00.000Z' }),
    ], null, NOW, STALE_MS);
    expect(items.map(i => i.sessionId)).toEqual(['newest', 'mid', 'old']);
  });

  it('pin이 없으면 정렬 후 최상단(=가장 최근 활동) 항목이 auto 배지를 받는다', () => {
    const items = buildSessionPickerItems([
      summary({ sessionId: 'a', lastActivity: '2026-08-06T08:00:00.000Z' }),
      summary({ sessionId: 'b', lastActivity: '2026-08-06T09:30:00.000Z' }),
    ], null, NOW, STALE_MS);
    expect(items.find(i => i.sessionId === 'b')!.badge).toBe('auto');
    expect(items.find(i => i.sessionId === 'a')!.badge).toBeNull();
  });

  it('pin이 있으면 그 세션만 pinned 배지, 다른 세션(가장 최근 활동이라도)은 배지 없음', () => {
    const items = buildSessionPickerItems([
      summary({ sessionId: 'a', lastActivity: '2026-08-06T08:00:00.000Z' }),
      summary({ sessionId: 'b', lastActivity: '2026-08-06T09:30:00.000Z' }), // 더 최근이지만 pin 대상 아님
    ], 'a', NOW, STALE_MS);
    expect(items.find(i => i.sessionId === 'a')!.badge).toBe('pinned');
    expect(items.find(i => i.sessionId === 'b')!.badge).toBeNull();
  });

  it('age(now-lastActivity)가 임계값을 넘으면 isStale=true', () => {
    const items = buildSessionPickerItems([
      summary({ sessionId: 'fresh', lastActivity: '2026-08-06T09:55:00.000Z' }), // 5분 전
      summary({ sessionId: 'stale', lastActivity: '2026-08-06T05:00:00.000Z' }), // 5시간 전
    ], null, NOW, STALE_MS);
    expect(items.find(i => i.sessionId === 'fresh')!.isStale).toBe(false);
    expect(items.find(i => i.sessionId === 'stale')!.isStale).toBe(true);
  });

  it('maxWindow/ratio는 입력의 정밀 계산값을 그대로 전달한다(여기서 재계산하지 않음) — 1M 세션도 정확히 통과', () => {
    const items = buildSessionPickerItems([
      // UsageAggregator가 이미 forceOneMillion 3단 계단으로 계산해 넣은 값(dev-note 303,186 사례처럼
      // 200K를 넘긴 1M 세션) — sessionPicker가 이 값을 무시하고 200K 테이블로 재계산하면 안 됨.
      summary({ sessionId: 'a', model: 'claude-sonnet-5', contextTokens: 303_186, maxWindow: 1_000_000, ratio: 0.303186 }),
    ], null, NOW, STALE_MS);
    expect(items[0].maxWindow).toBe(1_000_000);
    expect(items[0].ratio).toBeCloseTo(0.303186, 6);
  });

  it('repoName은 cwd의 마지막 세그먼트', () => {
    const items = buildSessionPickerItems([
      summary({ sessionId: 'a', cwd: '/home/user/repo/APP-BE' }),
    ], null, NOW, STALE_MS);
    expect(items[0].repoName).toBe('APP-BE');
  });

  it('빈 배열 입력이면 빈 배열 반환', () => {
    expect(buildSessionPickerItems([], null, NOW, STALE_MS)).toEqual([]);
  });
});
