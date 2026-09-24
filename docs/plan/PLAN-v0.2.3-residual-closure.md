# PLAN — v0.2.3 잔여 일괄 종결 릴리스

생성: 2026-09-23 · 소스: 세션 대화 + 직전 턴 사용자 승인
파이프라인: `/sh-dev-loop --tdd --auto`

---

## §1. 요구사항 (사용자 발화 원문 — 요약 금지)

> "codex 네이티브게이지가 도대체 무슨말인지모르겟네? 지금은 게이지가 가짜게이지니? 그리고 030으로 뺄만큼 큰범위야?"

> "위 전건(지금할수잇는것ㅊ포함) 전부 023으로 출시할게. 로드맵갱신해줘."

> "v0.2.3 /sh-dev-loop --tdd --auto"

"위 전건"은 직전 턴에서 어시스턴트가 제시하고 사용자가 "전부"로 승인한 9건을 가리킨다. 아래 R1~R9가 그것이다.

| ID | 요구사항 |
|---|---|
| R1 | 기간별 비용 탭 순서를 **일별 → 월별 → 장기**로 표시 |
| R2 | StatusBar가 Codex 전환을 무시하는 **결함** 수정 |
| R3 | 대시보드에 Codex **버킷별 Burn/Safe** 표시 |
| R4 | Utilization Trend 차트 **N버킷 일반화** |
| R5 | **라이트 테마** 연동 |
| R6 | **워크스페이스 스코핑** 잔여 |
| R7 | `gifenc`/`pngjs` **의존성 등재** (v0.2.2 보안검토 W1) |
| R8 | **프로토타입 HTML 드리프트** 해소 |
| R9 | M3 `.panel-root` 패딩 `--sp-4`→`--sp-6` |

---

## §2. 제외 합의

### X1. R4 툴체인 post-chore (eslint10 / vitest4 / esbuild / vsce3) — **이번 릴리스 제외**

메이저 4개를 기능 9건과 섞으면 회귀 귀속이 불가능해진다. 프로젝트가 v0.1.54에서 이미 내린 판정("vitest 마이그레이션 × 신규 테스트 동시 진행 = 실패 귀속 혼선")과 동일 사유. 어시스턴트가 제외를 권고했고 사용자는 이의 없이 `--tdd --auto` 구현 지시로 넘어갔다.

> ⚠️ 이 X1의 "R4"는 `project_vnext_migration_plan`의 릴리스 트랙 R4(툴체인)다. 위 §1의 **R4(Trend N버킷)**와 다른 축의 동명 ID다 — 혼동 금지.

### X2. `recentSessions` 워크스페이스 스코핑 — **하지 않는다 (R6에서 명시 제외)**

**착수 시점 계획이 틀렸다.** 계획 원문은 "activeBranch/recentSessions/recentEditedFiles/branchBreakdown … 이월 사유가 문서에 없음"이었으나, 실측 결과 `recentSessions`에는 **명시된 계약이 존재한다**:

- `src/services/UsageAggregator.ts:392` — "recentSessions는 main.ts의 '워크스페이스 매칭 0건' vs '세션 기록 자체가 없음' 구분(v0.1.49)에 cross-project 그대로 쓰인다 — 여기서 스코핑하면 그 구분이 무너진다(**SubTask1에서 scope-critic이 동일 이유로 지적한 회귀**)"
- `src/types/index.ts:391-392` — 같은 계약을 타입 문서로 재기술
- 소비처: `src/webview/sidebarView.ts:660` `if ((usage?.recentSessions?.length ?? 0) === 0) return '';`

따라서 `recentSessions` 스코핑은 **문서화·검토 완료된 회귀**다. R6은 사유가 없는 3필드로 좁힌다.

### X3. `activeBranch`와 `branchBreakdown`은 분리 스코핑 금지

`sidebarView.ts:293` `branchBreakdown.find(b => b.branch === activeBranch)` — 한쪽만 스코핑하면 find가 조용히 miss 되어 브랜치 칩의 비용이 사라진다. **같이 움직이거나 같이 안 움직인다.**

---

## §3. 착수 전 실측 (계획을 바로잡은 근거)

