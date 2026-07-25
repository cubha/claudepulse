# v0.1.47+ 구현 페이즈 가이드 — CC 2026 H2 신규 기능 트랙

> 작성일: 2026-07-25
> 근거: `docs/research/` 없음(WebSearch 리서치는 memory `reference_cc_2026h2_feature_research.md`에 원천 보존) + Claude Code CLI v2.1.190~218 체인지로그
> 계획 수립: `/plan` → planner 에이전트 위임(fable), 메인 세션 검수 완료
> 상태: 🔜 계획 확정. **구현 미착수**. 배포는 ship 게이트(명시 명령 대기)
> 버전 배정: 유동적 — 아래 각 항목은 "착수 순서"이며 버전 1:1 아님. 실제 작업량을 보고 인접 항목끼리 번들 가능(순서 건너뛰기 금지)

---

## 0. 한 줄 요약

공식 Claude Code CLI 2026 H2 업데이트(v2.1.190~218) 리서치에서 발견한 4개 기능 후보를 도입한다: **①소모율 카드 버그 수정 → ②attribution 강화+기간 토글 → ③모델별(Fable5) 한도 분리 게이지(검증 게이트 조건부) → ④세션 컨텍스트 게이지**. 판정 근거·버전 배정 원칙은 memory `project_roadmap.md`의 "v0.1.47+ — CC 2026 H2 신규 기능 트랙" 섹션이 상위 권위이고, 본 문서는 그 실행 페이즈 가이드다.

---

## 1. ① 소모율·안전시간 카드 — 착수 전 원인 확인 결과

**판정: 버그다. 미구현이 아니다.** (기존 로드맵 메모리의 "미완 기능" 서술은 부정확했음 — 본 문서로 정정)

- `src/webview/main.ts:1659` — `const burnRate = calcBurnRate(fhHistory) ?? calcBurnRateEstimate(...)`. `??`는 **null일 때만** 추정치로 폴스루하는데, `calcBurnRate`(main.ts:87)는 히스토리 2포인트 이상이면 **delta가 0이거나 음수여도 숫자(0/음수)를 그대로 반환**한다.
- 이어지는 표시 분기(main.ts:1664, 1677)가 `burnRate > 0`일 때만 값을 보여줘 → **두 폴링 포인트 사이 utilization 변화가 없으면(유휴 상태) "데이터 수집 중…"이 영구 고착**된다. 폴링 간격 5분(`src/constants.ts:27`) 기준 대시보드를 켜둔 채 잠깐 쉬기만 해도 재현. 5h 윈도 리셋으로 utilization이 하락한 경우(음수 delta)도 동일 경로로 고착.
- 부가 요인: (a) 기울기를 마지막 2포인트로만 계산해 노이즈 취약, (b) `snapshotHistory`는 in-memory(`extension.ts:47-48`)라 VS Code 재시작 시 초기화 — 재시작 직후 1분은 정당한 "수집 중"(추정치 경로가 이미 커버).
- 사이드바 `buildBurnRow`(main.ts:134)는 rate≤0이면 행을 숨기는 의도적 설계라 무증상 — **대시보드 카드만** 상태 라벨이 잘못됐다.

---

## 2. SubTask 분리 (9개: 트랙 4개 + 검증 스파이크 1개)

### ① 소모율·안전시간 카드 완성

| SubTask | 내용 | 파일 |
|---|---|---|
| 1-1 `[TDD]` | burn-rate 상태 도출 순수모듈 추출 + 상태머신 수정. 상태: `no_usage`(util=0) / `collecting`(<2pt·추정불가) / `idle`(rate=0 → "0.00%/min · 유휴" 표기, 수집중 아님) / `active`(rate>0) / `window_reset`(rate<0 → 히스토리 리셋 후 추정치 폴백). rate≤0일 때도 세션경과 추정치(`calcBurnRateEstimate`) 폴백 허용 + 기울기를 최근 N포인트(15~30분) 평균으로 안정화 | 신규 `src/webview/burnRate.ts`(calcBurnRate·calcBurnRateEstimate·calcSafeUntil·calcProjAtReset 이동 + `deriveBurnState()` 신설) + 신규 `test/unit/burnRate.test.ts` |
| 1-2 | 대시보드 카드·사이드바 burn row를 `deriveBurnState()` 소비로 교체 | `src/webview/main.ts`(1659-1686, 134-145), `src/webview/i18n.ts`(idle/유휴 라벨) |

**제외 결정**: `snapshotHistory` 영속화(재시작 후 즉시 복원)는 효익 대비 범위 확대라 이번 트랙에서 제외. 필요 시 별도 항목으로.

### ② 스킬/서브에이전트/MCP attribution 강화 + 24h·7d 토글

