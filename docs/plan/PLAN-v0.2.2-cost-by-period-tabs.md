# PLAN — v0.2.2: 기간별 비용 탭 통합 + 이월 항목 종결

> 수립: 2026-09-21 · 기준선 소스: 사용자 요구사항(세션 대화) + `docs/plan/PLAN-v0.2.1-codex-hardening.md` §7 잔여 + memory `project_roadmap`
> 파이프라인: `/sh-dev-loop --tdd --auto`

## 1. 사용자 요구사항 (원문 — 요약 금지)

```
지금 대시보드에 월별비용, 일별비용 나눠져잇는데, 이를 기간별비용으로 label붙이고 내부에 탭으로 전환하여 표시하도록 바꿔줘.

이와같은 섹션이 있으면 추가로 반영하고 얘기해줘.
이관된 항목잇으면 이번패치 (022v)에 같이작업해
/sh-dev-loop --tdd --auto
```

### R1. 기간별 비용 통합
대시보드의 **월별 비용**·**일별 비용** 두 섹션을 "기간별 비용"이라는 단일 라벨의 섹션으로 묶고,
섹션 **내부 탭**으로 전환 표시한다.

### R2. 동종 섹션 추가 반영 + 보고
"이와같은 섹션"(같은 지표를 기간 단위만 달리해 별도 섹션으로 나눠 놓은 곳)이 더 있으면 함께 반영하고
**사용자에게 보고**한다. 보고는 부수 산출이 아니라 요구사항의 일부다.

### R3. 이월 항목 동반 처리
이전 릴리스에서 이월(deferred)된 항목이 있으면 v0.2.2에 함께 작업한다. 이월 항목의 **전수 목록**과
각각의 포함/제외 판정·사유를 보고한다(목록 자체가 산출물).

## 2. R2 판정 — 동종 섹션 전수 조사 결과

`buildPanelShell()`의 13개 섹션을 전수 확인한 결과, **"같은 지표(비용)를 기간 단위만 달리해 별도
섹션으로 나눈 것"은 사용자가 지목한 2개가 아니라 3개**다.

| id | 라벨 | 성격 | 통합 |
|---|---|---|---|
| `panel-daily-card` | 일별 비용 (최근 7일) | 7일 바차트 + 비용이상행 + 중앙값 범례 | ✅ 탭 1 |
| `panel-longterm-card` | **장기 비용 트렌드** | 30/90/180일 라인차트 + 가격결손 note | ✅ 탭 2 (**추가 반영분**) |
| `panel-monthly-card` | 월별 비용 | 월 단위 바차트 + 가격결손 note | ✅ 탭 3 |

**통합 대상이 아닌 것**(같은 계열로 오인하기 쉬움 — 기록해 둔다):
- `panel-fh-card`/`panel-sd-card`(5H/7D) — 비용이 아니라 **레이트리밋 게이지**이고, 이미 나란한 지표밴드
  카드다(섹션이 아님). 탭으로 숨기면 헤드라인 지표가 한 번에 안 보이는 퇴행.
- `panel-util-trend-card`(30m/2h/24h)·`panel-skill-card`(전체/24h/7d) — **이미 내부 토글이 있다**.
  요구사항이 없애려는 "섹션 분산" 자체가 없다.
- `panel-calendar-card` — 1년 고정 뷰, 토글 없음이 GitHub 관례에 따른 의도적 결정(v0.1.43).

## 3. R3 판정 — 이월 항목 전수 목록

