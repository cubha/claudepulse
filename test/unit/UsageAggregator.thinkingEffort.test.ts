import { describe, it, expect } from 'vitest';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import type { SessionRecord } from '../../src/types';

// v0.2.6 ST3(thinking 비중) · ST7(effort별 비용).

const NOW = new Date().toISOString();
let seq = 0;
function rec(p: Partial<SessionRecord> = {}): SessionRecord {
  seq++;
  return {
    messageId: `m${seq}`, requestId: `r${seq}`, sessionId: 's1', model: 'claude-opus-4-8',
    timestamp: NOW, cwd: '/w', gitBranch: 'main',
    usage: {
      input_tokens: 10, output_tokens: 100,
      cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0,
      cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0,
    },
    costUsd: 1, toolCounts: emptyToolCounts(), editedFiles: [], isSidechain: false,
    ...p,
  };
}

describe('ST3 — 오늘 thinking 비중', () => {
  it('thinking/output 비중 — 분모는 thinking 필드가 있는 레코드의 output만(구버전 로그로 희석 금지)', () => {
    const s = new UsageAggregator().aggregate([
      rec({ thinkingTokens: 40 }),
      rec({ thinkingTokens: 10 }),
      rec(), // 필드 없음 — 분모에서 제외
    ]);
    expect(s.todayThinking).toEqual({ thinkingTokens: 50, outputTokens: 200, share: 0.25 });
  });

  it('오늘 thinking 필드가 하나도 없으면 null(0%가 아니다)', () => {
    const s = new UsageAggregator().aggregate([rec(), rec({ timestamp: '2020-01-01T00:00:00.000Z', thinkingTokens: 5 })]);
    expect(s.todayThinking).toBeNull();
  });
});

describe('ST7 — effort별 비용', () => {
  it('effort별 비용·토큰·share, 없으면 미상 버킷 — share 분모 = 스코프 총비용', () => {
    const s = new UsageAggregator().aggregate([
      rec({ effort: 'high', costUsd: 6 }),
      rec({ effort: 'high', costUsd: 2 }),
      rec({ effort: 'medium', costUsd: 1 }),
      rec({ costUsd: 1 }),
    ]);
    expect(s.effortBreakdown.map(e => [e.effort, e.costUsd, e.share])).toEqual([
      ['high', 8, 0.8],
      ['medium', 1, 0.1],
    ]);
    expect(s.effortUnattributed).toMatchObject({ costUsd: 1, share: 0.1 });
    expect(s.attributionScopes.last24h.effortBreakdown.map(e => e.effort)).toEqual(['high', 'medium']);
  });

  it('미상 버킷은 비용이 0이어도 토큰이 있으면 남는다(가격 미상 모델)', () => {
    const s = new UsageAggregator().aggregate([rec({ model: 'mystery-model-9', costUsd: 0 })]);
    expect(s.effortBreakdown).toEqual([]);
    expect(s.effortUnattributed).toMatchObject({ costUsd: 0, totalTokens: 110, hasUnpricedRecords: true });
  });
});
