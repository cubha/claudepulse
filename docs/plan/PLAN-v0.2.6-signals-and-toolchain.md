# PLAN v0.2.6 — R4 툴체인 + 신규 신호 일괄 (2026-10-06)

## 1. 사용자 요구사항 원문

> P2, P3 미정대상과 R4복구도 026에 한번에 진행할 수 있을거같은데?

> 빼야할항목을 도그푸딩하기위해서 codex 한달만 유료결제를 해보는건어때? 우선 방법좀 리서치해보고 정 안된다싶으면 한달유료결제할 의향잇어

→ 소스 리서치 결과 결제 불요(§2-4). 이어서:

> 1. 너가직접생성  (#10 Codex 서브에이전트 rollout을 Claude가 `codex exec`로 생성)
> 2. 어떤내용인지 알아듣기쉽게설명좀  (#12)

> 보여주면 더 풍부할거같긴한데  (#12 포함 결정)

> /sh-dev-loop --tdd --auto 진행해

기준 리서치: `docs/research/RESEARCH-신규기능후보-2026-09-28.md` §3 후보 #1·#4~#12 (#2·#3은 v0.2.5에서 소진).

## 2. 확정 제약·결정

### 2-1. 공통
- **Phase 0(R4)이 끝나고 기준선이 초록이어야 기능 착수.** 착수 전 기준선(2026-10-06 실측): `verify.sh --full` **PASS=32·FAIL=0**, vitest **65 files / 635 tests**, eslint 경고 0, `vsce ls` **15 files**.
- 브랜치 `feature/silver_sh`에 커밋까지. **push·PR·배포 금지**(feedback_ship_gate) — COMPLETE에서 멈춘다.
- 새 색·새 토큰 금지(§3#5·#6). 기존 `.skill-row`·`.panel-mcp-header`·`.panel-mcp-row`·`panel-flush` 문법 재사용.
- 대시보드 본문 서술 문장 금지(v0.2.4) — 설명은 `title` 툴팁·상태 마커.
- 빈 값과 0을 같게 그리지 않는다(v0.1.55 거짓초록) — 데이터 없음은 숨김 또는 "미상".
- 외부 문자열(훅 command, PR repo, agent role, 에이전트 타입)은 전부 `escapeHtml`.
- i18n 4로캘(ko/en/ja/zh) 동시 추가.
- 카드 수 불변식(`panelDesign.invariants` `class="card ` = **6**곳 — 초안의 "7"은 낡은 수치, acceptance-critic 정정): 신규 섹션은 **`panel-flush`**(카드 아님)로 둔다 → 6 유지.
- 골든 digest(`test/golden/webview-surface.json`)는 의도된 DOM 추가로 재기준선 — 재기준선 사유를 커밋 메시지에 남긴다.

### 2-2. Phase 0 — R4 (단독 커밋, 도구별 1커밋)
- 목표 버전(2026-10-06 npm 최신): eslint **10** + `typescript-eslint` **8** + `@eslint/js` 10 (flat config 전환 — `.eslintrc.cjs` → `eslint.config.mjs`, `--ext` 폐지로 `package.json lint`·`verify.sh` 동시 수정), vitest **5**, esbuild **0.28**, `@vscode/vsce` **4**, `ovsx` **1.2**, `@vscode/test-electron` **3** + `@vscode/test-cli`.
  - 로드맵 원안(eslint10/vitest4/vsce3)보다 vitest·vsce가 한 메이저 더 올라가 있다 — 최신으로 간다.
- **TypeScript 5.x 유지**(§2, TS 6은 사용자 승인 게이트), **chokidar 3 유지**. `npm update` 금지, 명시 설치만.
- vitest 5·vsce 4·ovsx 1.2·test-electron 3은 Node ≥22 → `.github/workflows/publish.yml` `node-version: '20'` → `'22'`. `package.json engines.node`(확장 런타임)는 무관하므로 유지.
- 마이그레이션 가이드는 기억이 아니라 Context7/공식 문서로 확인.
- `vsce ls --no-dependencies` 전후 diff **0** 확인.
- 새 lint 규칙으로 생긴 오류는 고친다. 규칙을 꺼서 초록을 만들면 보고 항목.
- `test:integration` 복구의 "완료" 정의(feedback_gate_wiring_signal): ①실행되어 통과 ②`verify.sh --full`에 배선 ③2f `DEAD_ALLOW` 예외 제거 ④일부러 깨뜨려 RED 관측.

### 2-3. 데이터 사실 (실측 2026-10-06, 최근 30일 jsonl 748개)
- **requestId dedup 안전성**: 스트리밍 다중 엔트리 7,281그룹에서 `diagnostics.cache_miss_reason`·`output_tokens_details.thinking_tokens`·`effort`가 **마지막 엔트리에 항상 존재**(last=any). `byRequestId` last-wins로 손실 없음.
- **#1 캐시 미스**: 5종 — `previous_message_not_found` 782 · `messages_changed` 107 · `model_changed` 98 · `unavailable` 33 · `system_changed` 29. **`cache_missed_input_tokens`는 messages/model/system_changed에만 있다.** previous_message_not_found·unavailable(78%)은 **건수만, 토큰 "미상"** — 0으로 그리지 않는다.
  - 미스 추정 비용 공식: `missedTokens × (writeRate − cache_read) / 1M`. 놓친 토큰이 읽기 대신 쓰기로 과금됐다는 가정. `writeRate` = 그 레코드의 캐시 생성 TTL 구성 가중(5m·1h 토큰 비율), 생성 토큰이 0이면 5m 요율. 가격 미상 모델은 비용 "미상".
- **#4 차단**: `quotaLimits`는 **429(`error:'rate_limit'`) 레코드에만** 있다(32행 전부 status=rejected·five_hour). 차단 **에피소드 = (rateLimitType, resetsAt) 그룹**(재시도 행을 사건으로 세지 않는다). 529·500은 서버 오류 — 차단과 **분리** 집계.
- **#5 thinking**: `usage.output_tokens_details.thinking_tokens` — output에 **포함된 값**. 비중 = thinking/output. 별도 과금 금지.
- **#6 PR**: `type:'pr-link'` `{sessionId, prNumber, prUrl, prRepository, timestamp}`, uuid 없음 → 키 `(prRepository, prNumber, sessionId)`.
- **#9 compaction**: `system/compact_boundary.compactMetadata{trigger:auto|manual, preTokens, postTokens, durationMs}` 30일 93건(manual 72·auto 21).
- **#11 effort**: 유효값은 **`effort`**(high 60k·medium 17k·xhigh 745). `perTurnEffort`는 턴 단위 오버라이드라 34k행이 null — 권위 필드는 `effort`, 없으면 "미상" 버킷.
- **#12 턴·훅**: `system/turn_duration{durationMs,messageCount}` 1,855건(중앙값 93s), `system/stop_hook_summary{hookInfos[{command,durationMs}],hookErrors,preventedContinuation}` 1,851건. 30일 훅 합계 2,560s / 턴 합계 1,235,624s = **0.21%**, 턴당 평균 훅 1.38s / 턴 중앙값 94s = **1.5%**(비율은 중앙값 기준으로 낸다 — 최장 턴 33시간 이상치. 계획 초안의 "2.1%"는 최장값을 합계로 오독한 오계산). 훅 command는 로컬 경로를 포함 → **스크립트 basename만 표시**(마켓 스크린샷 노출 방지), escape 필수. (구현 중 변경 — verify-impl 축A V2: 경로 토큰만 basename으로 줄이고, 경로 아닌 인자는 최대 3개 유지. 실측 훅 4종 중 `node ".../cli.js" hook stop`은 서브커맨드가 훅을 구분하는 유일한 정보라 basename만 남기면 서로 다른 훅이 한 줄로 합쳐진다. 노출 방지 목표(사용자 디렉토리·이름)는 따옴표 인식 토큰화·`VAR=` 제거·경로 basename으로 충족 — `test/unit/signals.test.ts` 'ST8 — 훅 표시명' 표가 명세.)
- **비-assistant 이벤트 중복**: `subagents/*.jsonl`은 부모 이력을 복사 → system 이벤트도 파일 간 중복 가능 → **uuid로 파일 간 dedup**.

### 2-4. Codex (openai/codex `ade17c6`, 2026-10-05 소스)
- `RateLimitSnapshot`: `credits{has_credits,unlimited,balance:string|null}`, `individual_limit{limit,used:string,remaining_percent,resets_at}`, `spend_control_reached:bool|null`, `rate_limit_reached_type` ∈ {rate_limit_reached, workspace_owner_credits_depleted, workspace_member_credits_depleted, workspace_owner_usage_limit_reached, workspace_member_usage_limit_reached}.
- free 표본: `credits:{has_credits:false,unlimited:false,balance:null}` → **비어있음으로 판정해 숨김**. balance는 형식 미확인 → 원문 표시.
- `PlanType` 전체 enum(소스): free, go, plus, pro, prolite, promax, team, self_serve_business_prolite, self_serve_business_usage_based, business, ent26, enterprise_cbp_automation, enterprise_cbp_usage_based, enterprise, edu, edu_plus … → 표시명 맵 + **미지 값은 원문 대문자 폴백**.
- **#8은 §8 불변식5(값별 분기 금지)를 개정한다** — `test/unit/planBadge.test.ts:40`이 잠그고 있다. 사용자가 #8(표시명 보정)을 범위로 승인한 것이 곧 명세 변경이다. 테스트 수정은 **명세 변경에 따른 정당한 수정**으로 COMPLETE 보고에 명시한다. 새 불변식: "표시명은 단일 함수 `codexPlanLabel` 1곳에서만 결정, 미지 값은 원문 대문자".
- #10: `multi_agent` Stable·default_enabled → free에서 서브에이전트 rollout 생성 가능. rollout 위치(WSL `~/.codex` vs Windows `%USERPROFILE%\.codex`)를 생성 후 확인. 픽스처는 **sanitize**(프롬프트·cwd·id) 후 `test/fixtures/codex`에. 크로스파일 dedup은 **부모(메인) 원본 우선**(v0.2.5 Claude와 동일 — 사본이 이기면 부모 턴이 서브에이전트로 재분류).

## 3. SubTask (전량 [S] — 대부분 `types/index.ts`·`JsonlParser.ts`·`UsageAggregator.ts`·`panelView.ts`·`i18n.ts`를 공유)

### Phase 0 — R4
| ID | 태그 | 내용 | 파일 |
|---|---|---|---|
| ST0a | — | ESLint 10 + typescript-eslint 8 flat config | `eslint.config.mjs`(신규), `.eslintrc.cjs`(삭제), `package.json`, `verify.sh`, `.vscodeignore` |
| ST0b | — | vitest 1 → 5 | `package.json`, `vitest.config.ts`→`.mts`, `@types/node` 20→22(vitest 5 peer) |
| ST0c | — | esbuild 0.20 → 0.28 | `package.json`, `esbuild.config.mjs` |
| ST0d | — | vsce 2 → 4 · ovsx 0.9 → 1.2 · CI Node 22 | `package.json`, `.github/workflows/publish.yml` |
| ST0e | — | `test:integration` 복구 + verify 배선 + 2f 예외 제거 + 의도적 RED | `.vscode-test.mjs`(신규), `package.json`, `verify.sh`, `test/integration/*` |

### Phase 1 — 데이터 채널
| ID | 태그 | 내용 | 파일 |
|---|---|---|---|
| ST1 | [TDD] | 파서 이벤트 채널: 파일별 **append** 이벤트 목록(turn_duration·stop_hook_summary·compact_boundary·pr-link·API 오류(429 quotaLimits/5xx)) + 파일 간 uuid dedup(`mergeEventsAcrossFiles`). `SessionRecord`에 `cacheMiss{reason,missedTokens|null}`·`thinkingTokens`·`effort` 추가 | `src/services/JsonlParser.ts`, `src/types/index.ts`, `test/unit/JsonlParser.events.test.ts` |

### Phase 2 — Claude 신호 집계(순수 함수)
| ID | 태그 | 내용 | 파일 |
|---|---|---|---|
| ST2 | [TDD] | #1 캐시 미스 원인 분해(원인별 건수·토큰(미상 구분)·추정 비용) — ~~today/24h/7d~~ **최근 7일 단일 창**(구현 중 축소: 하루 미스 ≈12건이라 today/24h는 표본이 거의 없다 — VERIFY-SPEC ST2) | `src/services/signals/cacheMiss.ts`, test |
| ST3 | [TDD] | #5 thinking 비중(오늘) | `src/services/UsageAggregator.ts`, test |
| ST4 | [TDD] | #4 차단 에피소드(유형·resetsAt·최초/최종 시각·재시도 행 수·overage 사유) + 5xx 서버 오류 수 | `src/services/signals/rateLimitBlocks.ts`, test |
| ST5 | [TDD] | #6 PR 단위 비용(pr-link ↔ 세션 레코드 정확 조인, 여러 PR에 걸친 세션은 `shared` 표시·합계 이중계산 금지) | `src/services/signals/prCost.ts`, test |
| ST6 | [TDD] | #9 compaction(현재 컨텍스트 세션의 압축 횟수·마지막 pre→post·trigger) | `src/services/signals/compaction.ts`, test |
| ST7 | [TDD] | #11 effort별 비용(effort 기준·미상 버킷·share 분모 = 스코프 총비용) | `src/services/UsageAggregator.ts`(computeAttribution), test |
| ST8 | [TDD] | #12 턴 지연(건수·중앙값·p90·최장·7일 일별 중앙값) + 훅 오버헤드(스크립트 basename별 누적·평균·오류 수, 턴 대비 비율) | `src/services/signals/turnHooks.ts`, test |

### Phase 3 — Codex
| ID | 태그 | 내용 | 파일 |
|---|---|---|---|
| ST9 | [TDD] | #7 Codex 크레딧·지출통제·차단 사유 파싱 + 의미 있는 값만 노출 판정(`hasMeaningfulCodexLimits`) | `src/sources/codex/codexRollout.ts`, `CodexSource.ts`, `src/types/index.ts`, test |
| ST10 | [TDD] | #8 `codexPlanLabel` 단일 함수 + 4개 렌더 지점 경유 | `src/webview/planBadge.ts`(또는 신규 `codexPlan.ts`), `sidebarView.ts`, `panelView.ts`, test |
| ST11 | [TDD] | #10 Codex 서브에이전트: 실 rollout 생성(`codex exec`)·sanitize 픽스처 → `session_meta.source` 서브에이전트 감지(`isSidechain`·`agentId`·`attributionAgent=agent_role`) + 메인 우선 dedup + capability on | `src/sources/codex/*`, `src/sources/AgentSource.ts`, `test/fixtures/codex/*`, test |

### Phase 4 — 배선·UI·릴리스
| ID | 태그 | 내용 | 파일 |
|---|---|---|---|
| ST12 | — | extension 배선(이벤트 수집 → 신호 모듈 → `UsageSummary` 신규 필드) + contracts | `src/extension.ts`, `src/types/index.ts`, `src/messaging/contracts.ts` |
| ST13 | (UI) | 사이드바: thinking 칩 · 최근 차단 1줄 · compaction 보조줄 · Codex 크레딧/지출통제/차단사유 | `src/webview/sidebarView.ts`, `i18n.ts` |
| ST14 | (UI) | 대시보드: 캐시 카드에 미스 원인 · 차단 이력(flush) · PR 비용(Git ROI 영역) · effort별(귀속 카드) · 턴/훅(flush) · Codex 서브에이전트(귀속 카드 Codex 노출) | `src/webview/panelView.ts`, `i18n.ts`, `docs/demo/mock-data.js`, golden |
| ST15 | — | 릴리스 메타: version 0.2.6, CHANGELOG, README What's New | `package.json`, `CHANGELOG.md`, `README.md` |

## 4. UI 설계 (Ground Truth `src/webview/styles.css`, 분기 A — 기존 화면 내 추가, `/frontend-design` 생략)
- 사이드바(단일 숫자): thinking 비중은 기존 모델/캐시 칩 줄에 칩 1개(Codex reasoning 칩과 대칭). 차단은 데이터 있을 때만 칩 1개(`.sb-chip--warn`, "⛔ 5h 차단 · N일 전"), compaction은 컨텍스트 게이지 칩 줄에 칩 1개(현재 세션 압축 있을 때만). (구현 중 변경: 초안의 "1줄/보조줄" → 칩 — 기존 칩 문법 재사용으로 새 클래스 0, 좁은 폭에서 줄 수 절약)
- 대시보드(목록·분해): 신규 섹션은 `panel-flush` + `.panel-chart-header`, 행은 `.skill-row` 3열(이름·바·값) 또는 `.panel-mcp-row` 2열. 상태는 `statusMarker.ts` 마커 + 툴팁.
- 빈 상태: 데이터 0건 섹션은 숨김(차단 이력 없음 = 섹션 숨김, 훅 0개 = 훅 목록 숨김). 예외: 귀속 카드 안 effort 목록은 숨기지 않고 `no_effort_data`("effort 기록 없음")를 표시한다 — 카드 안 하위 목록이라 숨기면 `collecting_data` 자리표시자가 남아 v0.1.40식 "수집중" 고착처럼 보인다(구현 중 변경, verify-impl 축A V11).
- 검증: 실빌드 + fake postMessage + Playwright 2폭×2로캘(feedback_webview_ui_verification).

## 5. 라우팅
전제: git ✅ / verify.sh ✅ (`--ts-only` 지원) / 독립 [P] 후보 4개 미만(공유 파일 다수) → **전량 [S]**.

## 6. 범위 밖
- MCP 비용 귀속(필드 의미 미확인), 모델별 주간 한도(비공개 API §3#3), OTel 수신, Cursor.
- 차단 이력의 추세 차트 마커(폴링 히스토리 창이 짧아 대부분 안 보임) — 목록으로 대체.
