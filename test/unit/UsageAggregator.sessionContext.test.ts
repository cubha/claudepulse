import { describe, it, expect } from 'vitest';
import { UsageAggregator } from '../../src/services/UsageAggregator';
import { emptyToolCounts } from '../../src/services/JsonlParser';
import type { SessionRecord } from '../../src/types';

function rec(p: Partial<SessionRecord> & { costUsd: number }): SessionRecord {
  return {
    messageId: Math.random().toString(36),
    requestId: Math.random().toString(36),
    sessionId: 's1',
    model: 'claude-opus-4-8',
    timestamp: '2026-06-12T10:00:00.000Z',
    cwd: '/tmp',
    gitBranch: 'main',
    usage: {
      input_tokens: 100, output_tokens: 50,
      cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0,
      cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0,
    },
    toolCounts: emptyToolCounts(),
    editedFiles: [],
    isSidechain: false,
    ...p,
  };
}

describe('UsageAggregator — 세션 컨텍스트 점유율 (#④, 누적합 아닌 마지막 레코드 1건 기준)', () => {
  it('마지막(최신) 레코드 1건의 input+cache_read+cache_creation 합으로 계산 — 세션 전체 누적 아님', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({
        costUsd: 1.0,
        timestamp: '2026-06-12T10:00:00.000Z',
        usage: { input_tokens: 50_000, output_tokens: 10, cache_creation_input_tokens: 0, cache_creation_5m_input_tokens: 0, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
      rec({
        costUsd: 1.0,
        timestamp: '2026-06-12T10:05:00.000Z', // 더 최신 — 이 레코드만 반영돼야 함
        model: 'claude-opus-4-8',
        usage: { input_tokens: 30_000, output_tokens: 10, cache_creation_input_tokens: 5_000, cache_creation_5m_input_tokens: 5_000, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 20_000 },
      }),
    ]);
    // 누적합이면 80,000+55,000=135,000이 되어 잘못됨. 마지막 레코드만: 30,000+20,000+5,000=55,000
    expect(r.sessionContext).not.toBeNull();
    expect(r.sessionContext!.tokens).toBe(55_000);
    expect(r.sessionContext!.model).toBe('claude-opus-4-8');
    // claude-opus-4-8 최대 윈도 200K → 55,000/200,000 = 0.275
    expect(r.sessionContext!.ratio).toBeCloseTo(0.275, 6);
  });

  it('레코드가 없으면 null', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([]);
    expect(r.sessionContext).toBeNull();
  });

  it('cwd/repoName 필드 — repoName은 cwd의 마지막 경로 세그먼트', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, cwd: '/home/user/projects/claudepulse' }),
    ]);
    expect(r.sessionContext!.cwd).toBe('/home/user/projects/claudepulse');
    expect(r.sessionContext!.repoName).toBe('claudepulse');
  });
});

describe('UsageAggregator — sessionContext 워크스페이스 스코핑 (B, v0.1.50)', () => {
  it('workspaceRoot 미지정 시 기존 동작(cross-project, 전체 레코드 중 최신 1건) 유지', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, cwd: '/repo/a', timestamp: '2026-06-12T10:00:00.000Z' }),
      rec({ costUsd: 1.0, cwd: '/repo/b', timestamp: '2026-06-12T10:05:00.000Z' }),
    ]);
    expect(r.sessionContext!.cwd).toBe('/repo/b');
  });

  it('workspaceRoot 지정 시 그 하위 cwd 레코드만 후보 — 워크스페이스 밖의 더 최신 레코드는 무시', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, cwd: '/repo/a', timestamp: '2026-06-12T10:00:00.000Z' }),
      rec({ costUsd: 1.0, cwd: '/repo/b', timestamp: '2026-06-12T10:05:00.000Z' }), // 더 최신이지만 워크스페이스 밖
    ], '/repo/a');
    expect(r.sessionContext).not.toBeNull();
    expect(r.sessionContext!.cwd).toBe('/repo/a');
  });

  it('workspaceRoot의 하위 디렉토리 cwd도 매칭 (repo 루트가 아닌 서브디렉토리에서 기동된 세션)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, cwd: '/repo/a/src/webview', timestamp: '2026-06-12T10:00:00.000Z' }),
    ], '/repo/a');
    expect(r.sessionContext).not.toBeNull();
    expect(r.sessionContext!.cwd).toBe('/repo/a/src/webview');
  });

  it('workspaceRoot 하위에 매칭 레코드가 없으면 null — 전역 폴백 금지', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, cwd: '/repo/other', timestamp: '2026-06-12T10:00:00.000Z' }),
    ], '/repo/a');
    expect(r.sessionContext).toBeNull();
  });
});

