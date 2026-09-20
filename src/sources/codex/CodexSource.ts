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
/** parseRolloutIntoState가 청크 사이에 이어받는 파싱 문맥(ST2 증분 파싱의 재개 상태). */
interface RolloutParseState {
  cwd: string;
  branch: string;
  sessionId: string;
  turnModel: Map<string, string>;
  seen: Set<string>;
}

/**
 * rollout jsonl 줄 배열 하나를 SessionRecord[]로 변환하는 **상태 저장(stateful) 핵심 로직**.
 * `state`를 넘기면 이전 청크에서 이어받은 문맥(cwd/branch/sessionId/turnModel)과 dedup Set으로
 * 계속 파싱한다 — CodexSource의 증분 파싱(ST2)이 파일별로 이 state를 캐싱해 재사용한다.
 * `rolloutLinesToSessionRecords`(아래, 기존 공개 API)는 이 함수를 fresh state로 감싼 얇은 래퍼다.
 */
function parseRolloutIntoState(rawLines: string[], state: RolloutParseState): { records: SessionRecord[]; state: RolloutParseState } {
  const lines = parseRolloutLines(rawLines);

  let { cwd, branch, sessionId } = state;
  const { turnModel, seen } = state;
  const out: SessionRecord[] = [];
  // subagent(thread_spawn) 세션 감지는 session_meta.source가 객체 형태일 때 가능하지만(D10-2),
  // 이번 범위에서는 미구현 — isSidechain은 항상 false. 반쯤 만든 감지보다 정직한 미구현이 낫다
  // (CODEX_CAPABILITIES.subagentAttribution=false이므로 UI도 이 값을 아직 소비하지 않는다).

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

  return { records: out, state: { cwd, branch, sessionId, turnModel, seen } };
}

/**
 * rollout jsonl 원본 줄 배열 하나(= 세션 파일 하나)를 `SessionRecord[]`로 변환한다.
 * 순수 함수 — 파일 I/O는 호출측(`CodexSource` 클래스)이 담당한다(codexRollout.ts와 동일 원칙).
 *
 * 레코드 단위 = `token_usage_record` 1건(API 응답 1개, JsonlParser의 assistant 메시지 1건과 대응).
 * dedup은 `tokenUsageRecordDedupKey`를 **`accumulateTokenUsage`와 공유**한다 — 따로 만들면
 * 총합 검증(codexRollout 테스트)과 레코드 드랍 여부가 서로 다른 기준으로 판정되는 드리프트가 생긴다.
 *
 * `seen`을 외부에서 넘기면(ST1) 여러 파일에 걸쳐 dedup Set을 공유할 수 있다 — `CodexSource`가
 * 크로스파일 dedup에 직접 쓰지는 않지만(크로스파일 dedup은 `loadAllSessionRecords`의 messageId
 * 기반 전역 패스로 처리, 아래 참조), 같은 파일을 여러 청크로 나눠 파싱할 때(ST2) 이어쓸 수 있도록
 * 공개해둔다.
 */