| # | 항목 | 출처 | v0.2.2 | 사유 |
|---|---|---|---|---|
| D1 | **ST10 회귀테스트** — Codex 버킷 히스토리 `windowMinutes` 키잉 잠금. `sidebarView.ts:27`이 모듈 최상단에서 `document.getElementById('root')`을 호출해 vitest(`environment:'node'`)에서 import 자체가 불가 | PLAN-v0.2.1 §7 "후속 과제로 남김" | ✅ **포함** | 명시적 이월 1순위. 모듈 import 가능화(lazy root)만 하면 해소 |
| D2 | **동일 크기 rotate 미탐지** — `canIncrement = cached.offset <= stat.size`가 파일이 같은 크기로 교체된 경우를 구분 못 함 | v0.2.1 /ship security-auditor #2 (비치명 판정, as-is) | ✅ **포함(조건부)** | billing-critical 경로. 단 **콘텐츠 지문(head N바이트) 방식으로 ~10줄+테스트 1개 안에 끝날 때만** — 넘으면 이월하고 보고(metadata `ino`/`birthtime`은 WSL/DrvFs에서 신뢰 불가 → 폴링 루프 재파싱 thrash 위험이 버그보다 나쁨) |
| D3 | ST12/ST13 마켓 스크린샷·GIF 재촬영 | PLAN-v0.2.1 §4 | — **이월 아님(완료)** | `media/*` 2026-09-20 갱신, 커밋 `79b6f7d`에 포함 |
| D4 | M3 `.panel-root` 좌우 패딩 `--sp-4`→`--sp-6` | PLAN-design-evolve §구현결과 | ❌ **제외** | 보류에 기술적 사유가 있다(advisor: P0 Y축정렬 주석 + 캘린더 고정폭 충돌). 자동 재개 대상이 아님 |
| D5 | v0.1.53 ST3 라이트테마 | memory `project_v0153_release_plan` | ❌ **제외** | 검증수단 부재로 **드롭 확정**(이월 아님) |
| D6 | **Codex 네이티브 게이지** — 대시보드 BURN RATE/SAFE UNTIL 카드 N버킷화 + Utilization Trend 차트 재설계 + StatusBarController Codex 연결 | PLAN-v0.2.1 §2 "v0.3+ 이월 확정" | ❌ **제외** | 고정 DOM id 1세트·2데이터셋 하드코딩·`FH_WINDOW_MS` 단일 윈도·`RateLimitSnapshot` 고정 타입을 전부 N버킷 동적으로 재설계하는 **아키텍처 작업**. 패치 릴리스(0.2.2) 범위 밖이며 별도 PLAN 필요. *검토했고 의도적으로 뺐다* |
| D7 | ③ 모델별(Fable) 주간 한도 게이지 / Cursor 계측 / v0.1.37 회고 V2 | roadmap | ❌ **제외** | 전부 **외부 조건 대기**(Anthropic이 model_scoped를 응답 헤더로 노출 / Cursor 개인 공식 API 출시 / V2 백로그). 우리가 착수할 수 있는 항목이 아님 |
| D8 | **프로바이더 2종 × 빈상태 3종 실 VS Code 창 스크린샷** — headless 목업이 아니라 실기 Extension Host 캡처 | PLAN-v0.2.0 §7 ST10 행 "**미완료로 남김**", v0.2.1 ST13이 승계 | ❌ **제외(측정 후 판정)** | 2026-09-21 브리지 가용성 **재측정**: `runjob-limited.sh` → `TIMEOUT: done-limited.txt 없음 (Session 1 미도달)`. v0.2.0 당시 2회 타임아웃과 같은 상태다. **원리적 불가가 아니라 지금 배선이 끊긴 것**이며, 코드 변경으로 닫을 수 있는 항목이 아니다. 브리지 복구 시 재시도 |
| D9 | **GitHub Release 생성 — v0.2.0 및 그 이전 태그(~8개)** | PLAN-v0.2.1 §7 "ST14 ... 별도 승인 대기로 보류" | ❌ **제외(사용자 결정)** | 2026-09-21 세션에서 사용자가 범위를 **"v0.2.1만"**으로 명시 선택했고 그대로 생성 완료(`gh release list` → v0.2.1 1건). 과거 태그 소급 생성은 사용자가 선택하지 않은 것이지 미처리가 아니다. 비코드·릴리즈 액션이라 이 패치의 코드 범위와도 무관 |

## 4. 확정 제약

- 프로젝트 CLAUDE.md §3 CRITICAL 전부. 특히 **#5 선언 밖 색 리터럴 0건**·**#6 7+1 액센트 cap**·**#7 외부 폰트 금지**
- 디자인 토큰 GT = `src/webview/styles.css`. **이번 라운드 신규 색 토큰 0** — `.scope-btn` 계열 기존 패턴 재사용
- `daily_cost` i18n 키는 **삭제·개명 금지** — `panelView.ts:1170`이 `t('daily_cost').split(' ')[0]`로 브랜치 비용 라벨에 재사용한다
- `rebuildPanelDom()`은 셸을 기본값으로 다시 그린다 → **새 탭 상태도 여기서 리셋**해야 한다(안 하면 active 표시와 렌더 데이터가 어긋나는, 그 함수 주석이 이미 기록한 divergence 재생산)
- 커밋·배포 금지 — 이 파이프라인은 구현+검증까지. ship은 별도 명시 승인(`feedback_ship_gate` 절대원칙)
- ~~릴리즈메타(package.json/CHANGELOG) 갱신은 ship 단계 소유 — 여기서 손대지 않는다(v0.2.1과 동일)~~
  → **2026-09-21 사용자 지시로 덮어씀**: `"미리 version bump도 해둬(배포x)"`. 릴리즈메타는 **선반영하되 ship은 금지**로 변경(§8 참조). 원 문구는 취소선으로 남긴다 — 지웠다면 왜 규칙이 바뀌었는지가 사라진다

