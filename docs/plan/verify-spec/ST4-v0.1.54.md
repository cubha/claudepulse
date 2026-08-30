# VERIFY-SPEC — v0.1.54 ST4: 웹뷰 전면 DOM digest 골든 캡처

## 요청
main.ts 분리(ST5) **전** 웹뷰 전면 DOM digest 골든 하네스 신설(`scripts/verify-webview-surface.mjs`) + 캡처(`test/golden/webview-surface.json`). 축: {sidebar,panel}×{700px,1600px}×{ko,en}. 기존 `verify-calendar-clip.js`는 병행 유지.

## 실제 결과
- `scripts/verify-webview-surface.mjs` 신설. `docs/demo/{panel,sidebar}.html`(실 빌드 `dist/webview/main.js` + fake `acquireVsCodeApi`) 재사용 — 목업 HTML 아님(feedback_webview_ui_verification 교훈 준수).
- 커버리지: main.ts가 실제로 만드는 id 전수(2026-08-30 grep 확정, panel 35개 + sidebar 4개)에 대해 `{존재여부, tag, childElementCount, hasText}` + 전역 `{totalElements, canvases, heatCells}` 카운트를 digest로 캡처.
- **1차 캡처 시도에서 커버리지 결함 2건을 자체 발견·수정**:
  1. id 오분류 — 초안에서 panel 전용 id(`fh-bar-fill`/`fh-remaining`/`fh-reset`/`sd-bar-fill`/`burn-rate-*`/`safe-until-*`, 전부 `buildPanelShell()` 소속)를 SIDEBAR_IDS에 잘못 넣어 sidebar 캡처에서 11/14 id가 `null`로 잡혔다. 소스 재확인 후 PANEL_IDS로 이전, sidebar는 실제 4개(`sb-ov-bar`/`sb-fh-bar`/`sb-sd-bar`/`sb-ctx-bar`)만 남김.
  2. `docs/demo/mock-data.js`의 `MOCK_USAGE.historicalDays`가 빈 배열·`sessionContext` 필드 자체가 없어 Usage Calendar(`heatCells:0`)와 컨텍스트 게이지(`sb-ctx-bar` null)가 항상 "collecting_data" 플레이스홀더 상태로만 캡처돼 그 구간 회귀를 원천적으로 못 잡는 골든이 될 뻔했다. 40일 `historicalDays` + `sessionContext` 목 데이터 추가.
  - 수정 후 재캡처: **8개 조합 전부 null id 0건**, panel `heatCells:376`·`canvases:7`(실제 `new Chart()` 호출 7곳과 일치), sidebar `heatCells:91`.
- `--capture`(골든 쓰기)와 무인자(`--check`, golden 대비 diff) 두 모드 지원. `--check` 자체 실행으로 자기 자신과의 diff 0건 확인(하네스 왕복 무결성).
- ST5에서 이 스크립트를 재실행해 분리 전/후 digest를 비교하는 것이 실제 게이트 — 이번 SubTask는 골든 **캡처**까지만(계획 원문 그대로).

