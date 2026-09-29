# PLAN v0.2.5 — 정확성 복구 (신모델 가격 · 서브에이전트 수집 · 벤더 비용 대조)

## 1. 사용자 요구사항 원문 (2026-09-28)

> 025 진행할게. 전건 /sh-dev-loop  --tdd --auto 진행

"전건"이 가리키는 범위는 직전 턴에 로드맵(project_roadmap.md "다음 후보 — 2026-09-28 조사")으로 등록하고 사용자에게 제안한 v0.2.5 묶음이다.
- **D-A** 신모델 가격 오적용: `claude-fable-5-1`·`claude-opus-5-5` 가격표 추가 + contextWindow의 opus-5*/sonnet-5 키 보강.
- **D-B** 서브에이전트 transcript 미수집: `projects/<p>/<session>/subagents/*.jsonl` 수집 + 겹침 dedup 확인 + `.orphaned`/`.superseded` 처리 확인.
- **D-C** 벤더 비용 대조 게이트: calcCost와 cost-state costUSD가 다르면 ⚠ 표시.

근거: `docs/research/RESEARCH-신규기능후보-2026-09-28.md`.

## 2. 메인 세션 실측 (조사 에이전트 수치를 그대로 쓰지 않고 재검증했다)

| 항목 | 실측 |
|---|---|
| fable-5-1 단가 | 벤더 cost-state 9개 표본이 모두 [$10/$50, cache read $0.25, 5m $12.5, 1h $20] 밴드 안에 든다. 현행 적용 단가(fable-5, cache read $1.0)로는 9개 중 8개가 밴드 밖이다(과대 계상) |
| opus-5-5 단가 | 표본 1건. [$4/$20, cache read $0.20, 5m $5, 1h $8]의 1h 끝값이 벤더와 소수 넷째 자리까지 일치(0.2525). 표본이 적다는 한계는 VERIFY-SPEC에 기록 |
| 컨텍스트 창 | opus-5(27,158/39,693)·sonnet-5(21,518/41,410)·opus-5-5(2,214/3,110) 기록이 200K를 넘는다. 현행 표에는 키가 없어 기본값 200K가 적용된다. 1M 초과는 극소수(13·5·6건) |
| 서브에이전트 파일 | 최상위 72개 · `<session>/subagents/*.jsonl` 738개. 다른 경로의 jsonl 0개. 로컬 `.orphaned`/`.superseded` 파일 0개 |
| 파일 간 중복 | Claude 파서의 message.id dedup은 **파일 안에서만** 동작한다(Codex만 전역 dedup). 최상위 파일끼리 겹침은 0건이지만, subagents를 넣으면 부모와 34건, subagents끼리 20건이 겹친다 → **전역 dedup이 필수**(CLAUDE.md §3#1) |
| 감시기 | chokidar `depth=2`(폴링)라 `subagents/` 안의 파일은 감시되지 않는다. depth 3이 되면 +1,614개(subagents 1,476 = jsonl 738 + meta.json 738, tool-results 138) → `tool-results`와 `*.meta.json`은 제외 |
| cost-state | 최상위 파일에만 95건. `modelUsage`는 `{model: {inputTokens, outputTokens, thinkingTokens, cacheReadInputTokens, cacheCreationInputTokens, webSearchRequests, costUSD}}`. 세션 도중 스냅샷이라 레코드 합계와 비교하면 안 되고, **같은 스냅샷 행 안의 토큰↔비용 자기정합성만** 유효하다(reference_add_new_model) |

## 3. 확정 제약

- 가격은 문서가 아니라 벤더 cost-state에서 역산한다. 신규 키는 `pricing.ts`와 `pricing/litellm-snapshot.json` 동시 갱신(스냅샷 동치 테스트).
- 캐시 생성 요율 관례(5m = input×1.25, 1h = input×2.0)는 유지된다. cache read는 관례를 강제하지 않는다(5.1/5.5 세대는 ×0.025 / ×0.05).
- 서브에이전트 기록은 부모 `sessionId`를 가진다(실측). 컨텍스트 게이지는 이미 `isSidechain`을 제외하므로 영향이 없어야 한다. 스킬별 집계도 `!isSidechain` 조건이라 이중 계산이 없어야 한다.
- 전역 dedup은 **refresh 경로의 레코드 풀 1곳**에서 한다(회고 포워드 컨트랙트: record 소싱은 `allRecords` 단일 진입점).
- 벤더 대조 판정은 오라클 테스트와 같은 밴드 방식을 쓴다: [전량 5m, 전량 1h] 밖이면 불일치. 노이즈 방지를 위해 여유와 최소 금액을 둔다.
- 새 UI는 v0.2.4 상태 마커(`statusMarkerHtml`)를 재사용한다. 본문에 문장을 넣지 않는다. 대시보드만 바꾼다.
- 색은 토큰만 쓴다(§3#5).

## 4. SubTask (전량 [S] — 독립 [P] 후보가 4개 미만)

| ID | 태그 | 내용 | 파일 |
|---|---|---|---|
| ST1 | [TDD] | D-A: `claude-fable-5-1`·`claude-opus-5-5` 가격 키 + 스냅샷 + 벤더 오라클 픽스처에 신모델 표본 추가 (contextWindow 키는 §6 X1로 제외) | `src/utils/pricing.ts`, `pricing/litellm-snapshot.json`, `test/fixtures/vendor-cost-oracle.json`, tests |
| ST2 | [TDD] | D-B: `getAllJsonlFiles`가 `<session>/subagents/*.jsonl`까지 수집(subagents 안의 `.meta.json`·`tool-results`·더 깊은 경로는 수집 제외, 최상위 점 파일 jsonl은 기존대로 수집 — §6 X2; 감시기는 `tool-results`·`*.meta.json`·점 파일을 폴링 제외) + 전역 message.id dedup 순수함수를 refresh 경로에 배선 + Claude 감시기 depth 3과 ignore 규칙 | `src/services/WorkspaceMapper.ts`, `src/services/JsonlParser.ts`(export 순수함수), `src/extension.ts`, `src/services/FileWatcher.ts`, tests |
| ST3 | [TDD] | D-C: 파서가 파일별 마지막 cost-state 스냅샷을 보관 → 순수함수 `detectPriceDrift(samples)` → `UsageSummary.priceDriftModels` → 대시보드 모델별 분석에 `⚠ 가격 불일치` 마커 + 툴팁(모델 목록) | `src/services/JsonlParser.ts`, `src/utils/vendorCostCheck.ts`(신규), `src/types/index.ts`, `src/extension.ts`, `src/webview/panelView.ts`, `src/webview/i18n.ts`, tests |

> ST3 부수 구현: 파서 캐시 hit 조건을 mtime 단독 → **mtime + size**로 바꿨다. "파일별 마지막 cost-state" 증분 테스트가 같은 밀리초 append를 놓쳐 실패한 것으로 발견했다 — ST3 정확성에 필요한 수정이다(/verify-impl V5: 미요청 추가가 아니라 ST3 일부로 재분류).

## 5. UI 설계
Ground Truth는 `src/webview/styles.css`다. 새 CSS는 없다. 기존 `.panel-marker-row` + `.status-marker.warn`을 재사용하고, 가격 미상 마커 옆에 둔다.

## 6. 제외 합의 (근거 있는 범위 조정)

> **사용자 승인 (2026-09-29)**: X1·X2 모두 권장 방향(제외)으로 확정 — "권장방향으로 결정".

### X1. contextWindow에 opus-5*/sonnet-5 1M 고정 키 — 하지 않는다
- 조사 보고의 "opus-5-5는 1M 모델"은 근거가 없었다. 벤더 cost-state에 `claude-opus-5`와 `claude-opus-5[1m]`, `claude-opus-5-5[1m]`이 **별도 키로** 기록된다 → 1M은 모델 기본값이 아니라 선택형 변종이다. jsonl `message.model`에는 `[1m]`이 남지 않는다.
- 확장은 이미 3단 판정(①같은 모델이 200K를 넘긴 관측 ②`~/.claude.json`의 [1m] 흔적 ③테이블)을 갖고 있고, 실사용에서는 ①이 발화한다(200K 초과 기록이 모델별 수천 건).
- 테이블에 1M을 고정하면 200K 변종 사용자의 게이지가 실제의 1/5로 표시된다 — 경고가 늦어지는 위험한 방향이다(v0.1.50 과대표시와 반대 방향의 같은 부류).
- 따라서 요구사항 ①의 "contextWindow 키 보강"은 **변경 없음이 정답**으로 판정한다. 회귀 잠금 테스트(증거 없는 opus-5-5는 200K 폴백, 관측 증거가 있으면 1M)만 추가한다.

### X2. `.orphaned`/`.superseded` 파일의 **실시간 감시**는 추가하지 않는다 (인수검증 V1 처분)
- "처리 확인"은 **수집 + 중복 제거**로 이행했다. 최상위에 생기면 기존 규칙대로 수집되고(이름 판정), 같은 기록은 `mergeRecordsAcrossFiles`가 1건으로 센다. 두 가지를 테스트로 고정했다(`subagentCollection.test.ts`).
- 감시기의 점 파일 무시(`isIgnoredWatchPath`)는 이번 변경 전부터 있던 규칙이다. 이 파일들이 **계속 append되는 파일**이라는 근거가 없다(로컬 0개, 공식 CHANGELOG에서 언급을 찾지 못함 — 조사 보고의 2.1.251 인용은 미확인). 재명명된 사본이라면 감시할 이유가 없고, 다음 refresh(다른 jsonl 변경·수동 새로고침) 때 전체 재수집으로 반영된다.
- 재검토 조건: 실제 파일이 관측되고 내용이 계속 늘어나는 것이 확인되면 감시 대상에 넣는다.

## 7. 잔여 위험 각주 (/verify-impl V1 권고, SPEC 아님)
- 컨텍스트 게이지의 1M 관측 판정(`UsageAggregator.ts` `observedOneMillionModels`)은 v0.1.50부터 **사이드체인을 포함**하도록 설계됐다("어디서든 200K를 넘겼다 = 1M 활성의 증거"). subagents 수집 전에는 사이드체인 레코드가 거의 없어 이 경로가 사실상 쓰이지 않았는데, v0.2.5부터는 실제로 쓰인다.
- 실측(2026-09-28): 200K 초과 모델 집합이 메인과 사이드체인에서 똑같다(4개). 사이드체인에서만 넘긴 모델은 0개라 **현재 영향은 없다**.
- 재검토 조건: 어떤 모델이 서브에이전트에서만 200K를 넘기는 것이 관측되면(서브에이전트는 1M 변종, 메인은 200K 변종인 경우), 메인 게이지 분모가 1M으로 잘못 잡힐 수 있다. 그때 관측 집합에 `!isSidechain`을 넣을지 판정한다.
