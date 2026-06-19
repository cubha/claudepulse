# 리서치 보고서: 근래 Claude Code 업데이트 기반 Claudepulse 추가/개선 후보

> 생성일: 2026-06-11
> 프로젝트: Claudepulse (VS Code Claude Code 사용량 모니터)
> 기반 자료: 실제 `~/.claude/projects/**/*.jsonl` 1차 샘플링 + 웹 리서치 2건(rate limit 정책 / 경쟁도구·jsonl 포맷)
> 방법: 메인 세션 1차 근거 + 병렬 에이전트 2개 웹 조사

---

## 1. 리서치 배경

fable-5 대응(v0.1.33) 완료 후, 2026년 상반기 Claude Code 변화 중 Claudepulse가 **새로 파싱·표시하거나 정확도를 보강할 수 있는 항목**을 식별한다. 핵심은 "데이터가 실제로 로그/헤더에 존재하는가(가용성)"를 1차 근거로 확정하고 우선순위를 매기는 것.

데이터 소스 3종 현황:
- **rate limit 헤더 폴링**: 이미 15개 헤더 파싱(5h/7d util·reset·status, overage, fallback, representative-claim, 7d-surpassed-threshold, upgrade-paths) — **성숙**
- **jsonl 파싱**: 토큰·web_search·Edit/Write/Bash/WebSearch/other·model·cwd·gitBranch — **개선 여지 큼**
- **credentials**: 플랜 정보 — 충분

---

## 2. 1차 근거 — 실제 jsonl에 존재하나 미활용 중인 데이터

> 이 세션 포함 실제 로그 다수를 직접 샘플링한 결과. "데이터 가용성" 최상위 신뢰도.

| 필드 | 실측값 | 현재 처리 | 시사점 |
|---|---|---|---|
| `usage.cache_creation.{ephemeral_5m,ephemeral_1h}_input_tokens` | **1h=26.9M, 5m=0** (이 사용자 거의 100% 1h) | 평면 `cache_creation_input_tokens`만 읽어 **1.25× 적용** | **1h 캐시는 2× 단가 → 캐시 생성비 ~37% 과소계산** (정확도 버그) |
| `attributionSkill` | sh-dev-loop 1237, ship 220, plan 81, research 36, analyze 22, … | 미파싱 | **스킬별 비용 분해** 기능 가능 (데이터 풍부) |
| `isSidechain` / `agentId` | sidechain=true 다수 | 총합엔 포함, 분리 안 함 | **서브에이전트 vs 메인** 소비 분리 |
| `service_tier` | 전량 `standard` | 미파싱 | batch(−50%)/priority 사용자 대응 (현재 영향 낮음) |
| `version` | 2.1.142~2.1.159 | 미파싱 | "추적 중 CC 버전" 표시(부가) |
| `entrypoint` | 전량 `cli` | 미파싱 | interactive vs `sdk`/`print` 구분 (Agent SDK 풀 분리 대응) |
| `server_tool_use.web_fetch_requests` / `code_execution_requests` | 산발 | `web_search_requests`만 읽음 | 서버툴 호출 카운트 확장 |

추가 확인: `claude-opus-4-8[1m]` 같은 **`[1m]` suffix**는 longest-prefix `findPricing` + `includes()` 로직으로 **이미 정상 처리**됨(버그 아님).

---

## 3. 웹 리서치 — 정책/포맷/경쟁 변화

### 3-1. Rate limit 정책 (Agent A)

