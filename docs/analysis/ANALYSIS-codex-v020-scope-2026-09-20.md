# v0.2.0 Codex 통합 범위 감사 — v0.2.1 후보 발굴

> 분석일: 2026-09-20
> 프로젝트: AgentVitals (claudepulse) — v0.2.0 "Codex 사용량 추적" 통합 범위
> 분석 관점: 요구사항 대조(verify-impl)가 아니라 **브라운필드 기술부채·일관성·엣지케이스 감사**. v0.2.1 패치에 묶을 후보 발굴이 목적.
> 방법: `Explore`(구조 탐색) + `code-reviewer`(품질 리뷰) 2개 에이전트를 Codex 관련 파일 집합에 스코핑해 병렬 실행, read-only.
> 대상: `src/sources/codex/**`, `src/webview/{panelView,sidebarView,webviewShared}.ts`, `src/webview/styles.css`(`.provider-codex`), `src/messaging/contracts.ts`, `src/types/index.ts`, 관련 테스트·데모 mock. 이번 세션에서 추가한(미커밋) Codex 모델별 색상 구분 변경분 포함.

---

## 0. 전제 — 미커밋 변경분

작업트리에 4개 파일이 unstaged 상태(HEAD=`34dc05a`, v0.2.0 + vscodeignore 수정 이후):
`src/webview/{panelView,sidebarView,webviewShared}.ts`, `src/webview/styles.css`.

내용: Codex 모델 도넛/칩이 전부 slate(회색)로 뭉개지던 것을 고쳐, `modelKind()`/`modelShortName()`에 `provider` 파라미터를 추가하고 `CODEX_MODEL_FAMILY_SLOTS`(family→기존 액센트 슬롯 등록표, 신규 토큰 없음)를 신설. `.provider-codex.theme-dark/light`에 `--c-fable`/`--c-haiku` 계열 재정의 추가. `verify.sh --full`(D-3/D-4/D-5 포함)·vitest 전부 PASS 확인됨(이 상태 기준으로 아래 감사 수행).

---

## 1. 🔴 Critical — billing/성능 직결

### 1-1. dedup이 파일 단위로만 걸려 크로스파일 중복을 못 잡는다
`CodexSource.ts` `rolloutLinesToSessionRecords`의 `seen` Set이 **함수 로컬**이고, `loadAllSessionRecords`는 파일마다 이 함수를 개별 호출해 결과를 concat만 한다. 즉 dedup은 "같은 파일 안"에서만 유효하다.

그런데 91× 인플레의 실제 원인(`thread_spawn` 서브에이전트가 부모 이력을 재생)은 서브에이전트가 **자기 rollout 파일을 따로 가지므로** 발생한다 — `listRolloutFiles`는 이런 파일을 구분 없이 전부 스캔한다. 부모 파일의 `response_id`가 서브에이전트 자신의 파일에 재생되면 양쪽이 **각각 별도 `seen` Set**으로 처리돼 둘 다 count된다. `UsageAggregator.ts`는 "allRecords가 이미 dedup됐다"는 전제로 재검증하지 않아 하류에서도 안 걸러진다.

**테스트 갭**: `CodexSource.test.ts`에 "2개 이상 파일 + 동일 response_id" 케이스 없음(다중 파일 테스트는 `loadLatestRateLimit`의 latest-wins뿐).
**수정 방향**: `loadAllSessionRecords`가 전체 파일에 걸친 공유 `seen` Set(또는 messageId 기준 글로벌 dedup 패스)을 갖도록.
**심각도가 높은 이유**: 이건 CLAUDE.md §3#1(message.id dedup 필수 — Claude 스트리밍 재기록 시 billing 불일치 방지)와 정확히 같은 클래스의 문제가 Codex 쪽에서 부분적으로만 막혀 있는 것이다.

