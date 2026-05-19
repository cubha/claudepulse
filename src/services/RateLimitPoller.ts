import * as https from 'node:https';
import type { Logger } from '../logger';
import type {
  ClaudeCredentials,
  FallbackInfo,
  OverageWindow,
  PlanInfo,
  PollerError,
  RateLimitSnapshot,
  UnifiedWindow,
} from '../types';
import type { CredentialsReader } from './CredentialsReader';

const POLL_MODEL = 'claude-haiku-4-5-20251001';
const API_HOST = 'api.anthropic.com';
const API_PATH = '/v1/messages';

export class RateLimitPoller {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly credReader: CredentialsReader,
    private readonly credentialsPath: string,
    private readonly logger: Logger,
    private readonly onSnapshot: (s: RateLimitSnapshot) => void,
    private readonly onError: (e: PollerError) => void
  ) {}

  start(pollIntervalMs: number): void {
    void this.poll();
    this.timer = setInterval(() => { void this.poll(); }, pollIntervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll(): Promise<void> {
    try {
      const creds = await this.credReader.read(this.credentialsPath);
      const headers = await this.postMinimalMessage(creds.accessToken);
      const snapshot = this.parseHeaders(headers, creds);
      this.onSnapshot(snapshot);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('not found') || msg.includes('not valid JSON') || msg.includes('accessToken')) {
        this.logger.warn(`RateLimitPoller: credentials missing — ${msg}`);
        this.onError('credentials_missing');
      } else if (msg.includes('TOKEN_EXPIRED')) {
        this.logger.warn(`RateLimitPoller: token expired`);
        this.onError('token_expired');
      } else {
        this.logger.warn(`RateLimitPoller: network error — ${msg}`);
        this.onError('network_error');
      }
    }
  }

  private postMinimalMessage(accessToken: string): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: POLL_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: '.' }],
      });

      const req = https.request(
        {
          hostname: API_HOST,
          path: API_PATH,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          const captured: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') captured[k] = v;
            else if (Array.isArray(v)) captured[k] = v[0] ?? '';
          }

          res.resume();
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            if (status === 401) {
              reject(new Error('TOKEN_EXPIRED: OAuth token is invalid or expired. Re-login via Claude Code CLI (`claude login`).'));
            } else if (status >= 400 && status !== 429) {
              reject(new Error(`API error ${status}`));
            } else {
              resolve(captured);
            }
          });
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  protected parseHeaders(h: Record<string, string>, creds?: ClaudeCredentials): RateLimitSnapshot {
    const now = new Date();

    const fiveHour = this.parseWindow(
      h['anthropic-ratelimit-unified-5h-utilization'],
      h['anthropic-ratelimit-unified-5h-reset'],
      h['anthropic-ratelimit-unified-5h-status'],
      now
    );

    const sevenDay = this.parseWindow(
      h['anthropic-ratelimit-unified-7d-utilization'],
      h['anthropic-ratelimit-unified-7d-reset'],
      h['anthropic-ratelimit-unified-7d-status'],
      now
    );

    const overallStatus = this.worstStatus(fiveHour.status, sevenDay.status);

    // 플랜 정보 (credentials 기반)
    const plan: PlanInfo | undefined = (creds?.subscriptionType || creds?.rateLimitTier)
      ? {
          subscriptionType: creds?.subscriptionType ?? '',
          rateLimitTier: creds?.rateLimitTier ?? '',
          organizationUuid: creds?.organizationUuid,
        }
      : undefined;

    // Overage(추가 사용량) 상태
    const overageStatusStr = h['anthropic-ratelimit-unified-overage-status'];
    const overage: OverageWindow | undefined = overageStatusStr
      ? {
          status: overageStatusStr === 'rejected' ? 'rejected' : 'allowed',
          utilization: h['anthropic-ratelimit-unified-overage-utilization']
            ? parseFloat(h['anthropic-ratelimit-unified-overage-utilization'])
            : 0,
          disabledReason: h['anthropic-ratelimit-unified-overage-disabled-reason'],
        }
      : undefined;

    // Fallback(속도 축소) 상태
    const fallbackStr = h['anthropic-ratelimit-unified-fallback'];
    const fallback: FallbackInfo | undefined = fallbackStr
      ? {
          available: fallbackStr === 'available' ? 'available' : 'unavailable',
          percentage: h['anthropic-ratelimit-unified-fallback-percentage']
            ? parseFloat(h['anthropic-ratelimit-unified-fallback-percentage'])
            : undefined,
        }
      : undefined;

    // 현재 병목 윈도우
    const repClaimStr = h['anthropic-ratelimit-unified-representative-claim'];
    const representativeClaim: 'five_hour' | 'seven_day' | undefined =
      repClaimStr === 'five_hour' ? 'five_hour'
      : repClaimStr === 'seven_day' ? 'seven_day'
      : undefined;

    // 7d 임계값 돌파
    const surpassedStr = h['anthropic-ratelimit-unified-7d-surpassed-threshold'];
    const sevenDaySurpassedThreshold = surpassedStr ? parseFloat(surpassedStr) : undefined;

    // 업그레이드 경로
    const upgradePathsStr = h['anthropic-ratelimit-unified-upgrade-paths'];
    const upgradePaths = upgradePathsStr
      ? upgradePathsStr.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    return {
      fiveHour,
      sevenDay,
      overallStatus,
      generatedAt: now,
      plan,
      overage,
      fallback,
      representativeClaim,
      sevenDaySurpassedThreshold,
      upgradePaths,
    };
  }

  protected parseWindow(
    utilizationStr: string | undefined,
    resetStr: string | undefined,
    _statusStr: string | undefined, // API status — 미래 재활성화용으로 보존, 현재는 % 임계값 우선
    now: Date
  ): UnifiedWindow {
    const utilization = utilizationStr ? parseFloat(utilizationStr) : 0;
    const resetAt = resetStr ? new Date(Number(resetStr) * 1000) : now;
    const msUntilReset = Math.max(0, resetAt.getTime() - now.getTime());
    const status = this.utilizationToStatus(utilization); // % 임계값 기반
    // const status = this.parseStatus(_statusStr); // API status 기반 — 필요 시 교체
    return { utilization, resetAt, msUntilReset, status };
  }

  /** utilization % → 표시 status (0~80% 파랑 / 80~90% 노랑 / 90~100% 빨강) */
  private utilizationToStatus(pct: number): UnifiedWindow['status'] {
    if (pct >= 0.90) return 'blocked';
    if (pct >= 0.80) return 'allowed_warning';
    return 'allowed';
  }

  // API status 헤더 파싱 — 미래 재활성화용으로 보존
  // private parseStatus(s: string | undefined): UnifiedWindow['status'] {
  //   if (s === 'blocked') return 'blocked';
  //   if (s === 'allowed_warning') return 'allowed_warning';
  //   return 'allowed';
  // }

  private worstStatus(a: UnifiedWindow['status'], b: UnifiedWindow['status']): UnifiedWindow['status'] {
    if (a === 'blocked' || b === 'blocked') return 'blocked';
    if (a === 'allowed_warning' || b === 'allowed_warning') return 'allowed_warning';
    return 'allowed';
  }
}
