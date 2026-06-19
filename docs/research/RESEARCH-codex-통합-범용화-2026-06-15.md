# 리서치 보고서: Codex 사용량 계측 통합 + 익스텐션 범용화 (v0.1.4)

> 생성일: 2026-06-15
> 프로젝트: Claudepulse (claude-code-gauge)
> 목적: 익스텐션을 Claude Code 전용 → 범용(Claude Code + Codex)으로 확장 가능한지 타당성 검증 + v0.1.4 구현계획 근거
> 근거: 병렬 tech-researcher 2건 (Codex 로컬 데이터 구조 / 가격·과금) + 현 코드베이스 결합 지점 분석

---

## 1. 리서치 배경

요즘 Codex 사용 증가 + Claude Code 이탈 추세 → 익스텐션을 Claude 편향에서 벗어나 범용 "AI 코딩 에이전트 사용량 계측" 도구로 확장. 사용자 전제: **"동일 계측 Level·동일 Layout/UX 유지, 데이터 받아오는 API만 Codex 표준으로 교체"**.

검증 질문: 이 전제가 실제로 성립하는가? Codex가 Claude Code의 jsonl처럼 토큰 단위 로컬 로그 + rate limit을 노출하는가?

---

## 2. 핵심 결론 — 전제는 "절반만" 성립

| 레이어 | Claude Code | Codex | 동일 계측 가능? |
|---|---|---|---|
| **토큰/비용 분석** (jsonl) | `~/.claude/projects/**/*.jsonl` | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | ✅ **가능** (제약 동반) |
| **Rate Limit 게이지** (5h/7d) | `anthropic-ratelimit-unified-*` 헤더 실시간 | **대응물 없음** | ❌ **불가** |

**결론**: 토큰·비용·모델·도구·세션·Git ROI 분석 레이어는 동일 레이아웃으로 이식 가능. 그러나 **익스텐션의 헤드라인 기능인 rate limit 게이지(5h/7d·burn rate·safe-until)는 Codex에서 데이터 소스 부재로 재현 불가.** → "동일 UX 보장"은 분석 레이어에 한정되며, 게이지 레이어는 프로바이더별 차등 노출이 불가피.

---

## 3. Codex 로컬 데이터 구조 (계측 가능 영역)

### 3-1. 세션 로그
- 경로: `~/.codex/sessions/YYYY/MM/DD/rollout-{ISO}-{UUID}.jsonl` (`CODEX_HOME`로 오버라이드)
- 포맷: JSONL, 이벤트 타입: `session_meta` / `event_msg` / `response_item` / `turn_context` / `compacted`
- 인증: `~/.codex/auth.json` (OAuth access token 또는 API key), 또는 `OPENAI_API_KEY`/`CODEX_API_KEY` env

### 3-2. 토큰 필드 (`event_msg[type=token_count].info.total_token_usage`)
```json
{ "input_tokens": 21027, "output_tokens": 313,
  "cached_input_tokens": 18500, "reasoning_output_tokens": 0 }
```
- 모델명: 별도 `turn_context.payload.model` 이벤트 (예: `gpt-5.5`)
- 메타: `session_meta.payload.{id, cwd, git.branch, git.commit_hash, cli_version}`
- 도구: `response_item` → `function_call`/`function_call_output`/`custom_tool_call`

