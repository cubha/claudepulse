# PLAN v0.2.3b — 사이드바↔대시보드 비대칭 해소 2건

> **릴리스 편입(2026-09-24, 사용자 결정)**: 원래 v0.2.4로 계획됐으나 v0.2.3이 미배포라 v0.2.3에 묶어 출하한다. 릴리스 메타(CHANGELOG·README·태그)는 0.2.3 단일. 아래 ST1/ST2는 v0.2.3 항목 ⑩/⑪에 해당하며 코드 주석은 `v0.2.3 ⑩/⑪`로 표기한다.

## 1. 사용자 요구사항 원문

사용자 발화(2026-09-24): "024 구현계획 확인 --> /sh-dev-loop --tdd --auto 진행해"

구현계획(memory `project_roadmap.md` v0.2.4 행, 원문 그대로):

> **사이드바↔대시보드 비대칭 해소 2건** — v0.2.3 ③④⑤와 같은 축의 잔여. **①대시보드 Codex 플랜 배지**: `panelView.ts:353-356`이 Codex일 때 배지를 **비운다**(`planBadgeEl.innerHTML = ''`), 코드에 `별건(ST9)`으로 등재된 이월. 당시 사유였던 "`fmtPlanTier`는 Claude `subscriptionType`/`rateLimitTier` 전용 포맷터"는 **사이드바가 이미 해법을 갖고 있어 무효** — `sidebarView.ts:775`가 `planType.toUpperCase()`로 값별 분기 없이 렌더한다(§8 불변식5). `panelCodexSnapshot`(panelView.ts:80)도 이미 있어 **데이터 신규 배선 0**, 사이드바 패턴 복사. **②`(proj N% left)` 복원**: v0.2.3 A2가 사이드바 Codex 버킷 행을 `buildBurnRow`→`buildCodexBucketBurnRow`로 교체하면서 투영 조각이 빠졌다(`deriveCodexBucketBurn`이 `calcProjAtReset`을 호출하지 않음). **의도였다는 기록이 코드·PLAN 어디에도 없다.** 이 조각은 `safeUntil`이 non-null일 때 = **리셋 전 소진 궤도일 때만** 나오므로, 가장 알려줘야 할 상황에서 정보가 줄었다. v0.2.3 인수검증 축A S2(미요청추가·낮음)는 범위 절차 관점이라 이 손실까지 본 판정이 아니었다. **전제**: v0.2.3 ship 선행(현재 미승인·미커밋). 배지가 마켓 히어로에 보이므로 이미지 재촬영 필요. **제외 유지**: R4 툴체인 · `test:integration` · Cursor·LLM요약·알림고도화.

## 2. 전제 정정 (착수 시 코드 대조 결과 — 판정 기준은 이 절을 따른다)

### ① "Codex일 때 배지를 비운다"는 전제는 **부분적으로 낡았다**
- `panelView.ts` `applyProviderVisibility`가 Codex 전환 시 배지를 비우는 것은 맞지만, 곧바로 호출되는
  `updateCodexBandSection` 말미가 **이미** `snapshot.planType.toUpperCase()` 배지를 그린다(v0.2.2 HEAD부터 존재 — `git show HEAD:src/webview/panelView.ts` 364-369행).
- **실결함은 "비움"이 아니라 소유자 없는 조건부 쓰기 4곳**이다:
  1. `updatePanel`(Claude)은 **provider 무관**하게 Claude 티어를 쓰고, subscriptionType이 없으면 **지우지 않는다**.
     - 초기 pull(`GetPollHistory`→`GetRateLimit`→`updatePanel`)이 체인이라 `GetCodexRateLimit`보다 늦게 도착하기 쉽다 → **Codex 모드로 대시보드를 열면 Claude 배지가 Codex 배지를 덮는다**.
  2. `updateCodexBandSection`은 planType이 있을 때만 쓰고 **지우지 않는다**.
  3. `applyProviderVisibility`는 Codex 전환 시에만 지운다 → **Codex→Claude 전환 시 Codex 배지가 다음 Claude 폴링까지 잔존**.
  4. `PushLang` 핸들러는 `rebuildPanelDom` 후 `updatePanel`만 호출 → Codex 모드에서 언어 변경 시 Claude 배지가 그려지고, provider 가시성도 재적용되지 않는다(Claude 전용 카드 재노출).
