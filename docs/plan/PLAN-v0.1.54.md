# PLAN — v0.1.54 "R2 선결 안전망" (2026-08-29)

## 사용자 요구사항 원문

> 그럼미리 R2 안전망작업까지하고 진행할게. 이에맞게 /plan후 로드맵갱신해 0.1.54

배경: vNext 마이그레이션(`docs/PLAN-vnext-migration-2026-07-02.md` §2 R2)이 원래 "버전 릴리즈 없이 main 누적"으로 계획했던 v0.2.0 Phase 0.5 선결 안전망을, 사용자가 별도 릴리즈 v0.1.54로 승격하기로 결정.

## 확정 제약

- CLAUDE.md §3 CRITICAL 7항 준수
- v0.1.53(디자인토큰 GT+게이트, escapeHtml, design-lint 프로토타입 정리 — 라이트테마 연동은 드롭)이 같은 워킹트리에 **미커밋 상태로 이미 존재**. R2는 그 위에 이어서 작업, 재구현 금지. 커밋은 이 계획 범위 밖(사용자 명시 승인 필요, feedback_ship_gate).
- 순서: ①(테스트 백필)이 ③(WorkspaceMapper async)보다 먼저 — 리팩터 전에 안전망 필요
- ④ webview 분리는 목업 검증 금지, 고정폭 미만/초과 스윕 + 로캘 2종([[feedback_webview_ui_verification]])
- ship/배포는 범위 밖

## 사용자 결정 (AskUserQuestion, 2026-08-29)

- **`WorkspaceMapper.getProjectDir()`**: 유지 + 테스트 추가. v0.2.0 Codex `ClaudeSource` 이관 시 재사용될 시임(`extension.ts:84` 포워드 컨트랙트 주석). ST1에서 테스트를 붙여 "테스트 없는 public 메서드 출하" 문제도 함께 해소.
- **v0.1.54의 릴리즈 성격**: **내부 마일스톤** — 마켓플레이스 publish 없음, 커밋+태그+CHANGELOG만. 전부 내부 리팩터/안전망이라 사용자 가시 변경 0. ST7에서 README "What's New" 갱신은 생략(feedback_ship_prerequisite은 마켓 공개 시에만 적용 대상이므로 이번엔 비대상).

## SubTask 목록 (planner 산출, opus 위임)