## 부수 발견 — 범위 밖, footnote (사용자 보고 필요)
- **`scripts/verify-calendar-clip.js`가 오늘(2026-08-30) 날짜 기준 6개 항목에서 이미 FAIL 중**(원래 서술 "5건"은 재확인 결과 정정 — 정확히는 아래 6개):
  1. `[대시보드 700px] 기본 스크롤 우측 끝 정렬 (scrollLeft 116)`
  2. `[대시보드 700px] 오늘 셀이 뷰포트 안에 보임`
  3. `[대시보드 1600px ko] 그리드 폭이 카드 폭을 따라 늘어나지 않음 (742px = 54주×14px)`
  4. `[대시보드 1600px en] 그리드 폭이 카드 폭을 따라 늘어나지 않음 (742px = 54주×14px)`
  5. `[사이드탭 300px] 그리드 폭이 사이드바 폭을 따라 늘어나지 않음 (182px = 14주×14px)`
  6. `[사이드탭 420px] 그리드 폭이 사이드바 폭을 따라 늘어나지 않음 (182px = 14주×14px)`

  **`docs/demo/mock-data.js` 원복 후 재실행해도 동일하게 재현** — 이번 ST4 변경이 만든 회귀가 아니라 v0.1.52에서 이미 배포된 Usage Calendar 고정폭 로직의 **날짜 의존 기존 결함**. **근본원인 확정(advisor 지적으로 코드 재확인)**: `calendarView.ts`의 `buildCalendarCells`가 그리드 시작을 월요일로 패딩하되 끝은 `today`에서 멈춘다 — 총 셀 수 = `windowDays + isoDow(windowStart)`(0~6, 요일 의존). `windowDays=371`일 때 371/7=53주 딱 떨어지지만 실제 셀 수는 371~377개(53~54주)로 **요일에 따라 흔들린다** — `verify-calendar-clip.js`의 `PANEL_GRID_W = 54 * CELL_PITCH`/`SIDEBAR_GRID_W = 14 * CELL_PITCH` 상수가 이 흔들림을 반영 못 해 특정 요일에만 FAIL한다. 렌더 결함이 아니라 **테스트 상수 쪽이 날짜의존성을 놓침**. v0.1.54 계획 범위 밖이라 수정하지 않음 — **별도 이슈로 사용자에게 보고 필요**.
  - **ST5 게이트 기준선으로 고정**: 위 6개 라벨을 "분리 전 기존 FAIL"로 기록해두고, ST5 완료 후 동일 스크립트 재실행 결과가 "정확히 이 6개만 FAIL(신규 FAIL 0건)"이면 통과로 판정한다(advisor 지침 — 이 스크립트를 통째로 gate 삭제하지 않고, 대신 회귀 검출력을 baseline-diff로 복원).

## 변경 파일
- `scripts/verify-webview-surface.mjs` (신설)
- `test/golden/webview-surface.json` (신설, 골든 캡처 산출물)
- `docs/demo/mock-data.js` (historicalDays·sessionContext 목데이터 보강 — calendar-clip.js는 자체 pushDays()로 historicalDays를 덮어써 영향 없음, 확인됨)

## 검증
- `npm run build && node scripts/verify-webview-surface.mjs --capture` → 8/8 조합 캡처, null id 0건
- `node scripts/verify-webview-surface.mjs` (self-check) → diff 0건
- `node scripts/verify-calendar-clip.js` → 원본 mock-data.js 기준으로도 동일 5건 FAIL 재현(사전 존재 결함, ST4 무관 확인)
- `npx vitest run` → 34 files / 268 tests PASS (mock-data.js는 vitest 대상 아님, 영향 없음 재확인)

## 정정 (Phase 3 배치검증, scope-critic 지적 반영, 2026-08-30)
scope-critic이 `PANEL_IDS` 배열에서 `sd-remaining`·`sd-reset`(패널 "WEEKLY USAGE" 카드의 남은시간/리셋
텍스트 — `fh-remaining`/`fh-reset`과 대칭이어야 할 짝)이 누락됐음을 발견(DECISION_CHANGED: yes).
grep으로 재확인해 실제 51개 id(panel 47 + sidebar 4) 중 49개만 감시하고 있었음을 확인 — 2개 추가해
`PANEL_IDS`/`SIDEBAR_IDS` 전수(51개)와 스크립트 감시대상 전수(51개)가 정확히 일치함을 재검증
(`comm` diff 양방향 0건). 골든 재캡처 후 self-check diff 0건, `npx vitest run` 268/268 재확인.
**실제 회귀는 없었음** — ST5의 실 EDH 스크린샷(대시보드)에 "WEEKLY USAGE (7D)" 카드의
"resets in 2d 16h · used 69%" 텍스트가 이미 정상 렌더된 것으로 확인됨(ST5 VERIFY-SPEC 참조) — 이번
건은 도구의 감시망 사각(2개 id 누락)이었을 뿐, ST5 분리 자체가 이 요소를 죽인 적은 없다.

## 미확인 사항
- calendar-clip.js의 날짜의존 결함 근본원인은 확정했으나(테스트 상수가 요일 흔들림 미반영) **수정은 하지 않음** — v0.1.54 범위 밖, 별도 이슈로 사용자 보고.
- `counts.totalElements`·`counts.heatCells`는 위와 동일 사유(요일 의존)로 골든 JSON엔 진단용으로 남기되 `diffDigests` 비교에서 제외했다 — `counts.canvases`만 비교 대상.
- 이 golden 하네스는 verify.sh에 아직 배선하지 않음(계획대로 ST5/ST6 구현 시 `--full` 티어에 배선 예정, ST4는 캡처까지가 범위).
