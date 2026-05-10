import { AggregatedStats, BillingWindow, ProjectSummary, SnapshotPayload, UsageRecord } from '../types';

/**
 * 일/주/월 롤업 + 비용 계산 + 5h window 추정.
 *
 * 5h Window 산출:
 *  - 시간 기준: 첫 메시지 timestamp + 5h - now → pctTimeRemaining (100% 정확)
 *  - 토큰 기준: ccusage P90 추정 차용 — Anthropic 공식 한도 비공개 (estimated)
 */
export class UsageAggregator {
  private readonly records: UsageRecord[] = [];

  ingest(records: UsageRecord[]): void {
    this.records.push(...records);
    // TODO: 인덱스 갱신 (sessionId·projectPath·timestamp 기준)
  }

  buildSnapshot(_now = new Date()): SnapshotPayload {
    // TODO: today / MTD / topProjects / billingWindow 산출
    const empty: AggregatedStats = { bucket: '', totalTokens: 0, byModel: {}, cost: 0, sessionCount: 0 };
    const billingEmpty: BillingWindow = {
      windowStart: _now,
      windowEnd: _now,
      msRemaining: 0,
      pctTimeRemaining: 0,
      tokensInWindow: 0
    };
    return {
      today: empty,
      monthToDate: empty,
      topProjects: [] as ProjectSummary[],
      billingWindow: billingEmpty,
      generatedAt: _now
    };
  }

  reset(): void {
    this.records.length = 0;
  }
}
