# Claudepulse 전수 감사 분석 보고서 (v0.1.43 → vNext)

> 분석일: 2026-07-02
> 프로젝트: Claudepulse (claude-code-gauge) — Claude Code 사용량 실시간 시각화 VS Code Extension
> 분석 관점: 취약점 / 잠재오류 / 성능개선 / 보완사항 일체 탐색 — 다음 버전 마이그레이션 계획 수립 목적
> 방법: 병렬 에이전트 3개(구조 Explore / 아키텍처 code-explorer / 품질 code-reviewer) + 기존 리서치 5건 교차 + 의존성 최신성 조회

---

## 1. 프로젝트 개요

### 목적 및 핵심 가치
Claude Code rate limit(5h/7d)·토큰·비용을 IDE 안에서 실시간 시각화. 차별축: 워크스페이스↔세션 자동 매핑, 네이티브 임계값 알림, globalStorage 영구 보관, usage×git 회고(Cost by Commit), 스킬별 비용 귀속.

### 기술 스택
| 분류 | 기술 | 버전 | 비고 |
|---|---|---|---|
| 언어/빌드 | TypeScript + esbuild(2타깃) + tsc --noEmit | 5.4 / 0.20 | extension(cjs/node18) + webview(iife/browser) |
| 파일 감시 | chokidar (usePolling 3000ms) | 3.6 | WSL2 inotify 한계 우회 |
| 차트 | Chart.js | 4.4 | CSP 안전 |
| RPC | vscode-messenger 3종 | 0.5 | WEBVIEW_BROADCAST_METHODS 회귀 잠금 |
| 영속화 | globalStorageUri JSON (ccg-history / ccg-retro) | — | 30일 롤오프 보완 |
| 테스트 | vitest 15개 + @vscode/test-electron + e2e 라운드트립 | 1.4 | |
| 배포 | vsce + ovsx (GitHub Actions 태그 트리거) | 2.24 / 0.9 | |

### 현재 완성도
- 총 소스 ~7,772줄. 최대 파일 `src/webview/main.ts` 1,770줄 + `styles.css` 1,587줄 (webview 집중).
- rate limit 헤더 15개 파싱 성숙 / jsonl 파싱(dedup·증분·캐시 TTL 분리) 성숙 / 회고 파이프라인(v0.1.37~0.1.42에 걸쳐 안정화) / 히트맵·credentialsPath 보안(v0.1.43) 완료.
- **v0.2.0 Codex 통합 PLAN 확정·구현 미착수** (`docs/PLAN-v0.2.0-codex-provider-2026-06-16.md`).
- 리서치 P0였던 **캐시 1h TTL 과소계산은 수정 완료** 확인(`src/utils/pricing.ts:74` — 5m 1.25× / 1h 2.0× 분리 과금, JsonlParser에서 ephemeral 분리 파싱).

---

## 2. 아키텍처 분석

### 구조 개요 (4레이어 + 2 스파인)
```
[수집]  Rate-limit 스파인: CredentialsReader → RateLimitPoller ← CredentialsWatcher(즉시 재폴링)
        Usage 스파인:      FileWatcher(chokidar) → JsonlParser(mtime+offset 증분, 2중 dedup)
[집계]  UsageAggregator(단일 순회, stateless) · CommitAttributor(회고, aggregate 밖 독립 — 비협상)
[영속]  CacheStore(ccg-history.json) · RetroStore(ccg-retro.json, SHA-keyed)
[UI]    StatusBar(2 item) + Sidebar(WebviewView) + DashboardPanel(단일 인스턴스) ← vscode-messenger broadcast
```
- `extension.ts`가 Composition Root — 모든 런타임 상태(lastSnapshot/snapshotHistory/allRecords/lastUsageSummary/lastRetroSummary)의 단일 소유자.
- 회고는 3중 헤지(retroDirty + retroBuildInFlight + first-paint 캐시)로 git 셸아웃 남용 차단, `DashboardPanel.isOpen` 게이트.

### 평가
| 항목 | 평가 | 근거 |
|---|---|---|
| 레이어 분리 | 높음 | 2 스파인 독립, 회고 모듈 격리, 공유 커널(types+contracts) 명확 |
| 패턴 일관성 | 높음 | Composition Root·EventEmitter·debounce·증분 파싱 일관. 포워드 컨트랙트(주석 seam) 전략 유지 |
| 확장성(Codex) | **보통** | usage 스파인 범용화 가능하나 수술 필요 — 아래 §2-1 |
| 테스트 가능성 | 보통 | 서비스 생성자가 의존성 직접 생성(주입 없음), webview 1,770줄 단일 파일 |

