# VERIFY-SPEC — v0.1.54 ST7: 릴리즈 메타

## 요청
내부 마일스톤이므로 package.json 버전범프(0.1.53→0.1.54)+CHANGELOG만. README "What's New" 갱신은 생략(사용자 결정, feedback_ship_prerequisite은 마켓 공개 시에만 적용 대상).

## 실제 결과
- `package.json` `"version"` `0.1.53` → `0.1.54`. `package-lock.json` 루트 name/version 2곳(3행·9행) 동기화.
- `CHANGELOG.md` — `[Unreleased]` 아래 `[0.1.54] - 2026-08-30` 신설. 전부 `### Internal` 섹션(ST1 테스트 백필·ST3 async 전환·ST2a/ST2b typecheck 배선·ST5 main.ts 분리·ST6 messenger 범프 요약) + `### Known Issues` 섹션(ST4에서 발견한 calendar-clip 사전 결함, 사용자 투명성 위해 기록 — 수정은 별도 이슈).
- README는 수정하지 않음(계획대로).
- `docs/PLAN-vnext-migration-2026-07-02.md` §2 R2에 "v0.1.54로 승격·완료" 반영은 이 SubTask가 아니라 완료 후 메모리 갱신 단계에서 처리(project_vnext_migration_plan.md).

## 변경 파일
- `package.json`, `package-lock.json`, `CHANGELOG.md`

## 검증
- `grep '"version"' package.json` → `0.1.54`
- CHANGELOG 신규 섹션이 ST1~ST6 VERIFY-SPEC 내용과 1:1 대응하는지 육안 대조 완료

## 미확인 사항
- 마켓플레이스 공개 페이지 갱신은 이 릴리즈 자체가 publish 대상이 아니므로 해당 없음.
- 커밋·태그·(내부 마일스톤이므로 publish 없음)는 사용자 명시 승인 필요(feedback_ship_gate).
