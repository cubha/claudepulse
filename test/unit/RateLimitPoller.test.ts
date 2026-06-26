import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitPoller } from '../../src/services/RateLimitPoller';
import type { CredentialsReader } from '../../src/services/CredentialsReader';
import type { Logger } from '../../src/logger';
import type { ClaudeCredentials, PollerError, RateLimitSnapshot } from '../../src/types';

class TestablePoller extends RateLimitPoller {
  public exposedParseHeaders(h: Record<string, string>): RateLimitSnapshot {
    return this.parseHeaders(h);
  }
}

function makePoller(onSnapshot: (s: RateLimitSnapshot) => void): TestablePoller {
  const mockReader = { read: vi.fn() } as unknown as CredentialsReader;
  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), dispose: vi.fn() } as unknown as Logger;
  return new TestablePoller(mockReader, '/fake/.credentials.json', mockLogger, onSnapshot);
}

/** poll() 분류 로직 검증용 — read()와 postMinimalMessage()를 스텁한다. */
class ClassifyPoller extends RateLimitPoller {
  public postCalls = 0;
  constructor(
    private readonly creds: ClaudeCredentials,
    private readonly post: (token: string) => Promise<Record<string, string>>,
    onSnapshot: (s: RateLimitSnapshot) => void,
    onError: (e: PollerError) => void
  ) {
    const mockReader = { read: vi.fn().mockResolvedValue(creds) } as unknown as CredentialsReader;
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), dispose: vi.fn() } as unknown as Logger;
    super(mockReader, '/fake/.credentials.json', mockLogger, onSnapshot, onError);
  }
  protected override postMinimalMessage(accessToken: string): Promise<Record<string, string>> {
    this.postCalls++;
    return this.post(accessToken);
  }
}

function makeCreds(over: Partial<ClaudeCredentials>): ClaudeCredentials {
  return { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, ...over };
}
const reject401 = () => Promise.reject(new Error('TOKEN_EXPIRED: invalid'));

describe('RateLimitPoller — 헤더 파싱', () => {
  it('5h/7d utilization, reset, status를 파싱한다 (% 임계값 기준)', () => {
    const snapshots: RateLimitSnapshot[] = [];
    const poller = makePoller((s) => snapshots.push(s));

    const now = Math.floor(Date.now() / 1000);
    const fhReset = now + 3600;
    const sdReset = now + 86400 * 3;

    const headers: Record<string, string> = {
      'anthropic-ratelimit-unified-5h-utilization': '0.84', // 0.84 >= 0.80 → allowed_warning
      'anthropic-ratelimit-unified-5h-reset': String(fhReset),
      'anthropic-ratelimit-unified-5h-status': 'allowed', // API status 무시됨
      'anthropic-ratelimit-unified-7d-utilization': '0.93', // 0.90 <= 0.93 < 1.0 → danger (blocked는 100%만)
      'anthropic-ratelimit-unified-7d-reset': String(sdReset),
      'anthropic-ratelimit-unified-7d-status': 'allowed', // API status 무시됨
    };

    const snap = poller.exposedParseHeaders(headers);

    expect(snap.fiveHour.utilization).toBeCloseTo(0.84, 2);
    expect(snap.fiveHour.status).toBe('allowed_warning'); // 0.84 >= 0.80
    expect(snap.sevenDay.utilization).toBeCloseTo(0.93, 2);
    expect(snap.sevenDay.status).toBe('danger');           // 0.90 <= 0.93 < 1.0 (blocked는 100%만)
    expect(snap.overallStatus).toBe('danger');             // worst(allowed_warning, danger) = danger
  });

  it('% 임계값으로 blocked가 allowed_warning보다 우선한다', () => {
    const poller = makePoller(() => {});
    const snap = poller.exposedParseHeaders({
      'anthropic-ratelimit-unified-5h-utilization': '1.0',  // 1.0 >= 0.90 → blocked
      'anthropic-ratelimit-unified-5h-reset': '9999999999',
      'anthropic-ratelimit-unified-5h-status': 'allowed',   // 무시됨
      'anthropic-ratelimit-unified-7d-utilization': '0.85', // 0.85 >= 0.80 → allowed_warning
      'anthropic-ratelimit-unified-7d-reset': '9999999999',
      'anthropic-ratelimit-unified-7d-status': 'allowed',   // 무시됨
    });
    expect(snap.fiveHour.status).toBe('blocked');
    expect(snap.sevenDay.status).toBe('allowed_warning');
    expect(snap.overallStatus).toBe('blocked');
  });

  it('헤더 없으면 기본값(utilization=0, status=allowed)을 반환한다', () => {
    const poller = makePoller(() => {});
    const snap = poller.exposedParseHeaders({});
    expect(snap.fiveHour.utilization).toBe(0);
    expect(snap.fiveHour.status).toBe('allowed');
    expect(snap.sevenDay.utilization).toBe(0);
    expect(snap.overallStatus).toBe('allowed');
  });

  it('msUntilReset는 0 이상이다', () => {
    const poller = makePoller(() => {});
    const pastReset = Math.floor(Date.now() / 1000) - 100;
    const snap = poller.exposedParseHeaders({
      'anthropic-ratelimit-unified-5h-utilization': '0',
      'anthropic-ratelimit-unified-5h-reset': String(pastReset),
      'anthropic-ratelimit-unified-5h-status': 'allowed',
      'anthropic-ratelimit-unified-7d-utilization': '0',
      'anthropic-ratelimit-unified-7d-reset': String(pastReset),
      'anthropic-ratelimit-unified-7d-status': 'allowed',
    });
    expect(snap.fiveHour.msUntilReset).toBe(0);
    expect(snap.sevenDay.msUntilReset).toBe(0);
  });
});

