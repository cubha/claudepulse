import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  parseRolloutLines,
  accumulateTokenUsage,
  extractRateLimitBuckets,
  extractGitInfo,
} from '../../../src/sources/codex/codexRollout';

const FIXTURE_DIR = path.join(__dirname, '../../fixtures/codex');
function loadLines(file: string): string[] {
  return fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf-8').split('\n').filter(l => l.trim());
}

describe('parseRolloutLines — 실물 fixture (free·exec·1턴·cli 0.155.1)', () => {
  const lines = loadLines('real-free-exec-1turn-cli0.155.1.jsonl');
  const parsed = parseRolloutLines(lines);

  it('15줄 전부 파싱된다', () => {
    expect(parsed.length).toBe(15);
  });

  it('각 라인은 top-level timestamp·ordinal을 보존한다(CodexSource가 SessionRecord.timestamp/합성키 ordinal로 소비)', () => {
    expect(parsed[0].timestamp).toBe('2026-09-19T00:27:04.435Z');
    expect(parsed[0].ordinal).toBe(0);
    expect(parsed[1].ordinal).toBe(1);
  });

  it('session_meta에서 git·cwd를 뽑는다(origin 없어 repository_url 키 자체 부재)', () => {
    const meta = parsed.find(p => p.type === 'session_meta');
    expect(meta).toBeDefined();
    if (meta?.type !== 'session_meta') throw new Error('unreachable');
    expect(meta.cwd).toBe('/home/user/fixture-repo');
    expect(meta.git?.branch).toBe('feat/codex-fixture-test');
    expect(meta.git?.repositoryUrl).toBeUndefined();
  });

  it('token_usage_record 1건의 usage를 실측값 그대로 읽는다', () => {
    const records = parsed.filter(p => p.type === 'token_usage_record');
    expect(records.length).toBe(1);
    if (records[0].type !== 'token_usage_record') throw new Error('unreachable');
    expect(records[0].usage.totalTokens).toBe(12792);
    expect(records[0].usage.cachedInputTokens).toBe(9984);
  });

  it('token_count의 rate_limits를 읽는다(free 플랜 — 30일 단일 버킷)', () => {
    const counts = parsed.filter(p => p.type === 'token_count');
    expect(counts.length).toBe(1);
    if (counts[0].type !== 'token_count') throw new Error('unreachable');
    expect(counts[0].rateLimits?.primary?.windowMinutes).toBe(43200);
    expect(counts[0].rateLimits?.secondary).toBeNull();
    expect(counts[0].rateLimits?.planType).toBe('free');
  });
});

describe('accumulateTokenUsage — usage 합 == 마지막 thread_token_usage (왕복 검산)', () => {
  it('실물: 단일 레코드라 usage == thread', () => {
    const lines = loadLines('real-free-exec-1turn-cli0.155.1.jsonl');
    const parsed = parseRolloutLines(lines);
    const result = accumulateTokenUsage(parsed);
    expect(result.totalTokens.totalTokens).toBe(12792);
  });

  it('합성(유료 2턴): usage 합이 README 기대값(total 3,120)과 일치한다', () => {
    const lines = loadLines('synth-plus-2turn-replay.jsonl');
    const parsed = parseRolloutLines(lines);
    const result = accumulateTokenUsage(parsed);
    expect(result.totalTokens.totalTokens).toBe(3120);
    expect(result.totalTokens.inputTokens).toBe(3000);
    expect(result.totalTokens.cachedInputTokens).toBe(1500);
    expect(result.totalTokens.outputTokens).toBe(120);
    expect(result.totalTokens.reasoningOutputTokens).toBe(35);
  });

  it('replay 중복(같은 누적쌍)을 skip한다 — 합산하면 4,370이 되어 틀린다', () => {
    const lines = loadLines('synth-plus-2turn-replay.jsonl');
    const parsed = parseRolloutLines(lines);
    const result = accumulateTokenUsage(parsed);
    // 원본 레코드 3건 + replay 1건 = 4건이 파일에 있지만, 유효 사용량은 3건분이어야 한다
    expect(result.recordsCounted).toBe(3);
    expect(result.recordsSkippedAsReplay).toBe(1);
  });

  it('비인접 replay(서브에이전트 91× 인플레의 실제 형태)도 skip한다', () => {
    // 실측 원인: thread_spawn 서브에이전트 rollout이 부모 이력 전체를 재타임스탬프해 블록으로
    // replay한다 — 중복이 직전 레코드가 아니라 "블록 앞부분"에 몰릴 수 있다. 직전 레코드만
    // 비교하면(lastThread 1개) 이 블록의 첫 replay가 그 시점의 lastThread(더 큰 누적값)와 달라
    // "감소=compaction reset"으로 오판되어 전량 count 될 위험이 있다.
    let ordinalSeq = 0;
    const mk = (turnId: string, responseId: string, u: { i: number; o: number }, cum: { i: number; o: number }) => ({
      type: 'token_usage_record' as const,
      timestamp: `2026-09-19T00:00:${String(ordinalSeq).padStart(2, '0')}.000Z`,
      ordinal: ordinalSeq++,
      turnId, threadId: 'thread-1', responseId,
      usage: { inputTokens: u.i, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: u.o, reasoningOutputTokens: 0, totalTokens: u.i + u.o },
      turnTokenUsage: { inputTokens: u.i, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: u.o, reasoningOutputTokens: 0, totalTokens: u.i + u.o },
      threadTokenUsage: { inputTokens: cum.i, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: cum.o, reasoningOutputTokens: 0, totalTokens: cum.i + cum.o },
    });
    const original = [
      mk('t1', 'resp-1', { i: 100, o: 10 }, { i: 100, o: 10 }),
      mk('t1', 'resp-2', { i: 200, o: 20 }, { i: 300, o: 30 }),
    ];
    const newWork = [mk('t2', 'resp-3', { i: 50, o: 5 }, { i: 350, o: 35 })];
    // 부모 이력(resp-1,resp-2)이 새 작업 뒤에 "블록"으로 재생됨 — 직전 레코드는 resp-3(누적 350+35)
    const replayBlock = [
      mk('t1', 'resp-1', { i: 100, o: 10 }, { i: 100, o: 10 }),
      mk('t1', 'resp-2', { i: 200, o: 20 }, { i: 300, o: 30 }),
    ];
    const lines = [...original, ...newWork, ...replayBlock];
    const result = accumulateTokenUsage(lines);
    // 정답: 원본 3건분(350+35=385)만 카운트, replay 2건은 전부 skip
    expect(result.totalTokens.totalTokens).toBe(385);
    expect(result.recordsCounted).toBe(3);
    expect(result.recordsSkippedAsReplay).toBe(2);
  });

  it('턴 내 turn_token_usage/thread_token_usage 누적 필드를 합산하지 않는다(과대계산 방지)', () => {
    // usage만 합산한 값과 마지막 thread_token_usage가 같아야 한다 — 다르면 잘못 합산한 것
    const lines = loadLines('synth-plus-2turn-replay.jsonl');
    const parsed = parseRolloutLines(lines);
    const result = accumulateTokenUsage(parsed);
    const records = parsed.filter(p => p.type === 'token_usage_record');
    const last = records[records.length - 1];
    if (last.type !== 'token_usage_record') throw new Error('unreachable');
    expect(result.totalTokens.totalTokens).toBe(last.threadTokenUsage.totalTokens);
  });

  it('구버전(token_count만): total 1,245로 폴백 집계된다', () => {
    const lines = loadLines('synth-legacy-tokencount-only.jsonl');
    const parsed = parseRolloutLines(lines);
    const result = accumulateTokenUsage(parsed);
    expect(result.totalTokens.totalTokens).toBe(1245);
    expect(result.usedFallback).toBe(true);
  });

  it('두 경로가 공존해도(실물 fixture) token_usage_record만 쓰고 token_count는 합산하지 않는다', () => {
    const lines = loadLines('real-free-exec-1turn-cli0.155.1.jsonl');
    const parsed = parseRolloutLines(lines);
    const result = accumulateTokenUsage(parsed);
    // 합산했다면 12792*2=25584이 될 것 — 그러면 안 된다
    expect(result.totalTokens.totalTokens).toBe(12792);
    expect(result.usedFallback).toBe(false);
  });
});

