import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  blockChipHtml, blockHistoryRows, cacheMissHtml, codexLimitsRowsHtml, codexSubagentRowHtml,
  compactionChipHtml, effortRows, fmtDuration, prCostRows, thinkingChipHtml, turnHooksHtml,
} from '../../src/webview/signalsView';
import type { RateLimitBlockHistory, TurnHookStats } from '../../src/types';

// v0.2.6 ST13·ST14 — 신호 렌더러(test-after). 시각은 Playwright 실렌더가 맡고, 여기서는
// "없으면 안 그린다"(빈 값 ≠ 0)·외부 문자열 escape·명세된 마커를 잠근다.

const NOW = Date.parse('2026-10-06T12:00:00.000Z');
const blocks = (firstAt: string): RateLimitBlockHistory => ({
  episodes: [{ rateLimitType: 'five_hour', resetsAt: 1, firstAt, lastAt: firstAt, rejectedCount: 3, overageDisabledReason: 'out_of_credits' }],
  unclassified429: 0,
  serverErrors: { count: 0, lastAt: null, byStatus: {} },
});

describe('사이드바 칩', () => {
  it('thinking 칩 — 값이 없으면 그리지 않는다', () => {
    expect(thinkingChipHtml(null)).toBe('');
    expect(thinkingChipHtml({ thinkingTokens: 0, outputTokens: 0, share: 0 })).toBe('');
    expect(thinkingChipHtml({ thinkingTokens: 30, outputTokens: 100, share: 0.3 })).toContain('30%');
  });

  it('차단 칩 — 7일 안의 차단만, 그 밖이면 빈 문자열', () => {
    expect(blockChipHtml(blocks('2026-10-04T12:00:00.000Z'), NOW)).toContain('5h');
    expect(blockChipHtml(blocks('2026-09-20T12:00:00.000Z'), NOW)).toBe('');
    expect(blockChipHtml({ episodes: [], unclassified429: 0, serverErrors: { count: 0, lastAt: null, byStatus: {} } }, NOW)).toBe('');
  });

  it('compaction 칩 — 압축 없으면 빈 문자열', () => {
    expect(compactionChipHtml(null)).toBe('');
    expect(compactionChipHtml({ count: 2, autoCount: 1, last: { at: '2026-10-06T00:00:00Z', trigger: 'auto', preTokens: 786256, postTokens: 34714 } })).toContain('2');
  });

  it('Codex extras — 빈 free credits는 행을 만들지 않고, 값은 escape한다', () => {
    expect(codexLimitsRowsHtml({ credits: { hasCredits: false, unlimited: false, balance: null }, individualLimit: null, spendControlReached: null, rateLimitReachedType: null })).toBe('');
    const html = codexLimitsRowsHtml({ credits: { hasCredits: true, unlimited: false, balance: '<b>12</b>' }, individualLimit: null, spendControlReached: true, rateLimitReachedType: 'future_reason' });
    expect(html).toContain('&lt;b&gt;12&lt;/b&gt;');
    expect(html).not.toContain('<b>12</b>');
    expect(html).toContain('future_reason'); // 모르는 사유는 원문
  });
});

