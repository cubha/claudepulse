# PLAN — 디자인 발전(evolve) 구현: 대시보드 전 섹션 M1~M4

## 사용자 요구사항 원문 (요약 금지)

- "아티팩트권위문서 기준 /sh-dev-loop --tdd --auto 진행해"
- 선행 확정(직전 세션): "오우 좋네!!! 디자인 딱맘에든다!!! 캘린더는 유지하는 방향으로 하고(아티팩트시안에서는
  누락된걸로보임) 지금 대시보드에 대상 많은데 이와같은 방향으로 디자인개선 아티팩트 전건 뽑아봐"
- "오케이. 시안확정으로 아티팩트를 권위문서로 메모리갱신" — 캔버스(`https://claude.ai/artifact/98aRbPSoiERZE6p6ngMb4W`,
  15보드)가 시각 Ground Truth로 확정됨. `reference_design_shian_artifact.md` (메모리) 참조.

## Ground Truth

- 메모리 `reference_design_shian_artifact.md` + 캔버스 15보드 원본 (S1~S5·D1~D3·P1)
- `src/webview/styles.css` (토큰 GT, 1774줄) — 이번 작업은 **선언 줄 불변, 사용처만 재배치**

## 확정 제약 (재논의 불가)

1. `styles.css`의 `--x:` **선언 줄 0건 변경** — 새 토큰 0 · 새 색 0
2. 7+1 액센트 cap 불변
3. `.theme-light` 페어 유지
4. Usage Calendar 내부(셀 11px·스크롤 동작) 무변경 — 헤더만 M1 적용
5. 게이지 밖 4곳(캐시밴드·신호품질·비용이상·페이스라인) 및 vitals 테마·ECG 파형 — 이번 구현에서 **생성 금지**
6. 배포·커밋은 사용자 명시 승인 전까지 금지

## 코드 실측으로 확정한 판정 (보드 vs 실제 코드 대조)

- **`.panel-metric-value`**(4개 지표: 5H/7D/BURN/SAFE) 15px(`--fs-mono-md`) → 22px(`--fs-mono-lg`).
  `--fs-mono-lg`는 선언 후 `.panel-gauge-center`(죽은 CSS, DOM 어디서도 안 씀) 1곳에서만 쓰이던 토큰 — 살아있는
  선택자로 옮기는 것이라 D-4 사각지대를 실제로 해소한다.
- **`.cache-kpi-value`**(히트율·오늘 절약) 15px → 22px — S3-Composition 보드 근거.
- **`.panel-chart-header`**(13개 카드 제목 전부가 공유하는 단일 선택자) 13px(`--fs-body`) → 16px(`--fs-h2`).
  하나의 CSS 규칙이라 13개 섹션 헤더에 자동 일괄 적용됨.
- **⚠️ 도넛 중앙 "$4.18" 라벨은 보드에만 있고 실제 코드에는 없다** — `.panel-model-donut`은 Chart.js canvas
  단독이고 center-text 오버레이가 없다(`.panel-gauge-center`는 죽은 CSS). "화면에서 제일 큰 글자가 도넛
  중심"이라는 서사는 구 정적 프로토타입(`docs/design/prototype/00-clausight-canvas.html`) 기준이었다.
  **이번 작업은 도넛에 새 center-text를 추가하지 않는다** — 그건 신규 기능이지 재배치가 아니다. M1의
  타당성은 그 서사 없이도 "선언만 되고 죽은 토큰을 살아있는 헤드라인 지표에 옮긴다"는 사실만으로 충분하다.
- **카드 제거 범위 — S1~S5 보드(전 섹션 적용의 실제 기준) 5개를 전수 조사한 결과 `border-radius: 8px`
  박스가 0건이다.** (`D1-Dash-After`에만 1건 있으나 이는 "전 섹션 적용" 이전의 표본 보드로 S3-Composition이
  대체함.) 즉 memory에 적힌 "17 → 6"은 구현 착수 전 추정치였고, 실제 승인된 보드 5개가 보여주는 목표 상태는
  **panelView.ts의 `.card` 17개 사용처 전부 제거**(카드 클래스 자체 정의는 남겨두되 각 마크업에서 뗀다)다.
  memory 자체가 "정확한 수는 구현 중 기존 DOM 구조 보고 판단"이라 명시했으므로 이 판단으로 진행한다.
  대체 수단: `.panel-root`의 기존 `gap: var(--sp-4)`(자식 간격) + 신규 `border-top: 1px solid var(--vscode-panel-border)`
  구분선(첫 섹션 제외) + 좌우 패딩은 `.panel-root`가 단독 소유(M3).