describe('extractRateLimitBuckets — window_minutes로 버킷 생성(버킷 개수·라벨 가변)', () => {
  it('free: primary(30일) 1개, secondary 없음', () => {
    const lines = loadLines('real-free-exec-1turn-cli0.155.1.jsonl');
    const parsed = parseRolloutLines(lines);
    const counts = parsed.filter(p => p.type === 'token_count');
    if (counts[0].type !== 'token_count') throw new Error('unreachable');
    const buckets = extractRateLimitBuckets(counts[0].rateLimits);
    expect(buckets.length).toBe(1);
    expect(buckets[0].windowMinutes).toBe(43200);
    expect(buckets[0].labelKey).toBe('codex_bucket_30d');
  });

  it('유료: primary(5h) + secondary(주간) 2개', () => {
    const lines = loadLines('synth-plus-2turn-replay.jsonl');
    const parsed = parseRolloutLines(lines);
    const counts = parsed.filter(p => p.type === 'token_count');
    if (counts[0].type !== 'token_count') throw new Error('unreachable');
    const buckets = extractRateLimitBuckets(counts[0].rateLimits);
    expect(buckets.length).toBe(2);
    expect(buckets[0].labelKey).toBe('codex_bucket_5h');
    expect(buckets[1].labelKey).toBe('codex_bucket_7d');
  });

  it('rate_limits가 null이면 빈 배열(게이지 섹션 자체를 숨기는 신호)', () => {
    const buckets = extractRateLimitBuckets(null);
    expect(buckets).toEqual([]);
  });

  it('미지의 window_minutes는 원시 분을 라벨로 노출한다(하드코딩 3종 밖 폴백)', () => {
    const buckets = extractRateLimitBuckets({
      limitId: 'codex', limitName: null,
      primary: { usedPercent: 10, windowMinutes: 1440, resetsAt: 0 },
      secondary: null, planType: 'unknown-future-plan',
    });
    expect(buckets[0].labelKey).toBeNull();
    expect(buckets[0].windowMinutes).toBe(1440);
  });
});

describe('extractGitInfo — Option 필드 개별 부재(D5)', () => {
  it('실물: branch 있음, repositoryUrl 없음(origin 미설정)', () => {
    const info = extractGitInfo({ commit_hash: 'abc123', branch: 'main' });
    expect(info?.branch).toBe('main');
    expect(info?.repositoryUrl).toBeUndefined();
  });

  it('detached HEAD 모사: commit_hash만 있고 branch 없음 — 미귀속 아닌 commit 기반 폴백 가능해야 함', () => {
    const info = extractGitInfo({ commit_hash: 'abc123' });
    expect(info?.commitHash).toBe('abc123');
    expect(info?.branch).toBeUndefined();
  });

  it('git 필드 자체가 없으면(non-git) null', () => {
    expect(extractGitInfo(undefined)).toBeNull();
  });
});
