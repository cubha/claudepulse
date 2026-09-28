# PLAN v0.2.4 — 대시보드 서술형 문구 정리 → 상태 마커 + 호버 툴팁

## 1. 사용자 요구사항 원문 (2026-09-28)

> 그리고 지금 대시보드에 불필요한 문구들(실제선이...아래...여유가잇다, 프롬프트재사용이 잘되고잇더...등)이 보여.
>
> 이런문구를 최대한 배제하고 UX적으로 필요한거라고하면 상태마커 사용 > 마우스호버 시 툴팁으로 보여주도록 개선작업진행해줘.
>
> /sh-dev-loop --tdd --auto

## 2. 전수 조사 (panelView.ts가 **본문에** 렌더하는 서술형 문구)

| # | 위치 | 키 | 현재 | 처분 |
|---|---|---|---|---|
| 1 | 캐시 효율 카드 | `cache_band_msg_normal/drop` | 본문 한 줄 `.cache-band-msg` | **제거** → 기존 상태 라벨(정상/급락)을 마커화, 문장은 툴팁 |
| 2 | Utilization Trend 캡션 | `pace_above/below_baseline` | 본문 한 줄 `.pace-verdict` | **마커화** — 짧은 라벨(신규 키 `pace_marker_over/under`) + 문장 툴팁 |
| 3 | Codex 지표 밴드 | `codex_variable_bucket_note` | 경고 배너 `#panel-codex-band-note` | **제거** — 버킷 카드 라벨(5H/주간/30일)이 이미 가변성을 보여 준다. 요소·키·CSS 삭제 |
| 4 | 모델별 분석 | `pricing_unknown_note` | 경고 배너 `.panel-warn-note` | **마커화** — `⚠ 가격 미상` + 툴팁(문장 + 모델 목록) |
| 5 | 장기 탭 | `cost_unknown_days` | `⚠ 문장 (Nd)` 본문 | **마커화** — `⚠ 가격 미상 Nd` + 문장 툴팁 |
| 6 | 월별 탭 | `cost_unknown_days` | 동일 | 동일 |
| 7 | Codex 추가 패널 제목 | `codex_extra_panel_title` | "대신 새로 생기는 것"(시안 서술이 제목으로 누출) | **라벨 교체** — "Codex 전용 지표" |
| 8 | Git ROI 카드 하단(`retroView.ts`) | `retro_disclaimer` | 본문 안내 문장 `.retro-disclaimer` | **제거** — 카드 헤더 ≈배지 `title`에 같은 문장이 이미 있다(정보 소실 없음) |
| 9 | Git ROI 카드 하단(`retroView.ts`) | `retro_scope_degraded` | ⚠ 경고 문장 `.retro-scope-warn` | **마커화** — `⚠ 전체 커밋` + 문장 툴팁 |

> #8·#9는 /verify-impl 인수검증(V2)이 찾은 누락이다 — 첫 조사가 `panelView.ts`만 훑었고, 대시보드 안 Git ROI 카드는 `retroView.ts`가 그린다. 조사 범위를 "대시보드에 렌더되는 모듈 전체"로 넓혀 재조사했고, 남은 본문 문구는 빈 상태(`no_scope_data`·`no_retro_data`)뿐이다(유지 대상).

**유지(대상 아님)**: 페이스 캡션의 `pace_safe_no_exhaust`("리셋 전 소진 없음") — 판정 문장이 아니라 `소진 예상 HH:MM`과 짝을 이루는 짧은 상태 값이고, 소모율 투영 기반이라 기준선 대비 마커(여유/과속)와 근거가 달라 둘이 엇갈릴 수 있다(인수검증 V1 판단). 빈 상태/로딩 문구(`collecting_*`, `no_*`, `waiting_poll` — 콘텐츠 대체이자 행동 안내), 차트 범례(`cost_median_line_legend`), 짧은 기준 라벨(`share_by_tokens`), 이미 마커+툴팁인 배지(회고 ≈근사 · 스킬 범위 · 비용 이상 델타 · 모델 `~`/가격 미상 셀).

## 3. 확정 제약·결정

- **이전 결정 번복을 명시한다**: #1·#2는 C1/C4 디자인 보드 판단("툴팁은 안 보이므로 본문에 노출")으로 본문에 뒀다. 사용자 지시로 **마커(항상 보임) + 툴팁(상세)** 으로 바꾼다 — 상태 신호 자체는 마커로 계속 보이므로 보드의 "신호가 보여야 한다"는 요구는 유지된다.
- 마커 = 공용 순수 헬퍼 `statusMarkerHtml`(escape · `title` · `aria-label` · `tabindex=0` · tone 클래스). 기존 배지(`.retro-approx-badge`)는 건드리지 않는다.
- 색은 토큰만(`--c-success/--c-warn/--c-danger`, `--vscode-descriptionForeground`) — CLAUDE.md §3#5.
- 대시보드만. 사이드바 무변경.
- golden digest가 `panel-cache-body` 자식 수 변화로 바뀌면 **의도된 스펙 변경**으로 사유를 적고 재기준선.

## 4. SubTask (전량 [S])

| ID | 태그 | 내용 | 파일 |
|---|---|---|---|
| ST1 | [TDD] | `statusMarkerHtml` 순수 헬퍼 + `.status-marker` CSS | `src/webview/statusMarker.ts`(신규), `styles.css`, `test/unit/statusMarker.test.ts`(신규) |
| ST2 | [TDD] | 조사표 #1~#9 적용 + 본문 서술 재유입 방지 소스스캔 잠금 | `panelView.ts`, `i18n.ts`, `styles.css`, `test/unit/panelCopyMarkers.invariants.test.ts`(신규) |

## 5. UI 설계
Ground Truth `src/webview/styles.css`. 마커 = `--fs-label`, weight 600, tone 색, `cursor: help`, 포커스 시 outline(`--vscode-focusBorder`). 레이아웃 변경 없음(기존 라벨 자리에 인라인).

## 6. 동반 수정 — 기간별 비용 장기 탭 헤더 금액 (같은 v0.2.4 릴리스)

### 사용자 요구사항 원문 (2026-09-28)
> 지금 대시보드 보니까 기간별비용 label옆에 금액이표기되는데, 일별, 월별은 정상표기되는제 장기는 일별과 동일하게표시되는거같어

### 확정 수정
- 원인: 장기 탭 헤더 readout이 선택 범위의 **마지막 날** 비용을 써서 일별(오늘)과 항상 같았다.
- 수정: `sumPeriodCost(filtered)` 순수 함수(`src/webview/metricCalc.ts`)로 선택 범위(30/90/180일) 합계를 표시. 일별=오늘 · 월별=이번 달 의미는 불변.
- 잠금: 단위테스트(`test/unit/metricCalc.test.ts`) + 렌더 검사 ⑤(`scripts/verify-cost-period-tabs.mjs` — 장기 readout = MOCK 30일 합계 ∧ ≠ 일별 readout).