| 항목 | 계획 주장 | 실측 | 판정 |
|---|---|---|---|
| R2 | `extension.ts:467` statusBar.update가 게이트 밖 | ✅ 확인. 468~470의 `if (activeProvider === 'claude')`는 `PushRateLimit` 웹뷰 push에만 걸림 | **결함 확정** |
| R3 | `appendCodexBucketHistory` 재사용 가능 | ✅ 단, **`sidebarView.ts`에서만 import**. `panelView.ts:199`는 스냅샷만 덮어쓰고 이력을 **누적하지 않는다** | 패널측 이력 저장소 **신설 필요** |
| R3 | burn/safe 카드 이식 | `panel-burn-card`/`panel-safe-card`는 `CLAUDE_ONLY_PANEL_IDS` 소속 + 5H 의미론 고정. 되살리면 의미 틀린 카드 1장 | **band-grid 행에 넣는다**, 배열 불변 |
| R4 | `updateTrendChart` 154줄 | ✅ 하드코딩 2 데이터셋 + `trend-readout` 문자열 `5H … · 7D …` + 페이스라인이 `lastPanelSnapshot?.fiveHour`+`FH_WINDOW_MS` 바인딩 | Codex엔 fiveHour 없음 → **페이스 omit 분기 필수** |
| R5 | `.theme-light` 부착 경로 0건 | ✅ `DashboardPanel.ts:67`·`SidebarViewProvider.ts:48` 하드코딩. `activeColorTheme`/`ColorThemeKind` **소스 전체 0건** | 확정 |
| R6 | 4필드 전부 사유 없음 | ❌ `recentSessions`는 사유 있음(§2 X2) | **3필드로 축소** |
| R6 | 골든 영향 | `docs/demo/mock-data*.js`는 **완성된 UsageSummary를 직접 제공** — `aggregate()`를 호출하지 않음 | 골든 **무영향** |
| R7 | lockfile 편입 | `package-lock.json` grep 0건 · `package.json` 0건. **착수 후 정정**: `.github/workflows/publish.yml:37`이 `npm ci`를 쓰고, `npm ci`는 lock 불일치 시 하드 실패한다 → **lock 갱신은 선택이 아니라 필수**. 스크래치 복제본 측정: lock diff = 버전 필드 + 2 엔트리, 전이 의존성 0 | devDependencies 등재 + lock 동기화 |
| R8 | error 9 / 기준선 6 | 9 = **3규칙 × 3파일**. D-TYPE-07×3·D-TOKEN-01×3은 **상시 잔존 대상**(CLAUDE.md §9, DESIGN-TOKENS §13.1). D-COLOR-02×3(`#93c5fd`·`#fcd34d`)만 실제 위반 | **D-COLOR-02 3건만 수정 → 정확히 6으로 복귀** |
| R9 | 캘린더 고정폭 충돌 | **실측으로 전제가 기각됐다.** `.calendar-grid-area { overflow-x: auto }`(v0.1.44) — 752px에서는 패딩 변경 **이전에도 이미** 스크롤 중(sw 756 > cw 628→612), 1100px에서는 양쪽 다 스크롤 없음. 카드 left 32→40, 캔버스 전부 +8로 **상대 오프셋 완전 동일** | **충돌 없음 → 채택** |

---

## §4. 제약 (비협상)

1. 프로젝트 CLAUDE.md §3 CRITICAL 전부 — 선언 밖 색 리터럴 금지 / 7+1 액센트 cap / 외부 폰트 금지 / `message.id` dedup / chokidar / `unsafe-eval` 차트 금지
2. 디자인 토큰 GT = `src/webview/styles.css`. 신규 토큰은 `.theme-dark`·`.theme-light` **양쪽** 선언 + `DESIGN-TOKENS.md` 기재
3. **커밋·배포는 별도 명시 승인 전까지 절대 금지**(`feedback_ship_gate` 절대원칙). 이번 메시지는 구현 지시이지 ship 승인이 **아니다**
4. `git add -A` 금지 · `--no-verify` 금지
5. 골든(`test/golden/webview-surface.json`) 갱신 필요 시 **날짜 기인 diff와 변경 기인 diff를 분리 증명**한 뒤 갱신 — v0.2.2 확립 절차: HEAD에 `git worktree` 격리 재캡처, 전체 diff 열거(`tail` 금지)
6. 새 게이트는 **일부러 깨뜨려 RED 확인 후** 채택(`feedback_gate_wiring_signal`). R3/R4 게이트는 요소 **존재**가 아니라 **렌더된 값**(burn 수치 / `canvas.toDataURL()` 지문)을 단언한다 — v0.2.2에서 존재 단언이 리셋 줄 삭제에도 그린이었던 사례

---

## §5. SubTask

