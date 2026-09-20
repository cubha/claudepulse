# PLAN — 게이지 밖 4곳 구현 (캐시밴드·신호품질·비용이상·페이스라인)

## 사용자 요구사항 원문

- (직전 세션) "중복되는 내용없으면 전부채택. 우선메모리만갱신" — 4곳 모두 채택 확정, 구현은 보류
- (본 세션) "게이지밖4곳 /sh-dev-loop --tdd --auto 진행"

## Ground Truth

- Artifact 캔버스 4보드: `C1-Cache.dc.html`(①캐시 정상범위) · `C2-Signal.dc.html`(②신호 품질) ·
  `C3-CostAnomaly.dc.html`(③비용 이상 감지) · `C4-PaceLine.dc.html`(④페이스 라인) · `P1-Placement.dc.html`(배치도, 권위)
- memory `reference_design_shian_artifact.md` — "게이지 밖 4곳" 섹션 (채택 확정 + 배치표)
- 경로: `/tmp/claude-1001/.../scratchpad/av/project/{C1,C2,C3,C4,P1}.dc.html` (세션 스크래치패드, 원문 재확인 가능)

## 확정 배치 (P1-Placement 보드가 권위, 재논의 불가)

| 항목 | 자리 | 신규 카드 |
|---|---|---|
| ① 캐시 정상범위 밴드 | 대시보드 §6 캐시 효율 **카드 내부** | ✗ |
| ② 신호 품질 판독 | 대시보드 지표 밴드(5H/7D/BURN/SAFE) **바로 아래** | ✅ 유일 |
| ③ 비용 이상 감지 | 대시보드 §3 오늘 비용 **카드 내부** + 사이드탭 `$4.18` 옆 칩 | ✗ |
| ④ 페이스 라인 | 대시보드 §2 사용률 추세(Utilization Trend) **차트 내부** | ✗ |

카드는 1개만 는다(②). 사이드탭에 들어가는 건 ③의 칩 하나뿐 — 나머지 3개는 대시보드 전용(사이드바 차트 금지 원칙, 캘린더만 예외).

## 코드 실측 — 필요한 데이터는 전부 이미 `UsageSummary`에 있다 (신규 서비스/메시징 변경 0)

- `historicalDays: DailyUsage[]` (CacheStore 전체 이력, ~30일 롤링) — ③ 중앙값, ④ 무관
- `today.costUsd`, `cacheStats.hitRate/savedUsd`, `last7Days[].cacheHitRate` — ①③
- `unpricedModels: string[]` (비어있으면 가격표 커버리지 100%) — ②
- `skillBreakdown: SkillUsage[]` + `skillUnattributed: SkillUnattributed` — ② 스킬 귀속 커버리지 = skillBreakdown 비용합 / (skillBreakdown 비용합 + skillUnattributed.costUsd)
- `modelShareBasis: 'cost'|'tokens'` — ② share 기준 배지 (이미 `panelView.ts` 573행 `byTokens`로 소비 중)
- `fh.utilization`, `fh.msUntilReset`, `fhHistory: PollPoint[]`, `FH_WINDOW_MS`(webviewShared.ts, 5h) — ④
- `burnRate.ts`의 `deriveBurnState`·`calcSafeUntil`·`calcProjAtReset` — ④ (이미 BURN RATE/SAFE UNTIL 카드가 씀, 재사용만)
- sidebarView.ts도 동일 `UsageSummary`를 받고 이미 `usage.historicalDays`를 소비 중(캘린더용) — ③ 칩에 재사용 가능

**결론**: `src/services/`·`src/messaging/` 변경 없음. 전부 `src/webview/` 레이어(+i18n) 작업.

## 신규 순수계산 모듈 (TDD 대상)

`src/webview/metricCalc.ts` 신설 — `burnRate.ts`와 같은 패턴(순수 함수, DOM/Chart.js 의존 없음).
**advisor 교차검증 반영**(원 초안 3곳이 실제로는 틀렸거나 기존 결정과 충돌 — 아래는 정정된 최종 시그니처):

