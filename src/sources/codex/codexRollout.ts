/**
 * Codex rollout jsonl 순수 파서 (v0.2.0). DOM/파일I/O 의존 없음 — 테스트 가능한 함수만.
 *
 * 계약은 1차 소스(openai/codex `codex-rs/protocol` · `state/session.rs` · `rollout/policy.rs`)와
 * 자체 머신 실측(codex-cli 0.155.1)으로 확정했다. memory `reference_codex_integration.md` D1~D11 참조.
 *
 * 절대 규칙(틀리면 billing 파탄):
 * 1. 토큰은 `token_usage_record.usage`(응답 단위 순수 증분)만 합산한다.
 *    `turn_token_usage`/`thread_token_usage`는 턴/스레드 누적 스냅샷이라 합산 금지(3.7× 과대, D6·D7).
 * 2. `token_usage_record`가 있으면 그것만 쓴다. `token_count`는 한도(rate_limits) 읽기 전용 —
 *    `total_token_usage`는 새 턴에서 fill_to_context_window가 덮어써 리셋되므로 누적 진실원이 아니다(D8).
 *    구버전(<0.154, token_usage_record 부재)만 token_count로 폴백한다.
 * 3. dedup 키는 `response_id`가 1순위다(있으면 `id:<response_id>`) — 같은 응답의 재생(replay)은
 *    같은 response_id를 갖는다. response_id가 없는 구버전 레코드만 누적쌍(thread_token_usage)
 *    비교로 폴백한다(`cum:<turn_id>|<JSON.stringify(threadTokenUsage)>`). 타임스탬프 3중키는
 *    쓰지 않는다 — 단조증가 검사는 compaction에서 틀린다(D4, `tokenUsageRecordDedupKey` 참조).
 * 4. rate_limits 버킷은 window_minutes에서 런타임 생성한다. 5h/7d 하드코딩 금지 — free 플랜은
 *    단일 30일 버킷이고 secondary가 없다(D9, 자체 실측).
 */

export interface TokenUsageTotals {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

function zeroUsage(): TokenUsageTotals {
  return { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 };
}

function addUsage(a: TokenUsageTotals, b: TokenUsageTotals): TokenUsageTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    cacheWriteInputTokens: a.cacheWriteInputTokens + b.cacheWriteInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningOutputTokens: a.reasoningOutputTokens + b.reasoningOutputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

function parseUsage(raw: unknown): TokenUsageTotals {
  const u = (raw ?? {}) as Record<string, unknown>;
  return {
    inputTokens: Number(u['input_tokens'] ?? 0),
    cachedInputTokens: Number(u['cached_input_tokens'] ?? 0),
    cacheWriteInputTokens: Number(u['cache_write_input_tokens'] ?? 0),
    outputTokens: Number(u['output_tokens'] ?? 0),
    reasoningOutputTokens: Number(u['reasoning_output_tokens'] ?? 0),
    totalTokens: Number(u['total_tokens'] ?? 0),
  };
}

export interface RateLimitWindow {
  usedPercent: number;
  windowMinutes: number;
  resetsAt: number;
}

export interface RateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  planType: string | null;
}

export interface GitInfo {
  commitHash?: string;
  branch?: string;
  repositoryUrl?: string;
}

/** `session_meta.source`가 문자열 또는 객체(서브에이전트)일 수 있다(D10-2). */
export type RolloutSource = string | { subagent?: { threadSpawn?: { parentThreadId?: string; depth?: number } } };

/** 모든 라인 변형이 공유하는 envelope — top-level `timestamp`/`ordinal`(합성키·시계열 정렬용). */
interface LineEnvelope {
  timestamp: string;
  ordinal: number;
}

export type RolloutLine =
  | (LineEnvelope & { type: 'session_meta'; cwd?: string; git: GitInfo | null; source: RolloutSource | null; cliVersion?: string; sessionId?: string })
  | (LineEnvelope & { type: 'turn_context'; turnId: string; model?: string })
  | (LineEnvelope & {
      type: 'token_usage_record';
      turnId: string;
      threadId: string;
      responseId: string;
      usage: TokenUsageTotals;
      turnTokenUsage: TokenUsageTotals;
      threadTokenUsage: TokenUsageTotals;
    })
  | (LineEnvelope & { type: 'token_count'; totalTokenUsage: TokenUsageTotals; lastTokenUsage: TokenUsageTotals; modelContextWindow: number | null; rateLimits: RateLimitSnapshot | null })
  | (LineEnvelope & { type: 'other' });