describe('RateLimitPoller — 인증 상태 분류 (token_stale vs token_expired)', () => {
  it('expiresAt 만료 + refreshToken 있으면 API 호출 없이 token_stale로 단락한다', async () => {
    const errors: PollerError[] = [];
    const poller = new ClassifyPoller(
      makeCreds({ expiresAt: Date.now() - 1000, refreshToken: 'r' }),
      reject401, () => {}, (e) => errors.push(e)
    );
    await poller.poll();
    expect(errors).toEqual(['token_stale']);
    expect(poller.postCalls).toBe(0); // 만료 선검사로 doomed call 회피
  });

  it('expiresAt 만료 + refreshToken 없으면 token_expired로 단락한다', async () => {
    const errors: PollerError[] = [];
    const poller = new ClassifyPoller(
      makeCreds({ expiresAt: Date.now() - 1000, refreshToken: '' }),
      reject401, () => {}, (e) => errors.push(e)
    );
    await poller.poll();
    expect(errors).toEqual(['token_expired']);
    expect(poller.postCalls).toBe(0);
  });

  it('유효 토큰인데 401 응답 + refreshToken 있으면 token_stale로 분류한다', async () => {
    const errors: PollerError[] = [];
    const poller = new ClassifyPoller(
      makeCreds({ refreshToken: 'r' }), reject401, () => {}, (e) => errors.push(e)
    );
    await poller.poll();
    expect(errors).toEqual(['token_stale']);
    expect(poller.postCalls).toBe(1);
  });

  it('유효 토큰인데 401 응답 + refreshToken 없으면 token_expired로 분류한다', async () => {
    const errors: PollerError[] = [];
    const poller = new ClassifyPoller(
      makeCreds({ refreshToken: '' }), reject401, () => {}, (e) => errors.push(e)
    );
    await poller.poll();
    expect(errors).toEqual(['token_expired']);
  });

  it('정상 응답이면 onSnapshot을 호출하고 에러를 내지 않는다', async () => {
    const errors: PollerError[] = [];
    const snaps: RateLimitSnapshot[] = [];
    const poller = new ClassifyPoller(
      makeCreds({}), () => Promise.resolve({}), (s) => snaps.push(s), (e) => errors.push(e)
    );
    await poller.poll();
    expect(errors).toEqual([]);
    expect(snaps).toHaveLength(1);
  });
});
