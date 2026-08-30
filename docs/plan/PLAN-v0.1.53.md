# PLAN — v0.1.53 (2026-08-28)

## 사용자 요구사항 원문

> 신규잔여항목과 보류대상 한번에 배포하도록할게. 묶어서 /plan진행 후 현재버전보다 0.0.1 상위 mig계획 메모리에 저장해줘
> (후속) 위 Task /sh-dev-loop --tdd --auto 진행

대상: /mnt/d/workspace/claudepulse · 현재 head v0.1.52(배포완료) → v0.1.53

## 확정 제약

- CLAUDE.md §3 CRITICAL 7항 전체 준수 — 특히 §3#5(선언 밖 색 리터럴 fail 게이트), §3#6(7+1 액센트 cap)
- ship/배포는 이 파이프라인 범위 밖. 커밋까지만. push/publish/vsce는 사용자 명시 승인 없이 금지 (feedback_ship_gate 절대원칙)
- ST3(라이트 테마 연동)은 위험 최상 — Xvfb 시각검증 실패 시 **이 SubTask만 드롭**, 나머지는 진행
- 테스트는 통과시키기 위해 약화·조작하지 않는다 (reward-hacking 방지 가드)

## 거부/제외 사항 (범위 밖 — 재논의 금지)

- **③ 모델별 주간 한도 게이지**: Anthropic이 응답 헤더에 `model_scoped` 노출해야 함(외부 조건) — CLAUDE.md §3#3 위반 없이는 불가
- **Cursor 계측**: 로컬 tokenCount=0 공식 공인 + 개인 usage API 부재. 재개조건=Cursor 공식 API 출시
- **design-lint harvest 결함 수정**: 대상이 `~/.claude/skills/design-lint` — 다른 repo. 전달용 프롬프트 별도 생성됨
- **v0.1.37 usage×git 회고 뷰**: 0.x.0급 신규 UI 섹션 — 패치(0.0.1) 아님

## SubTask 목록

- **ST0**: ✅완료·미커밋 — 디자인 토큰 GT 재수립 + D-0~3 게이트
  - 파일: `src/webview/styles.css`, `docs/design/DESIGN-TOKENS.md`, `CLAUDE.md §9`, `verify.sh`
  - 결과: 선언 밖 색 리터럴 122→0 · dead 21→0 · 미정의 1→0 · 페어 미충족 9→0. `verify.sh --full` PASS=18/FAIL=0
  - **재구현 금지** — 이 계획은 릴리즈 절차만 다룬다

- **ST1** `[TDD]` — 에러 메시지 HTML 이스케이프 적용 (계획 원문 대비 스코프 정정 — 실측 근거 아래)
  - **재측정 결과 (PLAN 원문 전제가 틀렸음)**: `escapeHtml`은 **이미 `src/webview/format.ts:7`에 존재**하고 main.ts에서 20곳 이상 사용 중(v0.1.39 추출). "정의 0개"는 이전 세션의 오탐이었다. 신규 모듈 생성은 **불필요** — PLAN 수정.
  - 실제 미이스케이프 지점(raw `err.message`/`msg`를 innerHTML에 직접 삽입, 5곳): `main.ts:44`(top-level catch) · `:139`(sidebar init failed) · `:182`(sidebar start failed) · `:730`(panel init failed) · `:764`(panel start failed)
  - 파일: `src/webview/format.ts`(신규 함수 `formatErrorHtml` 추가), `src/webview/main.ts`(5곳 치환), `test/unit/format.test.ts`(신규)
  - 설계: 5곳이 동일 로직(`err instanceof Error ? err.message : String(err)` → escape)을 중복하므로 `formatErrorHtml(err: unknown): string`으로 추출(중복 제거가 근거 — 과잉 추상화 아님)
  - TDD 적격 사유: 결정론 순수함수(unknown→escaped string) + vitest 존재 + 비자명(Error/non-Error 분기 + escape 5종)

