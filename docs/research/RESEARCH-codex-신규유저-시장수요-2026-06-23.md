# 리서치 보고서: Codex 통합의 신규 사용자 확보 타당성 (시장·수요 축)

> 생성일: 2026-06-23
> 프로젝트: Claudepulse (claude-code-gauge)
> 기반 자료: `docs/research/RESEARCH-codex-통합-범용화-2026-06-15.md` (기술 타당성 — 완료), 본 보고서는 **시장·수요 축** 보강
> 조사 방식: 병렬 market-researcher 2건(경쟁 공백 / 이탈 수요) + 메인 세션 기술델타 직접 조사

---

## 1. 리서치 배경

v0.2.0(Codex 통합 + 범용화)의 **기술 타당성**은 2026-06-15 리서치에서 검증 완료("절반만 성립" — 분석 레이어 ✅, rate limit 게이지 ❌). 그러나 사용자 목표가 **"신규 사용자 확보"**로 확정되면서, *"만들 수 있나"*가 아닌 *"만들면 사람이 오나"*(시장·수요)를 검증할 필요가 생겼다.

검증 질문 3개:
1. **경쟁 공백** — Codex 사용량을 IDE 내 시각화하는 도구가 실제로 비어있는가?
2. **이탈 수요 실재성** — CC→Codex 이탈이 실재하며, 이탈 유저가 잃은 가시성 기능이 무엇인가?
3. **기술 8일 델타** — 2026-06-15 이후 포맷·가격 변화.

---

## 2. 조사 결과

### 2-1. 경쟁 공백 — **비어있지 않다 (판정: (c) 진입 초기)**

원 가설("Codex 사용량 IDE 시각화 = 화이트스페이스")은 **기각**된다. 시장은 급속 형성 중이며, 이미 다수 경쟁자가 진입했다.

**Codex 전용 IDE 익스텐션 (이미 존재)**

| 도구 | 플랫폼 | 설치수 | 핵심 기능 |
|---|---|---|---|
| **Codex Stats Monitor** (MartinOrtiz) | VS Code | **8,927** | 상태바 실시간 ChatGPT/Codex 사용률 |
| Codex Quota Stats (EddieGivens) | VS Code | 1,217 | 상태바 토큰 + **5h/7d 할당량 % + 리셋 카운트다운** |
| Codex Token Usage (hochonin93) | VS Code | 946 | 상태바 토큰(today/7일/월), 입출력·캐시·추론 분류 |
| Codex Usage Monitor (SunYingkai) | VS Code | 375 | 상태바 rate limit 비율 표시 |

**Claude + Codex 통합 (이미 진입)**

| 도구 | 설치수 | 특징 |
|---|---|---|
| **Claude Code & Codex Assist** (agsoft) | **7,952** | 세션 히스토리+diff+검색+사용량·비용 타임라인 (Claude·Codex·OpenCode·Grok) |
| TokenScope (hooni) | 201 | 사이드바 트리+대시보드(14일 차트), 모델별 비용, CSV |
| Token Watch | 98 | SQLite 로컬 저장, 사이드바 대시보드 |
| AI Cost Tracker | 77 | Claude+Codex+**Gemini** 3종, 예산 한도 알림 |
| BurnRate | 20 | 상태바 + 히트맵 + Codex 5h 소진 예측 |

**참고: 비-IDE 도구** — CodexBar(macOS 메뉴바, 53+ 도구), CUStats, caut/CLI(16 도구), ccusage(★14k, Codex experimental).

**판정**: 2025-09 이전 공백(a) → 2026-06 현재 **(c) 진입 초기**. 경쟁자는 많지만 **지배 표준 부재**, 대부분 *상태바 카운터* 또는 *히스토리 뷰어* 수준에 머물러 대시보드 심도가 낮다. growthjack(28k)은 Claude 전용 유지.

### 2-2. 이탈 수요 — **실재하나 프레임 수정 필수 (양용 dual-use)**