라우팅: **전량 `[S]`**. 이유는 항목 수(<4)가 아니라 **구조적 불가**다 — `[P]` worktree dispatch는 `git status --porcelain`이 비고 PLAN이 커밋돼 있어야 하는데(impl-handoff §3-3-1), §4-3이 자율 커밋을 금지하고 작업트리에 R1 산출물 4파일이 미커밋 상태다.

| ID | TDD | 내용 | 대상 파일 |
|---|---|---|---|
| ST1 | — | **R1** 탭 순서 일별→월별→장기 (**작업트리에 구현·검증 완료**) | `src/webview/panelView.ts` · `test/unit/panelDesign.invariants.test.ts` |
| ST2 | `[TDD]` | **R2** `statusBar.update()`를 provider 게이트 **안**으로. Codex 활성 시 5H/7D 아이템 **숨김**. 근거 선례: `panelView.ts:59-62` "잘못된 라벨로 반쯤 맞는 화면보다 정직한 gap이 낫다" — N버킷을 2개 아이템에 욱여넣지 않는다 | `src/extension.ts` · `src/providers/StatusBarController.ts` · `test/unit/statusBarProviderGate.invariants.test.ts`(신설) |
| ST3 | `[TDD]` | **R3** 패널측 Codex 버킷 이력 저장소 신설(`appendCodexBucketHistory` 재사용) → `panel-codex-band-grid` 각 행에 버킷별 burn/safe. `CLAUDE_ONLY_PANEL_IDS` **불변** | `src/webview/panelView.ts` · `src/webview/webviewShared.ts` · `test/unit/webviewShared.codexBand.test.ts`(신설) |
| ST4 | `[TDD]` | **R4** Trend 차트 N시리즈화. 시리즈 선택을 순수함수로 분리 · `trend-readout` 동적 생성 · **페이스라인 omit 분기**(Codex엔 fiveHour 없음) · `panel-util-trend-card`를 `CLAUDE_ONLY_PANEL_IDS`에서 제거 | `src/webview/panelView.ts` · `src/webview/trendSeries.ts`(신설) · `test/unit/trendSeries.test.ts`(신설) |
| ST5 | `[TDD]` | **R5** `ColorThemeKind` **4종 전부** 매핑하는 순수함수 + `onDidChangeActiveColorTheme` 구독 → HTML shell 재생성이 아니라 **`provider-codex`와 동일 경로로 body 클래스 토글** | `src/panel/DashboardPanel.ts` · `src/providers/SidebarViewProvider.ts` · `src/webview/themeClass.ts`(신설) · `src/messaging/contracts.ts` · `test/unit/themeClass.test.ts`(신설) |
| ST6 | `[TDD]` | **R6** `recentEditedFiles` + (`activeBranch` ∧ `branchBreakdown`) 3필드 워크스페이스 스코핑. `recentSessions`는 §2 X2로 **제외** | `src/services/UsageAggregator.ts` · `test/unit/UsageAggregator.scoping.test.ts`(신설) |
| ST7 | — | **R7** `gifenc`/`pngjs`를 `devDependencies`에 등재 **+ lockfile 동기화**(계획 정정 — §3 R7 행 참조. 재생성 안 하면 `npm ci` 기반 배포 워크플로가 깨진다). `.vscodeignore`가 `node_modules/**`를 제외하므로 vsix 영향 0 | `package.json` · `package-lock.json` |
| ST8 | — | **R8** D-COLOR-02 3건(`#93c5fd`·`#fcd34d`)을 `--fg-sonnet`/`--fg-warn`으로 치환. D-TYPE-07·D-TOKEN-01 6건은 상시 잔존(§3) — error 9→**6**(기준선 복귀) | `docs/design/prototype/{context-session-picker,provider-compare,usage-heatmap}.html` **+ `prototype/styles.css`**(토큰 선언 + 자기 소비처 229줄 — acceptance-critic V1로 추가) · `CLAUDE.md` §9 기준선 문구 |
| ST9 | — | **R9** `.panel-root` 패딩 `--sp-4`→`--sp-6`. 752px·1100px 실측 결과 충돌 없음 → **채택**(§3 R9 행) | `src/webview/styles.css` |
| ST10 | — | 릴리즈메타: `package.json` 0.2.3 · `CHANGELOG.md [0.2.3]` · `README.md` What's New (`feedback_ship_prerequisite`) | `package.json` · `CHANGELOG.md` · `README.md` |

### 실행 순서

