# VERIFY-SPEC — v0.1.54 ST5: main.ts 분리 (1차, 정정된 범위)

## 요청 (정정 후)
원안(4분할: sidebarView/panelView/panelCharts/webviewApi, "기계적 추출")을 advisor 검토로 정정 —
`updateModelBreakdown`/`updateCacheSection`/`updateToolChart`/`updateLongTermSection`이 DOM 빌드와
`new Chart()` 생성을 한 함수 안에서 같이 해 `panelCharts.ts` 경계가 함수 내부를 쪼개야 해서 "기계적"이
아니게 됨 → **1차(이번)**: `webviewApi.ts` + `sidebarView.ts` + `panelView.ts`(차트 포함, 전부)로 축소.
`panelCharts.ts`는 2차로 연기(별도 이슈).

## 사전조사 — 교차사용 헬퍼 전수조사 (advisor 지적사항 #4)
`fmtPct`/`fmtReset`/`fmtTime`/`statusLabel`/`fmtPlanTier`/`fmtTokens`/`modelKind`/`modelShortName`/
`buildCalendarHtml`(+`CALENDAR_LOCALE`/`CALENDAR_WINDOW_DAYS`/`SIDEBAR_CALENDAR_WINDOW_DAYS`)가
사이드바·패널 양쪽에서 실제로 쓰임을 grep으로 확인(2026-08-30) — 3파일로는 순환 import 없이
분리 불가하다고 판단해 **4번째 파일 `webviewShared.ts`**(순수 함수 전용, DOM 미접근)를 신설.
`statusColor`/`barFillWidth`/`buildBurnRow`도 실제로는 편측 전용이었으나(각각 사이드바/패널/사이드바
전용) 물리적으로 같은 블록(원본 55-116행)에 있어 통째로 webviewShared.ts로 옮김 — 불필요한 export가
남지만 부작용 없음(esbuild가 미사용 export는 번들에서 제외).

## 실제 결과 — 파일 구성
- `src/webview/webviewApi.ts`(10줄, 신설) — `vsApi`(구 `_vsApi`) 단독 소유.
- `src/webview/webviewShared.ts`(157줄, 신설) — 위 교차사용 헬퍼 전부 + `buildCalendarHtml`.
- `src/webview/sidebarView.ts`(525줄, 신설) — `initSidebar`(export) + 그 전용 헬퍼(`fmtAge`,
  `CONTEXT_STALE_THRESHOLD_MS`, `modelAccentClass`, `buildUsageRowHtml`, `buildLangSelect`,
  `buildSidebarHtml`, `buildContextGaugeHtml`, `buildSidebarCalendarHtml`) — 자체 `const root = ...`.
- `src/webview/panelView.ts`(1195줄, 신설) — `initPanel`(export) + 패널 상태(차트 핸들 7종·
  `panelUsage`·`fhHistory`/`sdHistory` 등) + `update*` 렌더 함수 전부(차트 생성 포함) — 자체
  `const root = ...`, `Chart.register(...registerables)`도 이 파일로 이전(패널만 차트 사용).
- `src/webview/main.ts`(1882줄 → **27줄**) — `mode` 분기 dispatch만 소유.

## 침묵 실패 후보 3개 — 처리 결과
1. **`acquireVsCodeApi()` 1회 제약** — `webviewApi.ts` 단독 호출로 고정. sidebarView.ts/panelView.ts는
   `import { vsApi } from './webviewApi'`만 함 → 재호출 경로 없음(실 EDH 구동에서 Messenger 정상 초기화 확인).
2. **모듈 스코프 차트 핸들 7종** — 1차 분리에서는 이동하지 않고 전부 panelView.ts 하나가 계속 소유
   (2차 panelCharts.ts 분리 시 다시 다뤄야 할 문제, 이번엔 발생 안 함 — 실 EDH 스크린샷에서 Chart.js
   두 차트(Utilization Trend·Daily Cost)가 "Canvas is already in use" 없이 정상 렌더 확인).