| SubTask | 내용 | 파일 |
|---|---|---|
| 2-1 `[TDD]` | JsonlParser MCP 서버별 파싱(`mcp__<server>__<tool>` → 서버명 추출, per-record 서버별 호출수 맵). 이 SubTask에서 실물 jsonl로 사이드체인 엔트리에 subagentType/에이전트명 필드 존재 여부 탐침 → 있으면 2-2에 반영 | `src/services/JsonlParser.ts`(classifyToolName 주변, 143-155), `src/types/index.ts`(SessionRecord 확장), `test/unit/toolClassify.test.ts` 확장 |
| 2-2 `[TDD]` | UsageAggregator 기간 스코프 attribution 집계 — {24h, 7d, 전체} × {skills+미귀속버킷, subagentStats, mcpServers}. share 분모 = grand-total, "스킬 외 작업" 1급 버킷·이중계산 금지(기존 락인 유지) | `src/services/UsageAggregator.ts`(100-114, 221-241), `src/types/index.ts`(UsageSummary 확장), `test/unit/UsageAggregator.attribution.test.ts` 확장 |
| 2-3 | 웹뷰 토글 UI + 렌더. 기존 `scope-btn` 패턴(main.ts:797-801) 재사용, "≈Partial" 배지 유지 | `src/webview/main.ts`(updateSkillSection 1400-1450, buildPanelShell 877-882), `src/webview/i18n.ts`, `src/webview/styles.css` |

**✅ 확정(2026-07-25, 사용자)**: MCP 서버별 귀속은 **호출 수 기반** share 표기로 진행한다. 비용은 assistant 메시지 단위라 한 메시지에 MCP·비MCP 도구가 혼재하면 서버별 **비용** 분해가 원천적으로 불가능 — 호출 수 %가 거짓 정밀도를 피하고 "스킬 외 작업" 버킷 설계 철학과 일관된다. (기각된 대안: MCP tool_use 포함 메시지의 비용을 근사 귀속 + "≈" 라벨)

**서브에이전트 제약(기존 락인 유지)**: `agentId`는 불투명 식별자라 이름 분해 불가가 현재 데이터 사실(attributionSkill 서브에이전트 커버리지 0%). 기간별 집계·건수까지만 확장하고, 2-1 탐침에서 이름 필드가 발견되면 그때 확장 검토.

**✅ 2-1 탐침 결과(2026-07-25 재검증에서 수행·기록)**: 실물 `~/.claude/projects/**` 사이드체인 엔트리를 샘플링한 결과 키 집합은 `agentId · cwd · entrypoint · gitBranch · isSidechain · message · parentUuid · promptId · sessionId · timestamp · type · userType · uuid · version` 14개뿐 — **`subagentType`·에이전트명 계열 필드는 존재하지 않음**. 따라서 위 락인(집계·건수까지만)이 데이터 사실과 일치하며 2-2 확장 불필요로 확정. (구현 당시 탐침 근거가 기록되지 않아 재검증에서 독립 재현해 보강한 항목 — 재검증 대조표 갭B)

### ③ 모델별(Fable 5) 주간 한도 분리 게이지

| SubTask | 내용 | 파일 |
|---|---|---|
| 3-0 🔒 | **검증 스파이크(코드 변경 0줄, 선행 게이트)**. `RateLimitPoller.postMinimalMessage`와 동일한 `/v1/messages` 최소 요청 후 `anthropic-ratelimit-*` 응답 헤더 전량 덤프. 체크: (a) model-scoped/Fable 유사 헤더 존재 여부 (b) POLL_MODEL=haiku 요청에도 계정 스코프 모델별 헤더가 실리는지 (c) 현재 계정 플랜에서 해당 데이터 자체가 발급되는지 | scratchpad 1회성 스크립트만(레포 미반영) |
| 3-1 `[TDD]` (게이트 통과 시에만) | RateLimitPoller model-scoped 헤더 파싱 + `ModelScopedWindow[]` 타입 | `src/services/RateLimitPoller.ts`(parseHeaders 150-230), `src/types/index.ts`, `test/unit/RateLimitPoller.test.ts` |
| 3-2 (게이트 통과 시에만) | 웹뷰 게이지 — modelScoped 데이터 존재 시에만 렌더, 부재 시 완전 숨김(0%/빈 게이지 금지 — v0.1.35 DISABLED 칩 + v0.2.0 "빈 섹션 숨김" 원칙 재사용). 플랜 문자열 하드코딩 분기 금지, 데이터 존재가 1차 기준·PlanInfo는 보조 | `src/webview/main.ts`, `i18n.ts`, `styles.css`(`--c-fable` 토큰 기존재: styles.css:33) |