`ST1(완료) → ST2 → ST3 → ST4 → ST5 → ST6 → ST7 → ST8 → ST9 → ST10`

ST3가 ST4에 선행하는 이유: ST4의 Codex 시리즈는 ST3가 만드는 **패널측 버킷 이력 저장소**를 소비한다. 저장소 없이 ST4를 먼저 하면 데이터 없는 차트가 "수집 중"에 영구 고착된다.

---

## §6. UI 설계 명세

Ground Truth: `src/webview/styles.css`(토큰) · `docs/design/DESIGN-TOKENS.md` · `docs/design/UX-BRIEF.md` · `docs/design/prototype/*.html`
**전부 기존 화면 수정**이라 `/frontend-design` 호출 생략(분기 A 전부매칭).

- **ST3 Codex 밴드 행**: 기존 `panel-metric-card` 마크업을 유지하고 `buildBurnRow` 산출을 `panel-metric-sub` 위치에 추가. 신규 토큰 0.
- **ST4 Trend**: 시리즈 색은 기존 `--c-sonnet`/`--c-opus`를 유지하되 N>2일 때 7+1 cap 안에서 순환(`--c-haiku`·`--c-fable`). **8번째 액센트 신설 금지.**
- **ST5 라이트 테마**: `.theme-light` 51토큰이 이미 선언돼 있다 — 신규 선언 0, 부착 경로만 만든다.
- **ST9**: 토큰 값 변경 없음(`--sp-6` 기존 토큰 참조).

---

## §7. 검증 요구

| 대상 | 게이트 |
|---|---|
| ST2 | 소스 불변식 테스트 — `statusBar.update(` 호출이 provider 분기 안에 있음. **RED 선확인**(현재 코드에서 실패해야 채택) |
| ST3 | Playwright — Codex 축에서 밴드 각 행의 burn **수치가 렌더됨**(존재 아님). `scripts/verify-codex-panel-burn.mjs`(신설) |
| ST4 | 순수함수 단위 + Codex 축 차트 `toDataURL()` 지문이 Claude 축과 **다름** |
| ST5 | 4 `ColorThemeKind` 단위 + 라이트에서 body 클래스 `theme-light` 실렌더 확인 |
| ST6 | `aggregate()` 단위 — 스코프 지정 시 타 워크스페이스 레코드 제외, **미지정 시 기존 동작 불변**(하위호환) |
| 전체 | `bash verify.sh --full` · `npx vitest run` · 골든 diff 분리 증명 |

---

## §11. 인수검증(/verify-impl) 라운드에서 추가된 범위

사용자 지시 원문: **"추가발견된결함까지 보완진행해"** (2026-09-23, 축A·축B 판정 수령 후).

### A6. Claude 7일 창 소모율의 `%/min` 눌어붙음 — **R3와 동일 결함의 미발견 인스턴스**

R3에서 Codex 버킷의 `0.00%/min` 거짓 신호를 `pickBurnUnit`으로 고쳤는데, **같은 결함이 Claude의
7D 행에 그대로 남아 있었다**. 발견 경로는 코드 리뷰가 아니라 **마켓 히어로 캡처**다 —
`WEEKLY USAGE (7D) 26%` 아래가 `Burn 0.00%/min (est.)`로 찍혔고, `(est.)`가 붙었다는 것은
rate가 0(유휴)이 아니라 **양수인데 `toFixed(2)`가 0.00으로 눌렀다**는 뜻이다
(`buildBurnRow`는 `rate <= 0`이면 행 자체를 만들지 않는다).

처분: `pickBurnUnit`을 `codexBandBurn.ts`(Codex 전용)에서 **두 표면의 공통 조상인 `burnRate.ts`**로
올리고 `webviewShared.buildBurnRow`도 그것을 쓰게 했다. 사본을 남겨 두면 한쪽만 고쳐지는 드리프트가
다시 생긴다 — 이번 결함이 정확히 그 모양이었다.

| 항목 | 값 |
|---|---|
| 파일 | `src/webview/burnRate.ts`(소유 이관) · `src/webview/webviewShared.ts`(배선) · `src/webview/codexBandBurn.ts`(사본 제거) |
| 잠금 | `test/unit/burnRowUnit.test.ts`(신설, 8건) — RED 선확인: 기존 코드가 `Burn 0.00%/min (est.)`를 실제로 내는 것을 단언 실패로 재현 |
| 화면 확인 | 재촬영 히어로에서 `Burn 0.20%/hr (est.)`(7D) · `0.16%/min`(5H) |