export function rolloutLinesToSessionRecords(rawLines: string[], seen: Set<string> = new Set()): SessionRecord[] {
  return parseRolloutIntoState(rawLines, { cwd: '', branch: '', sessionId: '', turnModel: new Map(), seen }).records;
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

/** mtime+offset 캐시 엔트리(ST2) — JsonlParser.ts의 ParseCache와 동일 원칙, Codex rollout 파일 전용. */
interface RolloutFileCache {
  mtime: number;
  offset: number;
  /** 이 파일에서 지금까지 누적 파싱된 SessionRecord — 새로 읽은 증분만 파싱해 이어붙인다. */
  records: SessionRecord[];
  /** 증분 파싱이 이어지려면 session_meta/turn_context에서 나온 문맥을 유지해야 한다(다음 청크의
   * token_usage_record가 이 문맥을 참조). */
  cwd: string;
  branch: string;
  sessionId: string;
  turnModel: Map<string, string>;
  /** 파일 내부 dedup(기존 계약) — 증분 청크를 이어 파싱할 때도 이 Set을 이어써야 재생 라인이
   * 다시 카운트되지 않는다. */
  seen: Set<string>;
}

/** getFileLines(ST2)의 원시 줄 캐시 엔트리 — SessionRecord 파싱 문맥 없이 누적 줄만 보관한다. */
interface RawLineCache {
  mtime: number;
  offset: number;
  lines: string[];
}

/**
 * 청크의 마지막 개행(`\n`) 이후에 남은 바이트는 아직 다 쓰이지 않은 미완결 라인일 수 있다
 * (증분 파싱 보안검토 지적 — Codex CLI가 append 중인 파일을 stat 직후 읽으면 발생). 그 부분은
 * 버리고, `consumedBytes`(실제로 소비한 바이트 수)도 마지막 완결 개행까지만 보고해 caller가
 * offset을 그 지점까지만 전진시키게 한다 — 다음 호출에서 같은 줄을 처음부터 다시 읽는다.
 * 개행이 아예 없으면(한 줄이 청크 전체보다 길다) 아무것도 소비하지 않는다.
 * 바이트 단위로 마지막 개행을 찾는다 — UTF-8에서 0x0A(개행)는 멀티바이트 문자의 연속 바이트로
 * 절대 나타나지 않으므로(연속 바이트는 항상 0x80~0xBF) 문자 경계를 깨지 않는다.
 */
function splitCompleteLines(buf: Buffer): { lines: string[]; consumedBytes: number } {
  const lastNewlineIdx = buf.lastIndexOf(0x0a);
  if (lastNewlineIdx === -1) return { lines: [], consumedBytes: 0 };
  const complete = buf.subarray(0, lastNewlineIdx + 1);
  const lines = complete.toString('utf-8').split('\n').filter(l => l.trim());
  return { lines, consumedBytes: complete.length };
}

export class CodexSource implements AgentSource {
  readonly provider = 'codex' as const;
  readonly capabilities = CODEX_CAPABILITIES;
  private readonly fileCache = new Map<string, RolloutFileCache>();
  private readonly rawLineCache = new Map<string, RawLineCache>();

  constructor(private readonly homeDir: string = codexHomeDir()) {}

  /**
   * `~/.claude/` 밖(`~/.codex/`)의 대용량 rollout 파일을 매 refresh(기본 15초)마다 통째로
   * 재파싱하지 않도록 mtime+offset 캐시로 증분 파싱한다(ST2, ANALYSIS 🔴#2 — JsonlParser.ts의
   * parseFile과 같은 전략). 읽기 실패는 무성하지 않게 로깅한다(ST3, ANALYSIS 🟡#2).
   */
  private async parseFileIncremental(file: string): Promise<SessionRecord[]> {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(file);
    } catch (err) {
      this.fileCache.delete(file);
      console.error(`[CodexSource] rollout 파일 stat 실패, 건너뜀: ${file}`, err);
      return [];
    }

    const cached = this.fileCache.get(file);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.records;
    }

    // 파일이 축소(교체/rotate)됐으면 오프셋을 신뢰할 수 없다 — 전체 재파싱으로 안전하게 폴백한다
    // (JsonlParser.ts와 동일 원칙).
    const canIncrement = cached !== undefined && cached.offset <= stat.size;
    const startOffset = canIncrement ? cached.offset : 0;

    let buf: Buffer;
    try {
      buf = await this.readFileChunk(file, startOffset);
    } catch (err) {
      console.error(`[CodexSource] rollout 파일 읽기 실패: ${file}`, err);
      // 이전 캐시가 있으면 그 결과라도 보존한다(부분 실패로 이미 알던 사용량까지 잃지 않는다).
      return cached?.records ?? [];
    }

    // Codex CLI가 이 파일에 계속 append 중일 수 있다 — stat()→read() 사이에 마지막 줄이 아직
    // 다 쓰이지 않은 채로 읽히면, 그 미완결 라인까지 offset을 전진시키는 순간 나머지 절반이
    // append돼도 다시 안 읽혀 그 레코드가 영구 소실된다(verify-impl 동반 보안검토 지적).
    // 마지막 개행 이후의 미완결 바이트는 이번 파싱에서 버리고 offset도 그 앞까지만 전진시켜,
    // 다음 refresh가 그 줄 전체를 처음부터 다시 읽게 한다.
    const { lines: newLines, consumedBytes } = splitCompleteLines(buf);
    const state = canIncrement
      ? { cwd: cached!.cwd, branch: cached!.branch, sessionId: cached!.sessionId, turnModel: cached!.turnModel, seen: cached!.seen }
      : { cwd: '', branch: '', sessionId: '', turnModel: new Map<string, string>(), seen: new Set<string>() };

    const { records: newRecords, state: nextState } = parseRolloutIntoState(newLines, state);
    const records = canIncrement ? [...cached!.records, ...newRecords] : newRecords;

    this.fileCache.set(file, {
      mtime: stat.mtimeMs,
      offset: startOffset + consumedBytes,
      records,
      ...nextState,
    });

    return records;
  }

  /**
   * `loadLatestRateLimit` 전용 — token_count 스캔은 SessionRecord 파싱 문맥(cwd/turnModel/dedup)이
   * 필요 없으므로 `parseFileIncremental`과 별개로 가벼운 원시 줄 캐시만 유지한다(mtime+offset 동일
   * 원칙). `rawLineCache`는 `fileCache`와 독립적이라 두 메서드를 같은 refresh tick에서 함께 호출해도
   * 서로의 캐시를 침범하지 않는다.
   */
  private async getFileLines(file: string): Promise<string[]> {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(file);
    } catch (err) {
      this.rawLineCache.delete(file);
      console.error(`[CodexSource] rollout 파일 stat 실패, 건너뜀: ${file}`, err);
      return [];
    }

    const cached = this.rawLineCache.get(file);
    if (cached && cached.mtime === stat.mtimeMs) return cached.lines;

    const canIncrement = cached !== undefined && cached.offset <= stat.size;
    const startOffset = canIncrement ? cached.offset : 0;

    let buf: Buffer;
    try {
      buf = await this.readFileChunk(file, startOffset);
    } catch (err) {
      console.error(`[CodexSource] rollout 파일 읽기 실패: ${file}`, err);
      return cached?.lines ?? [];
    }

    // parseFileIncremental과 동일한 이유로 미완결 마지막 라인은 버리고 offset도 그 앞까지만 전진시킨다.
    const { lines: newLines, consumedBytes } = splitCompleteLines(buf);
    const lines = canIncrement ? [...cached!.lines, ...newLines] : newLines;
    this.rawLineCache.set(file, { mtime: stat.mtimeMs, offset: startOffset + consumedBytes, lines });
    return lines;
  }

  /** offset=0이면 전체 읽기, 아니면 해당 바이트 이후만 읽는다(디스크 I/O를 변경분으로 한정). */
  private async readFileChunk(file: string, offset: number): Promise<Buffer> {
    if (offset === 0) return fs.promises.readFile(file);
    const handle = await fs.promises.open(file, 'r');
    try {
      const stat = await handle.stat();
      const length = stat.size - offset;
      if (length <= 0) return Buffer.alloc(0);
      const buf = Buffer.alloc(length);
      await handle.read(buf, 0, length, offset);
      return buf;
    } finally {
      await handle.close();
    }
  }

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

  /**
   * 발견된 전 rollout 파일을 읽어 SessionRecord[]로 합친다. FileWatcher 배선(ST5)의 소비 지점.
   * 파일별 mtime+offset 캐시로 증분 파싱한다(ST2). 그 뒤 messageId 기준 **전역 1패스 dedup**을
   * 한 번 더 돈다(ST1, ANALYSIS 🔴#1) — 서브에이전트(thread_spawn)가 자기 rollout 파일에 부모의
   * response_id를 재생하면, 파일 내부 dedup(seen Set)은 파일마다 독립이라 못 잡지만 messageId는
   * response_id의 결정적 함수(`makeRecordKey`)라 여기서 걸러진다.
   */
  async loadAllSessionRecords(): Promise<SessionRecord[]> {
    const files = await listRolloutFiles(path.join(this.homeDir, 'sessions'));
    const all: SessionRecord[] = [];
    for (const file of files) {
      all.push(...(await this.parseFileIncremental(file)));
    }
    const seenMessageIds = new Set<string>();
    const out: SessionRecord[] = [];
    for (const record of all) {
      if (seenMessageIds.has(record.messageId)) continue;
      seenMessageIds.add(record.messageId);
      out.push(record);
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
      // ST2 — loadAllSessionRecords와 별개 캐시지만(getFileLines) 같은 mtime+offset 증분 원칙으로
      // 디스크 I/O를 줄인다(ANALYSIS 🔴#2 "매 refresh마다 전체 히스토리 2패스").
      const lines = await this.getFileLines(file);
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