### 1-2. 매 리프레시마다 전체 세션 히스토리를 통째로 2회 재읽음 — 증분 파싱 없음
`loadAllSessionRecords`와 `loadLatestRateLimit`이 각각 독립적으로 전체 rollout 파일을 풀 로드한다. `extension.ts`의 `doRefreshCodexUsage`가 이 둘을 연달아 호출하고, `usageRefreshIntervalMs`(기본 15초) 스로틀로 세션 활성 중 계속 트리거된다 — **15초마다 전 히스토리 2패스**.

Claude 경로(`JsonlParser.ts`)는 mtime+offset 캐시로 변경분만 스트리밍 파싱하는데 Codex 경로엔 이 메커니즘이 없다. 히스토리가 쌓일수록(GB급 세션 파일 — 프로젝트가 이미 알려진 리스크로 문서화한 시나리오) 매 refresh 비용이 선형 증가한다.

---

## 2. 🟡 Important — 정합성·무성 실패

| # | 항목 | 위치 | 내용 |
|---|---|---|---|
| 2-1 | 사이드바 plan 표기 대소문자 불일치 | `sidebarView.ts` 헤더배지(`toUpperCase()`, "FREE") vs footer(`buildFooterHtml`, Title Case "Free") | 같은 `planType` 값이 같은 화면 안에서 두 표기로 렌더. panelView.ts는 양쪽 다 uppercase로 일관 — **사이드바만** 이탈. Codex 전용 버그. |
| 2-2 | 파일 읽기 실패가 완전히 무성 | `CodexSource.ts` 2곳의 `catch { continue; }` | 손상된 jsonl·권한 오류·파일회전 race 시 로그 없이 해당 파일 사용량이 소실. v0.1.55가 다룬 "무성 $0" 부류와 동일 패턴. |
| 2-3 | 모델 패밀리 매칭 전략이 두 소비처에서 다름 | `webviewShared.ts`(첫 매치, `CODEX_MODEL_FAMILY_SLOTS`) vs `codexPricing.ts`(longest-prefix, 명시적 채택) | 겹치는 모델명에 대해 "어느 패밀리인가"를 다른 규칙으로 답할 수 있음. 신규 패밀리 등록 시 예측 불가 소지. |
| 2-4 | `modelShortName`이 `codex-mini-latest`를 "Latest"로 표시 | `webviewShared.ts` codex 분기, `model.split('-').pop()` | `['codex','mini','latest']` → 마지막 세그먼트 "latest"가 그대로 라벨. 실재 가격표 모델(`codexPricing.ts`)이라 실사용 경로 도달 가능. |
| 2-5 | `codexRollout.ts` 파일 헤더 "절대 규칙"이 실제 구현과 모순 | 파일 상단 주석(누적쌍 비교 우선 서술) vs `tokenUsageRecordDedupKey`(실제는 response_id 1순위, 누적쌍은 폴백) | billing-critical 알고리즘의 module-level 계약 문서가 자기모순 — 유지보수 혼란 소지. |
| 2-6 | `.provider-codex` 팔레트가 `DESIGN-TOKENS.md`에 미기재 | `styles.css:183-242` vs `docs/design/DESIGN-TOKENS.md`(매치 0건) | CLAUDE.md §9 "신규 토큰 추가 시 DESIGN-TOKENS.md 동시 기재" 절차 미이행. D-5 게이트는 다크/라이트 페어만 검사, 문서 누락은 못 잡음. |
| 2-7 | Codex 모델 색상 분기 신규 코드에 유닛테스트 0건 | `modelKind`/`modelShortName`/`CODEX_MODEL_FAMILY_SLOTS` | `terra`→fable 배정, 미등록 패밀리→slate 폴백 분기가 골든/헤드리스 캡처 외 회귀보호 없음. |

---

## 3. 참고 — 비대칭이지만 의도된 것 / 문서 드리프트 (버그 아님)