### 2-1. Codex 범용화(v0.2.0) 준비도 — 핵심 갭
| 지점 | 현재 | 필요 작업 |
|---|---|---|
| `~/.claude/projects` 경로 | 생성자 주입 이미 지원(`claudeDir?`), 기본값 계산식만 2곳 중복 | 기본 경로 상수 1곳 승격 + Source별 주입 (v0.2.0 ST2) |
| `SessionRecord` | provider 판별자 없음 | `provider` 필드 추가 |
| `calcCost` | JsonlParser.ts:167에 직접 결합 | 파서-가격 결합 분리 (Codex 비용 로직 상이) |
| `CommitAttributor` | provider 필터 없음(주석 예약만) | Codex 오조인 방지 필터 (포워드 컨트랙트 이행) |
| Rate-limit 스파인 | Anthropic 전용 하드코딩 | 범용화 대상 아님 — 분리 잘 되어 있어 영향 없음 |

---

## 3. 코드 품질

### 강점
- CLAUDE.md §3 CRITICAL 전 항목 준수 확인: message.id dedup(byRequestId+cross-file), createFileSystemWatcher 미사용, 비공개 API 미사용, unsafe-eval 없음, git `execFile`+리터럴 인자(셸 인젝션 안전), credentialsPath scope:machine + `resolveCredentialsPath()` globalValue-only 이중 방어.
- `WEBVIEW_BROADCAST_METHODS` 공유 상수 회귀 잠금(v0.1.40 교훈 반영), verify.sh에 금지 API grep 게이트.