## 5. SubTask (라우팅: 전량 `[S]` — 독립 파일 2~3개로 4 미만)

| # | 항목 | TDD | 대상 파일 |
|---|---|---|---|
| ST1 | `buildPanelShell()` — daily/longterm/monthly 3섹션을 `panel-cost-period-card` 단일 카드로 통합. 탭줄 + 3개 pane. **차트/빈상태/note/readout id는 전부 그대로 유지**(update 함수 무변경 보장) | ✗ (UI, 절대제외) | `src/webview/panelView.ts` |
| ST2 | 탭 상태·전환 배선 — `costPeriodTab` 상태, `.cost-tab-btn` 핸들러, `applyCostPeriodTab()`(pane/readout/aria 토글), `updateCostPeriodSection()` 디스패처. `updateUsageSection()`이 3개 직접 호출 → 디스패처 1개로. `rebuildPanelDom()`에 탭 리셋 추가. **숨은 pane에서 Chart를 생성하지 않는다**(0×0 생성 후 resize 의존 회피) | ✗ (UI) | `src/webview/panelView.ts` |
| ST3 | `styles.css` — `.cost-tab-row`/`.cost-tab-btn`. **탭은 밑줄형**(하단 2px `--vscode-focusBorder`), 안쪽 범위 토글(`.lt-scope-btn`)은 기존 알약형 그대로 — 두 줄이 서로 다른 조작임을 모양 자체가 설명한다. 신규 색 토큰 0 | ✗ (UI) | `src/webview/styles.css` |

> **ST3 개정(2026-09-21, verify-impl 축B B-V1)**: 최초 구현은 `.cost-tab-btn`을 `.scope-btn` 계열 선언에 합류시켜 **모양이 완전히 동일**했고, 구분 장치가 1px 경계선 하나뿐이었다. 축B가 "두 버튼 줄이 한 그룹처럼 읽힌다"고 지적 — 스펙 위반은 아니었으나(스펙이 그 정도만 요구했다) 캡처로 실제 확인되는 문제라 **스펙 쪽을 고쳤다**. 밑줄형 탭은 관례 자체가 구분을 설명하므로 설명 라벨을 추가할 필요가 없다.
| ST4 | i18n 4키 × 4언어 — `cost_by_period`, `period_tab_daily`, `period_tab_longterm`, `period_tab_monthly`. `daily_cost`/`long_term_trend`/`monthly_cost`는 **존치**(ST1이 헤더에서 안 쓰게 되지만 키 삭제 금지 — §4) | ✗ | `src/webview/i18n.ts` |
| ST5 | 회귀잠금 갱신 — `panelDesign.invariants.test.ts`: **카드 6개 유지**(통합 카드가 daily의 슬롯 승계), survivor `panel-daily-card`→`panel-cost-period-card`, stripped에서 longterm/monthly 제거(id 소멸). **추가 단언**: pane 정확히 3개 · 3개 canvas 전부 존치. 골든 하네스 `PANEL_IDS` 동기화 | ✗ (명세 변경 — 사용자 보고 필수) | `test/unit/panelDesign.invariants.test.ts`, `scripts/verify-webview-surface.mjs` |
| ST6 | **[D1]** `sidebarView.ts` 모듈 최상단 `document` 접근 제거(lazy root) → node env import 가능화 | ✗ | `src/webview/sidebarView.ts` |
| ST7 | **[D1]** ST10 회귀테스트 — `buildSidebarHtml`/`buildCodexSidebarHtml`의 버킷 히스토리가 배열 인덱스가 아니라 `windowMinutes`로 키잉됨을 잠근다. **잠금이 실제로 무는지** 인덱스 키잉으로 일시 되돌려 RED 확인 후 복원 | **[TDD 사후보강]** | `test/unit/webviewShared.*` 또는 신규 `test/unit/sidebarBucketHistory.test.ts` |
| ST8 | **[D2]** 동일 크기 rotate 하드닝 — head 지문 비교. §3 D2 예산(~10줄+테스트 1) 초과 시 **중단하고 이월 보고** | **[TDD]** | `src/sources/codex/CodexSource.ts`, `test/unit/sources/CodexSource.test.ts` |
| ST9 | 실렌더 검증 — 실빌드 + `docs/demo/panel.html` + Playwright 캡처. **2폭(700/1600) × 2로캘(ko/en)**, 탭 3개 전환 각각 캡처 | ✗ | (검증 산출물) |