- **M3**: `.panel-root { padding: var(--sp-4) var(--sp-4) var(--sp-8); }` → 좌우를 `--sp-6`(24px)로.
  `.panel-metric-grid`/`.panel-trend-card`/`.panel-session-card`/`.panel-files-card`/`.panel-branch-card`
  등 개별 `margin: 0 var(--sp-4) …` / `padding: var(--sp-3|4) …` 재선언(들여쓰기 복붙 패턴, D3-Moves 보드가
  지적한 바로 그 코드)을 제거하고 `.panel-root`의 소유로 흡수.
- **M4**: `text-transform: uppercase` 13곳 중 `.panel-metric-label`(4개, 5H/7D/BURN/SAFE)만 유지.
  나머지 9곳(`.panel-gauge-label`[죽은 CSS라 실질 대상 아님]·`.panel-chart-header`류 아님·
  `.cache-kpi-label`·`.branch-header`·`.model-bar-label` 등 실사용 9곳)은 uppercase 제거.
  사이드바 `.sb-section-label`(3곳: 5H/7D/컨텍스트)도 이번 "전건 적용" 범위 — 5H만 hero로 격상하며
  나머지는 문장형 유지 여부를 ST7에서 판단.
- **사이드바 5H hero**: 현재 `.sb-section-right`에 `fmtPct(fh.utilization)`가 7D/컨텍스트와 동일한 크기로
  인라인 표기됨(D2-Side-After 보드가 문제 삼은 "동등" 상태와 일치). 5H만 큰 갱신값(22px, `--fs-mono-lg`)을
  섹션 아래 전용 라인에 두고, 7D/컨텍스트는 현재 인라인 표기를 유지.
- **차트 가독성 4요소** — Chart.js 차트(trend/daily/longterm/monthly/tools)는 이미 y축 눈금이 있다
  (`scales.y.ticks`). 부족한 것: 마지막 데이터포인트 마커(라인 차트 3종), 막대 값 라벨(bar 차트 3종: daily/
  monthly/tools), daily·longterm·monthly 헤더 옆 현재값 판독 텍스트. 신규 의존성 없이 Chart.js 커스텀
  plugin(`afterDatasetsDraw`) + `pointRadius` 콜백으로 구현.

## SubTask 목록 (전량 `[S]` — styles.css/panelView.ts/sidebarView.ts를 여러 SubTask가 공유해 파일 단위 독립성 없음)

```
[Task] 디자인 발전 — 대시보드 전 섹션 M1~M4
  [S] 체인
    ├── ST1: styles.css M1 타입 위계 — .panel-metric-value·.cache-kpi-value→--fs-mono-lg, .panel-chart-header→--fs-h2
    ├── ST2: styles.css M4 라벨 소음 — uppercase 9곳 제거(4곳 유지), 사이드바 3곳 판단
    ├── ST3: styles.css M2+M3 — .panel-root 좌우 패딩 --sp-6, 카드별 margin/padding 재선언 제거, 구분선 CSS 신설
    ├── ST4: panelView.ts — .card 클래스 17곳 제거 + 구분선 마크업 적용, 대시보드 §3 오늘비용 텍스트 추가
    ├── ST5: panelView.ts — 차트 가독성(마지막 포인트 마커·bar 값 라벨·현재값 판독) 6개 차트
    ├── ST6: sidebarView.ts — 5H hero 레이아웃, 라벨 uppercase 판단 반영
    └── ST7: 골든 digest 재캡처(사유 기록) + Playwright 고정폭 스윕 캡처(2점 × 라이트/다크)
```

라우팅: 병렬 0 + 직렬 7 (styles.css를 ST1~3이 순차로 겹쳐 수정하므로 worktree 격리 이득이 없음 — team-dev
임계값 4개 미만).

전제: git ✅ / verify.sh ✅(--ts-only 지원) / 독립 SubTask 0개 → 전량 `[S]`

`[TDD]` 태그: 없음 — 전 SubTask가 UI/CSS 산출물이라 tdd-gate 절대제외(비결정 시각 출력) 해당.

## 구현 결과 (2026-09-17, PLAN 대비 실제 — advisor 교차검증 반영)

- **M1**: 계획대로 구현. `.panel-metric-value`·`.cache-kpi-value`→`--fs-mono-lg`, `.panel-chart-header`→`--fs-h2`.
- **M2**: 계획대로 구현하되 판정 정정 — advisor가 "카드 17→0"(이 문서 최초 버전의 오판정)을 "17→6"으로
  교정(보드 캡션 텍스트·memory M2 분해가 1차 증거). 생존 6: daily·calendar·model·cache·tool·skill. 제거 11:
  지표4·차트3(util_trend·longterm·monthly)·목록4(files·session·branch·retro). `panelDesign.invariants.test.ts`로
  회귀잠금.
- **M3**: **보류(구현 안 함)** — `.panel-root` 패딩 sp-4→sp-6 변경은 advisor가 P0 Y축정렬 주석 + 캘린더 고정폭
  오버플로 계약과의 충돌 위험을 지적해 제외. 카드 제거는 `class="card "` 토큰만 지우고 기존 margin/padding은
  그대로 둔 채 `panel-flush`(`border-top` 구분선)를 추가하는 방식으로 대체 — `.panel-root`/Chart.js 옵션 무변경.
