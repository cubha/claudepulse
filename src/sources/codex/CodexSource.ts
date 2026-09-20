import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentAvailability, AgentSource } from '../AgentSource';
import { CODEX_CAPABILITIES } from '../AgentSource';
import { classifyAvailability } from '../availability';
import { makeRecordKey, synthesizeRecordKey } from '../recordKey';
import { emptyToolCounts } from '../../services/JsonlParser';
import type { JournalUsage, SessionRecord } from '../../types';
import { extractRateLimitBuckets, parseRolloutLines, tokenUsageRecordDedupKey } from './codexRollout';
import type { RateLimitBucket, TokenUsageTotals } from './codexRollout';
import { calcCodexCost } from './codexPricing';
import type { CodexRateLimitSnapshot } from '../../types';

/** `~/.codex`. 테스트에서 임시 디렉토리로 주입할 수 있게 함수로 뺀다(os.homedir() 직접 호출 금지). */
export function codexHomeDir(): string {
  return path.join(os.homedir(), '.codex');
}

/**
 * rollout usage(`cachedInputTokens ⊂ inputTokens`, PLAN §3 "비캐시 input = input − cached")를
 * Claude API 의미론(입력·캐시읽기가 서로소인 버킷)으로 정규화한다. 그대로 두면 CacheStats
 * hitRate·DailyUsage 롤업이 캐시 토큰을 두 번 센다(input에 포함 + cache_read에 또 포함) —
 * UsageAggregator가 provider 분기 없이 그대로 재사용하려면 여기서 한 번만 정규화해야 한다.
 * 비용(costUsd)은 이 정규화와 별개로 `calcCodexCost`가 원본 usage에서 직접 계산한다.
 */
function toJournalUsage(u: TokenUsageTotals): JournalUsage {
  return {
    input_tokens: Math.max(0, u.inputTokens - u.cachedInputTokens),
    output_tokens: u.outputTokens,
    // OpenAI는 캐시 생성 비용이 없다(codexPricing.ts) — 5m/1h TTL 구분 자체가 없어 전량 5m 버킷에
    // 넣는다(합계 표시용, 비용 계산에는 영향 없음 — cache_creation 요율이 0).
    cache_creation_input_tokens: u.cacheWriteInputTokens,
    cache_creation_5m_input_tokens: u.cacheWriteInputTokens,
    cache_creation_1h_input_tokens: 0,
    cache_read_input_tokens: u.cachedInputTokens,
  };
}

/**
 * rollout jsonl 원본 줄 배열 하나(= 세션 파일 하나)를 `SessionRecord[]`로 변환한다.
 * 순수 함수 — 파일 I/O는 호출측(`CodexSource` 클래스)이 담당한다(codexRollout.ts와 동일 원칙).
 *
 * 레코드 단위 = `token_usage_record` 1건(API 응답 1개, JsonlParser의 assistant 메시지 1건과 대응).
 * dedup은 `tokenUsageRecordDedupKey`를 **`accumulateTokenUsage`와 공유**한다 — 따로 만들면
 * 총합 검증(codexRollout 테스트)과 레코드 드랍 여부가 서로 다른 기준으로 판정되는 드리프트가 생긴다.
 */
export function rolloutLinesToSessionRecords(rawLines: string[]): SessionRecord[] {
  const lines = parseRolloutLines(rawLines);

  let cwd = '';
  let branch = '';
  let sessionId = '';
  // subagent(thread_spawn) 세션 감지는 session_meta.source가 객체 형태일 때 가능하지만(D10-2),
  // 이번 범위에서는 미구현 — isSidechain은 항상 false. 반쯤 만든 감지보다 정직한 미구현이 낫다
  // (CODEX_CAPABILITIES.subagentAttribution=false이므로 UI도 이 값을 아직 소비하지 않는다).
  const turnModel = new Map<string, string>();
  const seen = new Set<string>();
  const out: SessionRecord[] = [];

  for (const line of lines) {
    if (line.type === 'session_meta') {
      cwd = line.cwd ?? '';
      branch = line.git?.branch ?? '';
      sessionId = line.sessionId ?? '';
      continue;
    }
    if (line.type === 'turn_context') {
      if (line.turnId && line.model) turnModel.set(line.turnId, line.model);
      continue;
    }
    if (line.type !== 'token_usage_record') continue;

    const key = tokenUsageRecordDedupKey(line);
    if (seen.has(key)) continue;
    seen.add(key);

    const model = turnModel.get(line.turnId) ?? 'unknown';
    // 원본 id가 있으면 그것을, 없으면 합성 — 절대 빈 문자열을 쓰지 않는다(§3#1 dedup 계약).
    const messageId = makeRecordKey('codex', line.responseId) ?? synthesizeRecordKey('codex', {
      sessionId, turnId: line.turnId, timestamp: line.timestamp, ordinal: line.ordinal,
    });

    out.push({
      provider: 'codex',
      messageId,
      // requestId는 스트리밍 중복 제거 키(JsonlParser.byRequestId)와 같은 역할 — 별도 원본이
      // 없으므로 messageId와 동일 값을 쓴다(advisor 지적: 빈 문자열/상수 금지).
      requestId: messageId,
      sessionId,
      model,
      timestamp: line.timestamp,
      cwd,
      gitBranch: branch,
      usage: toJournalUsage(line.usage),
      reasoningTokens: line.usage.reasoningOutputTokens,
      // 가격표에 없으면 null → 0 + pricingSource:'none'(UsageAggregator.resolvePriceFor)이
      // 진실을 전달한다. calcCost(Claude)의 기존 관례와 동일 — 여기서 새 규약을 만들지 않는다.
      costUsd: calcCodexCost(model, line.usage) ?? 0,
      toolCounts: emptyToolCounts(),
      editedFiles: [],
      isSidechain: false,
    });
  }

  return out;
}