## 6. UI/UX 설계 명세

**Ground Truth**: `src/webview/styles.css`(토큰) · `docs/design/DESIGN-TOKENS.md` · `docs/design/prototype/00-clausight-canvas.html`
**분기 판정**: 분기 A — 기존 화면(대시보드) 내 **재배치**다. 신규 화면이 아니므로 `/frontend-design` 호출 생략.

- **레이아웃**: 헤더(`기간별 비용` + 활성 탭의 readout) → 탭줄(3버튼, 하단 경계선) → 활성 pane 1개.
  나머지 pane은 `display:none`. 장기 탭은 자기 pane 안에 기존 30/90/180 토글을 **그대로** 유지(중첩 정상).
- **인터랙션**: 클릭 전환. 전환 시 ①`.active`/`aria-selected` 이동 ②pane 표시 전환 ③활성 탭 readout만 표시
  ④활성 탭 updater 1회 호출(그 시점에 컨테이너가 보이므로 Chart가 정상 크기로 생성된다).
- **비주얼**: 신규 색 토큰 0. **탭 = 밑줄형**(비활성 투명 → 활성 `--vscode-focusBorder` 2px), **범위 토글 = 기존 알약형 유지**. 간격은 `--sp-2/3`. (개정 근거는 §5 ST3 아래 주석)
- **접근성**: `role="tablist"`/`role="tab"`/`aria-selected`/`role="tabpanel"`.
- **기본 탭**: `daily` (현재 화면에서 가장 위에 있던 섹션 = 기존 첫인상 유지).

## 7. 검증 요구

- `bash verify.sh --full` — 현재 기준선 PASS=29/FAIL=0 유지
- vitest 전체 통과 + ST7/ST8 신규 테스트
- 골든 digest 변경 시 `--capture --accept-regression "<사유>"`로 **사유 기록 후** 재캡처
- ST5 테스트 편집은 "명세 자체가 변경됨" 케이스 — **무엇을 바꿨고 왜인지 사용자에게 명시 보고**

## 8. 진행 상태

| 단계 | 상태 |
|---|---|
| PLAN 수립 | ✅ 2026-09-21 (본 문서) |
| 구현(ST1~ST9) | 🔜 |
| /verify-impl 배치 검증 | 🔜 |
| 마켓 이미지 재촬영 | ✅ 완료(2026-09-21, 사용자 지시) — Windows GUI 브리지는 **재측정에서도 타임아웃**(Session 1 미도달)이라 실기 창 캡처는 불가. 대신 기존 자산과 **동일한 방식**(실 빌드 `dist/webview/main.js` + `docs/demo` 고정 입력 헤드리스 합성)으로 재촬영하고, 그 절차를 `scripts/capture-media.mjs`로 **하네스화**했다 — v0.1.40 캡처가 v0.2.0까지 stale하게 출하된 재발을 막는다. 산출: `media/screenshot-dashboard.png`(1100×680) · `media/demo-dashboard.gif`(752×632, 28프레임, 489KB — 스크롤 후 기간별 비용 탭 3개 시연 포함). GIF 인코딩 의존성(gifenc·pngjs)은 런타임 스택이 아니므로 `--no-save`로만 쓰고 package.json에 넣지 않았다 |
| 릴리즈메타 갱신 | ✅ 완료(2026-09-21, 사용자 지시 "미리 version bump도 해둬(배포x)") — `package.json` 0.2.1→**0.2.2**, `CHANGELOG.md` [0.2.2] 항목, `README.md` What's New v0.2.2(v0.2.1은 `<details>`로 강등). `package-lock.json`은 기존 관례대로 미갱신 |
| ship | ⛔ **미승인 — 진행 금지**. 사용자가 "배포x"를 명시했다(`feedback_ship_gate` 절대원칙) |

---

## 9. Phase 3 배치 검증 결과 (2026-09-21)