**게이트**: 외부 정황상 model-scoped 데이터는 CLI의 `/status` 엔드포인트가 반환한다는 서술이 있어, `/v1/messages` 응답 헤더에는 **없을 가능성이 상당함**. 헤더에 없으면 CRITICAL #3(비공개 API 금지)상 별도 엔드포인트 호출 불가 → **구현 중단, 사용자에게 구현 여부 재확인**. 3-1·3-2는 게이트 통과 전 어떤 배포 번들에도 미포함.

**⏸️ 최종 처분: 조건부 보류 확정(2026-07-25, 사용자 결정)** — 폐기 아님. 재개 조건은 아래 게이트 판정의 "재개 조건"과 동일하며, 그때 3-0 스파이크 1회 재실행으로 판정한다.

**❌ 게이트 판정: 실패(2026-07-25, 3-0 실측)**. `/v1/messages` 최소 요청 응답의 `anthropic-ratelimit-*` 헤더는 `unified-{5h, 7d, fallback, overage, representative-claim, reset, status}` 전부 **unified 계열뿐** — 모델별 분해 0건. 데이터는 서버에 존재하나(CLI `/status`가 표시) 공개 API 표면으로는 도달 불가. 남은 경로가 비공개 엔드포인트 호출뿐이라 CRITICAL #3 정면 위반 → **③ 전체 조건부 보류**. 재개 조건 = Anthropic이 model-scoped 데이터를 `/v1/messages` 응답 헤더로 노출. 재개 판정 비용은 3-0 스파이크 재실행 1회로 사실상 0. 측정 한계: 이 계정·요금제에서만 관측했으므로 플랜별 헤더 차등 가능성은 배제 못 함(단 타 플랜 탐침 수단 없음).

**UI 배치 권고**: 4카드 그리드에 5번째 카드를 조건부 추가하면 그리드 균형이 깨짐 → Weekly(7d) 카드 내부에 모델 스코프 서브 바(rate-bar 재사용, `--c-fable`)를 조건부 삽입 권고. 최종 판단은 실빌드 캡처로 확정(목업만으로 비례감 검증 불가 — `feedback_webview_ui_verification` 교훈, 히트맵 2차 반려 전례).

### ④ 세션 컨텍스트 사용률 게이지

| SubTask | 내용 | 파일 |
|---|---|---|
| 4-1 `[TDD]` | 컨텍스트 사용률 계산 — 현재 워크스페이스 최신 세션의 컨텍스트 점유 산출 + 모델별 최대 윈도 맵 | 신규 `src/utils/contextWindow.ts`(모델→max window 맵, `findPricing`과 동일한 longest-prefix 매칭), `src/services/UsageAggregator.ts` + `src/types/index.ts`(UsageSummary.sessionContext), 신규 `test/unit/contextWindow.test.ts` |
| 4-2 | 사이드바 미니 게이지 렌더 + "≈ 근사치(auto-compact 미반영)" 툴팁. 배치 기준 "단일 숫자→사이드바" 적용, 기존 rate-bar 시각 문법 재사용 | `src/webview/main.ts`(사이드바 렌더부), `i18n.ts`, `styles.css` |

**✅ 계산 방식 정정(원 요구사항 문구 기술 오류 수정 — 사용자 확인 불필요, 사실 정정)**: 요구사항 초안의 "누적 input 토큰"은 기술적으로 틀렸다. jsonl의 각 assistant 레코드 `input_tokens + cache_read + cache_creation`은 **그 턴 시점의 전체 컨텍스트 크기**이므로, 세션 전체에 걸쳐 누적합하면 매 턴 컨텍스트가 중복 합산되어 수십 배 부풀려지고 항상 100%를 초과하는 값으로 수렴한다(사실상 의미 없는 숫자). 채택 방식: **세션의 마지막(최신) 레코드 1건의 input 3종 합 / 모델 최대 윈도** — "현재 컨텍스트 점유율"의 표준 근사. jsonl에는 1M 베타 윈도 활성 여부가 기록되지 않으므로 보수적 기본값 + "≈" 라벨로 정직 고지.

