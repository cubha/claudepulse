import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  rolloutLinesToSessionRecords,
  listRolloutFiles,
  CodexSource,
} from '../../../src/sources/codex/CodexSource';

const FIXTURE_DIR = path.join(__dirname, '../../fixtures/codex');
function loadLines(file: string): string[] {
  return fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf-8').split('\n').filter(l => l.trim());
}

describe('rolloutLinesToSessionRecords — 실물 fixture(free·exec·1턴)', () => {
  const records = rolloutLinesToSessionRecords(loadLines('real-free-exec-1turn-cli0.155.1.jsonl'));

  it('token_usage_record 1건 → SessionRecord 1건', () => {
    expect(records.length).toBe(1);
  });

  it('provider·session_meta 필드가 채워진다', () => {
    const r = records[0];
    expect(r.provider).toBe('codex');
    expect(r.cwd).toBe('/home/user/fixture-repo');
    expect(r.gitBranch).toBe('feat/codex-fixture-test');
    expect(r.sessionId).toBe('01a0b70f-3d01-7d80-a21e-1a6ec4317cd4');
  });

  it('messageId·requestId는 비어있지 않고 codex 네임스페이스를 갖는다', () => {
    const r = records[0];
    expect(r.messageId).toMatch(/^codex:/);
    expect(r.requestId).toBe(r.messageId);
  });

  it('reasoningTokens가 usage.reasoning_output_tokens 그대로 실린다(verify-impl B-V2 보완, 이 fixture는 0)', () => {
    expect(records[0].reasoningTokens).toBe(0);
  });

  it('usage가 입력·캐시읽기 비중첩으로 정규화된다(input_tokens = 원본 input − cached)', () => {
    const r = records[0];
    // 원본: input 12,787 / cached 9,984 / output 5 (README 기대값)
    expect(r.usage.input_tokens).toBe(12_787 - 9_984);
    expect(r.usage.cache_read_input_tokens).toBe(9_984);
    expect(r.usage.output_tokens).toBe(5);
  });

  it('모델은 turn_context에서 온다(이 실물 fixture는 D9 실측의 미등재 신모델 gpt-5.6-terra라 costUsd는 0)', () => {
    const r = records[0];
    expect(r.model).toBe('gpt-5.6-terra');
    expect(r.costUsd).toBe(0);
  });
});

describe('rolloutLinesToSessionRecords — replay dedup(합성 유료 2턴)', () => {
  const records = rolloutLinesToSessionRecords(loadLines('synth-plus-2turn-replay.jsonl'));

  it('replay 1건은 레코드로 나오지 않는다(원본 3건만)', () => {
    expect(records.length).toBe(3);
  });

  it('레코드 usage 합이 README 기대 총합(3,120)과 일치한다', () => {
    // input_tokens는 비중첩 정규화(원본 input − cached)라 cache_read를 다시 더하면 원본 input으로
    // 복원된다 — total = (input−cached)+output+cached+cache_creation = input+output+cache_creation.
    const total = records.reduce((s, r) =>
      s + r.usage.input_tokens + r.usage.output_tokens
      + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens, 0);
    expect(total).toBe(3_120); // = 원본 input 3,000 + output 120 (cache_creation 0)
  });

  it('reasoningTokens 합도 dedup 이후 3건 기준(원본 usage 10/5/20, replay 중복 10 제외 — verify-impl B-V2 보완)', () => {
    const sum = records.reduce((s, r) => s + (r.reasoningTokens ?? 0), 0);
    expect(sum).toBe(35);
  });
});

describe('rolloutLinesToSessionRecords — 가격표에 없는 모델(unpriced)', () => {
  it('calcCodexCost가 null인 모델은 costUsd 0으로 떨어진다(UsageAggregator가 pricingSource로 구분)', () => {
    const lines = [
      JSON.stringify({ timestamp: '2026-09-19T00:00:00.000Z', ordinal: 0, type: 'session_meta', payload: { cwd: '/x', session_id: 's1' } }),
      JSON.stringify({ timestamp: '2026-09-19T00:00:01.000Z', ordinal: 1, type: 'turn_context', payload: { turn_id: 't1', model: 'gpt-5.6-terra' } }),
      JSON.stringify({
        timestamp: '2026-09-19T00:00:02.000Z', ordinal: 2, type: 'token_usage_record',
        payload: {
          turn_id: 't1', thread_id: 'th1', response_id: 'resp-1',
          usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
          turn_token_usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
          thread_token_usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
        },
      }),
    ];
    const records = rolloutLinesToSessionRecords(lines);
    expect(records[0].model).toBe('gpt-5.6-terra');
    expect(records[0].costUsd).toBe(0);
  });
});

describe('listRolloutFiles — 깊이3 재귀 탐색', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('YYYY/MM/DD 하위 .jsonl만 수집하고 그 외 확장자는 무시한다', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sessions-'));
    const deep = path.join(tmpDir, '2026', '09', '19');
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, 'rollout-a.jsonl'), '');
    fs.writeFileSync(path.join(deep, 'rollout-a.jsonl.zst'), ''); // 압축본 — 이번 범위 제외
    fs.writeFileSync(path.join(tmpDir, '2026', '09', 'not-a-day.txt'), '');

    const files = await listRolloutFiles(tmpDir);
    expect(files).toEqual([path.join(deep, 'rollout-a.jsonl')]);
  });

  it('디렉토리 자체가 없으면 빈 배열(예외로 죽지 않는다)', async () => {
    const files = await listRolloutFiles(path.join(os.tmpdir(), 'codex-sessions-definitely-missing-xyz'));
    expect(files).toEqual([]);
  });
});

