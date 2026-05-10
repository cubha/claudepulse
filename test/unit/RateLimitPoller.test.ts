import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitPoller } from '../../src/services/RateLimitPoller';
import type { CredentialsReader } from '../../src/services/CredentialsReader';
import type { Logger } from '../../src/logger';
import type { RateLimitSnapshot } from '../../src/types';

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

describe('RateLimitPoller — 헤더 파싱', () => {
  it('5h/7d utilization, reset, status를 파싱한다', () => {
    const snapshots: RateLimitSnapshot[] = [];
    const poller = makePoller((s) => snapshots.push(s));

    const now = Math.floor(Date.now() / 1000);
    const fhReset = now + 3600;
    const sdReset = now + 86400 * 3;

    const headers: Record<string, string> = {
      'anthropic-ratelimit-unified-5h-utilization': '0.84',
      'anthropic-ratelimit-unified-5h-reset': String(fhReset),
      'anthropic-ratelimit-unified-5h-status': 'allowed_warning',
      'anthropic-ratelimit-unified-7d-utilization': '0.93',
      'anthropic-ratelimit-unified-7d-reset': String(sdReset),
      'anthropic-ratelimit-unified-7d-status': 'allowed_warning',
    };

    const snap = poller.exposedParseHeaders(headers);

    expect(snap.fiveHour.utilization).toBeCloseTo(0.84, 2);
    expect(snap.fiveHour.status).toBe('allowed_warning');
    expect(snap.sevenDay.utilization).toBeCloseTo(0.93, 2);
    expect(snap.sevenDay.status).toBe('allowed_warning');
    expect(snap.overallStatus).toBe('allowed_warning');
  });

  it('blocked 상태가 allowed_warning보다 우선한다', () => {
    const poller = makePoller(() => {});
    const snap = poller.exposedParseHeaders({
      'anthropic-ratelimit-unified-5h-utilization': '1.0',
      'anthropic-ratelimit-unified-5h-reset': '9999999999',
      'anthropic-ratelimit-unified-5h-status': 'blocked',
      'anthropic-ratelimit-unified-7d-utilization': '0.5',
      'anthropic-ratelimit-unified-7d-reset': '9999999999',
      'anthropic-ratelimit-unified-7d-status': 'allowed',
    });
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