- **M4**: **변경 0건** — 13개 uppercase 셀렉터 전수 검토(칩6·hero라벨3·죽은CSS4, "제거" 근거를 보이는 셀렉터
  0개)로 무변경 판정. 이 문서 최초 버전의 "2 live 후보 de-uppercase" 가설도 재검토 후 폐기(S3 보드가
  `.cache-kpi-label`을 uppercase로 유지함을 확인).
- **차트 가독성**: daily/longterm/monthly에 현재값 readout(`panel-chart-readout`)·마지막점 마커·막대값라벨
  추가(`barValueLabelPlugin`, 신규 의존성 없음). tools는 스택형 히스토그램이라 데이터 형태가 달라 제외(별건).
  "오늘 vs 어제" 비교·14일 확장 등 데이터 형태 변경은 advisor 지적대로 범위 밖으로 유지.
  bar 라벨이 최댓값 근접 막대에서 캔버스 상단에 클리핑되는 걸 실 스크린샷으로 발견 → `layout.padding.top:14`
  추가로 해결(재검증 완료).
- **사이드바 hero**: 계획대로 5H만 `.sb-hero-value`(22px) 전용 표시, 7D/컨텍스트는 기존 인라인 유지.
- **검증**: `verify.sh --full` 29/0(변경 전후 동일), 골든 digest diff 0(재캡처 불요), vitest 350/350(신규 6건
  포함), 실 Extension Dev Host 스크린샷(사이드바·대시보드 2뷰, 실데이터)으로 육안 확인.

## /verify-impl 결과 (2026-09-18) + 보완

축A(코드, acceptance-critic): **기준선 충족** — R1~R8 전부 ✅, 미요청 구현 0건.

축B(화면, screen-critic): 초기 실행에서 캡처 파이프라인 결함(스크롤 캡처가 이전 캡처와 byte-identical) 발견 →
재캡처로 해소. 유효 지적 2건을 즉시 보완:
- **V2**: 지표밴드(5H/7D/Burn/Safe)가 시안(D1-Dash-After, 1행 4열)과 달리 2행 2열이었다 → `grid-template-columns:
  repeat(4,1fr)`로 수정, 구분선 CSS(`nth-child`)도 1행 기준으로 단순화.
- **V3**: "Utilization Trend" 헤더에만 형제 차트(Daily Cost·장기추세·월별비용)와 달리 현재값 readout이
  없었다 → `#trend-readout` 추가(`5H {fh%} · 7D {sd%}`).

**V1은 무시(사유 명시)**: screen-critic이 "D2-Side-After 시안에 Burn Rate·Safe Until 구분선밴드·모델구성
도넛·최근세션 목록이 있는데 사이드바에 전혀 없다"고 심각도 '높음'으로 판정했으나, 원문 `D2-Side-After.dc.html`을
직접 grep 재확인한 결과 그런 내용 자체가 없었다(그 4요소는 D1-Dash-After, 즉 **대시보드** 보드의 내용이며
screen-critic이 두 보드를 혼동한 것으로 보인다). verify-impl 원칙("판정은 명령이 아니다, 무시 시 사유 1줄")에
따라 이 항목은 반영하지 않는다 — 재사용 교훈은 [[reference_design_shian_artifact]]에 기록.

**축B와 무관하게 사용자가 스크린샷 확인 중 직접 지적한 이슈(즉시 수정)**: 사이드바는 hero 숫자가 "사용량%"인데
대시보드 지표밴드 4개는 hero가 "잔여량%"이라 두 표면의 관례가 어긋나 있었다. `fh-remaining`/`sd-remaining`
텍스트를 사용량%로, 서브텍스트를 잔여량%로 스왑(`panelView.ts` fhRemEl/sdRemEl 로직) — 사이드바와 표기
통일. 실은 시안 보드(S1-Trends "5시간 62%")도 원래 사용량% 기준이었으므로, 이건 새 선호가 아니라 **최초
구현이 보드 스펙에서 벗어났던 걸 바로잡은 것**이다.

verify.sh --full 29/0(보완 전후 3회 모두), vitest 350/350, 골든 digest diff 0 — 전부 유지.

## 검증 계획

- `bash verify.sh --full` — D-0~D-4 그린 유지 확인(선언 줄 불변이므로 그대로 통과해야 정상)
- vitest 전량 그린
- 골든 DOM digest 재캡처 — 요소 구조(카드 클래스 제거·구분선 추가)가 바뀌므로 필요. 재캡처 사유를 커밋/보고에
  명시
- Playwright: 실빌드 + fake postMessage로 대시보드 패널 렌더 → 고정폭 미만/초과 2점 스크린샷(다크 1 + 라이트 1
  최소) — `feedback_webview_ui_verification.md` 선행 교훈 반영
