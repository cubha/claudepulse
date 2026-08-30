# VERIFY-SPEC — v0.1.54 ST3: WorkspaceMapper async 전환 [TDD]

## 요청
`WorkspaceMapper.getAllJsonlFiles()`(동기 `fs.readdirSync` 2중 루프) + 단일 호출자 `extension.ts:148`를 async로 전환, 기존 동작 유지.

## RED/GREEN 증거
- RED: `test/unit/WorkspaceMapper.test.ts`에 `expect(mapper.getAllJsonlFiles()).toBeInstanceOf(Promise)` 추가 → 실행 결과 `expected [] to be an instance of Promise` (유효 RED — 구현 누락 사유, import/setup 오류 아님).
- GREEN: `WorkspaceMapper.ts`의 `getAllJsonlFiles()`를 `async getAllJsonlFiles(): Promise<string[]>`로 전환, 내부 `fs.readdirSync` 2곳을 `await fs.promises.readdir`로 교체. 테스트 파일은 RED 확인 이후 **수정하지 않음**.
- `extension.ts:148`(`refreshUsage()` 내부, 이미 `async function`) 호출부를 `const files = await workspaceMapper.getAllJsonlFiles();`로 수정 — 이 파일이 유일한 호출자(사전 grep 확인).

## 변경 파일
- `src/services/WorkspaceMapper.ts`
- `src/extension.ts` (1줄)
- `test/unit/WorkspaceMapper.test.ts` (RED 테스트 1건 추가 — ST1 백필 시 이미 `await` 패턴으로 작성해둔 나머지 케이스는 무수정 그대로 GREEN 유지, 계획된 마찰제거 트릭 그대로 적중)

## 검증
- `npx vitest run test/unit/WorkspaceMapper.test.ts` → 10/10 PASS
- `npx tsc --noEmit` → 에러 0 (extension.ts 포함 전체 루트 tsconfig)

## 미확인 사항
- 없음. `getAllJsonlFiles`의 유일 호출자가 `extension.ts:148` 하나임을 사전 grep으로 확정했으므로 누락된 호출부 위험 없음.