describe('대시보드 섹션', () => {
  it('캐시 미스 — 0건이면 빈 문자열, 토큰 미상이 있으면 합계를 하한(≥)으로 표기', () => {
    expect(cacheMissHtml({ reasons: [], missCount: 0, recordCount: 10, estCostUsd: 0, hasUnknownTokens: false })).toBe('');
    const html = cacheMissHtml({
      reasons: [
        { reason: 'previous_message_not_found', count: 3, missedTokens: null, estCostUsd: null, hasUnpricedRecords: false },
        { reason: 'new_reason_<x>', count: 1, missedTokens: 10, estCostUsd: 0.5, hasUnpricedRecords: false },
      ],
      missCount: 4, recordCount: 100, estCostUsd: 0.5, hasUnknownTokens: true,
    });
    expect(html).toContain('≥');
    expect(html).toContain('skill-row-other'); // 토큰 미상 행은 muted
    expect(html).toContain('new_reason_&lt;x&gt;');
  });

  it('차단 이력 — 에피소드와 서버 오류를 다른 마커로, 둘 다 없으면 빈 배열', () => {
    expect(blockHistoryRows({ episodes: [], unclassified429: 0, serverErrors: { count: 0, lastAt: null, byStatus: {} } })).toEqual([]);
    const b = blocks('2026-10-04T12:00:00.000Z');
    b.serverErrors = { count: 2, lastAt: '2026-10-01T00:00:00Z', byStatus: { 529: 2 } };
    const rows = blockHistoryRows(b);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('status-marker danger');
    expect(rows[1]).toContain('status-marker muted');
  });

  it('PR 비용 — 공유 세션 PR에만 공유 마커, repo 이름은 escape', () => {
    const rows = prCostRows([
      { prRepository: 'o/<r>', prNumber: 1, prUrl: 'u', costUsd: 2, totalTokens: 1, sessionCount: 1, sharedSessionCount: 1, firstLinkedAt: '2026-10-01T00:00:00Z', hasUnpricedRecords: false },
      { prRepository: 'o/r', prNumber: 2, prUrl: 'u', costUsd: 1, totalTokens: 1, sessionCount: 1, sharedSessionCount: 0, firstLinkedAt: '2026-10-01T00:00:00Z', hasUnpricedRecords: false },
    ]);
    expect(rows[0]).toContain('status-marker warn');
    expect(rows[0]).toContain('o/&lt;r&gt;#1');
    expect(rows[1]).not.toContain('status-marker');
  });

  it('effort — 미상 버킷은 비용 0이어도 토큰이 있으면 남는다, 둘 다 없으면 빈 배열', () => {
    expect(effortRows([], { costUsd: 0, totalTokens: 0, share: 0, hasUnpricedRecords: false })).toEqual([]);
    const rows = effortRows([], { costUsd: 0, totalTokens: 10, share: 0, hasUnpricedRecords: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('skill-row-other');
  });

  it('턴/훅 — 턴 0이면 빈 문자열, 훅 비율 마커 톤은 5%·15% 경계', () => {
    const base: TurnHookStats = {
      turnCount: 1, totalTurnMs: 100_000, medianMs: 100_000, p90Ms: 100_000, maxMs: 100_000,
      daily: [{ date: '2026-10-06', count: 1, medianMs: 100_000 }],
      hooks: [{ name: 'a.js', totalMs: 1000, count: 1, avgMs: 1000 }],
      hookTotalMs: 1000, avgHookMsPerTurn: 1000, hookShare: 0.01, hookErrorCount: 0,
    };
    expect(turnHooksHtml({ ...base, turnCount: 0 })).toBe('');
    expect(turnHooksHtml(base)).toContain('status-marker ok');
    expect(turnHooksHtml({ ...base, hookShare: 0.06 })).toContain('status-marker warn');
    expect(turnHooksHtml({ ...base, hookShare: 0.2 })).toContain('status-marker danger');
  });

  it('Codex 서브에이전트 행 — 0개면 빈 문자열, 미가격이면 비용 대신 미상', () => {
    expect(codexSubagentRowHtml({ mainCostUsd: 0, subagentCostUsd: 0, subagentShare: 0, subagentCount: 0, mainHasUnpriced: false, subagentHasUnpriced: false })).toBe('');
    const html = codexSubagentRowHtml({ mainCostUsd: 0, subagentCostUsd: 0, subagentShare: 0, subagentCount: 1, mainHasUnpriced: true, subagentHasUnpriced: true });
    expect(html).not.toContain('$0');
  });

  it.each([[400, '0.4s'], [31_000, '31s'], [91_487, '1m 31s'], [7_500_000, '2h 5m']])('fmtDuration(%d) = %s', (ms, want) => {
    expect(fmtDuration(ms)).toBe(want);
  });
});

describe('v0.2.6 신호 섹션 배치 불변식', () => {
  const panelSrc = fs.readFileSync(path.join(process.cwd(), 'src/webview/panelView.ts'), 'utf-8');

  it('신규 섹션 3개는 카드가 아니라 panel-flush다(카드 수 불변식 유지)', () => {
    for (const id of ['panel-block-card', 'panel-turn-card', 'panel-pr-card']) {
      const line = panelSrc.split('\n').find(l => l.includes(`id="${id}"`))!;
      expect(line, id).toContain('panel-flush');
      expect(line, id).not.toMatch(/class="card /);
    }
  });

  it('신규 i18n 키는 4개 언어를 모두 가진다', () => {
    const i18n = fs.readFileSync(path.join(process.cwd(), 'src/webview/i18n.ts'), 'utf-8');
    const block = i18n.slice(i18n.indexOf('// v0.2.6 신호'));
    const keys = [...block.matchAll(/^\s+([a-z0-9_]+): \{ ko: '([^']*)', en: '([^']*)', ja: '([^']*)', zh: '([^']*)' \},$/gm)];
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) for (const v of k.slice(2)) expect(v.length, k[1]).toBeGreaterThan(0);
  });
});