/**
 * `~/.codex/sessions/YYYY/MM/DD/*.jsonl` 깊이3 트리를 수동 재귀 순회한다(D-fact §3 "경로").
 * glob 의존성을 새로 들이지 않는다 — `WorkspaceMapper.ts`가 이미 이 패턴(수동 readdir)을 쓴다.
 * ⚠️ 범위 제외(사유는 PLAN §4 P-1 갱신 참조): `.zst` 압축본·`archived_sessions/`는 이 머신에
 * 실 샘플이 없어 왕복검증이 불가능하다 — 미검증 압축해제 코드보다 정직한 gap이 낫다.
 */
export async function listRolloutFiles(sessionsDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 3) await walk(full, depth + 1);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        out.push(full);
      }
    }
  }
  await walk(sessionsDir, 0);
  return out;
}

export class CodexSource implements AgentSource {
  readonly provider = 'codex' as const;
  readonly capabilities = CODEX_CAPABILITIES;

  constructor(private readonly homeDir: string = codexHomeDir()) {}

  async detectAvailability(): Promise<AgentAvailability> {
    const homeDirExists = fs.existsSync(this.homeDir);
    const authValid = homeDirExists && await this.readAuthValid();
    const hasRecords = authValid && await this.hasAnyRolloutFile();
    return classifyAvailability({ homeDirExists, authValid, hasRecords });
  }

  private async readAuthValid(): Promise<boolean> {
    try {
      const raw = await fs.promises.readFile(path.join(this.homeDir, 'auth.json'), 'utf-8');
      const auth = JSON.parse(raw) as Record<string, unknown>;
      const tokens = auth['tokens'] as Record<string, unknown> | undefined;
      // id_token 부재 = 로그아웃 상태 파일(auth.json 자체는 남아있을 수 있다) — §6 "미로그인"과 매칭.
      return typeof tokens?.['id_token'] === 'string' && tokens['id_token'].length > 0;
    } catch {
      return false;
    }
  }

  private async hasAnyRolloutFile(): Promise<boolean> {
    const files = await listRolloutFiles(path.join(this.homeDir, 'sessions'));
    return files.length > 0;
  }

  /** 발견된 전 rollout 파일을 읽어 SessionRecord[]로 합친다. FileWatcher 배선(ST5)의 소비 지점. */
  async loadAllSessionRecords(): Promise<SessionRecord[]> {
    const files = await listRolloutFiles(path.join(this.homeDir, 'sessions'));
    const out: SessionRecord[] = [];
    for (const file of files) {
      let content: string;
      try {
        content = await fs.promises.readFile(file, 'utf-8');
      } catch {
        continue;
      }
      const lines = content.split('\n').filter(l => l.trim());
      out.push(...rolloutLinesToSessionRecords(lines));
    }
    return out;
  }

  /**
   * 전체 rollout 파일에서 가장 최근 `token_count`(rate_limits 포함) 이벤트를 찾는다.
   * Claude의 `RateLimitPoller`(실시간 API 헤더 폴링)와 달리 Codex는 **CLI가 이미 기록해둔 값을
   * 읽기만** 한다(별도 네트워크 폴링 없음) — rollout jsonl 자체가 각 응답 시점의 한도 스냅샷을
   * 담고 있다(D9). 버킷이 하나도 없으면(오래된 CLI·API key 모드) null — 게이지 섹션을 숨기는 신호.
   */
  async loadLatestRateLimit(): Promise<CodexRateLimitSnapshot | null> {
    const files = await listRolloutFiles(path.join(this.homeDir, 'sessions'));
    let latestTimestamp = '';
    let latestBuckets: RateLimitBucket[] = [];
    let latestPlanType: string | null = null;
    // model_context_window는 rate_limits와 별개로 token_count 라인에 실린다(구버전 CLI는 null) —
    // "한도 스냅샷의 최신값" 스캔과 같은 latest-wins 원칙이지만 rateLimits 유무와 독립적으로 추적한다
    // (verify-impl B-V2/B-V6 보완: 버킷이 없어도 컨텍스트 실측만은 별도로 존재할 수 있다).
    let latestContextWindow: number | null = null;
    let latestContextTimestamp = '';
    for (const file of files) {
      let content: string;
      try {
        content = await fs.promises.readFile(file, 'utf-8');
      } catch {
        continue;
      }
      const lines = content.split('\n').filter(l => l.trim());
      for (const line of parseRolloutLines(lines)) {
        if (line.type !== 'token_count') continue;
        if (line.modelContextWindow !== null && line.timestamp >= latestContextTimestamp) {
          latestContextTimestamp = line.timestamp;
          latestContextWindow = line.modelContextWindow;
        }
        if (!line.rateLimits) continue;
        if (line.timestamp <= latestTimestamp) continue;
        const buckets = extractRateLimitBuckets(line.rateLimits);
        if (buckets.length === 0) continue;
        latestTimestamp = line.timestamp;
        latestBuckets = buckets;
        latestPlanType = line.rateLimits.planType;
      }
    }
    if (latestBuckets.length === 0) return null;
    return {
      buckets: latestBuckets,
      planType: latestPlanType,
      generatedAt: latestTimestamp,
      modelContextWindow: latestContextWindow,
    };
  }
}