### 기계축 — `bash verify.sh --full`
**PASS=30 · FAIL=0**. 기준선 29 + 신규 게이트 1(`기간별 비용 탭 전환 (2폭×2로캘×3탭)`).
디자인 토큰 D-1~D-5 전부 통과(선언 밖 색 리터럴 0건 유지).
> `design-lint` error 9건은 **이번 변경과 무관**하다 — 이 린터는 `docs/design/prototype/*.html`만 보고,
> 이번 diff에 프로토타입 파일이 없다. CLAUDE.md §9 기준선(error 6)과의 차이는 선행 드리프트이며
> 게이트 미적용(보고 전용) 항목이다.

### 파급반경축 — `scope-critic` ×2

**ST6~ST8(이월 항목): `DECISION_CHANGED: no`** — 수정안 그대로 진행.
행위 보존 확인 4건: ①`root` const→let의 런타임 동등성 ②`if`→`while` shift의 동등성(버킷당 push 1회)
③`buildCodexSidebarHtml` export는 테스트 전용 소비로 정당 ④`sameFileHead` 접두 비교가 256B 미만
성장 구간에서 거짓 불일치를 내지 않음.

**ST1~ST5(탭 통합): `DECISION_CHANGED: yes` → 무시(사유 기록)**
- **critic 지적**: `panel-cost-period-card`를 `CLAUDE_ONLY_PANEL_IDS`에 추가해야 한다. 근거로
  "기간별 비용은 Claude 시간 의미론이고 통합 전 3개 카드도 Claude 전용이었다"를 들었다.
- **무시 사유**: 그 전제가 사실과 반대다. ①`git show HEAD:src/webview/panelView.ts` 확인 결과 통합 전
  `CLAUDE_ONLY_PANEL_IDS`는 `panel-fh/sd/burn/safe/util-trend/skill/retro` 7개뿐이고 daily·longterm·
  monthly는 **애초에 들어 있지 않았다** — 즉 이번 통합은 provider 가시성 동작을 1비트도 바꾸지 않았다.
  ②같은 파일 `panelView.ts:276` 주석이 명시한다: *"나머지(daily/calendar/model/cache/tools/files/
  sessions/branch)는 UsageSummary 기반이라 provider 무관하게 이미 정상 동작한다(P2 codex axis 골든
  캡처로 확인됨)"*. ③골든 `panel@700px@ko@codex` 축에서 `panel-cost-period-card`가 정상 렌더로
  잡히고 `CODEX_EXPECTED_NULL_IDS.panel`은 빈 배열이다.
- critic 제안을 따랐다면 **Codex 사용자가 지금까지 보던 비용 이력이 사라지는**, 요청에 없던 퇴행이 된다.

### 기준선축 — `acceptance-critic` ×1
**UNMET 1 · UNREQUESTED 0 · UNKNOWN 0 · SPEC 2**

- **R1 ✅ 충족** — `panelView.ts:453-493` 통합 카드 + `role="tablist"` 3탭 + pane 3개, 전환 배선
  (`applyCostPeriodTab` 658-676 · `updateCostPeriodSection` 679-682 · 핸들러 115-119), 기본 탭 `daily`.
- **R2 ✅ 충족 + 전수성 독립 검증 통과** — critic이 `buildPanelShell()` 전 구간을 직접 읽어 §2의 3개 외에
  "같은 지표를 기간 단위만 달리해 나눈 섹션"이 **더 없음**을 확인.
- **§4 제약 ✅ 전항목 충족** — §3#5 색 리터럴 0 · §3#6 신규 `--c-*` 0 · §3#7 외부 폰트 0 ·
  `daily_cost` 키 존치 · `rebuildPanelDom` 탭 리셋.
- **미요청 추가 0건** — 신규 게이트+verify.sh 배선은 ST9의 코드 구현이자 `feedback_gate_wiring_signal`
  컨벤션 합치로 범위 안 판정.
- **R3 ⚠️ 부분 → 보완함(V1·V2)**: §3 이월 목록에 2건이 빠져 있었다("목록 자체가 산출물"이라는 R3 요건
  미충족). **D8**(실기 VS Code 스크린샷)·**D9**(v0.2.0 이전 GitHub Release)를 판정·사유와 함께 §3 표에
  추가. D8은 산문이 아니라 **재측정**으로 판정했다(브리지 타임아웃 실측).

> 보완은 PLAN 문서 갱신이므로 `verify.sh`만 재실행했다(sh-dev-loop Phase 3-2 FIX 규칙 —
> 코드가 바뀌어도 이미 받은 critic 판정은 유효하고, 재호출은 확정 결과를 흔든다).