3. **최상위 즉시실행 dispatch(호이스팅 의존)** — 이동 전 grep으로 이동 대상 코드에 top-level(함수 밖)
   DOM 접근 문이 없음을 확인(모두 함수 정의 내부). `SIDEBAR_CALENDAR_WINDOW_DAYS`(webviewShared.ts) →
   `buildSidebarCalendarHtml`(sidebarView.ts) 참조는 원래도 같은 파일 내 hoisting에 기댔던 지점인데,
   ESM은 import 대상 모듈을 importer의 top-level 코드보다 먼저 완전히 평가하므로 분리 후가 **오히려
   더 안전**해졌다(비동기 콜백에서만 호출되던 지점이라 원래도 실제 TDZ 위반은 없었음, 재확인).

## 검증 (전부 PASS)
- `npx tsc --noEmit -p tsconfig.webview.json` → 에러 0
- `npm run build` → 성공. **번들 크기 584.9kb → 585.3kb**(소폭 증가, 감소 아님 — tree-shaking으로
  모듈이 통째로 빠지는 침묵 실패의 반증 신호로 advisor가 지시한 체크리스트 항목)
- `node scripts/verify-webview-surface.mjs`(ST4 골든) → **diff 0건**(8/8 조합)
- `node scripts/verify-calendar-clip.js` → **분리 전과 정확히 동일한 6건 FAIL, 신규 FAIL 0건**
  (baseline: ST4 VERIFY-SPEC에 기록된 6개 라벨과 1:1 일치 확인)
- `npx vitest run` → 34 files / 268 tests 전부 PASS
- `npx eslint src --ext ts` → **error 0 · warn 0**(분리 전 warn 2건 중 1건은 webviewApi.ts 재작성 중
  두 번째 `eslint-disable-next-line`을 추가로 붙여 해소 — 순수 기계적 이동은 아니지만 동작 변화 없는
  린트 주석 추가일 뿐이라 부작용 없음, ST2b VERIFY-SPEC 미확인 각주 1건이 이걸로 해소됨)
- **Xvfb 실 EDH 시각검증**(`xvfb-run -a node scripts/verify-real-extension-visual.mjs`) — 실제
  `~/.claude` jsonl 데이터로 사이드바·대시보드 둘 다 정상 렌더 스크린샷 확보. 대시보드의
  Utilization Trend(line)·Daily Cost(bar) 차트 2종 모두 실제 데이터로 그려짐(Chart.js 정상 동작
  확인, "가능하면" 조건이었으나 환경에 xvfb-run·VS Code 테스트 바이너리·playwright-core가 모두
  존재해 실행 가능했음).

## 변경 파일
- 신설: `src/webview/webviewApi.ts`, `src/webview/webviewShared.ts`, `src/webview/sidebarView.ts`, `src/webview/panelView.ts`
- 대폭 축소: `src/webview/main.ts`(1882→27줄)

## 정정 (Phase 3 배치검증, 2026-08-30)
ST4 골든 하네스의 `PANEL_IDS` 누락 2건(`sd-remaining`/`sd-reset`)이 scope-critic 검토 중 발견돼
ST4 문서에서 수정·재캡처됨(ST4-v0.1.54.md 정정 섹션 참조). 이 SubTask(ST5) 자체의 분리 결과는
영향받지 않음 — 실 EDH 스크린샷에 해당 요소가 이미 정상 렌더돼 있었다.

## 미확인 사항
- `panelCharts.ts` 2차 분리는 이번 릴리즈 범위 밖(다음 릴리즈로 연기, PLAN 파일에 명시).
- 새로 만든 4개 파일에 대한 전용 유닛 테스트는 작성하지 않음 — main.ts 자체가 원래도 유닛테스트
  대상이 아니었고(webview DOM 코드), 이번 SubTask는 리팩터(행위 불변)라 characterization 백필도
  범위 밖으로 판단(ST1이 커버한 서비스 레이어와 성격이 다름). 회귀 감지는 골든 digest+calendar-clip+
  실 EDH 스크린샷 3중으로 대체.