**⚠️ 구현 중 발견(2026-07-25, scope-critic)**: "현재 워크스페이스 최신 세션"이라는 원 표현은 부정확했다. `UsageAggregator.aggregate()`가 받는 `records`(`extension.ts`의 `allRecords`)는 `WorkspaceMapper.getAllJsonlFiles()`가 반환하는 **이 머신의 `~/.claude/projects` 전체**(cross-project, 워크스페이스 미필터링)다. `WorkspaceMapper.cwdMatchesWorkspace()`/`getProjectDir()`는 존재하지만 코드베이스 어디에서도 호출되지 않는 dead code — CLAUDE.md가 차별화 기능으로 명시한 "워크스페이스 ↔ 세션 자동 매핑"은 현재 실제로 구현돼 있지 않다(`activeBranch` 등 기존 필드도 전부 동일하게 cross-project 스코프). `sessionContext`는 이 기존 스코프를 그대로 상속했을 뿐이라 다른 필드 대비 새로운 결함은 아니지만, 워크스페이스 스코핑 자체를 도입하는 건 이 SubTask 범위를 넘는 별도 작업(모든 필드에 영향)이라 이번엔 손대지 않음 — 별도 항목으로 분리 필요.

---

## 3. 실행 순서

1. SubTask 1-1 → 1-2 완료, `verify.sh` + 실빌드 Playwright 캡처(idle 상태 fake postMessage로 재현) 검증
2. SubTask 3-0 스파이크를 이 시점에 실행(코드 변경 0 — ② 구현과 병행 가능. 게이트 실패 시 사용자 재확인 리드타임을 미리 확보하는 목적. "③ 착수 = 3-0"이므로 착수 순서 위반 아님)
3. SubTask 2-1 → 2-2 → 2-3, `verify.sh` + 캡처 검증 (2-2 착수 전 위 §2 "MCP 귀속 방식" 결정 확정 필요)
4. 3-0 게이트 통과 시: SubTask 3-1 → 3-2 / 실패 시: 사용자 재확인 대기, ③ 전체 보류
5. SubTask 4-1 → 4-2, `verify.sh` + 캡처 검증

## 4. 버전 번들 제안 (작업범위 기준, 인접 원칙 준수)

| 버전 | 내용 | 근거 |
|---|---|---|
| v0.1.47 | ① (1-1·1-2) | 버그수정 성격, 단독으로 빠르게 배포 |
| v0.1.48 | ② (2-1~2-3) | 타입·집계 구조 변경이 커서 ①과 분리 권장 |
| (버전 미배정) | ③ (3-1·3-2) | 게이트 통과 시에만 독립 버전 배정. |
| v0.1.49 | ④ (4-1·4-2) | **확정(2026-07-25, 사용자): ④ 선배포 허용.** ③ 게이트가 실패·지연돼도 ④는 완성되는 대로 독립 배포한다. 착수 순서(①→②→③검증→④)는 그대로 지키되, "순서 건너뛰기 금지" 규칙은 번들링(묶어서 배포)에만 적용되고 개별 배포 시점에는 적용되지 않는 것으로 해석 확정. |

**번들 유연성**: ① 작업량이 예상보다 작게 끝나면 ①+② 동일 버전 병합 가능(인접이므로 허용). 순서를 건너뛰는 병합(예: ①+④)은 금지.

## 5. TDD 태그 근거 (3-AND, 인터랙티브 모드 — 제안, 최종 결정은 사용자 승인)

- **적격**: 1-1(상태머신·순수함수), 2-1(파서), 2-2(집계), 3-1(헤더 파서), 4-1(계산+prefix 매칭) — 모두 결정론 I/O + vitest 존재(`test/unit/*`) + 비자명
- **비적격**: 1-2·2-3·3-2·4-2(UI 렌더 — 검증 신호가 실빌드 캡처), 3-0(탐색적 스파이크 — 절대제외)

## 6. UI/UX 설계 근거

- Ground Truth: `docs/design/DESIGN-TOKENS.md`, `docs/design/UX-BRIEF.md`, prototype 3종
- ② 토글은 기존 `scope-btn`/`lt-scope-btn` 문법 그대로 재사용 — 신규 시각 언어 없음
- ④는 사이드바 기존 바/칩 문법 재사용
- `/frontend-design` 호출 불필요 — 신규 UI 전부 기존 컴포넌트 문법(scope-btn·rate-bar·metric-card) 재사용 범위. 단 ③에서 카드 그리드 재배치가 불가피해지면 그 시점에 재판정

## 7. 열린 결정 — 전부 확정 완료 (2026-07-25)

1. **② MCP 귀속 방식** — ✅ 호출 수 기반 확정 (§2 참조)
2. **③ 배포 격리 해석** — ✅ ④ 선배포 허용 확정 (§4 참조)

착수 게이트: 없음. 다음 실행은 SubTask 1-1부터.

## 8. 참고

- 원천 리서치: memory `reference_cc_2026h2_feature_research.md`
- 로드맵 판정표: memory `project_roadmap.md` "v0.1.47+ — CC 2026 H2 신규 기능 트랙"
- 재사용 원칙: [[feedback_sidebar_vs_dashboard]] [[feedback_webview_ui_verification]] [[reference_skill_attribution_gap]]
