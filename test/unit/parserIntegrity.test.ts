import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JsonlParser } from '../../src/services/JsonlParser';
import { resolvePricing, calcCost } from '../../src/utils/pricing';
import { detectPriceDrift } from '../../src/utils/vendorCostCheck';
import type { VendorCostSnapshot } from '../../src/types';

// v0.2.5 /ship 사전 보안검토 지적 3건 — 비용 정확성(§3#1 급)이라 같은 릴리스에서 재현 후 수정한다.

describe('W2 — 증분 파싱이 쓰는 중인 마지막 줄을 영구히 잃지 않는다', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'partial-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const line = (id: string) => JSON.stringify({
    type: 'assistant', sessionId: 's1', requestId: 'req-' + id, timestamp: '2026-09-29T00:00:00.000Z',
    message: { id: 'msg-' + id, model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 5 } },
  });

  it('줄 중간까지만 기록된 상태에서 읽혀도, 나머지가 붙으면 그 레코드를 읽는다', async () => {
    const file = path.join(dir, 's1.jsonl');
    const second = line('b');
    const cut = Math.floor(second.length / 2);
    fs.writeFileSync(file, line('a') + '\n' + second.slice(0, cut));
    const p = new JsonlParser();
    expect((await p.parseFile(file)).map(r => r.messageId)).toEqual(['msg-a']);
    fs.appendFileSync(file, second.slice(cut) + '\n');
    expect((await p.parseFile(file)).map(r => r.messageId).sort()).toEqual(['msg-a', 'msg-b']);
  });

  it('멀티바이트 문자가 청크·절단 경계에 걸려도 깨지지 않는다', async () => {
    const file = path.join(dir, 's2.jsonl');
    const withKo = JSON.stringify({
      type: 'assistant', sessionId: 's1', requestId: 'req-k', timestamp: '2026-09-29T00:00:00.000Z', cwd: '/작업/한글경로',
      message: { id: 'msg-k', model: 'claude-sonnet-5', usage: { input_tokens: 1, output_tokens: 1 } },
    });
    const bytes = Buffer.from(withKo + '\n', 'utf8');
    const cut = bytes.indexOf(Buffer.from('한', 'utf8')) + 1; // 멀티바이트 한가운데서 자른다
    fs.writeFileSync(file, bytes.subarray(0, cut));
    const p = new JsonlParser();
    expect(await p.parseFile(file)).toEqual([]);
    fs.appendFileSync(file, bytes.subarray(cut));
    const recs = await p.parseFile(file);
    expect(recs.map(r => r.cwd)).toEqual(['/작업/한글경로']);
  });
});

describe('W1 — 가격표 조회가 Object.prototype 상속 키에 걸리지 않는다', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('모델명 "%s"는 가격 미상(none), 비용 NaN 아님', (m) => {
    expect(resolvePricing(m).source).toBe('none');
    const c = calcCost(m, {
      input_tokens: 10, output_tokens: 10,
      cache_creation_5m_input_tokens: 0, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0,
    });
    expect(Number.isFinite(c)).toBe(true);
  });
});

describe('I3 — 비정상 토큰 값의 cost-state 스냅샷은 가격 불일치로 판정하지 않는다', () => {
  const snap = (p: Partial<VendorCostSnapshot>): VendorCostSnapshot => ({
    model: 'claude-sonnet-5', inputTokens: 100_000, outputTokens: 10_000, cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 5, ...p,
  });
  it.each([
    ['NaN input', { inputTokens: NaN }],
    ['Infinity output', { outputTokens: Infinity }],
    ['NaN cache read', { cacheReadInputTokens: NaN }],
  ])('%s → 드리프트 없음', (_, p) => {
    expect(detectPriceDrift([snap(p as Partial<VendorCostSnapshot>)])).toEqual([]);
  });
});
