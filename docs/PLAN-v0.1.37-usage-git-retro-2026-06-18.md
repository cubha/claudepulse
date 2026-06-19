# v0.1.37 구현 페이즈 가이드 — usage×git 회고 뷰 (커밋/기능 단위 귀속)

> 작성일: 2026-06-18
> 근거: deep-research(거북이코드 재생성) "Claude usage × git 히스토리 1급 융합 = 유일 비중복 시너지 공백" + 실데이터 스파이크 4대 제약(실측)
> 검증: advisor 3회(아키텍처 1 + codex-later 사이드이펙트 비교 2). 시퀀싱 = 사용자 확정(회고 뷰 먼저, 2026-06-18)
> 상태: 🔜 V2 백로그 정식 등재 + 설계 타당성 검토 완료. **구현 미착수**. 배포는 ship 게이트(명시 명령 대기)
> 분류: V2+ 백로그 항목. 본 문서가 docs/PLAN의 V2 백로그 정식 등재본이다.

---

## 0. 한 줄 요약

브랜치 단위 귀속(`BranchUsage`/`branchBreakdown` — **이미 구현됨**)을 **커밋/기능 단위**로 확장하는 회고 뷰. "이 기능에 Claude 얼마 썼나 / 어느 세션이 어느 변경을 낳았나 / 기능별 ROI". git commit이 jsonl에 tool_use로 안 잡히므로(실측 11/11 0건) **정확조인 불가 → timestamp+cwd+gitBranch 근사조인**만 가능. 따라서 핵심 설계 원칙은 **정직한 불확실성 표기**(근사치 라벨 + 미귀속 버킷 1급화)다.

차별화 TOP1 "워크스페이스↔세션 자동 매핑"을 git 차원으로 잇는 자연 연장. CLI는 구조적으로 불가(외부 git 컨텍스트 결합).

---

## 1. 핵심 아키텍처 결정

| 결정 | 내용 | 근거 |
|---|---|---|
| **회고 로직은 `aggregate()` 밖 독립 모듈** | `GitLogReader` + `CommitAttributor`를 `UsageAggregator.aggregate()`에 박지 않고 별도 서비스로. records 소비는 **post-aggregation** | **load-bearing(비협상)**. codex-later 시 회고가 provider 재구조화에 휩쓸리지 않게 하는 단일 결정. advisor 3회 모두 강조 |
| git 히스토리 = repo 소유(provider 무관) | `GitLogReader`는 Codex 결합 0 — 신규 코드 대부분이 codex와 직교 | git log는 agent가 아니라 repo의 것 |
| 신규 SHA-keyed 영속 스토어 | `RetroStore`(별도 파일 `ccg-retro.json`, 자체 version) | jsonl 30일 롤오프 → 커밋귀속 캐시가 raw-log 윈도 밖 생존 보장 = **본 v0.1.37의 "마이그레이션" 본질** |
| 첫 `child_process` 사용 | `git log` lazy 호출(회고 뷰 오픈 시) + **HEAD SHA로 캐시** | 매 refresh 셸아웃 금지(성능). 코드베이스 첫 외부 프로세스 호출 |
| 단일 record 진입점에서 소싱 | `extension.ts:50 allRecords`(또는 getter)에서 읽음. `workspaceMapper.getAllJsonlFiles()` 재호출 **금지** | codex "무행위변경 이관"이 getAllJsonlFiles를 `ClaudeSource`로 옮길 때 회고 ingestion이 깨지지 않게 |
| "기능 단위" = feature-branch 그룹핑(v1) | 기존 브랜치 귀속 직접 재사용. tag/finer-grain은 후속 | 과설계 회피. 이미 있는 `BranchUsage` 위에 커밋 레이어만 |

### 신규 서비스 인터페이스(안)
```ts
// src/services/GitLogReader.ts — 첫 child_process. lazy + HEAD SHA 캐시
interface CommitMeta {
  sha: string;
  committedAt: string;   // ISO8601 UTC (정규화 필수)
  branch: string;        // git log --decorate 또는 현재 브랜치
  subject: string;
  files: string[];       // --name-only
  repoRoot: string;      // git rev-parse --show-toplevel
}

// src/services/CommitAttributor.ts — 순수 결정론. aggregate() 밖. [TDD]
interface CommitUsage {
  commit: CommitMeta;
  costUsd: number;
  totalTokens: number;
  recordCount: number;
  sessionIds: string[];
  confidence: AttributionConfidence;  // 매칭 레코드 수 + 윈도 폭 기반
}
interface RetroSummary {
  commits: CommitUsage[];
  unattributed: { costUsd: number; totalTokens: number; recordCount: number; reason: 'post-last-commit' | 'no-window-match' };
  approximate: true;     // UI 근사치 라벨 강제용
  generatedAt: string;
}
```