function parseGit(raw: unknown): GitInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const info: GitInfo = {};
  if (typeof g['commit_hash'] === 'string') info.commitHash = g['commit_hash'];
  if (typeof g['branch'] === 'string') info.branch = g['branch'];
  if (typeof g['repository_url'] === 'string') info.repositoryUrl = g['repository_url'];
  return info;
}

/** 공개 export — 독립 유닛 테스트 대상(D5 detached HEAD 폴백 검증). */
export function extractGitInfo(raw: unknown): GitInfo | null {
  return parseGit(raw);
}

function parseRateLimitWindow(raw: unknown): RateLimitWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  return {
    usedPercent: Number(w['used_percent'] ?? 0),
    windowMinutes: Number(w['window_minutes'] ?? 0),
    resetsAt: Number(w['resets_at'] ?? 0),
  };
}

function parseRateLimits(raw: unknown): RateLimitSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    limitId: typeof r['limit_id'] === 'string' ? r['limit_id'] : null,
    limitName: typeof r['limit_name'] === 'string' ? r['limit_name'] : null,
    primary: parseRateLimitWindow(r['primary']),
    secondary: parseRateLimitWindow(r['secondary']),
    planType: typeof r['plan_type'] === 'string' ? r['plan_type'] : null,
  };
}

/**
 * rollout jsonl 줄 배열을 타입별 라인으로 정규화한다. 파싱 실패(JSON 오류·미지의 type)는
 * 'other'로 떨어뜨리고 죽지 않는다 — 버전 편차(#42025류)에 관대해야 한다는 계약(D6/D10-3).
 */
export function parseRolloutLines(lines: string[]): RolloutLine[] {
  const out: RolloutLine[] = [];
  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = entry['type'];
    const payload = (entry['payload'] ?? {}) as Record<string, unknown>;
    const envelope: LineEnvelope = {
      timestamp: typeof entry['timestamp'] === 'string' ? entry['timestamp'] : '',
      ordinal: typeof entry['ordinal'] === 'number' ? entry['ordinal'] : -1,
    };

    if (type === 'session_meta') {
      out.push({
        ...envelope,
        type: 'session_meta',
        cwd: typeof payload['cwd'] === 'string' ? payload['cwd'] : undefined,
        git: parseGit(payload['git']),
        source: (payload['source'] as RolloutSource | undefined) ?? null,
        cliVersion: typeof payload['cli_version'] === 'string' ? payload['cli_version'] : undefined,
        sessionId: typeof payload['session_id'] === 'string' ? payload['session_id']
          : typeof payload['id'] === 'string' ? payload['id'] : undefined,
      });
    } else if (type === 'turn_context') {
      out.push({
        ...envelope,
        type: 'turn_context',
        turnId: typeof payload['turn_id'] === 'string' ? payload['turn_id'] : '',
        model: typeof payload['model'] === 'string' ? payload['model'] : undefined,
      });
    } else if (type === 'token_usage_record') {
      out.push({
        ...envelope,
        type: 'token_usage_record',
        turnId: typeof payload['turn_id'] === 'string' ? payload['turn_id'] : '',
        threadId: typeof payload['thread_id'] === 'string' ? payload['thread_id'] : '',
        responseId: typeof payload['response_id'] === 'string' ? payload['response_id'] : '',
        usage: parseUsage(payload['usage']),
        turnTokenUsage: parseUsage(payload['turn_token_usage']),
        threadTokenUsage: parseUsage(payload['thread_token_usage']),
      });
    } else if (type === 'event_msg' && payload['type'] === 'token_count') {
      const info = (payload['info'] ?? {}) as Record<string, unknown>;
      out.push({
        ...envelope,
        type: 'token_count',
        totalTokenUsage: parseUsage(info['total_token_usage']),
        lastTokenUsage: parseUsage(info['last_token_usage']),
        modelContextWindow: typeof info['model_context_window'] === 'number' ? info['model_context_window'] : null,
        rateLimits: parseRateLimits(payload['rate_limits']),
      });
    } else {
      out.push({ ...envelope, type: 'other' });
    }
  }
  return out;
}

export interface AccumulateResult {
  totalTokens: TokenUsageTotals;
  recordsCounted: number;
  recordsSkippedAsReplay: number;
  usedFallback: boolean;
}