- **panelView.ts에 Codex 3단 빈 상태 분기 없음** — PLAN §7 A-V6에서 "패널은 사이드바를 거쳐야만 진입 가능한 구조라 갭이 아님"으로 이미 종결된 의도된 설계.
- **`AgentSourceCapabilities`(rateLimit/usdCost/skillAttribution 등) 선언만 되고 런타임에서 안 읽힘** — 실제 UI 숨김은 `buildCodexSidebarHtml`의 하드코딩으로 이뤄짐. 죽은 설정 필드. 주석은 "CODEX_CAPABILITIES=false"가 소비되는 것처럼 적었으나 실제로는 그 값 자체를 안 씀. v0.2.1에서 실제 와이어링하거나 주석만 정정.
- **`types/index.ts`의 "codex-later" forward-contract 주석이 stale** — "CommitAttributor에 provider 필터 추가 예정"이라 적혀 있으나, 실제 채택된 결정은 회고(retro)를 Claude 전용으로 완전 분리 유지하는 쪽. `CommitAttributor.attribute()`는 애초에 Codex 레코드를 받지 않아 오조인 위험 자체가 없음(버그 아님) — 주석만 실제 결정과 어긋남.
- **버킷 구조**: `RateLimitSnapshot`이 `primary`/`secondary` 2필드로 하드고정 — 0/1/2버킷은 테스트로 전부 커버됨. 단 구조상 **3번째 윈도가 API에 추가되면 조용히 버려진다** — 현재 실측 근거상 2버킷이 맞지만, 이 gap 자체는 문서화돼 있지 않음(코드 변경보다 주석 가치).
- **i18n**: Codex 관련 키 전부 ko/en/ja/zh 4개 언어 빠짐없이 채워짐. 다만 자동 완결성 게이트가 없어 향후 키 추가 시 누락을 못 잡음 — 인프라 후보.
- **reasoningTokens/modelContextWindow**: sidebarView.ts·panelView.ts 양쪽 게이팅 조건까지 일치 — 이상 없음.
- **확인 못한 것**: 골든 하네스가 색상값 자체를 검증하는지(구조만 보는지) 미확인 / design-lint "error 9·warn 29" 상세 미확인(Codex 데모 HTML 관련 가능성) / 실 VS Code 2 provider×3 상태 스크린샷은 이번에도 미시도.

---

## 4. v0.2.1 우선순위 제안

| 순위 | 항목 | 근거 |
|---|---|---|
| 1 | **1-1 크로스파일 dedup** | billing 정확도 직격, 서브에이전트 사용자에게 실사용 영향 |
| 2 | **1-2 증분 파싱 부재** | 장기 사용자 체감 성능 직격, 히스토리 누적할수록 악화 |
| 3 | 2-2 무성 파일읽기 실패 로깅 | 1·2 고치는 김에 로깅만 추가해도 해소 |
| 4 | 2-1 사이드바 plan 대소문자 | 1줄 CSS/포맷 수정, 육안으로도 바로 보이는 결함 |
| 5 | 2-4 `codex-mini-latest`→"Latest" 라벨 버그 | modelShortName 분기 보정 |
| 6 | 2-3 매칭 전략 통일 | 신규 모델 등록 예측가능성 |
| 7 | 2-5 헤더 주석 정정 | 문서 정확성, 코드 변경 없음 |
| 8 | 2-6 DESIGN-TOKENS.md 기재 | 절차 이행, 코드 변경 없음 |
| 9 | 2-7 신규 색상 분기 유닛테스트 | 회귀보호 강화 |

1~3은 코드 변경(테스트 포함)이 필요한 실질 수정, 4~5는 작은 버그 수정, 6~9는 문서/테스트 정리로 빠르게 처리 가능.

---

> 이 보고서는 `/analyze` 스킬로 스코핑 실행되었습니다(전체 프로젝트가 아닌 v0.2.0 Codex 통합 범위 한정, 외부 리서치 생략).
