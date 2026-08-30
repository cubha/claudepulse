# VERIFY-SPEC — ST4: 릴리즈 메타

## 요청
package.json 버전범프(0.1.52→0.1.53), CHANGELOG.md, README.md/마켓플레이스 공개정보 갱신.

## 실제 결과
- ST3가 드롭되어 **v0.1.53에는 ST1(escapeHtml)·ST2(design-lint 정리)만 반영**. CHANGELOG/README는 이 두 건만 기술 — 계획에 있던 라이트 테마 연동은 언급하지 않음(안 나갔으므로).
- `package.json` `"version": "0.1.52"` → `"0.1.53"`. `package-lock.json`도 루트 name/version 2곳(3행·9행) 동기화(불일치 시 `npm install` 재실행을 유발하므로 필수).
- `CHANGELOG.md` — `[Unreleased]` 아래 `[0.1.53] - 2026-08-28` 신설. Fixed(escapeHtml) + Internal(디자인 토큰 GT·게이트·design-lint harvest 전환) 섹션.
- `README.md` — "What's New in v0.1.52" → "v0.1.53"로 교체하고 기존 내용은 `<details><summary>v0.1.52</summary>` 접이식으로 강등(기존 컨벤션 그대로 유지). 신규 항목은 escapeHtml 수정만 — design-lint/토큰 GT는 사용자 비가시적 내부 변경이라 README에 넣지 않음(기존 컨벤션: README는 사용자 체감 변경만 기술).

## 변경 파일
- `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`

## 검증
- `grep '"version"' package.json` → `0.1.53`
- CHANGELOG/README 신규 섹션이 실제로 반영된 코드 변경(ST1/ST2)과 일치하는지 육안 대조 완료

## 미확인 사항
- 마켓플레이스(Visual Studio Marketplace/Open VSX) 공개 페이지 자체는 `vsce publish`/`ovsx publish` 이후에만 갱신되므로 이 SubTask 범위 밖(배포는 사용자 명시 승인 필요 — feedback_ship_gate).