- `median(nums: number[]): number | null`
- `THRESHOLD_LOW = 60` / `THRESHOLD_HIGH = 90` (export 상수, %) — C1 보드는 **단일 컷이 아니라 60/90 밴드**를
  그린다(78.4%="정상"은 밴드 내부, 31.2%="급락"은 밴드 아래). 렌더는 두 참조선 모두 그리고, 라벨은
  `THRESHOLD_LOW` 이탈 여부로만 판정(보드가 "above 90"에 대한 별도 라벨을 보여주지 않음).
- `classifyCacheHitRate(hitRatePct: number): 'normal' | 'drop'` — `hitRatePct >= THRESHOLD_LOW ? 'normal' : 'drop'`
- `filterQualifyingCostDays(days: DailyUsage[], excludeDateKey: string): DailyUsage[]` — **advisor 블로킹 지적 반영**:
  `historicalDays`엔 `totalTokens>0 && costUsd===0`인 날이 섞여 있다(당시 가격표 미등재, `longterm-cost-note`의
  `costUnknownDays`와 동일 원인). 이 0을 중앙값에 그대로 넣으면 "평소"가 허위로 무너져 거짓 이상감지가 뜬다.
  `d.totalTokens > 0 && d.costUsd > 0 && d.date !== excludeDateKey`만 통과시킨다(오늘 자신도 제외 — "오늘 vs
  평소" 비교이므로).
- `calcCostAnomalyPct(todayCost: number, qualifyingCosts: number[], minSample = 7): number | null` —
  `qualifyingCosts.length < minSample`이면 `null`(표본 부족 시 배지 자체를 숨김 — 2개 표본으로 "+61%"를
  단언하지 않는다). 충분하면 `median(qualifyingCosts)` 계산 후 `median>0`일 때만 `(today-median)/median`.
  대시보드(ST6)·사이드바 칩(ST8) **동일 함수 재사용** — 두 곳에 각자 계산 로직을 만들지 않는다.
- `calcSkillAttributionCoverage(skillsCostTotal: number, unattributedCostUsd: number): number` — **advisor
  블로킹 지적 반영**: `reference_skill_attribution_gap.md`의 "share 분모 = grand-total(Σskill + 버킷)" 락인과
  기존 `updateSkillSection()`의 `grandTotal = skills.reduce(costUsd) + unattr.costUsd` 계산을 그대로 따른다
  (별도 분모를 발명하지 않음). `coverage = grandTotal>0 ? skillsCostTotal/grandTotal : 1`(활동 0이면 이슈 없음).
- `calcPriceCoverage(observedModelCount: number, unpricedModelCount: number): number | null` — 분모를 명시
  (`modelBreakdown.length`, cost-weight 불가 — 가격 모르는 모델은 비용 가중을 못 매기므로 개수 기준).
  `observedModelCount===0`이면 `null`(표시 안 함).
- `calcPaceBaseline(nowMs: number, windowStartMs: number, resetAtMs: number): number` — 0..100,
  `clamp01((now-start)/(reset-start))*100`. **호출측 계약**(advisor 블로킹 지적): 이 함수 자체는 range 클램프만
  하고, "현재 5h 윈도 밖 포인트는 null로 스킵"하는 책임은 ST7 호출부(updateTrendChart)에 있다 — 24h 스코프처럼
  창 리셋을 여러 번 가로지르는 구간에서 단조 기준선이 100%에 눌어붙는 것을 막는다.

RED 테스트: `test/unit/metricCalc.test.ts` — 경계값(59.9/60/60.1%), median 홀/짝 개수, anomaly의 표본<7·median=0,
coverage의 분모 0(grand-total 공식과 `updateSkillSection` 기존 단언 수치 대조), price coverage의 관측 0개,
pace의 range 밖 clamp(음수·1 초과 양쪽).

## SubTask 목록 (전량 `[S]` — panelView.ts/styles.css/i18n.ts를 여러 SubTask가 순차 공유)

```
[Task] 게이지 밖 4곳
  [S] 체인
    ├── ST1: [TDD] src/webview/metricCalc.ts 신설 + test/unit/metricCalc.test.ts (RED→GREEN)
    ├── ST2: styles.css — ②신호품질 카드·①캐시 상태뱃지·③비용이상 뱃지/칩·④페이스 범례 CSS
             (기존 토큰만 재사용: --c-warn/--c-danger/--c-success/--tint-*, 7+1 cap 불변, .theme-light 페어)
    ├── ST3: i18n.ts — 신규 키 ko/en/ja/zh 4개 언어 전건
    ├── ST4: panelView.ts — ① 캐시 정상범위 밴드 (60/90 참조선 2개 + 상태 라벨)
    ├── ST5: panelView.ts — ② 신호 품질 카드 신설 (지표 밴드 바로 아래 삽입, grand-total 분모 재사용)
    ├── ST6: panelView.ts — ③ 비용 이상 감지 (오늘 비용 카드 내부 + 차트 참조선, 표본<7 시 배지 숨김)
    ├── ST7: panelView.ts — ④ 페이스 라인 (Utilization Trend 오버레이, 윈도 밖 포인트 null 처리 + 캡션)
    ├── ST8: sidebarView.ts — ③ 비용 이상 칩만 ($ 오늘 옆, ST6과 동일 calcCostAnomalyPct 재사용)
    └── ST9: 골든 DOM digest 재캡처(사유 기록) + 실 Extension Dev Host 스크린샷
             (고정폭 미만/초과 2점 스윕 — feedback_webview_ui_verification.md 선행 교훈. **다크만** 약속—
             라이트 강제는 하네스 미확인 기능이라 이번 PLAN에서 약속하지 않는다(advisor 지적, v0.1.53 ST3와
             동일 사유로 드롭). 전용 캡처 디렉토리 + md5 구분 확인(직전 라운드 byte-identical 버그 재사용 방지)
```

라우팅: 병렬 0 + 직렬 9. `[P]` 후보 4개 미만(team-dev 임계값 미달) + ST4~ST8가 ST1 산출물에 의존 +
panelView.ts를 5개 SubTask가 순차 공유 → 전량 `[S]`.

전제: git ✅ / verify.sh ✅(--ts-only 지원, 직전 라운드 확인됨) / 독립 SubTask 0개 → 전량 `[S]`

`[TDD]` 태그: ST1만 해당(순수 함수·결정론적·단위러너 존재 — tdd-gate 3-AND 충족). ST2~ST9는 UI/CSS/스크린샷
산출물이라 tdd-gate 절대제외(비결정 시각 출력).

## 제외 합의 (요청했지만 하지 않기로 한 것 — 이번 스코프 밖)

- **④ 페이스 라인의 "기준 페이스" 대각선**: 보드는 5h 윈도 전체(창 시작→리셋)의 이상적 직선을 그리지만,
  실제 Utilization Trend 차트는 사용자가 30m/2h/24h로 스코프를 바꿀 수 있는 카테고리(비시간) x축이다.
  전체 윈도 절대시간을 그대로 얹으면 스코프 밖 구간에서 x축이 어긋난다. **해법**: 기준선을 현재 렌더된
  `fhSlice` 각 포인트의 실제 타임스탬프에 `calcPaceBaseline()`을 적용해 같은 길이의 배열로 생성 —
  카테고리 축과 자동으로 정렬되고, 스코프를 바꿔도 깨지지 않는다. 이건 "기각"이 아니라 구현 방법의 선택.
- **② 신호 품질의 "커밋 조인 근사" 배지**: 회고(Retro) 데이터는 lazy-load(`GetRetroSummary`, 열 때만 요청)라
  메인 패널 최초 렌더 시점엔 없다. 실시간 조인 정확도 대신 **정적 배지**(항상 "근사" 표시, 기존
  `retro_approx_badge`/`skill_scope_badge` 문구 재사용)로 대체 — 회고를 열어야 아는 값을 메인 패널에
  강제로 미리 fetch하지 않는다(불필요한 IPC 왕복 방지).
- **캐시 정상범위 임계값의 정밀 튜닝**: 60% 단일 상수로 시작. 실사용 피드백 있으면 조정(위 median 판단 근거 참고).

## 절대 불변식 (기존 evolve 라운드와 동일 원칙 계승)

1. `styles.css`의 `--x:` 선언 줄 **0건 변경** — 새 토큰 0 · 새 색 0(7+1 cap 불변)
2. `.theme-light` 페어 유지(CLAUDE.md §9 D-3)
3. 신규 서비스/메시징 레이어 변경 금지(위 코드 실측이 불필요함을 확인함) — 벗어나면 스코프 재판단
4. 배포·커밋은 사용자 명시 승인 전까지 금지(feedback_ship_gate)
5. §3 CRITICAL(message.id dedup·chokidar·비공개 API 금지) 무관, 건드리지 않음
6. 골든 DOM digest 재캡처 시 사유 명시(허위성공 차단)

## 검증 계획

- `npx vitest run test/unit/metricCalc.test.ts` — ST1 RED 확인 후 GREEN 전환
- `bash verify.sh --full` — D-0~D-4 그린 유지(선언 줄 불변이므로 그대로 통과해야 정상)
- vitest 전량 그린 (기존 350 + 신규)
- 골든 DOM digest 재캡처(요소 구조 변경: 신규 카드 1개 + 배지/칩 다수) — 사유 기록
- 실 Extension Dev Host + Playwright: 대시보드 다크/라이트 각 1장, 신규 4항목 모두 가시 확인

## 구현 결과 (2026-09-18)

전 SubTask(ST1~ST9) 완료. advisor 사전검증에서 지적한 6건(median 오염·coverage 분모·pace 윈도 경계·
price coverage 분모·60/90 밴드·라이트테마 미약속) 전부 최초 구현부터 반영.

- **ST1**: `src/webview/metricCalc.ts` 7개 순수함수. RED(모듈 없음 확인) → GREEN(21/21) → 통합 후에도 21/21 유지.
- **ST2~ST3**: styles.css 신규 규칙(토큰 재사용만, 선언 줄 불변 — D-1~D-4 그대로 통과) + i18n 4개국어 31키.
- **ST4**: 캐시 밴드 — 스파크 차트에 60/90 참조선 2개 + `cache-band-status` 라벨. 실캡처: "98.3% Normal".
- **ST5**: 신호 품질 카드(②, 유일한 신규 카드) — 5개 항목 전부 실데이터로 렌더 확인(가격커버리지 100%·
  스킬귀속 18%·스킬외 $5077.37·커밋조인 approx.·share기준 Cost).
- **ST6**: 비용 이상 감지 — 대시보드 배지 + 30일 중앙값 참조선(medianLinePlugin, mixed-dataset-type 회피).
- **ST7**: 페이스 라인 — Utilization Trend에 "Baseline Pace" 데이터셋 + 캡션("Window start 15:50:05 ·
  Reset 20:50:05 · No exhaustion before reset") 실캡처 확인.
- **ST8**: 사이드바 칩 — "vs. usual +15%" 실캡처 확인, ST6과 `calcCostAnomalyPct` 완전 재사용(중복 계산 없음).
- **ST9**: 골든 digest — 기존 감시 id 0건 diff, `panel-signal-card`/`panel-signal-body` 신규 등록 후 재캡처
  (사유 기록, `--accept-regression`). 고정폭 스윕은 700px 1종만(모바일폭 스윕은 이번 라운드 실행 안 함,
  다크만 — 라이트 미약속 유지). 실 Extension Dev Host 스크린샷 5장(`​.playwright-mcp/gauge4/`), md5 전부
  상이(byte-identical 버그 재발 없음).

**구현 중 발견해 고친 버그(계획에 없던 것)**: `updateSignalSection()`이 `panelUsage.unpricedModels.length`를
optional-chaining 없이 접근해 `docs/demo/mock-data.js`(golden digest 픽스처, `unpricedModels`/
`modelShareBasis` 필드 없음)에서 `TypeError`로 files/session/skill 목록까지 연쇄로 렌더 중단시켰다.
`panelUsage?.unpricedModels ?? []` 기존 패턴(720행)으로 정정 + 픽스처에도 두 필드 추가(양쪽 다 방어).

검증: `bash verify.sh --full` 29/0 · vitest 371/371(신규 21건) · lint clean · typecheck clean ·
골든 digest diff 0(신규 id 등록 후) — 전부 그린. 배포·커밋 없음(사용자 승인 전까지 보류).