- 따라서 ①의 목표("대시보드에서 Codex 플랜 배지가 사이드바처럼 보인다")를 **실제로 보장**하는 수정 = 배지 텍스트를 결정하는 **순수 선택자 1곳** + 모든 쓰기 지점이 그 결과를 **무조건** 쓴다(빈 문자열=지움).
  5. (Phase 3 인수검증 V1에서 추가 발견) 초기 `GetLang` pull도 `rebuildPanelDom` 후 재수화 없음 — 4와 같은 클래스. `rehydrateAfterRebuild()` 1곳으로 모아 두 경로가 공유.
- 낡은 주석(`별건(ST9)`) 교체.

### ② 전제 확인됨
- `codexBandBurn.ts` `deriveCodexBucketBurn`에 `calcProjAtReset` 호출 없음 — 사실.
- `buildBurnRow`(webviewShared.ts)는 `safeUntil` non-null일 때만 ` · {safe_until} {time} ({proj} {pct} {left})`를 붙인다.

## 3. 확정 제약·결정

- 데이터 신규 배선 0 (기존 `panelCodexSnapshot`·`lastPanelSnapshot`만 사용).
- 배지 포맷: Claude=`fmtPlanTier(subscriptionType, rateLimitTier)` / Codex=`planType.toUpperCase()`(값별 분기 없음, §8 불변식5).
- ②는 **사이드바만** 렌더(로드맵 원문 범위). `CodexBucketBurn`에 `projText` 필드를 추가하는 것은 "판정과 수치는 한 곳"(codexBandBurn.ts 설계 원칙) 때문 — **대시보드 카드에는 렌더하지 않는다**(v0.2.3 S2와 같은 범위 이탈 회피).
- 기존 테스트 단언 수정 금지 — 신규 테스트만 추가.
- git: v0.2.3 미커밋 변경이 같은 파일에 섞여 있어 RED 선커밋 불가(커밋 시 미승인 v0.2.3이 딸려 들어감 = ship 게이트 위반). **non-git 대체**: 단일 vitest 실행으로 RED 관측 → VERIFY-SPEC에 "RED 관측·사유·구현 중 테스트 미수정" 기록.
- 전제 "v0.2.3 ship 선행" **미충족 상태로 진행**(사용자 지시). v0.2.3/v0.2.4 변경은 같은 작업트리에 섞인다 — 번들/분리는 ship 시 사용자 결정.
- 마켓 이미지 재촬영: `capture-media.mjs`가 변경된 상태(Codex 활성 배지 / Codex 사이드바 소진 궤도 행)를 촬영하는 경우에만.

## 4. SubTask (라우팅: 전량 [S] — 2건, 작업트리 dirty)

| ID | 태그 | 내용 | 파일 |
|---|---|---|---|
| ST1 | [TDD] | `panelPlanBadgeText(provider, claudeSnap, codexSnap): string` 순수 선택자 신설 + 쓰기 지점 4곳(`updatePanel`·`updateCodexBandSection`·`applyProviderVisibility`·`PushLang`) 무조건 쓰기로 통일, PushLang에 provider 가시성 재적용, 낡은 주석 교체 | `src/webview/planBadge.ts`(신규), `src/webview/panelView.ts`, `test/unit/planBadge.test.ts`(신규) |
| ST2 | [TDD] | `CodexBucketBurn.projText` 추가(safeUntil non-null일 때만 `calcProjAtReset`), `buildCodexBucketBurnRow`가 `buildBurnRow`와 같은 모양으로 `({proj} N% {left})` 렌더 | `src/webview/codexBandBurn.ts`, `test/unit/codexBandBurn.test.ts`(신규 케이스만 추가) |

## 5. UI 설계 명세
신규 화면·토큰 없음. 기존 `.plan-badge`·`.rate-burn-row` 마크업 재사용. Ground Truth: `src/webview/styles.css`, `docs/design/prototype/provider-compare.html`.