### 골든 재캡처 diff 전수 확인 (2026-09-21)
재캡처 로그를 `tail`로만 봤더니 "감시목록 제거" 19줄만 남고 **값 diff가 스크롤 아웃**돼 있었다.
전수 열거 + **날짜 효과 격리**(HEAD를 별도 worktree에 체크아웃해 같은 날 재캡처)로 다시 확인:

| 축 | 날짜만(HEAD 코드) | 이번 변경 포함 | 순수 기여 |
|---|---|---|---|
| `bySelector` 값 diff | 0건 | **0건** | 0 — 살아남은 감시 id의 지문이 전부 동일 |
| `counts.canvases` | 7 (무변) | 7 (무변) | 0 — **차트 유실 없음** |
| `counts.heatCells` | 376→377 / 91→92 | 동일 | 0 — 캘린더 1년 롤링 뷰의 날짜 경과분 |
| `panel.totalElements` | 705→707 / 633→635 | 710 / 638 | **+3** |
| `sidebar.totalElements` | 219→221 / 174→179 | 동일 | **0** |

`+3`은 구조 계산과 정확히 일치한다: 이전 `카드3+헤더3+readout3=9` → 이후 `카드1+헤더1+readout3+탭줄1+버튼3+pane3=12`.
사이드바 변동분은 **전부 날짜 효과**이며 이번 diff 기여가 0임이 격리 측정으로 확인됐다.

### 언어 전환(PushLang) 탭 리셋 게이트 — 추가 배선 + 자기검증
`rebuildPanelDom()`의 `costPeriodTab = 'daily'`는 load-bearing인데 어느 검증기도 안 건드리고 있었다
(초기 로드만 보는 12조합은 런타임 언어 전환 경로를 타지 않는다). `verify-cost-period-tabs.mjs`에
`pushLang` 브로드캐스트 → 리셋 단언을 추가.

**첫 구현은 물지 않았다(실측).** pane·버튼 표시만 단언했더니 리셋 줄을 지워도 초록이었다 —
`buildPanelShell()`이 셸을 **항상** daily active로 다시 그려 DOM은 정상으로 보이기 때문이다.
어긋남이 드러나는 곳은 차트다: 보이는 daily pane엔 캔버스가 없고 "수집 중"만 남으며 monthly 차트가
숨은 pane에 그려진다. 단언을 `chart-daily`가 **실제로 렌더됐는가**로 바꾸자 리셋 줄 제거 시 4/4 FAIL,
복원 시 4/4 PASS로 잠금이 확인됐다.
> 교훈: "게이트를 배선했다"와 "그 게이트가 문다"는 다르다. 새 게이트는 반드시 **일부러 깨뜨려 RED를
> 본 뒤** 채택한다 — 이번엔 그 절차가 첫 구현의 무력한 단언을 잡아냈다.

---

## 10. /verify-impl 인수검증 (2026-09-21, 사용자 지시)

### 1라운드

**축A `acceptance-critic`** — `UNMET 0 · UNREQUESTED 0 · UNKNOWN 3 · SPEC 3`
- R1 ✅ · R2 ✅(`buildPanelShell()` 전체 통독 독립 재검증, §2 제외 판정과 일치) · R3 ✅(PLAN-v0.2.0 §7 / v0.2.1 §7 / design-evolve 3개 출처 직접 대조, D1~D9 누락 없음)
- 릴리즈메타 3종 정합 ✅ · §4 제약 ✅(`gifenc`/`pngjs` package.json 미포함 직접 확인) · 미요청추가 0건
- **기준선 자체의 내적 모순 지적**: §4 "릴리즈메타는 ship 단계 소유, 여기서 손대지 않는다" ↔ §8 "릴리즈메타 갱신 ✅완료". 세션 중 사용자 지시가 §4를 덮어쓴 것이나 낡은 문구가 남아 있다는 지적 → **기준선 갱신으로 정정**(§4에 취소선 + 덮어쓴 사유 명기. 지우지 않은 이유: 지우면 규칙이 왜 바뀌었는지가 사라진다)
- UNKNOWN 3건(V1 verify.sh 수치 · V2 배포 흔적 · V3 package.json diff)은 전부 **비평가에게 Bash가 없어** 관측 불가했던 사실

