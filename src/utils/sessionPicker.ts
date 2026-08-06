import * as path from 'node:path';
import type { ContextSessionSummary } from '../types';

/**
 * 컨텍스트 사용률 세션 선택기(QuickPick) 아이템 — VS Code API 비의존 순수 계산.
 * maxWindow/ratio는 UsageAggregator.contextSessions가 sessionContext와 동일한 분모 3단 계단으로
 * 이미 계산해 넣은 값을 그대로 쓴다(여기서 재계산하지 않음) — 목록에 보이는 %와 선택 후 게이지 %가
 * 서로 달라 보이는 것을 방지한다.
 */
export interface SessionPickerItem {
  sessionId: string;
  repoName: string;
  cwd: string;
  branch: string;
  model: string;
  contextTokens: number;
  maxWindow: number;
  ratio: number;
  lastActivity: string;
  ageMs: number;
  badge: 'auto' | 'pinned' | null;
  isStale: boolean;
}

export function buildSessionPickerItems(
  sessions: ContextSessionSummary[],
  pinnedSessionId: string | null,
  nowMs: number,
  staleThresholdMs: number
): SessionPickerItem[] {
  const sorted = [...sessions].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  const autoSessionId = !pinnedSessionId && sorted.length > 0 ? sorted[0].sessionId : null;

  return sorted.map(s => {
    const ageMs = nowMs - new Date(s.lastActivity).getTime();
    const badge: SessionPickerItem['badge'] = pinnedSessionId
      ? (s.sessionId === pinnedSessionId ? 'pinned' : null)
      : (s.sessionId === autoSessionId ? 'auto' : null);
    return {
      sessionId: s.sessionId,
      repoName: path.basename(s.cwd),
      cwd: s.cwd,
      branch: s.branch,
      model: s.model,
      contextTokens: s.contextTokens,
      maxWindow: s.maxWindow,
      ratio: s.ratio,
      lastActivity: s.lastActivity,
      ageMs,
      badge,
      isStale: ageMs > staleThresholdMs,
    };
  });
}