**이탈 규모: 실질적.** 2026 상반기 촉발 사건 3개:
1. **3/23 Claude rate limit 버그** — 5h 창이 1~2h 소진, Anthropic "~7% 사용자 영향" 공식 확인(Issue #41930). 환불/취소 논의 폭발.
2. **4/21 Pro 플랜 제거 소동** — Claude Code를 $20 Pro에서 제외 → 24h 내 롤백. OpenAI 역공 쿠폰.
3. **4/22 GPT-5.5 출시** — 동일 $20에서 더 너그러운 한도.
- 데이터: Codex 주간활성 200만 돌파(3월), 500명 서베이 65% Codex 선호(품질은 Claude 67% 승).

**그러나 핵심 반전 2가지:**

**(A) 지배 패턴 = 완전이탈이 아닌 양용(dual-tool).** "Codex는 병렬/자율, Claude Code는 정밀협업/복잡추론" 분업, 양쪽 동시 구독($40/월)이 2026-06 주류. Fable 5(6/22) 출시로 일부 회귀도 진행.

**(B) 이탈 유저가 "잃었다"고 하는 건 사용량 가시성이 아니다.** 그들은 **코드 품질·MCP 생태계·200K 컨텍스트·Agent Skill**을 더 언급한다. → **"이탈자가 우리 게이지를 그리워한다"는 직접 근거는 희박.** 원래 acquisition 논리의 이 가지는 약하다.

**대신 진짜 수요는 — Codex 자체의 비용 가시성 gap (심각, 잘 문서화됨):**
- **블랙박스 하드스톱**: 사전 경고 없이 HTTP 429 `usage_limit_reached`, 잔여·요청별 소비 불가시. 2~4h 락아웃 중 작업 손실 (OpenAI 커뮤니티)
- **모델 사일런트 폴백**: 가벼운 모델 설정에도 무거운 모델로 라우팅 → 예상외 급등
- **대시보드 오작동**: Codex Analytics "No data" 공백 버그(5월~)
- **6/16 신규 버그**: gpt-5.5 Plus 5h 예산 2~3 프롬프트 소진(Issue #28879)
- **공식 RFC Issue #5085** "Cost Tracking & Usage Analytics": *"Unpredictable bills: users run --full-auto without knowing the cost"* — 실시간 비용·예산경계·프로젝트별 귀속·터미널 가시성 요청
- **수요 실증**: 제3자 도구 8~9천 설치, "live token counter 装착 후 소비 패턴이 하룻밤 바뀜"(dev.to 서베이) — 가시성이 행동을 바꾼다는 1차 증거

### 2-3. 기술 8일 델타 — 가격 동일, 신규 CRITICAL 함정

- **가격: 델타 없음** — gpt-5.5 $5/$30, gpt-5.4 $2.5/$15, gpt-5.3-codex $1.75/$14 (2026-06-15 값 유효). 신규 인지: **Fast mode 크레딧 배율**(5.5=2.5×, 5.4=2×).
- **포맷: 안정적이나 여전히 experimental** — ccusage 경고 유지. 누적값 차분 방식 확정. Codex CLI v0.138(6/8)·v0.140(`/usage` 명령 추가, 단 세션 내 TUI 전용·파일 미저장).
- **🔴 신규 CRITICAL — 서브에이전트 91배 과다계산(#950)**: Codex 서브에이전트 rollout 파일이 **부모 스레드 전체 이력을 재타임스탬프 포함** → 3단 인플레이션(부모이력 재생 + 47% 중복로깅 + N 서브에이전트 ×중복). 실측 20.6B vs 실제 226M = **91×**.
  - **회피법**: `session_meta.source.subagent.thread_spawn` 탐지 + (timestamp,input,output) 3중키 dedup. **CodexParser 설계 필수 반영** — 2026-06-15 리서치 미포착.
- **대용량 jsonl 무음 스킵(#952)** — 기존 증분파싱(mtime+offset) 제약 재확인.

---

## 3. 프로젝트 적합성 분석

### 3-1. 우리 차별축이 Codex 도구 시장에서 비어있는가? → **예 (핵심 발견)**

기존 Codex/통합 도구들은 *상태바 카운터*(Codex Stats Monitor 8.9k) 또는 *히스토리 뷰어*(Claude&Codex Assist 7.9k)에 집중. **우리가 v0.1.34~38에서 확보한 차별축은 Codex 공간에 부재:**

| 우리 차별축 | Codex 도구 시장 현황 |
|---|---|
| **Git ROI (비용↔커밋 귀속)** | 현존 도구 **0개** 구현 |
| **스킬/도구별 비용 귀속** | 우리만 보유. Codex도 `function_call` 이벤트로 유사 분해 가능 |
| **워크스페이스↔세션 매핑** | TokenScope가 주장하나 검증 미흡, 나머지 없음 |
| **대시보드 심도(차트+세션+캐시효율)** | 대부분 상태바 수준 |

### 3-2. ⭐ rate limit 게이지 가능성 — 전제 부분 반전 (CodexBar 소스 검증)

2026-06-15 메모리 "Codex 게이지 불가 — 데이터 소스 없음"은 **부분적으로만 옳다.** 경쟁 메뉴바 앱들(CodexBar·CUStats·Codex Quota Stats)이 세션 밖에서 5h/7d %를 실시간 표시한다는 사실이 반증 신호였고, CodexBar(오픈소스) 소스 구조에서 메커니즘을 확인했다:

**Codex 한도 획득 경로 3가지 + 우리 §3 #3(비공개 HTTP API 금지) 적용:**

| 경로 | 메커니즘 | 우리 규칙 | 비용 |
|---|---|---|---|
| **① 로컬 `codex -s read-only -a untrusted app-server` RPC** | 공식 CLI가 띄우는 로컬 RPC 서버 질의 | ✅ **합법** (공식 헤더 읽는 우리 Claude 게이지와 동급) | ⚠️ **Issue #874: OAuth 오류 시 CLI 폴백이 호출당 ~3M 토큰 소비** — 폴링이 사용자 토큰 태움 |
| ② OpenAI 웹 대시보드 스크레이핑(쿠키) | chatgpt.com HTML 파싱 | ❌ **금지** (§3 #3 Claudemeter 방식) | — |
| ③ Admin API key / OAuth 비문서 엔드포인트 | 비공개 API | ⚠️ 회색·비권장 | — |

**핵심 분해 — 메모리 "% 산출 불가"는 분모에 한해 옳다:**
- 5h **사용량(분자)** = 로컬 jsonl `token_count` 누적차분으로 **무료·합법 산출** ✅
- 할당량 **%(분모)** = ① RPC(토큰소비) 또는 ② 스크레이핑(규칙위반) 필요 ⚠️

→ **규칙준수 + 무료로 우리가 제공 가능한 차별축 = "%-게이지"가 아니라 "로컬파일 기반 5h burn-rate 예측"** (사용 페이스·소진 예상 시점). Codex Quota Stats는 %만 표시·예측 없음, 경쟁 도구 누구도 burn 예측 강조 안 함. **= 진짜 화이트스페이스.** (정확한 %-게이지는 ①의 토큰비용을 사용자 옵트인으로 처리하거나 v2 보류.)

### 3-3. 약점·리스크

- **late entrant** — Codex Stats Monitor(8.9k)·Claude&Codex Assist(7.9k)가 설치수 선점. 우리는 후발.
- **유지보수 비용** — experimental 포맷 + 91× 함정 + GB 파일 → CodexParser는 지속 추종 부담. 사용자가 Codex를 실사용해야 fixture 검증 가능(BLOCKER는 사용자 Codex 도입으로 자연 해소 예정).
- **①의 토큰 소비** — %-게이지를 RPC로 구현 시 폴링이 사용자 토큰을 태움(#874). burn-rate 예측은 로컬파일만 쓰므로 이 리스크 없음 — 그래서 1차는 burn-rate가 정답.

---

## 4. 권장안

### 1순위 — **진입하되 프레임을 "양용 통합 대시보드"로 전환**

근거:
- acquisition 논리는 **성립하나, "이탈자 회수"가 아니라 "dual-use 사용자 전체 포괄"**이 정확. 2026 주류는 양쪽 구독.
- Codex 자체 비용 가시성 gap이 심각·문서화됨(Issue #5085, 8~9k 설치 제3자 도구) → 수요 실증.
- **우리 차별축(Git ROI·스킬귀속·워크스페이스매핑·대시보드 심도)이 Codex 도구 시장에 부재** → late entrant 약점을 심도로 상쇄 가능.
- **⭐ 추가 차별축 — 로컬파일 기반 Codex burn-rate 예측**(§3-2): 규칙준수+무료로 가능하고 경쟁 도구 누구도 미보유. 우리 헤드라인(예측 게이지)의 Codex 이식 = late entrant를 단숨에 차별화.
- 포지셔닝: *"Codex Stats Monitor가 Codex 토큰을 보여준다면 — Claudepulse는 Claude·Codex 양쪽에 얼마 쓰고, **언제 막힐지 예측하고**, 어떤 Git 작업·스킬에 귀속되는지를 한 화면에 보여준다."*

### 2순위 (대안) — **Codex 보류, 검증된 Claude 깊이 우선**

late entrant 부담·유지보수 비용이 우려되면, 이미 검증 가능한 Claude 데이터의 깊이(미귀속 버킷 축소·스킬 커버리지 상향·예산 예측)를 먼저 파는 것이 ROI가 높다. Codex는 사용자의 실사용 fixture 축적 후 재평가.

### 주의사항 (구현 착수 전 반드시 해소)

1. **[해소됨 → 설계 반영] Codex 게이지 = burn-rate 예측으로 구현** — §3-2 확정: %-게이지는 RPC(토큰소비 #874) 또는 스크레이핑(규칙위반)이라 v1 제외. **로컬 jsonl 기반 5h burn-rate 예측**(무료·합법)을 헤드라인 차별축으로 이식. 메모리 `reference_codex_integration` "게이지 불가" 항목을 "%-게이지 불가 / burn-rate 예측 가능"으로 정정 필요.
2. **[설계 필수] 서브에이전트 91× 과다계산** — `session_meta.source.subagent.thread_spawn` 탐지 + (timestamp,input,output) 3중키 dedup을 CodexParser 1급 설계로. 누락 시 billing 91배 오류(우리 CLAUDE.md §3 dedup 원칙의 Codex판).
3. **리브랜딩** — 마켓 ID(`cubha.claude-code-gauge`) 유지, displayName만 범용 전환(설치수·평점 보존).
4. **`supportsUsdCost` 분기** — 구독 Codex는 토큰-only. 이미 PLAN 반영됨.

---

## 5. 출처

**경쟁 공백**
- [Codex Stats Monitor — VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MartinOrtiz.codex-stats) — 8,927 설치, Codex 전용 상태바
- [Codex Quota Stats — VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=EddieGivens.codex-quota-stats) — 1,217, 5h/7d 할당량 %
- [Codex Token Usage — VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=hochonin93.codex-token-usage) — 946
- [Claude Code and Codex Assist — VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=agsoft.claude-history-viewer) — 7,952, 통합 히스토리/비용
- [TokenScope](https://marketplace.visualstudio.com/items?itemName=hooni.tokenscope) · [BurnRate](https://marketplace.visualstudio.com/items?itemName=litchiak.burnrate) · [Token Watch](https://marketplace.visualstudio.com/items?itemName=alvin0-dinhai.token-watch) · [AI Cost Tracker](https://marketplace.visualstudio.com/items?itemName=workingpayload.token-alerts)
- [Claude Code Usage (growthjack)](https://marketplace.visualstudio.com/items?itemName=growthjack.claude-code-usage) — 28,179, Claude 전용
- [Codex IDE Features — OpenAI 공식](https://developers.openai.com/codex/ide/features) — 토큰/비용 시각화 없음 확인

**이탈 수요**
- [Cost Tracking & Usage Analytics · Issue #5085 · openai/codex](https://github.com/openai/codex/issues/5085) — Codex 비용 가시성 RFC
- [Hard usage limits with no visibility — OpenAI Community](https://community.openai.com/t/hard-usage-limits-with-no-visibility-are-breaking-agent-workflows-codex-chatgpt-subscription/1378663) — 블랙박스 하드스톱
- [Codex rate-limit cost jumped 10-20x since June 16 · Issue #28879](https://github.com/openai/codex/issues/28879) — 6/16 신규 버그
- [Widespread usage limit drain since March 23 · Issue #41930 · anthropics/claude-code](https://github.com/anthropics/claude-code/issues/41930) — Claude 이탈 촉발
- [Developers Switch from Claude Code to Codex — tamimbuilds](https://tamimbuilds.medium.com/developers-switch-from-claude-code-to-openai-codex-amid-reliability-issues-f8904dbab6a1) — 65% 선호 수치
- [Claude Code vs Codex — 500+ Reddit Developers (dev.to)](https://dev.to/_46ea277e677b888e0cd13/claude-code-vs-codex-2026-what-500-reddit-developers-really-think-31pb) — live token counter 행동변화
- [CodexBar (steipete)](https://github.com/steipete/codexbar) — 53+ 도구 한도 메뉴바

**기술 델타**
- [ccusage — Codex 가이드](https://ccusage.com/guide/codex/) — 누적차분·experimental 경고
- [Massive token overcounting for Codex subagent sessions (91x) · Issue #950 · ccusage](https://github.com/ryoppippi/ccusage/issues/950) — 서브에이전트 91× 함정
- [Large Codex JSONL silently skipped · Issue #952 · ccusage](https://github.com/ccusage/ccusage/issues/952) — 대용량 무음 스킵
- [Codex Pricing — OpenAI](https://developers.openai.com/codex/pricing) — gpt-5.5/5.4 가격 동일 확인

---

> 이 보고서는 Claude Code `/research` 스킬로 자동 생성되었습니다.