---

## 2. 근사조인 알고리즘 (Phase 2 — TDD의 심장)

> ⚠️ 실측 제약: git commit은 세션 jsonl에 tool_use로 **안 잡힌다**(검증 11/11 0건). 정확조인 불가 → 근사조인만. UI "근사치" 명시 필수.

1. **UTC 정규화** — 레코드/커밋 양쪽 timestamp 전부 UTC로(경계 정확도).
2. **repo 단위 분해** — cwd → git repo root 매핑(멀티루트 워크스페이스 = 복수 repo). repo별 커밋을 commit time 오름차순 정렬.
3. **record→commit 귀속** — 레코드 timestamp **이상(≥)인 최초 커밋**에 귀속. 윈도 `(prev_commit_time, commit_time]` **AND** cwd가 해당 repo root에 매치. (= 레코드 직후 그 작업을 "담은" 다음 커밋에 귀속)
   - ⚠️ **1차 키 = repo+윈도. 브랜치는 join 키 아님(표시용)** — 정정(advisor, 2026-06-18 실측). `git log`는 과거 커밋의 *당시* 브랜치를 복원 못 함(대부분 `%D` decoration 없음 → 전부 현재 브랜치로 태깅). 따라서 strict 브랜치 매칭 시 feature-branch 작업이 전부 미귀속으로 폭발한다(실측: 레코드 201 main / 18 feature, 후자 전량 유실). 브랜치는 노이즈이므로 join에서 제외, 커밋 라벨로만 노출. 실 파이프라인 테스트(`RetroPipeline.integration.test.ts`)로 검증.
4. **미귀속 버킷(1급 처리)** —
   - `post-last-commit`: 마지막 커밋 이후 레코드(미커밋 작업 = 기획·토론·리서치·디버깅, 실측 output ~49%)
   - `no-window-match`: 어떤 윈도/repo에도 안 맞는 레코드
   - **숨기면 거짓 정밀도** → 항상 1급 슬라이스로 렌더.
5. **정확도 한계(버그 아님, 명시)** — 브랜치 히스토리 가변성(rebase/squash/merge가 시각+SHA 재작성), cwd≠git-root 불일치, 근사치 본질(정확조인 원천 불가).