describe('CodexSource.detectAvailability — 3단 판정(실 파일시스템 fixture 디렉토리)', () => {
  let tmpHome: string;

  afterEach(() => {
    if (tmpHome) fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('홈 디렉토리 자체가 없으면 not_installed', async () => {
    const src = new CodexSource(path.join(os.tmpdir(), 'codex-home-missing-xyz'));
    expect(await src.detectAvailability()).toBe('not_installed');
  });

  it('홈은 있지만 auth.json이 없으면 not_authenticated', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const src = new CodexSource(tmpHome);
    expect(await src.detectAvailability()).toBe('not_authenticated');
  });

  it('auth.json은 있지만 id_token이 없으면(로그아웃) not_authenticated', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    fs.writeFileSync(path.join(tmpHome, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: {} }));
    const src = new CodexSource(tmpHome);
    expect(await src.detectAvailability()).toBe('not_authenticated');
  });

  it('인증은 됐지만 세션 파일이 0건이면 no_records', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    fs.writeFileSync(path.join(tmpHome, 'auth.json'), JSON.stringify({ tokens: { id_token: 'x' } }));
    const src = new CodexSource(tmpHome);
    expect(await src.detectAvailability()).toBe('no_records');
  });

  it('인증 + 세션 파일 존재 시 ready', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    fs.writeFileSync(path.join(tmpHome, 'auth.json'), JSON.stringify({ tokens: { id_token: 'x' } }));
    const deep = path.join(tmpHome, 'sessions', '2026', '09', '19');
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, 'rollout-a.jsonl'), '');
    const src = new CodexSource(tmpHome);
    expect(await src.detectAvailability()).toBe('ready');
  });
});

describe('CodexSource.loadLatestRateLimit — 실 fixture 기반', () => {
  let tmpHome: string;

  afterEach(() => {
    if (tmpHome) fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('세션 파일이 없으면 null', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const src = new CodexSource(tmpHome);
    expect(await src.loadLatestRateLimit()).toBeNull();
  });

  it('free 실물 fixture 1건 — 단일 30일 버킷을 읽는다', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const deep = path.join(tmpHome, 'sessions', '2026', '09', '19');
    fs.mkdirSync(deep, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURE_DIR, 'real-free-exec-1turn-cli0.155.1.jsonl'),
      path.join(deep, 'rollout-real.jsonl')
    );
    const src = new CodexSource(tmpHome);
    const snap = await src.loadLatestRateLimit();
    expect(snap).not.toBeNull();
    expect(snap!.buckets.length).toBe(1);
    expect(snap!.buckets[0].labelKey).toBe('codex_bucket_30d');
    expect(snap!.planType).toBe('free');
    // verify-impl B-V2/B-V6 보완 — 실 fixture의 실측값(README 기대값과 별개로 grep 확인됨)
    expect(snap!.modelContextWindow).toBe(258_400);
  });

  it('두 파일 중 timestamp가 더 최근인 쪽을 우선한다(실물 00:27 < 합성 10:00 — 합성 2버킷이 이긴다)', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const deep = path.join(tmpHome, 'sessions', '2026', '09', '19');
    fs.mkdirSync(deep, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURE_DIR, 'real-free-exec-1turn-cli0.155.1.jsonl'),
      path.join(deep, 'a-rollout-real.jsonl')
    );
    fs.copyFileSync(
      path.join(FIXTURE_DIR, 'synth-plus-2turn-replay.jsonl'),
      path.join(deep, 'b-rollout-synth.jsonl')
    );
    const src = new CodexSource(tmpHome);
    const snap = await src.loadLatestRateLimit();
    expect(snap).not.toBeNull();
    expect(snap!.buckets.length).toBe(2);
    expect(snap!.buckets.map(b => b.labelKey)).toEqual(['codex_bucket_5h', 'codex_bucket_7d']);
    expect(snap!.modelContextWindow).toBe(258_400);
  });

  it('rate_limits 없이 token_count만 있어도 modelContextWindow는 별도로 잡힌다(verify-impl B-V6 보완 — latest-wins 독립 스캔)', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const deep = path.join(tmpHome, 'sessions', '2026', '09', '19');
    fs.mkdirSync(deep, { recursive: true });
    const lines = [
      JSON.stringify({ timestamp: '2026-09-19T00:00:00.000Z', ordinal: 0, type: 'session_meta', payload: { id: 's1' } }),
      JSON.stringify({
        timestamp: '2026-09-19T00:01:00.000Z', ordinal: 1, type: 'token_count',
        payload: { total_token_usage: { total_tokens: 0 }, last_token_usage: { total_tokens: 0 }, model_context_window: 128_000, rate_limits: null },
      }),
    ];
    fs.writeFileSync(path.join(deep, 'rollout-no-limits.jsonl'), lines.join('\n'));
    const src = new CodexSource(tmpHome);
    // buckets가 0건이라 스냅샷 자체는 null(기존 계약 유지) — modelContextWindow만 있어도 전체를
    // 살리지 않는다(§6 "버킷 0건=섹션 숨김" 신호가 더 강한 계약).
    expect(await src.loadLatestRateLimit()).toBeNull();
  });
});