describe('UsageAggregator — sessionContext 분모 3단 계단 (S1, 2026-08-03)', () => {
  it('①관측증명: 같은 모델의 records 중 하나라도 200K 초과 contextTokens가 있으면 1M 윈도로 확정', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      // 다른 세션(더 과거)에서 같은 모델이 200K를 넘겼다는 관측 증거
      rec({
        costUsd: 1.0, model: 'claude-sonnet-5', timestamp: '2026-08-01T00:00:00.000Z',
        contextTokens: 756_610,
      }),
      // 최신 레코드(실제 게이지에 표시될 값) — 자체는 200K 미만
      rec({
        costUsd: 1.0, model: 'claude-sonnet-5', timestamp: '2026-08-03T00:00:00.000Z',
        contextTokens: 72_492,
      }),
    ]);
    expect(r.sessionContext!.maxWindow).toBe(1_000_000);
    expect(r.sessionContext!.tokens).toBe(72_492);
    expect(r.sessionContext!.ratio).toBeCloseTo(0.072492, 5);
  });

  it('②claude.json 증거: knownOneMillionModels에 해당 모델이 있으면 관측 증거 없이도 1M 확정', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate(
      [rec({ costUsd: 1.0, model: 'claude-opus-5', contextTokens: 111_909 })],
      undefined,
      new Set(['claude-opus-5']),
    );
    expect(r.sessionContext!.maxWindow).toBe(1_000_000);
    expect(r.sessionContext!.ratio).toBeCloseTo(0.111909, 5);
  });

  it('③폴백: 관측 증거도 claude.json 증거도 없으면 기존 테이블(200K) 그대로', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, model: 'claude-opus-4-8', contextTokens: 50_000 }),
    ]);
    expect(r.sessionContext!.maxWindow).toBe(200_000);
  });

  it('200K 초과 워크스페이스는 더 이상 100% 클램프에 고정되지 않는다 — dev-note 303,186토큰 사례', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, model: 'claude-sonnet-5', contextTokens: 303_186 }),
    ]);
    // 자기 자신이 200K를 넘겼다는 사실 자체가 ①의 관측 증거
    expect(r.sessionContext!.maxWindow).toBe(1_000_000);
    expect(r.sessionContext!.ratio).toBeCloseTo(0.303186, 5);
    expect(r.sessionContext!.ratio).toBeLessThan(1);
  });
});

describe('UsageAggregator — sessionContext contextTokens 소비 (S2 배선, 2026-08-03)', () => {
  it('레코드에 contextTokens가 있으면 그 값을 쓴다 — usage 합계가 아님', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({
        costUsd: 1.0,
        contextTokens: 35_310, // iterations 마지막 message 기준(정답)
        usage: { input_tokens: 4, output_tokens: 846, cache_creation_input_tokens: 4_487, cache_creation_5m_input_tokens: 4_487, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 64_847 }, // top-level 합산(69,338) — 오답
      }),
    ]);
    expect(r.sessionContext!.tokens).toBe(35_310);
  });

  it('contextTokens 미지정(레거시 픽스처)이면 기존처럼 usage 합계로 폴백', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({
        costUsd: 1.0,
        usage: { input_tokens: 30_000, output_tokens: 10, cache_creation_input_tokens: 5_000, cache_creation_5m_input_tokens: 5_000, cache_creation_1h_input_tokens: 0, cache_read_input_tokens: 20_000 },
      }),
    ]);
    expect(r.sessionContext!.tokens).toBe(55_000);
  });
});

describe('UsageAggregator — sessionContext 정직성 강화 (S3, 2026-08-03)', () => {
  it('isSidechain=true 레코드는 후보에서 제외 — 배경 서브에이전트가 게이지를 가로채지 않는다', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, cwd: '/repo/a', timestamp: '2026-08-03T00:00:00.000Z', isSidechain: false, contextTokens: 10_000 }),
      // 더 최신이지만 사이드체인(서브에이전트) — 무시돼야 함
      rec({ costUsd: 1.0, cwd: '/repo/a', timestamp: '2026-08-03T01:00:00.000Z', isSidechain: true, contextTokens: 99_999 }),
    ]);
    expect(r.sessionContext!.tokens).toBe(10_000);
  });

  it('레코드 전부 isSidechain=true면 null(무매칭)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, isSidechain: true }),
    ]);
    expect(r.sessionContext).toBeNull();
  });

  it('SessionContextUsage에 timestamp 필드가 포함된다(경과시간 UI용)', () => {
    const agg = new UsageAggregator();
    const r = agg.aggregate([
      rec({ costUsd: 1.0, timestamp: '2026-08-03T00:00:00.000Z' }),
    ]);
    expect(r.sessionContext!.timestamp).toBe('2026-08-03T00:00:00.000Z');
  });
});