- **ST2** — 프로토타입 HTML 드리프트 정리 (실행 중 스코프 정정 — advisor 검토 반영)
  - **실제 결과: error 9 → 6** (0이 아님 — 아래 사유로 목표 자체를 정정)
  - **D-COLOR-02 (4색) → 0 완료**: 각 파일 자체 `:root`에 로컬 커스텀 프로퍼티 선언(`--canvas-surface`·`--qp-surface`·`--exp-b`) 후 `var()` 참조로 치환. 렌더 값 바이트 동일. `usage-heatmap.html`의 죽은 선언(`background: #143;`, 직후 덮어써짐) 함께 제거
  - **D-TOKEN-01·D-TYPE-07은 의도적으로 미조치**: 재측정 결과 `--token-source`의 허용 px 집합이 spacing과 font-size/border-width를 구분하지 않는 flat set이라, off-scale 값을 스냅하면 실제로는 정리가 아니라 왜곡(예: `gap:10px`가 위반인 이유가 spacing 스케일이 아니라 `--fs-label`=11px 우연치 때문). 시각적 손실 리스크 대비 report-only 지표 개선의 이득이 낮다고 판단해 중단
  - **부수 개선(원 계획에 없었음)**: `verify.sh`의 design-lint 호출을 구 `--tokens DESIGN-TOKENS.md`(unstructured harvest, 문서에 위반값 적으면 허용집합 오염되는 기결함)에서 `--token-source src/webview/styles.css`(structured, 실 선언 harvest)로 전환. design-lint 스킬 쪽에 이관했던 harvest 개선 과제가 상류에서 이미 해소된 것을 발견해 채택
  - 파일: `docs/design/prototype/00-clausight-canvas.html`, `context-session-picker.html`, `usage-heatmap.html`, `verify.sh`, `docs/design/DESIGN-TOKENS.md` §13.1, `CLAUDE.md` §9
  - `provider-compare.html`은 D-COLOR-02 위반 없어 수정 없음

- **ST3** — 라이트 테마 연동 — **드롭됨 (사전 합의된 조건 발동)**
  - 코드 조사 결과: 현재 15개 `--vscode-*` 재정의 중 12개는 VS Code가 실제 주입하는 진짜 theme API 변수(예: `--vscode-editor-background`)를 `.theme-dark`/`.theme-light`에서 섀도잉하는 진짜 결함이고, 3개(`--vscode-card-background`·`--vscode-divider`·`--vscode-grid`)는 VS Code에 존재하지 않는 자체 발명 pseudo-token이라 **그대로 둬야** 한다 — 이 구분을 틀리면 D-2류 무성 실패가 재발한다.
  - 검증 인프라 실측: Playwright/chrome-devtools MCP 연결 안 됨(세션 시작 시 확인). Xvfb·Linux VS Code 테스트 바이너리(`.vscode-test/`)는 있으나 스크린샷 도구(import/scrot/gnome-screenshot/maim) 전무 — 렌더 결과를 실제로 "보는" 수단이 없다.
  - **PLAN 원문의 드롭 조건("검증 실패 시 드롭")을 "검증 수단 부재"에도 적용** — advisor 조언: "검증 수단이 없다는 것과 검증에 실패했다는 것은 다르다"를 근거로, 전체 사용자의 첫인상에 영향을 주는 변경을 값-동등성 주장만으로 내보내지 않는다.
  - 재개 조건: Playwright/chrome-devtools MCP 재연결 **또는** 스크린샷 도구 확보 후 별도 SubTask로 재시도

- **ST4** — 릴리즈 메타 (ST1~3 이후, 드롭된 것 제외 반영)
  - 파일: `package.json`(0.1.52→0.1.53), `CHANGELOG.md`, `README.md`/마켓플레이스 공개정보

## 라우팅 판정

- 하드 전제: git ✅ · verify.sh ✅ (`--ts-only` 지원 확인됨)
- `[P]` 후보: ST1(src/webview/*) · ST2(docs/design/prototype/*) · ST3(src/providers,src/panel) — 파일 독립이나 **3개 < 4개 임계값** → 전량 `[S]`
- ST4는 ST1~3 결과(드롭 여부)에 의존 — 구조적으로 순차

**[S] 체인**: ST1 → ST2 → ST3(위험 최상, 실패 시 드롭) → ST4

## TDD 플래그 상태

`--auto --tdd` — 자동 태그 적용, 승인 제안 생략. ST1만 3-AND 적격.

## UI 설계 명세

해당 없음 (신규 화면 없음 — ST2/ST3은 기존 GT/토큰 값 그대로 재배선, 톤 변경 아님)