### 3-3. Claude Code 대비 제약 (load-bearing)
1. **누적값 차분 필요**: `token_count`는 세션 누적값 → per-turn은 직전 이벤트와의 차분 역산 (ccusage 방식)
2. **`message.id` dedup 없음** → 누적값 교차검증으로 대체
3. **interactive 모드만**: `codex exec`(non-interactive)는 token_count 파일 미기록 (`--json` stdout 전용)
4. **버전 경계**: `token_count`는 v0.44(2025-09)~ 추가. 이전 로그엔 토큰 없음. 일부 초기 세션은 `turn_context` 부재(모델 미상 → fallback 처리)
5. **포맷 experimental**: ccusage가 Codex 지원을 "experimental"로 분류, 포맷 지속 변경 중
6. **세션 파일 비대화 버그**: 단일 파일 700MB~2GB 사례(Issue #24948) → 증분 파싱(mtime+offset) 필수

---

## 4. Codex 가격·과금 (비용 계산)

### 4-1. 모델·가격 (USD per 1M tokens, 2026-06, **수동 검증 필요**)
| Model ID | Input$ | Cached Input$ | Output$ | 비고 |
|---|---|---|---|---|
| `gpt-5.5` | 5.00 | 0.50 | 30.00 | Codex CLI 기본, 캐시 90%↓ |
| `gpt-5.4` | 2.50 | 0.25 | 15.00 | >272K 장문 5/22.5 |
| `gpt-5.4-mini` | 0.75 | 0.075 | 4.50 | |
| `gpt-5.4-nano` | 0.20 | 0.02 | 1.25 | |
| `gpt-5.3-codex` | 1.75 | 0.175 | 14.00 | 코딩 특화 |
| `codex-mini-latest` | 1.50 | 0.375 | 6.00 | 레거시 |
| `o4-mini` | 1.10 | — | 4.40 | **2026-02-13 retired** |

### 4-2. Claude와 캐시 구조 차이 (중요)
- **Claude**: cache_creation(5m 1.25×) + cache_creation_1h(2.0×) + cache_read(0.1×) — 생성 비용 별도
- **OpenAI**: 캐시 **생성 비용 없음**, cached input 읽기만 input의 ~10%(90% 할인)
- → `CostTokens`에서 Codex 모델은 `cache_creation_*` = 0 고정, `cached_input` → `cache_read` 슬롯 매핑

### 4-3. 구독 vs API
- **구독(Plus/Pro)**: 월정액 + 크레딧, 토큰→USD **직접 환산 불가**. rate limit = 5h 롤링(+주간, 수치 비공개)
- **API key**: 토큰 종량제 → USD 환산 가능
- → **USD 비용 계측은 API key 모드 한정**. 구독 사용자는 "토큰량/메시지 수"만 표시(USD 미표시 또는 추정 disclaimer)

### 4-4. LiteLLM 주의
- Codex 엔트리 부정확(`gpt-5-codex` ctx 272K 오기·구가격). 스냅샷 그대로 쓰면 오차 → 수동 검증.

---

## 5. Rate Limit — Codex 미지원 (게이지 레이어 공백)

| 항목 | Codex 현황 |
|---|---|
| `anthropic-ratelimit-unified-*` 대응 헤더 | **없음** |
| OpenAI `x-ratelimit-*` 헤더 | 존재하나 Codex CLI가 무시(Issue #2131) |
| `/status` (잔여 토큰·5h·주간) | interactive 세션 내 표시만, **로컬 파일 미저장** |
| 프로그래밍 실시간 조회 | **없음** |
| 웹 대시보드 | `platform.openai.com/usage` (API key 사용자 과거 조회만) |

→ Claude Code의 게이지(5h/7d util·burn rate·safe-until·overage·fallback)에 대응하는 **실시간 데이터 소스가 Codex엔 존재하지 않음.** 사후 추정(로그 기반 5h 윈도우 사용량 집계)은 가능하나, 플랜별 한도(메시지 수)가 비공개라 "%·safe-until" 정확 산출 불가.

---

## 6. 현 코드베이스 프로바이더 결합 지점 (추상화 대상)

| 파일 | Claude 고유 의존 | Codex 대응 |
|---|---|---|
| `constants.ts` | `~/.claude/.credentials.json`, EXTENSION_ID | `~/.codex/auth.json` |
| `WorkspaceMapper.ts`·`FileWatcher.ts` | `~/.claude/projects` 경로·인코딩 | `~/.codex/sessions/YYYY/MM/DD` |
| `JsonlParser.ts` | Claude jsonl 스키마(message.id·usage) | Codex rollout 스키마(token_count 차분·turn_context) |
| `RateLimitPoller.ts` | `api.anthropic.com`+unified 헤더 | **대응 불가** (Codex 게이지 비활성) |
| `CredentialsReader.ts` | `claudeAiOauth` 키 | `auth.json` 형식 |
| `pricing.ts` | Claude 가격 | Codex 가격 추가 |
| `pathDecoder.ts` | Claude 경로 인코딩 | Codex 경로 규칙 |

---

## 7. 권장안

### 7-1. 타당성 종합
- **분석 레이어(토큰/비용/모델/도구/세션/Git ROI)**: Codex 동일 레벨 이식 **가능** (API key 비용·누적차분·포맷변동 제약 명시)
- **게이지 레이어(rate limit)**: Codex **불가** → 프로바이더별 차등(Claude=풀, Codex=분석만 + 로그기반 5h 사용량 근사치)

### 7-2. 리브랜딩 (핵심 제약)
- 마켓플레이스 ID = `cubha.claude-code-gauge`(`name`+`publisher`). **`name` 변경 시 신규 익스텐션 등록 → 설치수·평점·리뷰 전부 소실.**
- → **`name`(ID)·`publisher`·내부 네임스페이스(`claudeCodeGauge.*`) 유지**, `displayName`·`description`·아이콘·README만 범용 브랜드로 변경
- 범용명 후보(사용자 확정 필요): "AI Usage Gauge", "Agent Usage Gauge", "Codepulse", "Coding Agent Meter" 등. "Gauge"는 게이지 기능 강조라 Codex(게이지 없음) 포함 시 "Usage/Cost" 중심 네이밍이 정합적.

### 7-3. 아키텍처 방향
- `Provider` 인터페이스 도입: `{ id, label, credentialsPath, sessionLogDir, parse(), pricing, supportsRateLimit }`
- `ClaudeProvider`(기존 로직 이관) + `CodexProvider`(신규). 공통 `SessionRecord`로 정규화 → 기존 UsageAggregator/webview 재사용(동일 레이아웃)
- 프로바이더 감지: `~/.claude` / `~/.codex` 존재 여부 자동 + 설정 토글. 다중 동시 표시 or 프로바이더 스위처
- 게이지 섹션은 `provider.supportsRateLimit` 분기 — Codex 선택 시 게이지 숨김/근사치 배지

### 7-4. 리스크
- Codex 포맷 experimental → 파서 유지보수 부담(ccusage 추종 권장)
- 구독 사용자 USD 미산출 → UX에 명확한 모드 표기 필요
- 세션 파일 GB 비대화 → 증분 파싱·성능 한계 대비

---

## 8. 출처
- Codex 로컬 데이터: [ccusage Codex 가이드](https://ccusage.com/guide/codex/), [DEV.to 역공학](https://dev.to/milkoor/reverse-engineering-codex-cli-rollout-traces-3b9b), [openai/codex Issue #9660·#17539·#24948·#2131](https://github.com/openai/codex/issues), [codex-trace](https://github.com/PixelPaw-Labs/codex-trace), [steipete/CodexBar](https://github.com/steipete/codexbar)
- 가격/모델: [OpenAI API Pricing](https://openai.com/api/pricing/), [Codex Models](https://developers.openai.com/codex/models), [Codex Pricing](https://developers.openai.com/codex/pricing), [GPT-5.3-Codex](https://openai.com/index/introducing-gpt-5-3-codex/)
- 인증: [Codex Auth](https://developers.openai.com/codex/auth)

> 이 보고서는 Claude Code `/research` 흐름으로 생성되었습니다.
