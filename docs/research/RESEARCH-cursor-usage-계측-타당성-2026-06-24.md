# 리서치 보고서: Cursor IDE 사용량/비용 계측 — claudepulse 지원 타당성

> 생성일: 2026-06-24
> 프로젝트: Claudepulse (claude-code-gauge)
> 목적: Cursor usage SideTab/Dashboard 구현을 위한 기술·시장 정보 수집. v0.2.0(멀티 IDE) 라인의 다음 후보로 Cursor가 타당한지 판단.
> 근거: 병렬 리서치 2건 — tech-researcher(로컬 데이터·요금·할당량) + market-researcher(경쟁·수요)

---

## 1. 리서치 배경

claudepulse는 `~/.claude/projects/*.jsonl` **로컬 파일 직접 파싱**으로 Claude Code 사용량/비용을 IDE 내 시각화한다(CRITICAL #3: 비공개 HTTP API 금지 — Claudemeter 즉시중단 위험). Codex 지원을 AgentSource 추상화로 추가 중(v0.2.0). 본 리서치는 **Cursor도 동일 패턴(로컬 파싱→토큰·비용)으로 지원 가능한지** 검증한다.

---

## 2. 조사 결과

### 2-1. 기술 타당성 (tech-researcher)

**로컬 데이터 소스**: `state.vscdb`(SQLite) — macOS `~/Library/Application Support/Cursor/User/globalStorage/`, Linux `~/.config/Cursor/...`, Windows `%APPDATA%\Cursor\...`. 테이블 `cursorDiskKV`(키: `composerData:`/`bubbleId:`/`agentKv:`). 각 `bubbleId` 행에 `tokenCount.inputTokens/outputTokens` 필드 존재. 추가: `~/.cursor/chats/store.db`, opt-in `~/.cursor/projects/*/agent-transcripts/*.jsonl`.

**🔴 결정적 차단: `tokenCount`가 항상 0**. Cursor 공식 팀이 포럼(2026-03)에서 공인 — "best-effort, 스트림 종료 후 백엔드에서 가져오려 하나 타이밍 문제로 항상 실패. **신뢰 불가, 메인 소스로 쓰지 말 것.**" 해결 일정 미공표. → **로컬 DB에서 정확 토큰·비용 역산 불가.**

**요금 단위**: 2025-06 이후 "요청 수" → **달러 크레딧(실토큰 × 모델별 API가격)**. Pro $20/Pro+ $60/Ultra $200. 1차 단위는 토큰기반 달러, 요청수는 근사.

**할당량/게이지 소스**: 공식 Admin/Analytics API(`/teams/daily-usage-data` 등)는 `crsr_` 키 = **팀 Admin 전용**(개인 Pro 무용). 개인 잔여는 로컬 어디에도 없음.

**정확 데이터 유일 경로** = 비공개 `api2.cursor.sh/api/usage` + `WorkosCursorSessionToken` 쿠키 → **CRITICAL #3 위반(Claudemeter 패턴 그 자체)**. 현존 개인용 도구가 전부 이 방식인 건 채택 이유가 아니라 **배제 이유**.

### 2-2. 시장·수요 (market-researcher)

**수요 = 실재·강함**: 2025-06~07 Cursor **과금 폭탄 사태**(요청수→달러크레딧 전환, 사전고지 없이 적용 → "$28→$500/3일", HN "$1,400/월 환산"). CEO 공개 사과·환불. 이후 실시간 비용 가시성 수요 폭발. 포럼 "Real-Time Usage Tracking" 피처 리퀘스트 다수. Cursor MAU 1M+/결제 360k+/ARR $2B.

**경쟁 공백**: **cursor-stats(13k 설치, 사실상 표준)가 2026-03 아카이브** — 저자가 "Cursor 가격정책 반복 변경에 따른 유지보수 부담"으로 중단 → **13k 사용자 공백**. 나머지 경쟁자는 설치 50 미만(초기) 또는 Enterprise 전용 또는 비공개 API 의존.

**멀티 AI 통합 트렌드**: Tokcat(Claude+Codex+Cursor+9종)·SessionWatcher(5종, macOS 메뉴바, claudepulse와 구조 유사)가 "로컬 파일 파싱"으로 멀티 에이전트 비용 통합 표방. 개발자 70%가 2~4개 AI 도구 동시 사용.

**보안**: CursorJacking 취약점(CVSS 8.2, 2026-04 미패치) — state.vscdb의 세션토큰을 익스텐션이 읽을 수 있음. Cursor "익스텐션=로컬앱 신뢰경계"라며 미수정. → 비공개 API/세션토큰 의존 도구는 보안 비판에 노출.

---

## 3. 프로젝트 적합성 — AgentSource 계약 충돌

claudepulse AgentSource 계약 = **"로컬 파일 파싱 → 토큰·비용 산출"**. Claude Code는 성립(jsonl에 비용 직접 기록). Codex는 부분 성립(로컬 jsonl에 토큰 **누적값** 있어 차분 가능 — [[reference_codex_integration]]). **Cursor는 계약 이행 불가**: 로컬에 신뢰 가능한 토큰 값 자체가 없다(0). Codex보다 더 나쁨.

| 계측 항목 | 로컬 소스로 가능? | CRITICAL #3 |
|---|---|---|
| 요청 수·모델 분포·타임라인 | ✅ 가능(state.vscdb) | 허용 |
| 정확 토큰·비용 | ❌ 불가(tokenCount=0) | — |
| 개인 할당량 게이지 | ❌ 로컬에 없음 | — |
| 정확 토큰·비용·게이지(비공개 API) | (가능) | **위반·금지** |

→ claudepulse 원칙 하 Cursor는 **"요청 횟수/활동 추적기" 수준**에만 머물며, ccusage급 비용 정확도라는 **차별축을 Cursor에선 상실**.

---

## 4. 권고

### 1순위 — **보류(park) + 단일 선행 검증**
Cursor 지원을 v0.2.x 확정 범위에 넣지 말고 보류. 착수 전 **단 하나를 먼저 검증**: Tokcat/SessionWatcher가 Cursor를 어떻게 지원하는가 — `~/.cursor/projects/*/agent-transcripts/` opt-in JSONL 또는 다른 로컬 파일에 **신뢰 가능한 토큰/비용이 실제로 있는가**(tech 리서치는 "같은 백엔드라 토큰0 예상"이나 미확정). 있으면 진입 타당, 없으면 비공개 API 없이는 불가.

### 2순위 (대안) — **"활동 추적기"로 제한 지원**
정확 비용 포기, 요청 수·모델 분포·세션 타임라인만 로컬 파싱으로 표시. 13k 공백을 노리되 **비용 정확도는 약속 안 함**(정직 disclaimer). 단 claudepulse 정체성(데이터 정확성)과 충돌 → 비권장.

### 주의 (절대 금지)
비공개 `/api/usage` + 세션 쿠키 경로는 CRITICAL #3 위반 + CursorJacking 보안 비판 + cursor-stats 아카이브가 입증한 유지보수 폭탄(가격정책 변경마다 깨짐). **채택 시 Claudemeter와 동일한 폐기 경로.**

> **종합**: 수요는 검증됐고 공백(13k)도 크지만, claudepulse의 핵심 가치(로컬 기반 비용 정확도)가 Cursor 데이터 구조상 **구조적으로 이식 불가**. Codex(부분가능)와 달리 Cursor는 "선행검증 통과 시에만" 진입. 미통과 시 멀티-IDE 라인은 **Claude Code + Codex로 한정**하는 것이 정체성 정합적.

---

## 5. 출처

(tech) Cursor Forum: cursorDiskKV tokenCount always 0 / Cursor Docs: API·Models&Pricing / vibe-replay: Cursor local storage / Vantage·Finout: pricing 2026 / Open VSX·GitHub: cursor-usage-monitor·cursor-usage·tokscale
(market) VS Code MP: cursor-stats(Dwtexe, 아카이브)·cocodev·lixen·mce / GitHub: ofershap·handlecusion(Tokcat)·junhoyeo(tokscale) / SessionWatcher.com / forum.cursor.com: Real-Time Usage Tracking / wearefounders·Panto: 과금사태·통계 / LayerX: CursorJacking CVSS 8.2

> 이 보고서는 claudepulse 리서치 파이프라인(tech+market 병렬 에이전트 종합)으로 생성되었습니다.
