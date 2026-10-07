// Codex 플랜 표시명의 단일 소유자 (v0.2.6 ST10).
//
// §8 불변식5("planType은 원본 대문자화만, 값별 분기 금지")를 **개정**한다. 그 규칙은 값 집합을 몰라서
// 추측 분기를 막으려던 것이었고, 이제 집합을 소스로 안다 — openai/codex ade17c6
// `protocol/src/account.rs` PlanType(serde lowercase). 원문 대문자는 `PROLITE`·`ENT26`처럼 사람이 못
// 읽는 이름을 그대로 보여줬다. 새 불변식: 표시명은 **여기서만** 정하고, 모르는 값은 원문 대문자로 폴백한다
// (미래 플랜·`unknown`이 빈칸이 되지 않게). 렌더 지점은 전부 이 함수를 거친다(codexPlan.test.ts가 잠근다).
const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  prolite: 'Pro Lite',
  promax: 'Pro Max',
  team: 'Team',
  self_serve_business_prolite: 'Business Pro Lite',
  self_serve_business_usage_based: 'Business (Usage-based)',
  business: 'Business',
  ent26: 'Enterprise',
  enterprise_cbp_automation: 'Enterprise (Automation)',
  enterprise_cbp_usage_based: 'Enterprise (Usage-based)',
  enterprise: 'Enterprise',
  edu: 'Edu',
  edu_plus: 'Edu Plus',
  edu_pro: 'Edu Pro',
};

export function codexPlanLabel(raw: string | null | undefined): string {
  if (!raw) return '';
  const key = raw.toLowerCase();
  // 외부 문자열 — 'constructor' 같은 상속 프로퍼티가 표시명으로 잡히지 않게 자기 키만 본다.
  return Object.prototype.hasOwnProperty.call(PLAN_LABELS, key) ? PLAN_LABELS[key] : raw.toUpperCase();
}