- **ST0** — 사각지대 3종 계측(tsc webview / tsc test / eslint webview 오류 수). 커밋 없음. **실측(2026-08-30)**: `tsc -p tsconfig.webview.json` 4 에러(rootDir 위반 2 · `Parameters<typeof Chart>` 제네릭 불일치 1 · 암묵적 any 1) · `tsc -p tsconfig.test.json`(신설 전이라 대상 자체 없음, ST2a 착수 근거) · `eslint src/webview` 실행 자체 불가(ignorePatterns가 전체 제외, "glob이 전부 무시됨" 에러). 결과로 ST2a 순서·ST2b 방식 확정
- **ST1** `[characterization]` — UsageAggregator 코어 롤업(`today`/`last7Days`/`cacheHitRate`/`modelBreakdown`/`cacheStats`/`todayToolCounts`/`recentSessions`/`recentEditedFiles`/`branchBreakdown`) + `CacheStore` + `WorkspaceMapper`(`getProjectDir` 포함) 테스트 백필
  - TDD 태그 없음(의도적) — characterization은 첫 실행이 GREEN이 정상이라 RED 게이트가 성립하지 않음. **역규약**: 여기서 RED가 나오면 실제 버그 발견이지 "구현 신호"가 아님
  - **CRITICAL 경계**: `aggregate()`에 dedup 없음(dedup은 JsonlParser 책임, §3#1과 무관) — characterization 중 이를 버그로 오인해 dedup 추가 금지
  - 마찰 제거: WorkspaceMapper 테스트를 처음부터 `await mapper.getAllJsonlFiles()` 형태로 작성 → ST3 async 전환 시 테스트 수정 0건
- **ST2a** — `tsconfig.test.json` 신설(`rootDir`/`outDir` 없이 별도 구성, `include: ["test/**/*.ts","src/**/*.ts"]`) + verify.sh 편입 + D-0류 측정 무결성 바닥(대상 파일 수 ≥ N)
  - 함정: `test/integration/extension.test.ts`가 mocha 전역 사용, `@types/mocha` 미설치 — include 스코프 조정 또는 타입 추가 필요
- **ST3** `[TDD]` — WorkspaceMapper·호출체인(`extension.ts:148` 단일 호출자) async 전환. 유효 RED: "반환값이 Promise인가/await 후 배열인가"
- **ST2b** — webview typecheck(`tsconfig.webview.json` 배선, 현재 어디에도 참조 안 됨) + lint(`.eslintrc.cjs:21`의 `src/webview/**` ignore 제거, `parserOptions.project` 배열에 추가) — ST5(main.ts 분리)의 하드 선행조건
- **ST4** — 전면 DOM digest 골든 하네스 신설(`scripts/verify-webview-surface.mjs`) + **분리 전** 골든 캡처(`test/golden/webview-surface.json`). 축: {sidebar,panel}×{700px,1600px}×{ko,en}. 기존 `verify-calendar-clip.js`(캘린더 기하만 단언)는 병행 유지, 대체 아님
- **ST5 (정정, 2026-08-30 — advisor 검토)** — 원안(sidebarView.ts/panelView.ts/panelCharts.ts/webviewApi.ts 4분할, "기계적 추출")은 실행 중 전제와 충돌 확인: `updateModelBreakdown`/`updateCacheSection`/`updateToolChart`/`updateLongTermSection` 등이 DOM 빌드와 `new Chart()` 생성을 **한 함수 안에서** 같이 하고 있어 `panelCharts.ts` 경계를 그으려면 함수를 반으로 쪼개야 한다 — 더 이상 "기계적"이 아님(ST1의 escapeHtml·ST2의 design-lint와 동일하게 실행 중 발견된 전제 오류, 이번이 세 번째).
  - **1차(이번 릴리즈, 기계적 추출로 확정)**: `webviewApi.ts`(`_vsApi` 단독) + `sidebarView.ts`(`initSidebar`/`recordSbHistory`/`renderSidebar`/`buildSidebarHtml`/`buildContextGaugeHtml`/`buildSidebarCalendarHtml`/`fhHistory`/`sdHistory`/`MAX_HISTORY` — sidebar와 panel은 서로 거의 안 건드려 깔끔하게 쪼개짐) + `panelView.ts`(나머지 전부, 차트 포함).
  - **2차(다음 릴리즈로 연기)**: `panelCharts.ts` 분리 — DOM+Chart 동시생성 함수를 쪼개는 작업이라 별도 검증 라운드 필요(1차 골든 게이트가 먼저 클린해야 그 위에서 안전하게 진행 가능).
  - 이동 전 교차사용 헬퍼 전수조사(`buildCalendarHtml`/`heatLevel`/`fmtTokens`/`fmtAge`/`getCssVar`/`modelKind`/`fmtPct`/`fmtReset`/`statusColor`/`statusLabel`/`barFillWidth` 등) 완료 후 이동 — 순환 import 방지.
  - 침묵 실패 후보 3개 명시 잠금: ①`acquireVsCodeApi()` 1회 제약 → `webviewApi.ts` 단독 소유 ②모듈 스코프 차트 핸들+상태 7종 → 소유 모듈 정확히 하나(1차 분리에서는 전부 panelView.ts 소유로 유지, 문제 안 됨) ③최상위 즉시실행 dispatch(호이스팅 의존) → 이동 대상 코드에 top-level DOM 접근 문(모듈 평가 시점 실행)이 없는지 확인 후 이동.
  - esbuild 단일 엔트리 계약 유지(다중 엔트리 금지, CSP nonce 영향) — 분리 후 `dist/webview/main.js` 크기가 크게 줄지 않았는지 확인(tree-shaking으로 모듈 하나가 안 불릴 경우의 신호).
  - 게이트: `scripts/verify-webview-surface.mjs`(ST4 골든) diff=0 + `verify.sh --full` + `verify-calendar-clip.js`(분리 전 기존 FAIL 6건 그대로, 신규 FAIL 0건) + (가능하면) Xvfb 실 EDH 육안
  - **실행 결과(2026-08-30, acceptance-critic 지적으로 이 문서에 역반영)**: 위 "1차" 예측(3파일)도
    실행 중 재정정됨 — 교차사용 헬퍼 전수조사(`fmtPct`/`fmtReset`/`fmtTime`/`statusLabel`/`fmtPlanTier`/
    `fmtTokens`/`modelKind`/`modelShortName`/`buildCalendarHtml`+상수 3개)가 사이드바·패널 양쪽에서
    실제로 쓰임을 확인해, 3파일로는 순환 import 없이 분리 불가 → **4번째 파일 `webviewShared.ts`**
    (순수 함수 전용, DOM 미접근) 신설. 최종: `webviewApi.ts`+`webviewShared.ts`+`sidebarView.ts`+
    `panelView.ts`. 상세: `docs/plan/verify-spec/ST5-v0.1.54.md`. 전 게이트 그린(골든 diff 0/8,
    calendar-clip 동일 6건, vitest 268/268, eslint 0, 실 EDH 스크린샷 정상).
- **ST6** — vscode-messenger 0.5.x→0.6.1(3패키지 동시 범프: `vscode-messenger`/`-common`/`-webview`). 게이트: `npm run test:e2e`(실 라운드트립, 대조군 포함). **ST4~ST5 사이에 넣지 않음**(런타임 의존성 변경이 골든 diff에 무관한 드리프트를 섞음) — ST5 이후 기본
- **ST7** — 릴리즈 메타. 내부 마일스톤이므로 package.json 버전범프+CHANGELOG만, README 갱신 생략. `docs/PLAN-vnext-migration-2026-07-02.md` §2 R2에 "v0.1.54로 승격·완료" 반영

## 실행 순서

```
ST0(계측) → [분기: ST2a 위치 결정] → ST1 → ST3 → ST2a(미확정시 여기) → ST2b → ST4(골든캡처) → ST5(분리+diff) → ST6(messenger) → ST7
```

## 부수 발견 (범위 밖, footnote)

- `test/integration/extension.test.ts:12`가 `getExtension('cubha.claudepulse')` 조회하는데 실제 ID는 `cubha.claude-code-gauge`(package.json name). `test:integration`이 verify.sh에 없어 미발견 상태로 남아있었음. 이번 계획에 포함 안 함 — 별도 항목으로 처리.
- ST4/ST5/ST6 게이트(`test:e2e`, `verify-calendar-clip.js`, `verify-real-extension-visual.mjs`)가 현재 verify.sh 어디에도 배선 안 됨 — ST5/ST6 구현 시 `--full` 티어에 배선 권장(이 repo 관용구: "강제는 산문이 아니라 기계가 한다")
- `verify.sh`가 v0.1.53으로 이미 dirty, `verify.sh.bak`(untracked) 존재 — ST2a/ST2b가 같은 파일을 또 수정하므로 diff 혼선 주의

## 완료 게이트

- `bash verify.sh --full` FAIL=0 (ST2a/ST2b 배선 반영 후)
- `npm run test:e2e` 통과 (ST6)
- Xvfb 실 EDH 시각검증 (ST5)
- 커밋은 범위 밖, 사용자 명시 승인 필요
