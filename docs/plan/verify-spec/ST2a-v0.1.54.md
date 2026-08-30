# VERIFY-SPEC — v0.1.54 ST2a: tsconfig.test.json + verify.sh 편입

## 요청
`tsconfig.test.json` 신설(rootDir/outDir 없이 별도 구성, `include: ["test/**/*.ts","src/**/*.ts"]`) + verify.sh 편입 + D-0류 측정 무결성 바닥.

## 실제 결과
- `tsconfig.test.json` 신설. `module: ESNext` / `moduleResolution: Bundler` 채택(root tsconfig.json의 Node16보다 관대) — 테스트가 `src/**`(Node16 대상)와 `src/webview/**`(ESNext/Bundler 대상)를 동시에 import하므로 둘 다 만족하는 설정 필요. `lib`에 `DOM`/`DOM.Iterable` 추가(webview 코드가 `document`/`HTMLElement` 등 사용). `types: ["node","mocha"]` — `test/integration/extension.test.ts`가 `suite`/`test` 전역(mocha TDD 스타일, `@vscode/test-electron`이 런타임 주입)을 쓰는데 `@types/mocha` 미설치 상태였음(계획에 명시된 함정) → **`@types/mocha`를 devDependency로 신규 설치**.
- verify.sh에 3단계 추가: `TypeScript typecheck (test)`(`tsc --noEmit -p tsconfig.test.json`), 측정 무결성 바닥(`--listFilesOnly` 결과 ≥50, 실측 71) — `--ts-only`에도 포함(저비용 컴파일 확인 취지에 부합).
- **실측 사각지대 버그 5건 발견·수정** (이 게이트가 처음 켜지며 드러남, tsc가 test 디렉토리를 본 적이 없어 여태 무성했던 결함):
  1. `test/unit/MultiRepoContextGauge.integration.test.ts` — ST3(WorkspaceMapper async 전환)로 `mapper.getAllJsonlFiles()` 5개 호출부가 타입 불일치(Promise를 sync처럼 사용) → `await` 추가. **런타임 회귀이기도 함**(vitest는 타입을 안 봐서 통과했겠지만 `files.length`가 `undefined`가 되어 즉시 실패했을 것 — 전체 vitest 재실행으로 통과 확인).
  2. `test/unit/RateLimitPoller.test.ts` — `makePoller()` 헬퍼가 `RateLimitPoller` 생성자 5번째 인자(`onError`)를 안 넘겨 `undefined`로 암묵 통과 중이었음 → 빈 콜백 추가.
  3. `test/unit/FileWatcher.debounce.test.ts` — `beforeEach(() => vi.useFakeTimers())`가 `VitestUtils`(체이닝용 `vi` 자신)를 암묵 반환해 훅 타입과 불일치 → 블록 바디로 감싸 `void` 반환.
  4~5. `src/webview/main.ts:1236,1243` — `Parameters<typeof Chart>[1]['options']`(클래스에 호출 시그니처 없음, TS2344) + tooltip 콜백 `ctx` 암묵 `any` → `ConstructorParameters<typeof Chart>[1]['options']`로 교정 + `ctx: { parsed: unknown }` 명시.
- `npx vitest run` 전체 재실행: **34 files / 268 tests 전부 PASS** (회귀 없음, 신규 백필 30건 포함).
- `bash verify.sh --full` PASS=20/FAIL=0.

## 변경 파일
- `tsconfig.test.json` (신설)
- `verify.sh` (3단계 추가)
- `package.json`/`package-lock.json` (`@types/mocha` 추가)
- `test/unit/MultiRepoContextGauge.integration.test.ts`, `test/unit/RateLimitPoller.test.ts`, `test/unit/FileWatcher.debounce.test.ts` (사각지대 버그 수정)
- `src/webview/main.ts` (타입 버그 2건 수정, 런타임 동작 변화 없음 — 순수 타입 주석/캐스트)

## 검증
- `bash verify.sh --ts-only` → PASS=4/FAIL=0
- `bash verify.sh --full` → PASS=20/FAIL=0
- `npx vitest run` → 34 files / 268 tests PASS

## 미확인 사항
- `@types/mocha` 설치로 `npm audit`이 기존부터 있던 취약점 17건(4 moderate·12 high·1 critical)을 보고하지만 **전부 기존 트리 소속**(`@types/mocha` 자체는 런타임 의존성 0) — 이번 변경이 새로 만든 취약점 아님, 이번 SubTask 범위 밖(R4 툴체인 트랙에서 별도 처리).
