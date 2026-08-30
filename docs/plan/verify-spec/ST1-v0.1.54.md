# VERIFY-SPEC — v0.1.54 ST1: 유닛 테스트 백필 [characterization]

## 요청
UsageAggregator 코어 롤업(today/last7Days/cacheHitRate/modelBreakdown/cacheStats/todayToolCounts/recentSessions/recentEditedFiles/branchBreakdown) + CacheStore + WorkspaceMapper(getProjectDir 포함) 테스트 백필. TDD 태그 없음(characterization) — 첫 실행 GREEN이 정상.

## 실제 결과
- `test/unit/UsageAggregator.coreRollup.test.ts` 신설(14 tests) — today/last7Days/cacheHitRate/modelBreakdown/cacheStats(+가격 미매칭 폴백)/todayToolCounts/recentSessions(중복세션·20건 절단)/recentEditedFiles(중복파일 최신순) 커버.
- **branchBreakdown은 기존 `UsageAggregator.branch.test.ts`가 이미 커버 중** — 중복 작성 안 함.
- `test/unit/CacheStore.test.ts` 신설(7 tests) — merge/load 왕복, 동일날짜 덮어씀, 정렬, 파일없음 폴백, 손상 JSON 폴백, version≠1 무시.
- `test/unit/WorkspaceMapper.test.ts` 신설(9 tests) — getProjectDir(정확매칭/prefix폴백/미매칭 null/projectsDir 없음), getAllJsonlFiles(수집/빈배열/개별 디렉토리 실패 무시), cwdMatchesWorkspace 위임 확인, 생성자 기본 경로.
  - **마찰제거 트릭 적용**: `getAllJsonlFiles()` 테스트를 `await mapper.getAllJsonlFiles()`로 작성 — 현재는 동기 함수지만 `await`가 non-promise에도 동작해 ST3(async 전환) 때 이 테스트 파일은 **0건 수정**으로 그대로 GREEN 유지.
- 전부 **첫 실행 GREEN**(30/30) — characterization 역규약대로 RED 없음. 실버그 미발견.

## gbc 게이트 판정 및 사유 (무시 근거 명시)
`UsageAggregator.coreRollup.test.ts` 작성 시 gbc 게이트가 "workspaceRoots 배열 처리·pinnedSessionId/auto 폴백 형제 케이스 누락"을 지적했으나, **무시함** — 사유:
- workspaceRoots 배열 스코핑은 `UsageAggregator.sessionContext.workspaceRoots.test.ts`(11 tests)가 이미 전담 커버.
- pinnedSessionId/pinMissing/mode(auto·pinned) 폴백은 `MultiRepoContextGauge.integration.test.ts`(SubTask6, 2개 전용 테스트: pin 적중·pin 소실→자동폴백)가 이미 커버.
- 두 기능은 이번 ST1 계획 원문 목록(today/last7Days/cacheHitRate/modelBreakdown/cacheStats/todayToolCounts/recentSessions/recentEditedFiles/branchBreakdown)에 **포함되지 않음** — sessionContext류는 별개 서브시스템으로 이미 자체 테스트 파일 보유.
- 중복 작성은 소유권 분산(같은 동작을 두 파일이 다르게 단언할 위험)만 만들어 회피.

## 변경 파일
- `test/unit/UsageAggregator.coreRollup.test.ts` (신설)
- `test/unit/CacheStore.test.ts` (신설)
- `test/unit/WorkspaceMapper.test.ts` (신설)

## 검증
- `npx vitest run test/unit/UsageAggregator.coreRollup.test.ts test/unit/CacheStore.test.ts test/unit/WorkspaceMapper.test.ts` → 3 files, 30 tests, 전부 PASS

## 미확인 사항
- `aggregate()`의 `now = new Date()` 의존 필드(today/last7Days/cacheStats/modelBreakdown/todayToolCounts)는 테스트가 `new Date().toISOString().slice(0,10)`로 "오늘"을 런타임 계산해 프로덕션 로직과 동일 기준을 씀 — UTC 자정 경계 근처(초 단위)에서 이론상 미세 레이스가 있으나 실사용상 무해(기존 코드베이스에 시간 주입 지점 없음, 이 프로젝트 관례).