**축B `screen-critic`** — `DEVIATION 0 · UNSPEC 0 · UNKNOWN 0 · SPEC 1`
- 4축(요소 유무·정보 위계·상태 표현·레이아웃) 전부 ✅. ko/en × 좁은폭(700), Codex 축, 마켓 히어로 합성까지 실렌더 확인
- design-lint error 6건은 `panel.html`의 브라우저 미리보기용 인라인 테마 목업 CSS에서 나온 것으로 이번 diff와 무관함을 `styles.css` 직접 검사로 교차확인
- **B-V1(낮음)**: 탭줄과 장기 pane 내부 범위 토글의 버튼 **모양이 완전히 동일**해 1px 경계선만으로는 구분이 약하다. 스펙 위반은 아님(스펙이 그 정도만 요구했다)

### 보완

- **B-V1 → 보완함(기준선까지 갱신)**. 캡처에서 실제로 확인되는 문제라 무시하지 않고 **스펙 쪽을 고쳤다**: `.cost-tab-btn`을 `.scope-btn` 공유 선언에서 분리해 **밑줄형 탭**으로 분화(알약형 → 하단 2px `--vscode-focusBorder`). 탭이라는 관례 자체가 구분을 설명하므로 설명 라벨 추가가 불필요하다. 신규 색 토큰 0 유지. §5 ST3·§6 비주얼 개정.
- **UNKNOWN 3건 → 증거 공급 후 재판정 요청**. 메인이 판정하지 않고 `bash verify.sh --full`·`git log/tag/status`·`ls *.vsix`·`gh release list`·`git diff package.json` **원시 출력**을 `evidence-round2.md`로 넘겼다(verify-gate §5: 메인은 ❓를 ✅로 바꾸지 않는다. 증거 공급은 자기승인이 아니다).

### 2라운드 (델타만 — 1라운드 ✅ 항목은 재판정하지 않음)

- **축A V1·V2·V3 → 전부 ✅**. V2 판정에서 비평가가 `gh release list`의 v0.2.1 1건을 릴리즈 타임스탬프(01:59:05Z)와 증거 파일 생성시각(03:35:01Z)의 선후로 교차검증해 "직전 세션 산출물"임을 확인. `git status`가 전부 `M`/`??`라는 점을 "커밋된 적 없음"의 직접 근거로 채택.
- **축B B-V1 → ✅ 해소**. "밑줄형 텍스트 탭 vs 필드형 세그먼트 버튼"으로 형태 자체가 달라 관례만으로 즉시 구분된다는 판정. 우려했던 활성 탭 식별성은 굵기600 + 밑줄 + 전경색 전환 3중 신호로 충분. Codex 축에서 밑줄이 코덱스 그린이 아닌 `--vscode-focusBorder`인 것은 "신규 색 토큰 0" 스펙 의도대로이며 이탈 아님. 신규 문제 0건.

### 최종

```
UNMET 0 · UNREQUESTED 0 · UNKNOWN 0 · SPEC 0
verify.sh --full PASS=30 / FAIL=0 · vitest 486/486
```

마켓 이미지는 B-V1 보완으로 탭 모양이 바뀌어 **재촬영을 한 번 더 돌렸다**(`scripts/capture-media.mjs` 1회 명령 — 하네스화의 첫 배당금).

---

## 11. 후속 보완 — 장기 탭 내부 범위 토글 잠금 (2026-09-21, 사용자 확인 요청)

사용자 질문("장기비용트렌드 섹션의 범위설정도 누락 안 시키고 잘 이관했지?")을 계기로 점검한 결과,
**이관 자체는 정상이었으나 어느 게이트도 그것을 보고 있지 않았다.** ①~④는 탭 전환만 단언해서,
탭 *안으로* 들어간 기존 조작이 조용히 죽어도 전부 초록이 난다.

**실측 확인(런타임)**: 장기 탭에서 30일→90일→180일→30일을 실제로 클릭. `.lt-scope-btn.active`가
정확히 따라 움직이고, 30일과 180일의 차트 렌더가 다르며(범위 필터 동작), 30일로 되돌리면
**픽셀 차이 0**으로 첫 렌더가 그대로 복원된다(상태 누수 없음).

**주의 — 90일과 180일은 정상적으로 같다**: `docs/demo/mock-data.js:91`의 `historicalDays`가 **40일치**라
두 범위 모두 전체 40일을 담는다. 픽스처 길이에 묶인 단언(90≠180)을 넣으면 데이터가 늘어날 때
거짓 실패가 나므로 **넣지 않았다**.

