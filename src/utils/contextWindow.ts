/**
 * 모델별 최대 컨텍스트 윈도(토큰) 조회 — pricing.ts의 findPricing과 동일한
 * longest-prefix 매칭 패턴을 재사용한다(단일 소스가 아닌 이유: 가격표와 컨텍스트창 크기는
 * 독립적으로 갱신되는 별개 사실이라 분리 유지).
 *
 * jsonl에는 1M 베타 윈도 활성 여부가 기록되지 않아 계정별로 정확히 판별할 수 없으므로,
 * 최상위 플래그십(fable-5)만 표준 1M으로 가정하고 나머지는 보수적 기본값(200K)을 쓴다.
 * UI에서는 이 근사성을 "≈" 라벨로 고지한다(SubTask 4-2).
 */
const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-fable-5':    1_000_000,
  'claude-opus-4-8':     200_000,
  'claude-opus-4-7':     200_000,
  'claude-opus-4-6':     200_000,
  'claude-opus-4-5':     200_000,
  'claude-opus-4-1':     200_000,
  'claude-opus-4':       200_000,
  'claude-sonnet-4-6':   200_000,
  'claude-sonnet-4-5':   200_000,
  'claude-sonnet-4':     200_000,
  'claude-haiku-4-5':    200_000,
};

export const DEFAULT_CONTEXT_WINDOW = 200_000;

/** 모델명 → 최대 컨텍스트 윈도. 미지의 모델은 보수적 기본값(200K)으로 폴백. */
export function findContextWindow(model: string): number {
  // hasOwnProperty 가드 — model이 'constructor' 등 상속 프로퍼티명이면 직접 인덱싱이
  // 상속 함수를 반환해 number 계약이 깨지고 하류 나눗셈이 NaN이 된다.
  if (Object.prototype.hasOwnProperty.call(CONTEXT_WINDOWS, model)) return CONTEXT_WINDOWS[model];
  const lm = model.toLowerCase();

  let best: string | undefined;
  for (const key of Object.keys(CONTEXT_WINDOWS)) {
    if (lm.startsWith(key) && (best === undefined || key.length > best.length)) {
      best = key;
    }
  }
  if (best !== undefined) return CONTEXT_WINDOWS[best];

  const family = lm.split('-').slice(0, 3).join('-');
  for (const key of Object.keys(CONTEXT_WINDOWS)) {
    if (key.startsWith(family)) return CONTEXT_WINDOWS[key];
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/** contextTokens(현재 턴 시점 컨텍스트 점유량) / 모델 최대 윈도, 0.0~1.0로 클램프. */
export function calcContextUsageRatio(contextTokens: number, model: string): number {
  const maxWindow = findContextWindow(model);
  if (maxWindow <= 0) return 0;
  return Math.min(1, Math.max(0, contextTokens / maxWindow));
}
