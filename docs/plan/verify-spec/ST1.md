# VERIFY-SPEC — ST1: 에러 메시지 HTML 이스케이프

## 요청
main.ts의 외부/에러 문자열 innerHTML 주입 지점에 escapeHtml 적용.

## 실제 구현 (PLAN 원문에서 스코프 정정됨)
- `escapeHtml`은 이미 `src/webview/format.ts`에 존재(v0.1.39 추출, 20+ 호출부 기존 사용 중). 신규 모듈 생성은 하지 않음.
- 실측으로 raw `err.message`/`msg`가 이스케이프 없이 innerHTML에 들어가는 지점 5곳을 확인: `main.ts:44,139,182,730,764` (PLAN 원문에는 730/764 두 곳만 적혀 있었음 — 이전 세션 조사 누락).
- 5곳 로직이 동일(`err instanceof Error ? err.message : String(err)` → escape)하여 `formatErrorHtml(err: unknown): string`으로 추출 후 5곳 전부 치환.

## 변경 파일
- `src/webview/format.ts` — `formatErrorHtml` 함수 추가
- `src/webview/main.ts` — import 갱신 + 5개 지점 치환
- `test/unit/format.test.ts` — 신규 (escapeHtml 2 + fmtCost 2 + formatErrorHtml 3, 총 7 테스트)

## TDD 이행
RED: `formatErrorHtml is not a function` (3 테스트 실패, 기존 escapeHtml/fmtCost 4개는 처음부터 통과 — 유효 RED 확인).
GREEN: 구현 후 7/7 통과.

## 구현 결정
- 중복 제거가 추출 근거 — 5곳 동일 패턴이 아니었다면 추출하지 않았을 것.
- `formatErrorHtml`은 DOM 비의존 순수함수로 format.ts에 배치(파일 헤더 컨벤션과 일치).

## 미확인 사항
- 나머지 29곳 innerHTML 사용부는 정적 템플릿이거나 이미 `escapeHtml()`/`t()` 처리된 문자열로 판단해 제외했음 — 개별 재확인은 하지 않음(PLAN 스코프: 외부/에러 문자열 유입 지점만).
- `err.message`가 실제로 공격자 통제 가능한지는 낮은 리스크로 판단(VS Code Messenger 초기화 실패는 대부분 로컬 환경 오류) — 방어적 조치로 처리.