/**
 * `usage`만 합산한다(D7). `token_usage_record`가 하나도 없으면 구버전으로 판단해 `token_count`
 * 폴백으로 전환한다(D6) — 이때는 마지막 `total_token_usage`를 그대로 진실원으로 쓴다(구버전엔
 * fill_to_context_window 리셋 문제가 없는 단일 경로였다).
 *
 * dedup 키 = `response_id`(API 응답 단위 천연 고유키, 필드 자체가 있는 한 이게 가장 강한 신호).
 * **비인접(non-adjacent) replay를 반드시 Set으로 잡는다** — 91× 인플레의 실제 형태는
 * "직전 레코드와 다른" replay가 아니라, `thread_spawn` 서브에이전트가 부모 이력 전체를
 * **블록** 단위로 재생하는 것이다(중복이 스트림 뒤쪽에 몰릴 수 있음). 직전 값 1개만 비교하면
 * (이전 구현) 그 블록의 첫 replay가 그 시점의 마지막 누적값과 달라 "감소=compaction reset"으로
 * 오판되어 **전량 count** 되는 결함이 있었다(실측 385가 715로 과대계산).
 * `response_id`가 없는 극히 드문 경우만 누적쌍(threadTokenUsage) Set으로 폴백한다.
 */
/**
 * `token_usage_record` 1건의 dedup 키. `accumulateTokenUsage`와 `CodexSource`(SessionRecord 변환)가
 * **동일 정의**를 공유해야 한다 — 따로 만들면 한쪽만 replay를 skip해 총합은 맞는데 레코드 수는
 * 틀리는(또는 그 반대) 드리프트가 생긴다.
 */
export function tokenUsageRecordDedupKey(rec: Extract<RolloutLine, { type: 'token_usage_record' }>): string {
  return rec.responseId
    ? `id:${rec.responseId}`
    : `cum:${rec.turnId}|${JSON.stringify(rec.threadTokenUsage)}`;
}

export function accumulateTokenUsage(lines: RolloutLine[]): AccumulateResult {
  const records = lines.filter((l): l is Extract<RolloutLine, { type: 'token_usage_record' }> => l.type === 'token_usage_record');

  if (records.length === 0) {
    const counts = lines.filter((l): l is Extract<RolloutLine, { type: 'token_count' }> => l.type === 'token_count');
    const last = counts[counts.length - 1];
    return {
      totalTokens: last ? last.totalTokenUsage : zeroUsage(),
      recordsCounted: counts.length,
      recordsSkippedAsReplay: 0,
      usedFallback: true,
    };
  }

  let total = zeroUsage();
  const seen = new Set<string>();
  let counted = 0;
  let skipped = 0;

  for (const rec of records) {
    const key = tokenUsageRecordDedupKey(rec);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    total = addUsage(total, rec.usage);
    counted++;
  }

  return { totalTokens: total, recordsCounted: counted, recordsSkippedAsReplay: skipped, usedFallback: false };
}

export interface RateLimitBucket {
  windowMinutes: number;
  usedPercent: number;
  resetsAt: number;
  /** 알려진 3종(5h/7d/30d)만 i18n 키를 준다. 미지의 window는 null — 호출측이 원시 분을 노출한다. */
  labelKey: 'codex_bucket_5h' | 'codex_bucket_7d' | 'codex_bucket_30d' | null;
}

const KNOWN_WINDOWS: Record<number, RateLimitBucket['labelKey']> = {
  300: 'codex_bucket_5h',
  10080: 'codex_bucket_7d',
  43200: 'codex_bucket_30d',
};

/**
 * window_minutes에서 버킷을 런타임 생성한다(D9) — 5h/7d 하드코딩 금지. null(rate_limits 부재)이면
 * 빈 배열 — 호출측이 게이지 섹션 자체를 숨기는 신호로 쓴다(빈 값과 0 값을 같게 그리지 않는다).
 */
export function extractRateLimitBuckets(snapshot: RateLimitSnapshot | null): RateLimitBucket[] {
  if (!snapshot) return [];
  const out: RateLimitBucket[] = [];
  for (const w of [snapshot.primary, snapshot.secondary]) {
    if (!w) continue;
    out.push({
      windowMinutes: w.windowMinutes,
      usedPercent: w.usedPercent,
      resetsAt: w.resetsAt,
      labelKey: KNOWN_WINDOWS[w.windowMinutes] ?? null,
    });
  }
  return out;
}