### A7. N>2 계열 색 순환의 화면 도달 검증 — **축B V1(확인불가) 종결**

축B 판정 V1: 데모 목업이 Claude 2계열·Codex 1계열뿐이라 **N>2 순환 경로가 화면에 한 번도
나타나지 않는다**. 비평가는 임시 픽스처를 제안했으나, 임시 픽스처는 다음 릴리스에 사라진다.

처분: `scripts/verify-codex-panel-burn.mjs`에 검사 ⑤를 **영구 추가**했다 — 3버킷(300/10080/43200분)
스냅샷을 두 시각으로 주입한 뒤, `--c-sonnet`·`--c-opus`·`--c-haiku`의 RGB를 CSS에서 읽어
**캔버스 픽셀에 실제로 존재하는지** 센다.

왜 픽셀인가: `trendSeries.test.ts`가 잠그는 것은 **accentVar 배열의 인덱스 순환**이지 그 변수가
해석돼 칠해지는지가 아니다 — 토큰명이 오타여도 배열은 옳고 화면만 회색이 된다(D-2의 "선언되지 않은
`var()`는 선언째 폐기"와 같은 무성 실패).

**무는지 확인함**: `TREND_ACCENT_VARS[i % …]`를 `[0]`으로 일시 개악 → 재빌드 → 게이트가
`--c-opus 0픽셀` · `--c-haiku 0픽셀`로 FAIL(종료코드 1). 원복 후 종료코드 0.

### A8. 낡은 주석 2건 정정

- `scripts/capture-media.mjs` 헤더: "gifenc/pngjs는 `--no-save`로 설치" → R7이 devDependencies + lockfile로 바꿨고 그 사유(`npm ci` hard-fail)를 적었다.
- `src/webview/styles.css` Y축 정렬 주석: "panel-root에 sp-4 패딩" → R9가 `sp-6`으로 올렸다. 카드의 **상대** 정렬이 panel-root 값과 무관하다는 점(R9 채택 근거)을 함께 적었다.

---

## §10. Phase 3 배치 검증 판정과 처분

verify.sh `--full` **PASS=32 · FAIL=0** · vitest **525/525** · 골든 diff **0건**
(골든은 `totalElements`/`heatCells`를 캘린더 날짜 의존 때문에 비교 대상에서 제외한다 — 실질 신호는 `canvases` 7→7 불변과 id별 구조 동일.)

| 판정 | 출처 | 처분 |
|---|---|---|
| **V1 R8 부분** — `prototype/styles.css:229`에 `#93C5FD` 잔존. 토큰만 추가하고 **그 파일 자신의 소비처를 안 바꿨다**. design-lint는 `*.html`만 스캔해 사각지대였고, 이 CSS는 CLAUDE.md §1이 "시각 Ground Truth"로 지정한 `00-clausight-canvas.html`에 `<link>`로 연결된다 | acceptance-critic | **수정함.** 229줄 → `var(--fg-sonnet)`. 프로토타입 전체 리터럴 재검 0건 |
| **V2 ST10 부분** — 마켓 이미지 미재촬영 | acceptance-critic | **유지(미실시).** §8이 이미 자체 보고한 항목. 사용자 지시 대기 — `feedback_ship_prerequisite`상 **ship 차단 사유**로 명시 |
| **공유 상태 경계** — `panelCodexHistory`(패널)와 `sbCodexHistory`(사이드바)가 따로 쌓여, 열린 시점이 다르면 같은 버킷의 소모율이 화면마다 다르게 보인다 | scope-critic ST3/ST4 (`DECISION_CHANGED: yes`) | **수용·수정함(A5).** 확장이 이력을 소유하고(`codexBucketHistory`) 웹뷰가 열릴 때 `GetCodexPollHistory`로 받아 출발한다 — Claude의 `snapshotHistory`+`GetPollHistory`와 같은 구조. `flatten`/`hydrate` 순수 변환기 + 잠금 4건(경쟁 상황 포함) |
| **pickBurnUnit 범위 명시 요구** | scope-critic ST3/ST4 | **이미 충족.** §9 A1/A2에 기록돼 있고 사용자 보고에도 별도 블록으로 올렸다 |
| ST5·ST6 전 경계 | scope-critic (`DECISION_CHANGED: no`) | 조치 없음 |
| **별건** — `extension.ts`의 `checkThreshold()`가 R2와 같은 provider 게이트 밖 | acceptance-critic | **의도적으로 유지.** 상태바는 Codex 자리에 남의 숫자를 *표시*하는 문제지만 임계 알림은 **안전 경보**(CLAUDE.md §6 차별점 2)다. 막으면 사용자가 여전히 쓰고 있는 Claude 한도에 모르고 부딪힌다. Codex엔 대응 알림이 없어 "틀린 알림이 맞는 알림을 가리는" 상황도 아니다. 호출부에 결정 사유를 주석으로 남겼다 |
| **UNKNOWN** — "v0.2.2 유입분" 라벨의 VCS 근거 부재 | acceptance-critic | **근거 제시.** `git diff e64d85b`: `capture-media.mjs` +1/-1 · `verify-cost-period-tabs.mjs` +1/-1 · `panelDesign.invariants.test.ts` +11 · `panelView.ts` +146/-52 — 전부 v0.2.2 머지 커밋 **이후** 변경이 맞다 |

---

## §9. 승인 범위 밖 추가분 (구현 중 발생 — 사용자 보고 대상)

`--auto`가 선승인한 것은 §1의 R1~R9다. 아래 넷은 그 목록에 없던 변경이라 따로 세운다.

| # | 변경 | 사유 | 영향 |
|---|---|---|---|
| A1 | `pickBurnUnit` — 소모율 표기 단위를 창 길이로 선택 | 30일 버킷(free 플랜의 유일 버킷)을 %/min으로 적으면 `0.00%/min`이 되어 **유휴와 구분되지 않는다**. v0.1.47이 고친 "idle을 수집 중으로 오표기"와 같은 부류의 거짓 신호 | R3 범위 내 판단이나 **v0.2.1에 출시된 사이드바 표시가 바뀐다** |
| A2 | 사이드바 Codex 버킷이 `buildBurnRow` → `buildCodexBucketBurnRow` | A1을 대시보드에만 적용하면 같은 버킷이 두 화면에서 다른 수치를 보인다 | v0.2.1 ST10 경로 변경 |
| A3 | `broadcastMethods.test.ts` 망라성 잠금 신설 | 기존 테스트는 항목을 손으로 적어 **새 Push\*를 못 본다**. v0.1.40 회귀가 정확히 "추가하고 등재를 잊음"이었다 | 테스트 추가만 |
| A5 | 확장 소유 Codex 버킷 이력 + `GetCodexPollHistory` pre-hydrate | scope-critic `DECISION_CHANGED: yes` 수용 — 웹뷰별 누적은 같은 버킷의 소모율을 화면마다 다르게 만든다 | `extension.ts` · `contracts.ts` · `handlers.ts` · 웹뷰 2곳 · `codexBucketHistory.ts` |
| A4 | **테스트 수정** — `codexBucketHistory.test.ts`의 `%/min` 단언 | A1로 명세가 바뀌어 깨졌다. **약화가 아니라 강화**로 갱신: `[['1.00','min'],['6.00','hr']]`로 단위까지 단언해 ①버킷 키 혼선 ②단위 회귀를 함께 잡는다. 원 의도("각 버킷이 제 소모율을 보인다") 보존 | 게이트 강화 |

---

## §8. 진행 상태

| ST | 상태 |
|---|---|
| ST1 | ✅ 완료(v0.2.2 직후 작업트리 유입분) |
| ST2 | ✅ 완료 — RED 2/2 선확인 |
| ST3 | ✅ 완료 — 단위 10/10 · 게이트 RED 확인 |
| ST4 | ✅ 완료 — 단위 7/7 · 게이트 RED 확인 |
| ST5 | ✅ 완료 — 단위 6/6 + 망라성 잠금 · 게이트 RED 확인 |
| ST6 | ✅ 완료 — 단위 7/7, 기존 507건 무회귀 |
| ST7 | ✅ 완료 — lock 동기화 + `npm ci` 정합 확인 |
| ST8 | ✅ 완료 — design-lint error 9→6(기준선 복귀) |
| ST9 | ✅ 완료 — 실측 후 채택 |
| ST10 | ⚠️ 부분 — 버전·CHANGELOG·README 완료, **마켓 이미지 재촬영 미실시**(탭 순서·패딩이 스크린샷/GIF에 보인다. 사용자 지시 대기) |

**커밋·배포: 미수행**(`feedback_ship_gate` 절대원칙 — 이번 지시는 구현 지시이지 ship 승인이 아니다).
