# v0.2.0 구현 페이즈 가이드 — Codex 통합 + 익스텐션 범용화

> **버전 승격**: 구 v0.1.4 → **v0.2.0** (2026-06-24). 범용화+프로바이더 추상화+멀티 IDE(Codex·Cursor) 라인이라 마이너 격상.

> 작성일: 2026-06-16 (델타 갱신 2026-06-23)
> 근거: `docs/research/RESEARCH-codex-통합-범용화-2026-06-15.md`(기술) + `docs/research/RESEARCH-codex-신규유저-시장수요-2026-06-23.md`(시장·수요) + 기능 3분류(동일 14 / Claude-only 11 / Codex-only 3)
> 검증: advisor 1회(아키텍처, 2026-06-16) + advisor 1회(게이지 경첩, 2026-06-23). UX 스위처 = 사용자 확정(2026-06-16)
> 상태: 🔜 계획 확정. 구현 미착수. **배포는 ship 게이트(명시 명령 대기)**

---

## ⭐ 2026-06-23 리서치 델타 (시장·수요 — 본 PLAN 수정분)

신규유저 확보 타당성 리서치 결과, 아키텍처 골격은 유지하되 **2개 설계 결정 추가 + 포지셔닝 전환**:

1. **게이지 전제 부분 반전** — "Codex 게이지 절대 불가"는 분모(할당량 %)에 한해 옳음. **5h 사용량 분자는 로컬 jsonl로 무료·합법 산출 가능**. → `supportsRateLimit`(=분모 있는 %-게이지)는 Claude 전용 유지하되, **소스-무관 burn-rate 예측(5h 롤링+페이스+소진예상)을 UsageAggregator 공통 계산**해 Codex 게이지 대체로 노출. ※ 정확 %-게이지를 `codex app-server` RPC로 구현하면 호출당 토큰 소비(ccusage #874) → v1 제외, 옵트인/v2 보류.
2. **🔴 서브에이전트 91× 과다계산(ccusage #950)** — Codex 서브에이전트 rollout이 부모 이력 재타임스탬프 포함 → ST3 dedup "누적 교차검증"만으로 불충분. **`session_meta.source.subagent.thread_spawn` 탐지 + (timestamp,input,output) 3중키 dedup 필수**(누락 시 billing 91배 오류 = §3 dedup의 Codex판).
3. **포지셔닝 전환** — "이탈자 회수"❌ → **"dual-use(양쪽 구독) 통합 대시보드 + 언제 막힐지 예측"**⭐. 경쟁 Codex 도구(8.9k/7.9k 설치)는 상태바카운터/히스토리뷰어 수준 — 우리 차별축(Git ROI·스킬귀속·워크스페이스매핑·burn예측) 부재. late entrant 약점을 심도로 상쇄.

### 델타 SubTask 매핑
| SubTask | 변경 | 내용 |
|---|---|---|
| ST1 | 수정 | `supportsRateLimit` 의미 정정(분모 있는 %-게이지=Claude전용). burn-rate는 source-agnostic이라 flag 불필요 |
| ST3 | 수정 | dedup에 `thread_spawn` 탐지 + 3중키 dedup 추가(91× 차단) |
| **ST6.5** | **신규 [TDD]** | burn-rate 계산 — `UsageAggregator` 5h 롤링+페이스+소진예상. 소스-무관(토큰소비 0) |
| ST6 | 수정 | Codex 게이지 "완전숨김" → "burn-rate 예측 패널" 대체(% 없는 변형) |
| ST8 | 수정 | dual-use 포지셔닝·"언제 막힐지 예측" 카피 문서화 |

---

## 0. 한 줄 요약

Claude Code 전용 → 범용("Claude Code + Codex") 사용량 계측. **`AgentSource` 추상화**로 데이터 소스를 교체 가능하게 만들고, 분석 레이어는 동일 레이아웃 재사용하되 **게이지·USD·스킬귀속은 프로바이더별 차등**(데이터 비대칭). 마켓 ID·설치수 보존을 위해 `name`/`publisher`/네임스페이스 유지.

---

## 1. 핵심 아키텍처 결정

| 결정 | 내용 | 근거 |
|---|---|---|
| 신규 디렉토리 | `src/sources/` | 기존 `src/providers/`(VS Code View Provider 전용)와 충돌 회피 |
| 추상화 단위 | `AgentSource` 인터페이스 | 데이터 소스(Claude/Codex)를 다형 처리 |
| 정규화 모델 | 공통 `SessionRecord`(+`provider`, optional `reasoningTokens`) | UsageAggregator/webview **재사용**(동일 레이아웃) |
| **런타임 분기 2개** | `supportsRateLimit` + `supportsUsdCost` | 게이지 유무 + USD 유무(구독 Codex는 토큰-only) — **둘 다 load-bearing** |
| Claude 격리 | 기존 로직 → `ClaudeSource`로 **무행위변경 이관** | billing-critical 경로 보호(message.id dedup·캐시 TTL 비용) |
| 리브랜딩 | `displayName`/title/아이콘/README만, 실배포 직전 별도 | `name` 변경 = 신규 익스텐션 = 설치수·평점 소실 |

### `AgentSource` 인터페이스(안)
```ts
interface AgentSource {
  id: 'claude' | 'codex';
  label: string;
  supportsRateLimit: boolean;   // Claude=true, Codex=false
  supportsUsdCost: boolean;     // Claude=true, Codex=API key 모드만 true
  credentialsPath(): string;
  sessionLogDir(): string;      // ~/.claude/projects | ~/.codex/sessions
  listSessionFiles(): string[]; // Codex는 YYYY/MM/DD 재귀
  parseFile(path: string): Promise<SessionRecord[]>;
}
```

---

## 2. ⚠️ 선결 리스크 (advisor 지적 — 구현 전 인지 필수)

1. **[BLOCKER] Codex 실데이터 fixture 부재** — 이 머신에 `~/.codex` 없음(2026-06-16 확인). CodexParser의 I/O 계약이 전부 2차 정보(ccusage/dev.to 역공학, "experimental" 포맷). 지어낸 fixture로 TDD하면 실로그에서 깨짐. → **실제 `rollout-*.jsonl` 1개 확보 전까지 CodexParser는 "스키마 미검증/experimental"로 표기**. verified처럼 두지 말 것.
2. **구독 vs API-key = USD 레이어 전체의 분기점** — "동일" 분류한 비용 8기능(Today's $, 7일 비용막대, 모델별비용, Cost-by-skill)이 구독 Codex에선 **토큰-only로 붕괴**. `supportsUsdCost`로 토큰-only UI 상태를 1급 처리.
3. **FileWatcher 구조 차이** — Codex는 날짜중첩(`YYYY/MM/DD`) + 자정 넘으며 신규 일자 폴더 생성. Claude 평면 구조와 다름. 또 700MB~2GB 파일 이슈로 **mtime+offset 증분 파싱 필수**(선택 아님).
4. **Codex 가격 수동검증** — LiteLLM Codex 엔트리 부정확(ctx·구가격). 임베드 전 수동 확인.

---

## 3. 페이즈 (의존 순서)

### Phase 0 — 선행 검증 게이트
- **0-1** Codex `rollout-*.jsonl` 실 fixture 확보(사용자 제공) → `test/fixtures/codex/`. 없으면 ST3를 experimental로 명시 진행.
- **0-2** Codex 모델 가격 수동검증(gpt-5.5/5.4/5.3-codex 등, USD/1M).

### Phase 1 — 도메인 추상화 (foundation)
- **ST1** `AgentSource` 인터페이스 정의 + `SessionRecord` 확장(`provider`, `reasoningTokens?`) + `supportsRateLimit`/`supportsUsdCost`.
  - 파일: `src/sources/AgentSource.ts`(신규), `src/types/index.ts`
  - TDD: ✗ (타입 정의 중심, 런타임 로직 없음)

### Phase 2 — Claude 이관 (무행위변경)
- **ST2** `ClaudeSource` — 기존 `JsonlParser`+`WorkspaceMapper.getAllJsonlFiles`+constants 경로를 `AgentSource` 구현으로 래핑. 내부 로직 불변.
  - 파일: `src/sources/ClaudeSource.ts`(신규), `src/extension.ts`(주입점만)
  - 게이트: 기존 vitest 전량 그린 유지(회귀 0).

### Phase 3 — Codex 파서·소스 (experimental)
- **ST3** `[TDD]` `CodexParser` — rollout jsonl → `SessionRecord`.
  - token_count **누적값 차분**(per-turn 역산), `turn_context.payload.model`, `session_meta`(id/cwd/git.branch/cli_version), `response_item.function_call` 도구 분류, `reasoning_output_tokens` 수집.
  - 캐시 매핑: `cached_input_tokens`→`cache_read`, `cache_creation_*`=0.
  - dedup: message.id 없음 → 누적 교차검증. 증분 파싱(mtime+offset).
  - 파일: `src/sources/codex/CodexParser.ts`(신규), `test/unit/CodexParser.test.ts`
  - ※ fixture 미확보 시 테스트는 합성 데이터 기반 + **experimental 주석 명시**.
- **ST4** `CodexSource` + Codex 가격.
  - `sessionLogDir`=`~/.codex/sessions`(+`CODEX_HOME`), `listSessionFiles`=YYYY/MM/DD 재귀, `auth.json` 모드 판별→`supportsUsdCost`, `supportsRateLimit=false`.
  - `pricing.ts`에 Codex 모델 가격 추가(findPricing longest-prefix 호환). gpt 계열은 캐시생성비용 0.
  - 파일: `src/sources/CodexSource.ts`(신규), `src/utils/pricing.ts`, `test/unit/pricing.test.ts`(Codex 가격 케이스 `[TDD]`)

### Phase 4 — 통합 (extension/watcher)
- **ST5** 소스 레지스트리 + 자동감지 + 통합.
  - `~/.claude`/`~/.codex` 존재 감지(있는 것만 활성) + 설정 토글. `refreshUsage`가 활성 소스들에서 parse.
  - FileWatcher: Codex YYYY/MM/DD 중첩 감시 + 자정 신규 폴더 대응 + mtime+offset 증분.
  - 파일: `src/sources/index.ts`(레지스트리, 신규), `src/extension.ts`, `src/services/FileWatcher.ts`, `src/constants.ts`(Codex 경로/CONFIG_KEYS), `package.json`(설정 contribution)

### Phase 5 — 적응형 UI (데이터 비대칭)
- **ST6** `supportsRateLimit`/`supportsUsdCost` 이중 분기.
  - Codex 활성 시: 게이지(StatusBar/사이드바 3섹션/burn/safe)·Cost-by-Skill·서브에이전트 **숨김**(0표시 금지, hero 스왑으로 footprint 유지).
  - `supportsUsdCost=false`(구독 Codex): USD→토큰/메시지수 only + 모드 배지(API/구독).
  - Codex-only: `reasoning_output_tokens` 표시.
  - 파일: `src/services/UsageAggregator.ts`, `src/providers/SidebarViewProvider.ts`, `src/providers/StatusBarController.ts`, `src/panel/DashboardPanel.ts`, `src/webview/main.ts`, `src/messaging/contracts.ts`

### Phase 6 — 프로바이더 스위처 + i18n
- **ST7** 좌측 사이드탭 **스위처(토글 전환)** — 사용자 확정(2026-06-16). 한 번에 1 프로바이더, `globalState` 영속.
  - 다중 동시표시 아님. i18n 4개국어(ko/en/ja/zh) 키 추가.
  - 파일: `src/webview/main.ts`, `src/webview/i18n.ts`, `src/providers/SidebarViewProvider.ts`

### Phase 7 — 검증·문서 (미배포)
- **ST8** verify.sh + vitest + Playwright 시각검증(Claude/Codex 양 모드). CHANGELOG `[Unreleased]`. README는 **기능 문서만**(displayName 미확정).
  - **리브랜딩(displayName/view title/아이콘/최종 Title명)은 실배포 직전 별도 단계 — 본 범위 제외**(사용자 확정).

---

## 4. 미해결 결정 (실배포 직전)

1. 범용 Title 최종명 — "Gauge"는 게이지 강조라 Codex(게이지 없음) 포함 시 "Usage/Cost" 중심 네이밍이 정합.
2. Codex 액센트 색상 — 6+1 cap 초과 → 신규 추가 vs 기존 재사용(합의 필요).
3. 구독 Codex USD 미산출 표시 — 토큰-only vs 추정치+disclaimer.

## 5. 확정된 결정

- UX 전환 = **사이드탭 스위처(토글)** ✅ 2026-06-16
- displayName/리브랜딩 = **실배포 직전**(이번 미결정) ✅
- `name`/`publisher`/`claudeCodeGauge.*` 네임스페이스 = **유지** ✅

---

## 6. TDD 적격 요약

| SubTask | TDD | 사유 |
|---|---|---|
| ST1 | ✗ | 타입 정의 중심 |
| ST2 | ✗(회귀) | 무행위변경 — 기존 테스트 그린 유지 |
| ST3 | **[TDD]** | 결정론(누적차분)+vitest+비자명. ※fixture 부재 시 experimental |
| ST4(가격) | **[TDD]** | pricing.test.ts 패턴, 결정론 |
| ST5~ST7 | ✗ | 통합/UI/E2E |
| ST8 | ✗ | 검증 게이트 |