**게이트 ⑤ 신설**(`verify-cost-period-tabs.mjs`): Chart 인스턴스를 번들 밖에서 잡을 수 없어
`canvas.toDataURL()` 픽셀 지문으로 판정한다 — ①active 이동 ②30일≠180일 ③30일 재선택 시 지문 복원.
**자기검증**: 범위 토글 핸들러의 `updateLongTermSection()` 호출을 일부러 지우자 `30일과 180일의
차트가 동일`로 RED, 복원 시 GREEN. 잠금이 문다.

> 메타교훈: **통합은 "옮겼는가"뿐 아니라 "옮긴 뒤에도 조작이 사는가"를 잠가야 한다.** 이번 게이트는
> 탭 전환만 보고 있어서, 사용자가 묻지 않았으면 이 사각지대가 그대로 출하됐을 것이다.

---

## 12. /ship 사전 보안검토 (2026-09-21)

`security-auditor` QUICK — **Critical 0**, Warning 2. CLAUDE.md §3 CRITICAL 5개 항목 전부 위반 없음
(신규 네트워크 호출 0 · `createFileSystemWatcher` 0 · 신규 차트 라이브러리 0 · 색 리터럴 0 ·
dedup 유지). 핸들 누수·path traversal·자격증명 하드코딩도 0건 확인.

### W2 `sameFileHead` 좁은 재발 경로 → **지적이 성립하지 않음(검증으로 반증)**, 단 코드는 조였다

지적: 캐시된 지문이 256B 미만일 때 rollout 공통 선두(`{"timestamp":"2026-…`) 때문에 다른 세션
파일로 교체돼도 접두가 우연히 일치해 무성 손실이 재발할 수 있다.

**반증**: 실패 테스트를 만들려다 만들 수 없음을 확인했고, 이유가 명확하다 —
`startsWith`는 **부분 겹침이 아니라 완전 접두 포함**을 요구한다. 파일이 256B 미만이면
`head(A)`는 곧 **파일 A 전체**이므로, `head(B).startsWith(head(A))`가 참이려면 B가 A 전체로
시작해야 한다. 그 경우 `offset(=|A|)`만큼 건너뛰는 것은 **옳다**(그 바이트가 실제로 동일하므로).
실측: 두 session_meta 줄의 공통 선두는 114자 중 99자지만 `startsWith`는 `false`다.

**그럼에도 코드는 `canReuseHead`로 조였다** — 버그 수정이 아니라 **감사 용이성**을 위해서다.
"완전 길이 지문의 정확한 일치"는 접두 논리보다 검증할 것이 적고, 짧은 지문 구간을 전체 재파싱으로
떨어뜨리는 비용은 사실상 0이다(그 시점 파일이 256B 미만이고, 넘는 순간 지문이 영구히 고정된다).
회귀 테스트는 **실제로 바뀐 동작**을 잠근다 — 짧은 지문 구간을 지나 256B를 넘겨 자랄 때
전체 재파싱이 일어나도 **dedup이 살아 레코드가 중복되지 않음**(§3#1급 billing 보호).

> 처음엔 "접두 충돌" 시나리오 테스트를 썼는데 **새 코드·옛 코드 양쪽에서 실패**했다. 그게 신호였다 —
> 테스트가 잘못됐거나 전제가 틀렸다는 뜻이고, 이 경우는 후자였다. 지적을 무비판 수용해 그대로
> 테스트를 통과시켰다면 존재하지 않는 버그의 "회귀 잠금"을 출하할 뻔했다.

### W1 `gifenc`/`pngjs` lockfile 미편입 → **이번 릴리스에서는 반영하지 않음(사유 기록)**

지적은 타당하다(버전 미고정 패키지가 릴리스 담당자 머신에서 실행되고 산출물이 마켓에 실린다).
다만 이번에 넣지 않는다: ①`capture-media.mjs`는 CI가 아니라 수동 실행 도구이고 **vsix에 들어가지
않는다**(`.vscodeignore`가 `node_modules/**`·`scripts/` 제외) ②`devDependencies` 추가는
`package-lock.json` 갱신을 부르는데, 이 repo는 락파일을 의도적으로 뒤처진 상태로 유지하는 관례가
있어 **ship 직전에 의존성 관리 방식을 바꾸는 쪽이 제거하려는 리스크보다 크다**.
→ 다음 사이클 과제로 남긴다(auditor도 "이번 배포를 막을 사유는 아니다"로 판정).
