// 대시보드 헤더 플랜 배지의 단일 소유자 (v0.2.3 ⑩).
//
// 이전에는 쓰기 지점 4곳(updatePanel·updateCodexBandSection·applyProviderVisibility·PushLang)이
// 각자 "값이 있을 때만" 쓰고 아무도 지우지 않아, **마지막에 도착한 쪽이 이겼다**. Codex 모드로
// 대시보드를 열면 체인으로 늦게 오는 GetRateLimit가 Codex 배지를 Claude 티어로 덮었고,
// Codex→Claude 전환 후엔 Codex 배지가 다음 폴링까지 남았다. 무엇을 보일지는 여기서만 정하고,
// 호출측은 결과를 **무조건** 쓴다(빈 문자열 = 지움).
import type { AgentProvider, CodexRateLimitSnapshot, RateLimitSnapshot } from '../types';
import { fmtPlanTier } from './webviewShared';
import { codexPlanLabel } from './codexPlan';

export function panelPlanBadgeText(
  provider: AgentProvider,
  claude: Pick<RateLimitSnapshot, 'plan'> | null,
  codex: Pick<CodexRateLimitSnapshot, 'planType'> | null,
): string {
  if (provider === 'codex') {
    // 표시명은 codexPlanLabel 단일 소유(v0.2.6 ST10 — §8 불변식5 개정, 모르는 값은 원문 대문자).
    return codexPlanLabel(codex?.planType);
  }
  const plan = claude?.plan;
  return plan?.subscriptionType ? fmtPlanTier(plan.subscriptionType, plan.rateLimitTier) : '';
}
