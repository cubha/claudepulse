import * as https from 'node:https';
import type { Logger } from '../logger';
import type { RateLimitSnapshot, UnifiedWindow } from '../types';
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
    private readonly onSnapshot: (s: RateLimitSnapshot) => void
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
      const snapshot = this.parseHeaders(headers);
      this.onSnapshot(snapshot);
    } catch (err) {
      this.logger.warn(`RateLimitPoller poll failed: ${String(err)}`);
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
          // 응답 헤더만 필요 — body는 드레인
          const captured: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') captured[k] = v;
            else if (Array.isArray(v)) captured[k] = v[0] ?? '';
          }

          res.resume(); // body 소비 (메모리 누수 방지)
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

  protected parseHeaders(h: Record<string, string>): RateLimitSnapshot {
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

    return { fiveHour, sevenDay, overallStatus, generatedAt: now };
  }

  protected parseWindow(
    utilizationStr: string | undefined,
    resetStr: string | undefined,
    statusStr: string | undefined,
    now: Date
  ): UnifiedWindow {
    const utilization = utilizationStr ? parseFloat(utilizationStr) : 0;
    const resetAt = resetStr ? new Date(Number(resetStr) * 1000) : now;
    const msUntilReset = Math.max(0, resetAt.getTime() - now.getTime());
    const status = this.parseStatus(statusStr);
    return { utilization, resetAt, msUntilReset, status };
  }

  private parseStatus(s: string | undefined): UnifiedWindow['status'] {
    if (s === 'blocked') return 'blocked';
    if (s === 'allowed_warning') return 'allowed_warning';
    return 'allowed';
  }

  private worstStatus(a: UnifiedWindow['status'], b: UnifiedWindow['status']): UnifiedWindow['status'] {
    if (a === 'blocked' || b === 'blocked') return 'blocked';
    if (a === 'allowed_warning' || b === 'allowed_warning') return 'allowed_warning';
    return 'allowed';
  }
}
