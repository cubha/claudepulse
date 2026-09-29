# PLAN v0.2.5b — 서브에이전트 타입별 비용 (v0.2.5 동반 출하)

## 1. 사용자 요구사항 원문 (2026-09-29)

> 다른로드맵과 병합할만한거잇어? 추가기능이랑 같이묶어서 올리면좋을거같은데

→ 제안(서브에이전트 타입별 비용을 v0.2.5에 묶기, 나머지는 v0.2.6)에 대해:

> 오케이. 묶고 추가분 검증까지진행해.

제안 내용(직전 턴): v0.2.5에서 서브에이전트 transcript를 수집하게 됐으나 대시보드엔 합계·비중·고유 에이전트 수만 나온다. 사이드체인 레코드 top-level `attributionAgent`(실측 28,794건 중 28,680건 = 99.6%에 존재, 12종+)로 **어떤 에이전트가 얼마를 썼는지**를 기존 서브에이전트 영역에 추가한다. 근거: `docs/research/RESEARCH-신규기능후보-2026-09-28.md` §3 후보 2, 로드맵 v0.2.6 P1 항목을 당겨옴.

## 2. 확정 제약

- **사이드체인만 집계**(`isSidechain`). 메인 체인 비용은 이미 스킬 집계에 들어가 있어 이중계산 금지.
- 타입별 합계 + 미상 버킷 = `subagentStats.subagentCostUsd` (분모 일치 — 스킬 카드의 grand-total 원칙).
- `attributionAgent`가 없는 사이드체인 레코드는 **"타입 미상" 버킷을 1급으로 노출**(숨기면 거짓 정밀도 — "스킬 외 작업"과 같은 원칙). 미가격 레코드만 있어 비용이 0이어도 토큰이 있으면 숨기지 않는다.
- 24h/7d/All 스코프 토글에 그대로 따른다 — `computeAttribution` 안에서 계산해 스코프별 재사용.
- "실행 수" = 타입별 고유 `agentId` 수(기존 "N 에이전트"와 같은 단위).
- 대시보드만(비용 귀속 카드 내부). 사이드바 무변경. Codex는 이 카드가 원래 숨겨진다(CLAUDE_ONLY).
- 새 색·새 토큰 없음 — 기존 `.skill-row` / `.skill-row-other` / `.panel-mcp-header` 문법 재사용(§3#5·#6).
- 본문 서술 문장 금지(v0.2.4 규약) — 설명은 `title` 툴팁.

## 3. SubTask (전량 [S] — 독립 [P] 후보 4개 미만)

| ID | 태그 | 내용 | 파일 |
|---|---|---|---|
| ST4 | [TDD] | 파서가 `attributionAgent`를 `SessionRecord`로 옮기고, `computeAttribution`이 사이드체인만으로 `subagentTypeBreakdown`(타입·비용·토큰·실행수·share·미가격 플래그, 비용 내림차순) + `subagentTypeUnattributed` 버킷 산출 → `AttributionScope`·`UsageSummary`에 노출 | `src/services/JsonlParser.ts`, `src/services/UsageAggregator.ts`, `src/types/index.ts`, `test/unit/subagentTypeBreakdown.test.ts`(신규) |
| ST5 | (UI — TDD 제외, 렌더 검사 test-after) | 비용 귀속 카드에 "서브에이전트 타입별" 서브섹션(`#panel-subagent-list`): 타입 목록(접힘 6행 + "+N 더보기") + 미상 버킷 행(muted, 항상 표시), 툴팁=타입·비중·실행수·토큰, 없으면 빈 상태. mock 데이터 추가, 골든 digest 재기준선(의도된 DOM 추가), 렌더 검사 2폭×2로캘 | `src/webview/panelView.ts`, `src/webview/i18n.ts`, `docs/demo/mock-data.js`, `scripts/verify-list-cap.js`, `scripts/verify-webview-surface.mjs` |

## 4. UI 설계

Ground Truth `src/webview/styles.css`. 위치: 비용 귀속 카드, 스킬 목록 아래·MCP 헤더 위. 헤더는 `.panel-mcp-header` 클래스를 그대로 재사용(styles.css 무변경), 행은 `.skill-row` 3열(이름·바·비용), 미상 버킷은 `.skill-row-other`(slate, 마지막). 바 폭 스케일 = 전체 타입 중 최대 share. 목록 상한은 v0.1.55 `cappedListHtml` 컨벤션.

## 5. 릴리스 메타

v0.2.5 CHANGELOG `Added`·README What's New에 1항목 추가. 버전은 0.2.5 유지(단일 출하).
