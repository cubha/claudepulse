/** LiteLLM 기반 Claude 모델 가격 스냅샷 (USD per 1M tokens).
 * 갱신 시 pricing/litellm-snapshot.json 과 동시 수정 후 CHANGELOG 기록. */
export interface ModelPrice {
  input: number;
  /** 5m TTL 캐시 생성 요율 (input × 1.25, Anthropic 표준) */
  cache_creation: number;
  /** 1h TTL 캐시 생성 요율 (input × 2.0, Anthropic 표준) */
  cache_creation_1h: number;
  output: number;
  cache_read: number;
}

/**
 * 웹검색 서버툴 과금 — $10 / 1,000 requests.
 *
 * 추정이 아니라 실측이다: 벤더 오라클(cost-state)에서 토큰 비용을 뺀 초과분이 요청 2·28·3건에서
 * 각각 $0.0200·$0.2800·$0.0300으로 **센트까지 일치**했다(test/fixtures/vendor-cost-oracle.json).
 * 이걸 빼면 웹검색을 쓴 세션이 가격표와 무관하게 오라클 밴드를 벗어나 게이트가 죽는다.
 */
export const WEB_SEARCH_USD_PER_REQUEST = 0.01;

export const PRICING: Record<string, ModelPrice> = {
  // 최상위 티어 (Opus 위 신규 모델)
  'claude-fable-5':    { input: 10.0,  output: 50.0, cache_creation: 12.5,  cache_creation_1h: 20.0, cache_read: 1.0  },
  // Claude 5 세대 — 벤더 오라클(cost-state.modelUsage[].costUSD) 역산으로 확정.
  // opus-5는 21/21 샘플(=[1m] 변종 포함), sonnet-5는 7/7 샘플에서 이탈 0.0%.
  // ⚠️ Sonnet 5는 Sonnet 4.x($3/$15)보다 **싸다** — 4.x 값을 관성으로 복사하면 50% 과대계상된다.
  // ⚠️ `claude-opus-5[1m]`(1M 컨텍스트 변종)은 프리미엄이 붙지 않는다(11/11 실측). 접미사는
  //    아래 최장접두사 매칭이 흡수하므로 별도 키가 필요 없다.
  'claude-opus-5':     { input:  5.0,  output: 25.0, cache_creation:  6.25, cache_creation_1h: 10.0, cache_read: 0.5  },
  'claude-sonnet-5':   { input:  2.0,  output: 10.0, cache_creation:  2.5,  cache_creation_1h:  4.0, cache_read: 0.2  },
  // Opus 4.5+ (현행 — $5/$25)
  'claude-opus-4-8':   { input:  5.0,  output: 25.0, cache_creation:  6.25, cache_creation_1h: 10.0, cache_read: 0.5  },
  'claude-opus-4-7':   { input:  5.0,  output: 25.0, cache_creation:  6.25, cache_creation_1h: 10.0, cache_read: 0.5  },
  'claude-opus-4-6':   { input:  5.0,  output: 25.0, cache_creation:  6.25, cache_creation_1h: 10.0, cache_read: 0.5  },
  'claude-opus-4-5':   { input:  5.0,  output: 25.0, cache_creation:  6.25, cache_creation_1h: 10.0, cache_read: 0.5  },
  // Opus 4.0/4.1 (레거시 deprecated — $15/$75)
  'claude-opus-4-1':   { input: 15.0,  output: 75.0, cache_creation: 18.75, cache_creation_1h: 30.0, cache_read: 1.5  },
  'claude-opus-4':     { input: 15.0,  output: 75.0, cache_creation: 18.75, cache_creation_1h: 30.0, cache_read: 1.5  },
  // Sonnet
  'claude-sonnet-4-6': { input:  3.0,  output: 15.0, cache_creation:  3.75, cache_creation_1h:  6.0, cache_read: 0.3  },
  'claude-sonnet-4-5': { input:  3.0,  output: 15.0, cache_creation:  3.75, cache_creation_1h:  6.0, cache_read: 0.3  },
  'claude-sonnet-4':   { input:  3.0,  output: 15.0, cache_creation:  3.75, cache_creation_1h:  6.0, cache_read: 0.3  },
  // Haiku
  'claude-haiku-4-5':  { input:  1.0,  output:  5.0, cache_creation:  1.25, cache_creation_1h:  2.0, cache_read: 0.1  },
};

/** 가격 출처 — 'family'는 근사치다. UI가 근사임을 말할 수 있도록 계산과 분리해 노출한다. */
export type PricingSource = 'exact' | 'family' | 'none';

export interface ResolvedPricing {
  price: ModelPrice | undefined;
  source: PricingSource;
}

