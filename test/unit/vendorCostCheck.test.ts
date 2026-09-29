import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectPriceDrift } from '../../src/utils/vendorCostCheck';
import { JsonlParser } from '../../src/services/JsonlParser';
import type { VendorCostSnapshot } from '../../src/types';
import oracle from '../fixtures/vendor-cost-oracle.json';

/**
 * v0.2.5 D-C — 가격표 드리프트를 런타임에 잡는다. D-A(fable-5-1이 fable-5 단가로 과대계상)는
 * 키가 있어서(최장접두사) `unpricedModels`에 안 걸렸고 화면은 정상으로 보였다. 벤더 cost-state의
 * 토큰↔비용이 우리 밴드 [전량 5m, 전량 1h] 밖이면 가격표가 틀린 것이다(오라클 테스트와 같은 판정).
 */
function snap(p: Partial<VendorCostSnapshot>): VendorCostSnapshot {
  return {
    model: 'claude-haiku-4-5-20251001', inputTokens: 100_000, outputTokens: 20_000,
    cacheReadInputTokens: 0, cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0.2,
    ...p,
  };
}

describe('detectPriceDrift', () => {
  it('벤더 오라클 픽스처 전체(현행 가격표)에서는 드리프트 0 — 오탐 없음', () => {
    const samples = (oracle.samples as Array<Record<string, unknown>>).map(s => snap({
      model: s.model as string,
      inputTokens: s.inputTokens as number, outputTokens: s.outputTokens as number,
      cacheReadInputTokens: s.cacheReadInputTokens as number,
      cacheCreationInputTokens: s.cacheCreationInputTokens as number,
      webSearchRequests: s.webSearchRequests as number, costUSD: s.vendorCostUSD as number,
    }));
    expect(samples.length).toBeGreaterThan(40);
    expect(detectPriceDrift(samples)).toEqual([]);
  });

  it('haiku $1/$5: 100k in + 20k out = $0.20 → 벤더가 $0.30이면 드리프트', () => {
    const d = detectPriceDrift([snap({ costUSD: 0.3 })]);
    expect(d.map(x => x.model)).toEqual(['claude-haiku-4-5-20251001']);
    expect(d[0].expectedLoUsd).toBeCloseTo(0.2, 6);
    expect(d[0].vendorUsd).toBeCloseTo(0.3, 6);
  });

  it('밴드 아래(가격표가 비싸다 — D-A 방향)도 드리프트', () => {
    expect(detectPriceDrift([snap({ costUSD: 0.1 })])).toHaveLength(1);
  });

  it('반올림 수준 차이(2% 이내)는 무시한다', () => {
    expect(detectPriceDrift([snap({ costUSD: 0.203 })])).toEqual([]);
  });

  it('금액이 작은 스냅샷($0.05 미만)은 판정하지 않는다 — 초기 스냅샷 노이즈', () => {
    expect(detectPriceDrift([snap({ inputTokens: 1000, outputTokens: 100, costUSD: 0.04 })])).toEqual([]);
  });

  it('가격표에 없는 모델은 건너뛴다 (unpricedModels가 따로 말한다)', () => {
    expect(detectPriceDrift([snap({ model: 'claude-mystery-9', costUSD: 5 })])).toEqual([]);
  });

  it('같은 모델의 여러 스냅샷은 1건으로 모이고, 모델명 순으로 정렬된다', () => {
    const d = detectPriceDrift([
      snap({ costUSD: 0.3 }), snap({ costUSD: 0.4 }),
      snap({ model: 'claude-fable-5-1', inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 10_000_000, costUSD: 10 }),
    ]);
    expect(d.map(x => x.model)).toEqual(['claude-fable-5-1', 'claude-haiku-4-5-20251001']);
  });
});

describe('JsonlParser — cost-state 스냅샷 보관', () => {
  let dir: string;
  let file: string;
  const costLine = (costUSD: number) => JSON.stringify({
    type: 'cost-state', sessionId: 's1', totalCostUSD: costUSD,
    modelUsage: { 'claude-sonnet-5': { inputTokens: 10, outputTokens: 20, thinkingTokens: 0, cacheReadInputTokens: 30, cacheCreationInputTokens: 40, webSearchRequests: 1, costUSD } },
  });
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coststate-'));
    file = path.join(dir, 's1.jsonl');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('파일의 **마지막** cost-state 행만 남긴다 (세션 도중 스냅샷이 누적 갱신된다)', async () => {
    fs.writeFileSync(file, costLine(1) + '\n' + costLine(2) + '\n');
    const p = new JsonlParser();
    await p.parseFile(file);
    expect(p.getCostSnapshots(file)).toEqual([{
      model: 'claude-sonnet-5', inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 30,
      cacheCreationInputTokens: 40, webSearchRequests: 1, costUSD: 2,
    }]);
  });

  it('증분 파싱: 새 cost-state가 붙으면 교체, 없으면 이전 스냅샷 유지', async () => {
    fs.writeFileSync(file, costLine(1) + '\n');
    const p = new JsonlParser();
    await p.parseFile(file);
    fs.appendFileSync(file, JSON.stringify({ type: 'user', message: {} }) + '\n');
    await p.parseFile(file);
    expect(p.getCostSnapshots(file)[0].costUSD).toBe(1);
    fs.appendFileSync(file, costLine(3) + '\n');
    await p.parseFile(file);
    expect(p.getCostSnapshots(file)[0].costUSD).toBe(3);
  });
});

describe('배선 — refresh가 드리프트를 요약에 싣고, 대시보드가 마커로 보인다', () => {
  const ext = fs.readFileSync(path.join(process.cwd(), 'src/extension.ts'), 'utf-8');
  const panel = fs.readFileSync(path.join(process.cwd(), 'src/webview/panelView.ts'), 'utf-8');
  const i18n = fs.readFileSync(path.join(process.cwd(), 'src/webview/i18n.ts'), 'utf-8');

  it('extension이 파일별 cost-state 스냅샷으로 detectPriceDrift를 돌려 priceDriftModels를 채운다', () => {
    expect(ext).toMatch(/priceDriftModels\s*=\s*detectPriceDrift\(/);
    expect(ext).toContain('getCostSnapshots(');
  });

  it('대시보드 모델별 분석이 price_mismatch 경고 마커(툴팁에 설명)를 렌더한다', () => {
    const line = panel.split('\n').find(l => l.includes("t('price_mismatch')"));
    expect(line, 'price_mismatch 마커 줄').toBeDefined();
    expect(line).toContain('statusMarkerHtml');
    expect(line).toMatch(/tone:\s*'warn'/);
    expect(line).toContain("t('price_mismatch_note')");
  });

  it('i18n: price_mismatch · price_mismatch_note가 4개 언어로 있다', () => {
    for (const key of ['price_mismatch', 'price_mismatch_note']) {
      const m = i18n.match(new RegExp(`^\\s+${key}:\\s*\\{([\\s\\S]*?)\\}`, 'm'));
      expect(m, key).not.toBeNull();
      for (const lang of ['ko', 'en', 'ja', 'zh']) expect(m![1], `${key}.${lang}`).toMatch(new RegExp(`${lang}:\\s*'[^']+'`));
    }
  });
});
