import { describe, it, expect } from 'vitest';
import { UsageAggregator } from '../../../src/services/UsageAggregator';
import { emptyToolCounts } from '../../../src/services/JsonlParser';
import { calcCodexCost } from '../../../src/sources/codex/codexPricing';
import type { SessionRecord } from '../../../src/types';

/**
 * advisor 지적(2026-09-19) 회귀 잠금 — UsageAggregator가 Codex 레코드를 Claude PRICING map으로
 * 조회하면 `gpt-5-codex`처럼 **가격이 있는** 모델도 'none'(미상)으로 오판된다. v0.1.55 거짓초록의
 * 반대 방향(거짓 unpriced) — resolvePriceFor가 r.provider로 분기해야 한다.
 */
function todayAt(hhmm: string): string {
  return `${new Date().toISOString().slice(0, 10)}T${hhmm}:00.000Z`;
}

function codexRec(model: string, outputTokens: number, hhmm: string): SessionRecord {
  const rawUsage = {
    inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0,
    outputTokens, reasoningOutputTokens: 0, totalTokens: outputTokens,
  };
  return {
    provider: 'codex',
    messageId: `codex:${model}-${hhmm}`,
    requestId: `codex:${model}-${hhmm}`,
    sessionId: 's1',
    model,
    timestamp: todayAt(hhmm),
    cwd: '/repo',
    gitBranch: '',
    usage: {
      input_tokens: 0, output_tokens: outputTokens,
      cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0,
      cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0,
    },
    costUsd: calcCodexCost(model, rawUsage) ?? 0,
    toolCounts: emptyToolCounts(),
    editedFiles: [],
    isSidechain: false,
  };
}

const agg = new UsageAggregator();

describe('UsageAggregator — provider별 가격표 분기(resolvePriceFor)', () => {
  it('가격표에 있는 Codex 모델은 unpricedModels에 잡히지 않고 pricingSource가 exact다', () => {
    const s = agg.aggregate([codexRec('gpt-5-codex', 1_000_000, '01:00')]);
    expect(s.unpricedModels).toEqual([]);
    expect(s.modelBreakdown[0].pricingSource).toBe('exact');
    expect(s.modelShareBasis).toBe('cost');
  });

  it('Codex·Claude 가격 모델이 섞여도 둘 다 exact로 판정되고 비용 기준 share를 쓴다', () => {
    const claudeRec: SessionRecord = {
      messageId: 'c1', requestId: 'c1', sessionId: 's1', model: 'claude-sonnet-5',
      timestamp: todayAt('03:00'), cwd: '/repo', gitBranch: 'main',
      usage: {
        input_tokens: 0, output_tokens: 1_000_000,
        cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0,
        cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0,
      },
      costUsd: 10, toolCounts: emptyToolCounts(), editedFiles: [], isSidechain: false,
    };
    const s = agg.aggregate([codexRec('gpt-5-codex', 1_000_000, '01:00'), claudeRec]);
    expect(s.unpricedModels).toEqual([]);
    expect(s.modelShareBasis).toBe('cost');
    expect(s.modelBreakdown.every(m => m.pricingSource === 'exact')).toBe(true);
  });

  it('가격표에 없는 Codex 모델(gpt-5.6-terra류)만 unpriced로 잡힌다', () => {
    const s = agg.aggregate([codexRec('gpt-5.6-terra', 1_000_000, '01:00')]);
    expect(s.unpricedModels).toEqual(['gpt-5.6-terra']);
    expect(s.modelShareBasis).toBe('tokens');
  });

  it('Codex 레코드는 sessionContext 계측 후보에서 제외된다(Claude 전용 컨텍스트 창 계산이라 모델명이 안 맞음)', () => {
    const s = agg.aggregate([codexRec('gpt-5-codex', 1_000_000, '01:00')]);
    expect(s.sessionContext).toBeNull();
    expect(s.contextSessions).toEqual([]);
  });
});
