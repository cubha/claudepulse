# VERIFY-SPEC — v0.1.54 ST2b: webview typecheck + lint 배선

## 요청
`tsconfig.webview.json` 배선(현재 어디에도 참조 안 됨) + lint(`.eslintrc.cjs:21`의 `src/webview/**` ignore 제거, `parserOptions.project` 배열에 추가) — ST5(main.ts 분리)의 하드 선행조건.

## 실제 결과
- **`tsconfig.webview.json` 실측 확인**: `outDir`/`rootDir`이 설정돼 있었으나 실제 번들 산출은 `esbuild.config.mjs`가 전담(esbuild가 이 tsconfig를 읽지 않음) — 이 파일의 유일한 존재 이유는 `--noEmit` 타입체크뿐이었다. `rootDir: "src/webview"`가 걸려있어 webview 코드가 합법적으로 import하는 `src/types`·`src/messaging/contracts`(cross-boundary 공유 타입)를 만나면 TS6059로 즉시 실패 — **한 번도 실행 가능한 상태가 아니었음**(ST0 계측에서 처음 확인). `outDir`/`rootDir`/`sourceMap` 제거 + `noEmit: true` 명시로 교정.
- `verify.sh`에 `TypeScript typecheck (webview)`(`tsc --noEmit -p tsconfig.webview.json`) 스텝 추가, `--ts-only`에도 포함.
- `.eslintrc.cjs` — `ignorePatterns`에서 `'src/webview/**'` 제거, `parserOptions.project`를 문자열 1개→배열 `['./tsconfig.json', './tsconfig.webview.json']`로 변경(typescript-eslint는 project 배열을 지원 — 여러 tsconfig에 걸친 파일들을 각각의 project로 타입인식). 기존 `npx eslint src --ext ts` 단일 스텝이 이제 `src/webview`까지 자동 포함(중복 스텝 안 만듦).
- `npm run build`/`npm run typecheck` 스크립트에 `&& tsc --noEmit -p tsconfig.webview.json` 추가 — CLI 진입점(`npm run build`)에서도 동일 사각지대 재발 방지.
- 실행 결과: webview eslint는 **error 0 · warn 2**(`DailyUsage` 미사용 import, 명시적 `any` 1건 — 둘 다 이번 SubTask 이전부터 있던 기존 코드, warn이라 게이트 안 막음, 수정은 범위 밖).
- `bash verify.sh --full` PASS=21/FAIL=0 (ST2a의 20에서 웹뷰 typecheck 스텝 1개 증가).

## 변경 파일
- `tsconfig.webview.json` (outDir/rootDir 제거, noEmit 추가)
- `.eslintrc.cjs` (ignorePatterns, parserOptions.project)
- `verify.sh` (webview typecheck 스텝 추가)
- `package.json` (`build`/`typecheck` 스크립트에 webview typecheck 추가)

## 검증
- `npx tsc --noEmit -p tsconfig.webview.json` → 에러 0
- `npx eslint src --ext ts` → exit 0 (error 0 · warn 2)
- `npm run build` → 정상 완료 (esbuild + 양쪽 tsc 전부 통과)
- `bash verify.sh --full` → PASS=21/FAIL=0

## 미확인 사항
- `main.ts:26-27`의 `eslint-disable-next-line`이 그 다음 줄(27행, `as any` 1건)만 덮고 28행의 동일 패턴(`as any` 삼항 분기 두 번째 브랜치)은 안 덮어 warn이 뜬다 — 기존부터 있던 1줄 누락이며 이번 SubTask가 만든 문제 아님, warn이라 게이트를 막지 않아 수정하지 않음(범위 밖).
