# VERIFY-SPEC — v0.1.54 ST6: vscode-messenger 0.5.x → 0.6.1

## 요청
`vscode-messenger`/`vscode-messenger-common`/`vscode-messenger-webview` 3패키지 동시 0.6.1 범프. 게이트: `npm run test:e2e`(실 라운드트립, 대조군 포함). ST4~ST5 사이에 넣지 않음(지켜짐 — ST5 완료 후 진행).

## 실제 결과
- 범프 전 baseline 확립: 기존 0.5.1(semver `^0.5.0` 범위 내 npm이 설치해둔 실제 버전)에서 `npm run test:e2e` 먼저 실행 → PASS 확인(사전조사, 비교 기준선 확보).
- `npm install vscode-messenger@0.6.1 vscode-messenger-common@0.6.1 vscode-messenger-webview@0.6.1` — `package.json`/`package-lock.json` 3곳 모두 `^0.6.1`로 갱신.
- `npm run build` — esbuild+양쪽 tsc 전부 정상(타입 breaking change 없음). 번들 592.1kb(0.5.1 대비 +7kb, 라이브러리 자체 증가분).
- `npm run test:e2e` 범프 후 재실행 → **PASS**(`[roundtrip] PASS — FIX panel received pushUsageSummary; regression panel did not.`) — 동일 대조군 구조(FIX 패널 수신·회귀 패널 미수신) 유지 확인.
- 전체 재검증: `npx vitest run`(268/268) · `npx eslint`(error 0) · `node scripts/verify-webview-surface.mjs`(golden diff 0) · `verify-calendar-clip.js`(여전히 동일 6건, 신규 0) · `bash verify.sh --full`(PASS=23/FAIL=0) 전부 그린.
- **verify.sh 배선 추가**(ST4/ST5/ST6 완료 시점 — 계획의 "구현 시 --full 티어 배선 권장" 반영):
  - `node scripts/verify-webview-surface.mjs`(웹뷰 골든 digest) → `--full`에서만(빌드 산출물 필요, ~17s)
  - `npm run test:e2e`(vscode-messenger 라운드트립) → `--full`에서만(~5s, 바이너리 캐시 시)
  - `verify-calendar-clip.js`는 **의도적으로 배선하지 않음** — 상시 6건 FAIL 중인 사전 결함(ST4 문서화)이 있어 그대로 걸면 실제 회귀 발생 여부를 구분할 수 없음. 그 결함 해소 후 배선.

## 변경 파일
- `package.json`, `package-lock.json` (버전 3곳)
- `verify.sh` (골든 digest + test:e2e 스텝 추가)

## 검증
- `npm run test:e2e` (0.5.1 baseline) → PASS
- `npm run build` (0.6.1) → 성공
- `npm run test:e2e` (0.6.1) → PASS (동일 대조군 로직)
- `bash verify.sh --full` → PASS=23/FAIL=0 (ST4/ST5 시점 21 → 신규 2스텝 추가로 23)
- `bash verify.sh --ts-only` → PASS=5/FAIL=0 (신규 스텝 미영향 확인)
- `bash verify.sh --no-build` → PASS=17/FAIL=0 (신규 스텝 정상 스킵 확인)

## 미확인 사항
- 0.5→0.6 마이너 범프의 공식 CHANGELOG를 별도로 확인하지 못함(패키지에 번들 CHANGELOG 없음, npm registry에도 미게시) — 실제 라운드트립 테스트 통과로 대체 검증.
- `verify-real-extension-visual.mjs`(Xvfb 실 EDH)는 이 범프 이후 재실행하지 않음 — ST5에서 이미 실행해 사이드바·대시보드 정상 렌더 확인했고, messenger 버전만 바뀐 이번 SubTask는 test:e2e 라운드트립으로 충분하다고 판단.