/** 'claude-opus-5-20260101' → 'claude-opus'. 벤더·패밀리까지만 남기고 버전 세그먼트를 버린다. */
function familyOf(model: string): string {
  return model.toLowerCase().split('-').slice(0, 2).join('-');
}

/** 'claude-opus-4-8' → [4, 8]. 버전 세그먼트가 없으면 []. */
function versionOf(key: string): number[] {
  const segs = key.split('-').slice(2);
  const nums: number[] = [];
  for (const seg of segs) {
    const n = Number(seg);
    if (!Number.isFinite(n)) break;
    nums.push(n);
  }
  return nums;
}

function newerThan(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -1, y = b[i] ?? -1;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * 모델명 → 가격 + 출처.
 * 1) 정확 매칭 → 2) 가장 긴 접두사 키(`claude-opus-4-1` > `claude-opus-4`, `claude-opus-5[1m]` → `claude-opus-5`)
 * → 3) 같은 패밀리의 **최신 버전** 키로 근사(source='family').
 *
 * ⚠️ 3)의 패밀리는 **첫 2세그먼트**다. v0.1.55 이전에는 3세그먼트라 `claude-opus-5`의 패밀리가
 * `claude-opus-5` 자신이 되어 이 폴백이 **구조적으로 절대 발화하지 않았다** — 신모델이 나오면
 * 근사 과금이 아니라 조용한 $0이 됐고, 실제로 opus-5·sonnet-5 사용자 비용이 전부 0이었다.
 *
 * ⚠️ 패밀리 후보가 여럿이면 선언 순서가 아니라 **버전 내림차순**으로 고른다. 순서 의존이면
 * 표에 키를 추가하는 위치만으로 과금이 바뀐다(sonnet은 세대가 올라가며 싸졌으므로 실제 위험).
 */
export function resolvePricing(model: string): ResolvedPricing {
  const exact = PRICING[model];
  if (exact) return { price: exact, source: 'exact' };

  const lm = model.toLowerCase();

  let best: string | undefined;
  for (const key of Object.keys(PRICING)) {
    if (lm.startsWith(key) && (best === undefined || key.length > best.length)) {
      best = key;
    }
  }
  if (best !== undefined) return { price: PRICING[best], source: 'exact' };

  const family = familyOf(lm);
  let latest: string | undefined;
  for (const key of Object.keys(PRICING)) {
    if (familyOf(key) !== family) continue;
    if (latest === undefined || newerThan(versionOf(key), versionOf(latest))) latest = key;
  }
  if (latest !== undefined) return { price: PRICING[latest], source: 'family' };

  return { price: undefined, source: 'none' };
}

/** 하위호환 래퍼 — 출처가 필요 없는 호출부용. */
export function findPricing(model: string): ModelPrice | undefined {
  return resolvePricing(model).price;
}

/** calcCost 입력 토큰 셋 (JournalUsage와 구조 호환). */
export interface CostTokens {
  input_tokens: number;
  output_tokens: number;
  /** 5m TTL 캐시 생성 토큰 (요율 input × 1.25) */
  cache_creation_5m_input_tokens: number;
  /** 1h TTL 캐시 생성 토큰 (요율 input × 2.0) */
  cache_creation_1h_input_tokens: number;
  cache_read_input_tokens: number;
  /** usage.service_tier — 'batch' 시 전체 −50% */
  serviceTier?: string;
  /** usage.server_tool_use.web_search_requests — 토큰과 무관하게 건당 과금된다. */
  webSearchRequests?: number;
}

/**
 * 단일 비용 진실원(single source of truth).
 * 캐시 생성을 5m(1.25×)·1h(2.0×) TTL로 분리 과금 — 1h를 5m 요율로 과금하던 과소계산 버그 수정.
 * service_tier=batch 시 전체 비용 −50%.
 */
export function calcCost(model: string, t: CostTokens): number {
  const p = findPricing(model);
  if (!p) return 0;

  const cost =
    (t.input_tokens / 1_000_000) * p.input +
    (t.output_tokens / 1_000_000) * p.output +
    (t.cache_creation_5m_input_tokens / 1_000_000) * p.cache_creation +
    (t.cache_creation_1h_input_tokens / 1_000_000) * p.cache_creation_1h +
    (t.cache_read_input_tokens / 1_000_000) * p.cache_read;

  // service_tier=batch → 전체 −50% (priority/standard/미지정은 정가)
  const tierMultiplier = t.serviceTier === 'batch' ? 0.5 : 1.0;
  // 웹검색은 토큰이 아니라 요청 건당 과금이라 batch 할인 적용 여부가 오라클로 확인되지 않았다
  // (batch 샘플이 없다). 확인 전까지 할인 밖에 둔다 — 과소계상보다 과대계상이 덜 위험하다.
  return cost * tierMultiplier + (t.webSearchRequests ?? 0) * WEB_SEARCH_USD_PER_REQUEST;
}