**비용 모델 정합** — 실비용은 output이 아니라 cache_creation+input이 지배(실측 output 833K vs cache 3.57M). `SessionRecord.costUsd`는 **이미 cache amortize 반영**(CRITICAL #1 message.id dedup + 캐시 TTL 비용 정확도 경로 통과)이므로 회고는 `r.costUsd`를 그대로 합산 — 별도 비용 재계산 금지(이중계산 위험).

---

## 3. 기존 자산 재사용 분석 (요청 #2)

| 자산 | 재사용 범위 | 주의 |
|---|---|---|
| `SessionRecord`(types) | **그대로 소비**. `gitBranch`/`cwd`/`timestamp`/`isSidechain`/`agentId` 이미 보유 → 파싱 변경 0 | — |
| `branchBreakdown`/`BranchUsage` | **기능 단위(feature-branch) v1의 base** — 이미 구현됨. 커밋 레이어만 그 위에 추가 | 회고는 브랜치 집계를 대체 아님, 세분화 |
| `UsageAggregator.aggregate()` | **건드리지 않음** — 회고는 별도 모듈 | aggregate에 박으면 codex-later 재작업 폭증(§5) |
| `WorkspaceMapper.cwdMatchesWorkspace` | cwd↔repo 매칭에 재사용 가능 | ⚠️ **워크스페이스 root 매칭이지 git repo root 아님** + `getAllJsonlFiles` 비재귀 — repo root는 `git rev-parse`로 별도 확보 |
| `CacheStore` `{version, load, merge, persist}` 패턴 | **패턴만 재사용** → `RetroStore` 신규 | ⚠️ 커밋귀속은 **SHA-keyed**(날짜-keyed 아님) → `ccg-history.json` 오버로드 **금지**, 별도 파일·자체 version |
| `extension.ts:50 allRecords` | 회고 record 소싱 진입점 | getAllJsonlFiles 재호출 금지(§5 포워드 컨트랙트) |

---

## 4. 불확실성 UX 설계 (요청 #3)

> 제약 #1·#2(근사조인·미귀속 큼)를 정직하게 노출. "숨기면 거짓 정밀도"가 설계 제1원칙.

| 패턴 | 구현 |
|---|---|
| **근사치 라벨** | 뷰 헤더에 명시적 "≈ 근사치 (timestamp+branch 추정)" 배지. `RetroSummary.approximate=true` 강제 |
| **미귀속 버킷 1급화** | "기타/미커밋(~49%)" 슬라이스를 커밋들과 동등하게 렌더. 절대 숨김/0표시 금지 |
| **커밋별 신뢰도 신호** | `confidence` = 매칭 레코드 수 + 윈도 폭. 낮으면 시각적 약화(흐림/물음표) |
| **조인 방식 disclaimer** | 툴팁: "git 커밋은 세션 로그에 기록되지 않아 시각 근사로 귀속. rebase/squash 시 부정확" |
| **거짓 정밀도 회피** | `~`, 범위, 반올림 $ 사용. 소수점 정밀 비용 단언 금지 |
| 토큰/비용 dual | cache amortize 반영된 costUsd 표시 + 토큰 병기(구독/토큰-only 대비) |

배치(사이드바 vs 대시보드): 회고는 **차트+테이블 복합** → **대시보드(WebviewPanel)** 신규 섹션. 사이드바엔 active-branch 칩만(이미 있음). (참조: feedback_sidebar_vs_dashboard)

---

## 5. ⚠️ 포워드 컨트랙트 — codex-later 사이드이펙트 (사용자 요청: 비교검증 + 권장)

> 사용자 결정: **회고 뷰 먼저**. PLAN-v0.1.4-codex-provider(확정·미구현, `SessionRecord`에 `provider` 추가 + `src/sources/AgentSource` 추상화)가 **나중**. advisor 2회 교차검증 결론: **회고-first는 base-agnostic로 지으면 저위험**. 단 아래 6개를 계획에 못박는다.

| # | 사이드이펙트 | 완화(본 계획 반영) |
|---|---|---|
| 1 | **Codex 레코드 오조인(undercount)** — codex `session_meta`는 `git.branch`+`cwd` 보유 → Codex 레코드가 **미귀속으로 자동 처리 안 됨**, Claude 커밋 윈도에 조인됨. 한 repo에서 둘 다 쓰면 커밋 USD는 Claude-only인데 토큰은 Codex 흡수 → 과소집계 | codex 착수 시 **provider 필터 필수**(codex-owned 작업). 본 계획은 "미귀속 버킷이 알아서 처리"라 가정하지 **않음** |
| 2 | **Ingestion 결합** — codex "무행위변경 이관"이 `getAllJsonlFiles`를 `ClaudeSource`로 이동 | 회고는 `allRecords`(앱 단일 record 진입점)에서 소싱 → 이관에도 안 깨짐 |
| 3 | 구독 Codex = USD 붕괴(토큰-only) | 비용 렌더 **단일 seam** → codex가 `supportsUsdCost`로 게이트. 회고는 seam만 제공 |
| 4 | 리브랜딩(Gauge→범용) | 회고 문자열 **하드코딩 "Claude"/"Gauge" 0개**, i18n 키만 → codex 리브랜딩이 회고 안 건드림 |
| 5 | isSidechain 토글 Claude 전용 | codex는 reasoning tokens로 degrade. 동일 seam 뒤에 게이트 |
| 6 | **provider 배관 선구현 금지** | `provider?` 죽은 파라미터 미리 안 박음(존재 않는 AgentSource 형태 추측 = 과설계). seam = **깨끗한 모듈 경계 + 단일 비용 렌더 경로**이지 dead param 아님. 오늘의 단일 프로바이더 현실에 맞게 짓되 변경을 **국소화** |

**권장 피드백(사용자에게):** 회고-first 진행 OK. 단 §1의 "독립 모듈(aggregate 밖)" + §5의 6개 컨트랙트를 비협상 조건으로 고정. 이를 지키면 codex-later는 **rewrite가 아니라 bounded graft**(codex 자체 1페이즈: provider 필터 + 토큰-only 비용 경로 추가)로 수렴. version 라벨은 codex가 v0.1.37 이후로 재넘버링하는 것으로 가정(codex 문서의 "v0.1.4"는 구표기).

---

## 6. 페이즈 (의존 순서) — [판단: SubTask 6개 분리]

신규 서비스 2개 + 영속 스토어 + 타입 + 통합 + UI = 파일 5+개·크로스레이어·외부 I/O(git) → **SubTask 분리**(CLAUDE.md Phase 실행 프로토콜 적용).

### Phase 0 — 스코프 확정 게이트
- 기능 단위 = **feature-branch 그룹핑(v1)** 확정. git log cadence = **lazy(뷰 오픈) + HEAD SHA 캐시**. version = v0.1.37(codex는 이후 재넘버링 가정).

### Phase 1 — GitLogReader (foundation, 첫 child_process)
- **ST1** `GitLogReader` — repo 발견(`git rev-parse --show-toplevel`), `git log --name-only --decorate`(UTC), HEAD SHA 캐시, git-absent/non-repo cwd graceful degradation.
  - 파일: `src/services/GitLogReader.ts`(신규)
  - TDD: **부분 [TDD]** — git log **출력 파서 함수**는 결정론 → 단위테스트. 셸아웃 자체는 통합.

### Phase 2 — CommitAttributor (근사조인 엔진, 핵심)
- **ST2** `[TDD]` `CommitAttributor` — §2 알고리즘. records × commits → `CommitUsage[]` + 미귀속 버킷. aggregate() 밖 순수 함수. UTC 경계·윈도·미귀속 분기 단위테스트.
  - 파일: `src/services/CommitAttributor.ts`(신규), `src/types/index.ts`(`CommitMeta`/`CommitUsage`/`RetroSummary`/`AttributionConfidence`), `test/unit/CommitAttributor.test.ts`

### Phase 3 — RetroStore (SHA-keyed 영속 = "마이그레이션" 본질)
- **ST3** `[TDD]` `RetroStore` — `CacheStore` 패턴, **별도 파일 `ccg-retro.json` + 자체 version**. SHA-keyed merge. jsonl 30일 롤오프 후에도 커밋귀속 생존.
  - 파일: `src/services/RetroStore.ts`(신규), `test/unit/RetroStore.test.ts`
  - TDD: merge/version 마이그레이션 로직 결정론.

### Phase 4 — 통합 (extension/messaging)
- **ST4** 배선 — `extension.ts`에서 `allRecords` 소싱(getAllJsonlFiles 재호출 X), 회고 뷰 오픈 시 GitLogReader→CommitAttributor→RetroStore 파이프라인, messaging contract 추가.
  - 파일: `src/extension.ts`, `src/messaging/contracts.ts`(`PushRetroSummary`/request), `src/messaging/handlers.ts`

### Phase 5 — 회고 뷰 + 불확실성 UX
- **ST5** 대시보드 신규 섹션 — §4 패턴 전부(근사치 배지·미귀속 1급 슬라이스·confidence·disclaimer·거짓정밀도 회피). i18n 4개국어(ko/en/ja/zh). 하드코딩 "Claude"/"Gauge" 0개.
  - 파일: `src/panel/DashboardPanel.ts`, `src/webview/main.ts`, `src/webview/i18n.ts`, `src/messaging/contracts.ts`(타입), styles(토큰만)

### Phase 6 — 검증·문서 (미배포)
- **ST6** verify.sh + vitest 전량 그린 + Playwright 시각검증(근사치 라벨·미귀속 슬라이스 가시). CHANGELOG `[Unreleased]`. README 기능 문서. **§5 포워드 컨트랙트를 코드 주석으로 명시**(codex 인계용).

---

## 7. 범위외 / 알려진 한계 (정직성)

1. **서브에이전트 별도 transcript 크롤 — 범위외.** 사용자 실측 제약 #4("서브에이전트 토큰은 별도 subagents/ transcript")는 **이 머신에선 미재현**(별도 디렉토리 부재, isSidechain 엔트리 0건 — 2026-06-18 검증). 단 CC 버전 의존적이므로 삭제 않고 **후속 과제로 플래그**. 회고는 **기존 record-set(isSidechain 인라인 포함)을 단일 진실원**으로 사용. 별도-transcript 크롤은 선결 시 기존 `subagentStats`도 영향받는 별건(out-of-scope).
2. **정확조인 원천 불가** — git commit이 jsonl에 없음(실측). 영구히 근사치. exact join 약속 금지.
3. **rebase/squash/merge 후 부정확** — 브랜치 히스토리 가변성. disclaimer로 노출.

---

## 8. TDD 적격 요약

| SubTask | TDD | 사유 |
|---|---|---|
| ST1 GitLogReader | **부분 [TDD]** | 출력 파서 결정론(단위) / 셸아웃은 통합 |
| ST2 CommitAttributor | **[TDD]** | 결정론 근사조인+vitest+비자명(3-AND 충족). 핵심 |
| ST3 RetroStore | **[TDD]** | merge/version 마이그레이션 결정론 |
| ST4 통합 | ✗ | 배선/외부 I/O 통합 |
| ST5 UI | ✗ | Webview/E2E |
| ST6 검증 | ✗ | 검증 게이트 |

> `[TDD]`는 후보 표기. 실제 실행은 소비 스킬(sh-dev-loop/team-dev) 플래그+사용자 승인으로 최종 결정.

## 9. 확정된 결정

- 시퀀싱 = **회고 뷰 먼저**, codex 나중 ✅ 2026-06-18(사용자)
- 회고 로직 = **aggregate() 밖 독립 모듈** ✅(비협상, advisor 3회)
- "기능 단위" = **feature-branch 그룹핑(v1)** ✅
- 영속 = **별도 SHA-keyed RetroStore** ✅
- 구현 미착수 / ship = 명시 명령 대기 ✅