- **5h 한도 2배 상향**(2026-05-06, SpaceX 컴퓨팅 계약). 주간 한도 50% 임시 증가(7/13까지 공지).
- **statusLine JSON**(CC v2.1.80+, 2026-03-19): status line 스크립트에 stdin으로 `rate_limits.{five_hour,seven_day}.{used_percentage,resets_at}` + `cost` + `context_window` 주입. **단 이는 status line 스크립트 전용** — VS Code 익스텐션이 직접 수신 불가. Max 20x OAuth에서 `rate_limits` 누락 버그(#40094, not planned).
- **Max 플랜 2개 주간 버킷**: 통합 + Sonnet 전용. `seven_day_opus`/`seven_day_sonnet` 내부 추적 확인(SDK #50518)되나 **헤더 외부 노출 미확정** → 관망.
- **Agent SDK 크레딧 풀 분리(2026-06-15)**: `claude -p`, GitHub Actions, ACP 앱(Zed·JetBrains)은 별도 월 크레딧. **Claude Code 터미널 대화형은 기존 풀 유지** → Claudepulse(interactive 모니터)엔 영향 적음. `entrypoint`로 구분만 가능.
- `/usage` 명령이 이미 **Skills/Subagent/Plugin/MCP별 기여 비율** 표시 → §2 attribution 데이터와 일치.

### 3-2. jsonl 포맷 변화 (Agent B)

`isSidechain`, `isMeta`, `teamName`/`agentName`, `TaskCreate`/`TaskUpdate`, content 내 `{type:"thinking"}` 블록, `[1m]` suffix, compaction 경계 이벤트, OTEL `agent_id`/`parent_agent_id`, subagent 5단계 중첩.

### 3-3. 경쟁 VS Code 익스텐션 (Agent B)

| 익스텐션 | 설치 | 2026 신규 | Claudepulse 대비 |
|---|---|---|---|
| **growthjack/claude-code-usage** | **23.6k** | v2.0: Sessions/Projects/Content/Branches 4탭, OAuth 실할당량, AI 어드바이저, 다중벤더 가격 | **최대 위협**. 단 thinking·서브에이전트 계층·스킬별 비용 없음 |
| Claude Status (long-kudo) | 6.8k | burn rate, 30일 히트맵, 30분 예측 | 영구저장·모델분해 약함 |
| Claude Code Usage Tracker | 6.3k | 5h/7d 진행바, 초과크레딧 | 단순 |
| Claude Usage Analytics | 0.7k | Personality·Achievement, Opus 4.8 가격 | 방향 다름 |
| CodeMaman AI Tracker | 0.01k | ROI·**Skills 추적**·프로젝트별 비용 | 설치 미미하나 Skills 추적 선례 |

**시장 트렌드**: 서브에이전트/워크플로우 비용 분해 수요 급증, Content Composition(프롬프트 vs 도구결과 vs 출력) 분석, OAuth 실할당량 전환, 캐시 TTL(5m/1h) 구분, 모델 믹스 추적, `blocks --live` → statusline 전환.

---

## 4. 추가/개선 후보 — 우선순위

> 각 후보: **근거 / 데이터 가용성 / 작업량 / 차별성**

### P0 — 정확도 버그 (즉시, v0.1.x)

**① 캐시 생성 1h/5m TTL 분리 비용 계산** ⭐ 최우선
- **근거**: 실측 1h=26.9M·5m=0 → 1h(2×)를 5m(1.25×)로 계산해 캐시 생성비 ~37% 과소. Claude Code는 1h 캐시 주력.
- **데이터 가용성**: ✅ 즉시 (`usage.cache_creation.{ephemeral_5m,ephemeral_1h}_input_tokens`)
- **작업량**: 소 — `ModelPrice`에 `cache_creation_5m`(input×1.25)/`cache_creation_1h`(input×2.0) 분리, `pricing.test.ts` 보강, JsonlParser·UsageAggregator 비용식 수정. 평면 필드 폴백 유지(구버전 로그).
- **차별성**: 정확도는 경쟁 공통 약점.

### P1 — 신규 차별 기능 (데이터 즉시 가용, v0.2)

**② 스킬별 비용 분해 (attributionSkill)** ⭐ 차별점
- **근거**: 기존 "Git 브랜치 ROI"와 동급 차별 축. `/usage`도 같은 분류 제공하나 IDE 상시 시각화는 없음. 실측 데이터 풍부.
- **데이터 가용성**: ✅ 즉시 (`attributionSkill`)
- **작업량**: 중 — SessionRecord에 필드 추가, 집계, 대시보드 도넛/바 1개. (사이드바 vs 대시보드 배치 기준: 차트형 → 대시보드)
- **차별성**: growthjack·Claude Status 미보유. CodeMaman만 유사(설치 0.01k).

**③ 서브에이전트 vs 메인 소비 분리 (isSidechain)**
- **근거**: 워크플로우/서브에이전트 비용 분해 수요 급증. growthjack 약점.
- **데이터 가용성**: ✅ 즉시 (`isSidechain`, `agentId`)
- **작업량**: 중 — 집계 시 sidechain 플래그 분리, "서브에이전트 소비 N%" 지표.
- **차별성**: IDE 경쟁사 미구현 화이트스페이스.

### P2 — 개선/보강 (v0.2~0.3)

**④ 도구 카운트 세분화**
- **근거**: 현재 Edit/Write/Bash/WebSearch/**other**만 → other가 Read/Grep/Glob/Task/TodoWrite/WebFetch/MCP(`mcp__*`)/Skill을 불투명하게 합산.
- **데이터 가용성**: ✅ 즉시 (content tool_use.name + `server_tool_use.{web_fetch,code_execution}_requests`)
- **작업량**: 소~중 — `ToolUseCounts` 확장, MCP는 `mcp__` 프리픽스 그룹.

**⑤ service_tier 인지**
- **근거**: batch(−50%)/priority 단가 차이. 현재 전량 standard라 영향 낮음 → 미래 정확도.
- **데이터 가용성**: ✅ 즉시 (`usage.service_tier`)
- **작업량**: 소.

### P3 — 탐색/관망 (불확실 — 선검증 필요)

| 후보 | 상태 | 비고 |
|---|---|---|
| **⑥ thinking 토큰 분리 지표** | content `{type:"thinking"}` 존재 시 가능. **단 Fable/Opus4.8은 display 기본 omitted** → 토큰은 output에 포함되나 블록 텍스트 비어있을 수 있음. **선검증 필요** | 화이트스페이스지만 가용성 불확실. output_tokens에 이미 포함돼 비용 영향은 없음(정보성 지표) |
| **⑦ statusLine JSON 연동** | CC v2.1.80+ rate_limits/cost/context_window. **VS Code 익스텐션 직접 수신 불가**(status line 스크립트 stdin 전용) | 활용도 제한 → 관망 |
| **⑧ Fast Mode 비용 식별** | Opus 4.8 Fast = $10/$50. 판별 메타데이터 **미확인** | 선검증 후 판단 |
| **⑨ seven_day_opus/sonnet 버킷** | 내부 추적 확인, 헤더 노출 미확정 | SDK 업데이트 관망 |
| **⑩ Agent SDK 풀(6/15) 구분** | `entrypoint`로 cli vs sdk 구분 가능하나 Claudepulse는 interactive 모니터 | 영향 적음 |

---

## 5. 권장안

### 1순위 (이번 사이클)
**① 캐시 1h/5m TTL 분리 비용 계산** — 실데이터로 확정된 ~37% 과소계산 정확도 버그. 작업량 소, 영향 큼. fable-5 작업과 같은 pricing 레이어라 연속 작업 효율적.

### 2순위 (다음 마이너)
**② 스킬별 비용 분해 + ③ 서브에이전트 분리** — growthjack(23.6k) 추격에 맞설 **차별 축**. 데이터 즉시 가용, 기존 Git 브랜치 ROI·모델 분해 패턴 재사용. ④ 도구 세분화는 ②③ 구현 중 함께.

### 주의사항
- **thinking 지표(⑥)는 선검증 필수** — display omitted로 블록이 비어있으면 무의미. 구현 전 실로그 확인.
- **statusLine 연동(⑦)은 매력적이나 익스텐션이 직접 못 받음** — 헛수고 주의.
- **경쟁 포지셔닝**: growthjack이 OAuth 실할당량·4탭으로 거리 좁힘. Claudepulse 우위(영구저장·예측·캐시효율)에 **스킬/서브에이전트/thinking** 화이트스페이스를 더해 방어.
- 가격 스냅샷은 v0.1.33에서 이미 현행화(fable·opus 4.x·sonnet·haiku). Fast Mode 단가만 추후.

---

## 6. 출처

**1차 근거**: 실제 `~/.claude/projects/**/*.jsonl` 직접 샘플링 (cache_creation TTL, attributionSkill, service_tier, version, entrypoint, isSidechain)

**Rate limit 정책 (Agent A)**:
- [Rate limits — Claude API Docs](https://platform.claude.com/docs/en/api/rate-limits)
- [Higher usage limits and SpaceX compute deal — Anthropic](https://www.anthropic.com/news/higher-limits-spacex)
- [Use the Claude Agent SDK with your plan (6/15 풀 분리) — Claude Help](https://support.claude.com/en/articles/15036540)
- [Expose rate limit utilization in status line JSON — GH #29604](https://github.com/anthropics/claude-code/issues/29604)
- [per-bucket rate-limit (seven_day_opus/sonnet) — GH #50518](https://github.com/anthropics/claude-code/issues/50518)
- [rate_limits missing for Max 20x — GH #40094](https://github.com/anthropics/claude-code/issues/40094)
- [Manage costs (/usage) — Claude Code Docs](https://code.claude.com/docs/en/costs)

**경쟁도구·jsonl 포맷 (Agent B)**:
- [ccusage releases](https://github.com/ryoppippi/ccusage/releases) · [statusline 가이드](https://ccusage.com/guide/statusline)
- [growthjack/claude-code-usage v2.0 (23.6k)](https://marketplace.visualstudio.com/items?itemName=growthjack.claude-code-usage)
- [Claude Code changelog](https://code.claude.com/docs/en/changelog) (thinking 제어, subagent 5단계, /usage per-category)
- [claude-dev.tools jsonl 포맷](https://claude-dev.tools/docs/jsonl-format) (isSidechain, teamName, TaskCreate)
- [Anthropic 모델 가격 (Fast Mode·Cache TTL)](https://platform.claude.com/docs/en/about-claude/pricing)

---

> 이 보고서는 Claude Code `/research` 스킬로 생성되었습니다. 권장안 채택 시 `/plan` 또는 `/sh-dev-loop`로 구현 진행.