### 기술 부채 / 결함 목록 (심각도 순)
| # | 항목 | 심각도 | 위치 | 설명 |
|---|---|---|---|---|
| 1 | webview 에러 폴백 하드코딩 색상 5곳 | 🔴 규칙위반 | `src/webview/main.ts:35,156,641,675,712` | `#f48771`×4, `#8a8a8a`×1 — §3#5 위반. styles.css는 link로 로드되므로 Messenger 실패 시에도 `var(--vscode-*)` 사용 가능 |
| 2 | RateLimitPoller HTTP 타임아웃 부재 | 🟡 잠재오류 | `src/services/RateLimitPoller.ts:106-141` | `req.setTimeout` 없음 — 행 걸린 요청의 소켓·Promise 누적 + 해당 회차 onError 무통보(stale 윈도). ※braintrust 정정: `start()`가 in-flight 가드 없는 setInterval이라 다음 회차는 발화 — "폴링 영구 잠김" 아님 |
| 3 | StatusBar 하드코딩 `#3B82F6` | 🟡 규칙위반 | `src/providers/StatusBarController.ts:53` | StatusBarItem.color는 CSS var 불가 — `new vscode.ThemeColor(...)` 또는 undefined로 교체 |
| 4 | WorkspaceMapper 동기 I/O | 🟢 성능(정정) | `src/services/WorkspaceMapper.ts:16-29,44-67` | `readdirSync` 중첩은 사실이나 디바운스된 refresh당 1회·소형 디렉토리(추정 수 ms) — ※braintrust 정정: "이벤트 루프 블로킹" 체감 근거 없음. async 전환은 v0.2.0 ST2 전 위생 작업으로 |
| 5 | JsonlParser `statSync` | 🟢 위생 | `src/services/JsonlParser.ts:42` | 파일당 1회 stat, 영향 미미 — 성능 아닌 위생 동기로 1줄 수정 |
| 6 | startPoller 재시작 시 subscriptions 누적 | 🟢 위생(정정) | `src/extension.ts:236,246` | ※braintrust 정정: 진입부 `poller?.stop()`으로 구 인스턴스 선정지 — 타이머/워처 누수 없음. 누적되는 것은 dispose 클로저(수십 바이트)뿐, 위생 수정만 |
| 7 | `getNonce()` 중복 + `Math.random()` | 🟢 보안(낮음)/부채 | `DashboardPanel.ts:73-77`, `SidebarViewProvider.ts:54-58` | CSP nonce는 `crypto.randomBytes` 권장. 공통 유틸로 통합 |
| 8 | webview `main.ts` 1,770줄 단일 파일 | 🟡 유지보수 | `src/webview/main.ts` | 사이드바/패널 렌더 혼재. retroView.ts 분리는 부분적. 테스트 불가 영역 |
| 9 | ~~경로 하드코딩 2곳~~ 기본 경로 상수 중복 | 🟢 확장성(부분 기각) | `FileWatcher.ts:15` + `WorkspaceMapper.ts:8` | ※braintrust 반증: 둘 다 이미 `constructor(claudeDir?)` 주입 지원 — "파라미터화 필요"는 거짓 양성. 잔여 갭 = 기본값 `~/.claude` 계산식 2곳 중복 + `extension.ts:53-54` 무인자 호출 → v0.2.0 ST2에 흡수 |
| 10 | `allRecords` 전량 메모리 상주 | 🟢 성능(관찰) | `src/extension.ts` | SessionRecord[] 전체 보관 — 현재 규모 무해, 장기 사용자·Codex 추가 시 증가 축 |
| 11 | 테스트 팩토리 인자 불일치 의심 | 🟢 확인필요 | `test/unit/RateLimitPoller.test.ts:13-17` | onError 콜백 누락 시 오류 경로 테스트 무동작 가능 |
| 12 | `@types/chokidar@1.7.5` 스텁 | 🟢 부채 | package.json | chokidar 3+는 자체 타입 내장 — 제거 대상 |
| 13 | 테스트 디렉토리 tsc 사각지대 (braintrust 신규) | 🟡 부채 | `tsconfig.json:22` | `test` exclude + vitest는 타입체크 안 함 → 테스트 전체가 타입 무검증 (#11의 근본 원인). `tsconfig.test.json` 추가 + verify.sh 편입 |

### 테스트 커버리지 공백 (유닛 테스트 0인 모듈)
| 모듈 | 위험도 |
|---|---|
| **UsageAggregator** (가장 복잡한 집계 — byDay/bySession/byModel/byBranch/bySkill) | 높음 — attribution·branch·historicalDays 부분 테스트만 존재, 코어 롤업 무검증 |
| CacheStore (merge/persist/load) | 중간 |
| WorkspaceMapper (경로 인코딩·cwd 매칭 — 차별점 1의 코어) | 중간 |
| SidebarViewProvider / DashboardPanel (HTML·CSP 생성) | 낮음 |
| StatusBarController (상태 전환) | 낮음 |

### 보안 점검 (OWASP + VS Code Extension 특수 위협)
- 통과: 셸 인젝션(execFile), 경로 하이재킹(S6 이중 방어), CSP(unsafe-eval 없음), 비공개 API 미사용, 민감정보 로깅 없음.
- 잔여: #7 nonce 품질(위험 낮음 — 외부 스크립트 주입 벡터 협소).

### 성능 점검
- 병목 후보: #4(동기 readdir) > #5(statSync) > chokidar usePolling 3000ms(WSL 필수라 유지) > #10(메모리).
- webview 렌더는 Chart.js 재생성 패턴 — 현재 데이터 규모에서 병목 아님.

---

## 4. 기술 트렌드 대비

### 스택 최신성 (2026-07-02 npm 조회)
| 기술 | 현재 | 최신 | 상태 |
|---|---|---|---|
| eslint | ^8.57 | 10.6.0 | 🔴 v8 EOL — flat config 마이그레이션 필요 |
| vitest | ^1.4 | 4.1.9 | ⚠️ 메이저 3단계 |
| chokidar | ^3.6 | 5.0.0 | ⚠️ 메이저 2단계 — **WSL usePolling 동작 재검증 필수** (HARD 제약) |
| typescript | ^5.4 | 6.0.3 | ⚠️ 메이저 |
| esbuild | ^0.20 | 0.28.1 | ⚠️ |
| @vscode/vsce | ^2.24 | 3.9.2 | ⚠️ 배포 파이프라인 검증 필요 |
| chart.js | ^4.4 | 4.5.1 | ✅ 마이너 |
| vscode-messenger | ^0.5 | 0.6.1 | ✅ 마이너 |

### 도메인/경쟁 (기존 리서치 2026-06-11 · 06-23 근거)
- **growthjack/claude-code-usage 23.6k 설치 — 최대 위협** (4탭 대시보드·OAuth 실할당량·AI 어드바이저). 대응축: thinking·서브에이전트 계층·스킬귀속·Git ROI는 우리만 보유.
- 미활용 jsonl 데이터: `service_tier`, `entrypoint`, `web_fetch/code_execution_requests` — 기능 확장 여지 낮음(실측 전량 standard/cli). ※braintrust 정정: `isSidechain`/`agentId` 서브에이전트 분리는 **이미 구현됨**(`UsageAggregator.ts:100-119` subagentStats, v0.1.38).
- v0.2.0 Codex: dual-use 포지셔닝 확정, **서브에이전트 91× 과다계산(ccusage #950) 3중키 dedup 필수**, 실 fixture 미확보가 BLOCKER.
- Cursor: 구조적 불가로 보류 확정(재개조건 = 공식 개인 API 출시).

---

## 5. 개선 로드맵 (초안 — ⚠️ braintrust 4렌즈 검토로 **대체됨**)

> **확정 계획은 `docs/PLAN-vnext-migration-2026-07-02.md` 참조.** 아래 초안은 검토 이력 보존용.
> 주요 변경: #9 독립 항목 삭제(거짓 양성), 툴체인 메이저 → post-v0.2.0, chokidar 5 → 보류 확정,
> TS 6 → CLAUDE.md §2 개정 승인 게이트, 테스트 보강 → "v0.2.0 Phase 0.5" 격상, 서브에이전트 뷰 → stale 삭제.

### 즉시 개선 (Quick Win — 패치 릴리즈 후보 v0.1.44)
- [ ] 🔴 #2 RateLimitPoller `req.setTimeout(15s)+destroy` — 폴링 영구 잠김 차단
- [ ] 🔴 #1 webview 하드코딩 색상 5곳 → `var(--vscode-errorForeground)`/`var(--vscode-descriptionForeground)`
- [ ] 🟡 #3 StatusBar `#3B82F6` → ThemeColor
- [ ] 🟡 #6 startPoller disposable 정리
- [ ] 🟢 #7 `src/utils/nonce.ts` 통합(crypto.randomBytes)
- [ ] 🟡 #5 statSync → fs.promises.stat
- [ ] 🟢 #12 @types/chokidar 제거, chart.js·vscode-messenger 마이너 범프
- [ ] 🟢 #11 RateLimitPoller 테스트 팩토리 인자 tsc 검증

### 단기 개선 (1~2주)
- [ ] #4 WorkspaceMapper async 전환 (호출 체인 await 포함)
- [ ] UsageAggregator 코어 롤업 + CacheStore + WorkspaceMapper 유닛 테스트 보강 (v0.2.0 리팩터 전 안전망)
- [ ] #9 경로 하드코딩 파라미터화 — v0.2.0 ST1 선행 준비
- [ ] 툴체인: eslint 10(flat config) + vitest 4 + esbuild 0.28 + vsce 3 (배포 워크플로 검증 동반)
- [ ] #8 main.ts 모듈 분리 1차 (sidebar/panel 렌더 분리)

### 중장기 개선 (1개월+)
- [ ] **v0.2.0 Codex 통합** — 기존 PLAN 그대로 (AgentSource 추상화, ST0 fixture 게이트, 91× dedup, burn-rate 공통 계산)
- [ ] chokidar 5 + TypeScript 6 메이저 (WSL polling 회귀 검증 게이트 필수)
- [ ] #10 allRecords 메모리 전략 (증분 집계 or 기간 윈도)
- [ ] 미활용 jsonl 필드 활용 기능 (서브에이전트 분리 뷰 등 — 경쟁 대응)

---

## 6. 리서치 출처
- 내부: `RESEARCH-claude-code-모니터링-개선후보-2026-06-11.md`, `RESEARCH-codex-통합-범용화-2026-06-15.md`, `RESEARCH-codex-신규유저-시장수요-2026-06-23.md`, `RESEARCH-cursor-usage-계측-타당성-2026-06-24.md`, `PLAN-v0.2.0-codex-provider-2026-06-16.md`
- 외부: npm registry 버전 조회(2026-07-02). 기존 리서치가 도메인·경쟁·정책을 커버하여 추가 웹 리서치 생략(스킬 2-0 규칙).

---

> 이 보고서는 Claude Code `/analyze` 스킬로 자동 생성되었습니다.
