# PLAN v0.1.57 — 리브랜딩 L0: "Claude Code Gauge" → "AgentVitals"

작성 2026-09-17 · 스킬 `/sh-dev-loop --tdd --auto` · 선행 게이트(제품명 컨펌) 통과

---

## 1. 사용자 요구사항 (원문)

> 020 진행을하게된다면 마켓 이름도 바꾸고싶은데 가능한가? 지금 다운로드수가 꽤되서 버릴순없어

> displayName이 변경되면 사용자가 보는 이름이 바뀌는거지? 추적검색 (cubha.claude-...)은 못바꾸고?

> 오케이. 그럼 문서, 소개글, readme, ..등 전체문서갱신 및 앱 내부 기존 제품명 표기되는 부분 갱신을 위해
> 범위 산정 및 신규 제품명 네이밍 --> /sh-dev-loop --tdd --auto 진행해.
> (제품명은 컴펌 후 진행. 실제 마켓플레이스 조사해서 중복제품명 없도록)

> AgentVitals이라면 바이탈에 맞는 디자인테마가 있어야될거같은데 가능하니?
> → (답변 후) "AgentVitals 확정" / "우선 L0만. L1, L2 작업은 추후 아티팩트로 시안먼저 뽑고 진행할 수 있도록
>    진행 --> 020계획 전에 선행으로 할 수 있도록"

## 2. 확정 사항 (사용자 컨펌 완료 — 재논의 불가)

| 항목 | 확정값 |
|---|---|
| 제품명 | **AgentVitals** |
| 마켓 displayName | **`AgentVitals — Claude Code & Codex Usage`** (브랜드+서술형) |
| IDE 내부 표시 | **`AgentVitals`** 단독 (사이드바·액티비티바·상태바·커맨드 접두) |
| 테마 범위 | **L0만** (메타포 언어). L1·L2는 아티팩트 시안 선행 후 v0.2.0 **착수 전** 별건 |
| 배포 | **금지** — 패키징·테스트까지. 커밋/ship은 사용자 명시 승인 필요 |

### 네이밍 근거 (재조사 불필요)
33개 후보를 VS Code Marketplace + Open VSX 양쪽 실조사. `AgentVitals`는 양 마켓 완전 중복 0.
탈락 사유 기록: `AgentGauge`·`Vibegauge` = "gauge"가 Codex에서 원천 부재라 현 이름의 실패를 반복 /
`CostPulse` = 구독 Codex는 `supportsUsdCost=false` / `VibeMeter`·`Fathom`·`Ampere` = 마켓 밖 동명 제품.

## 3. 🔴 절대 불변식 (ST1이 기계로 잠근다)

1. `package.json.name === "claude-code-gauge"` · `publisher === "cubha"`
   — 변경 시 **신규 익스텐션** 취급. Open VSX 16,572 DL + VSM 992/★4.45 전량 소실.
2. 설정키 5개 `claudeCodeGauge.*` 불변 (credentialsPath·pollIntervalMs·usageRefreshIntervalMs·
   utilizationWarnThreshold·retroCommitScope) — 기존 `settings.json` 무성 실패.
3. 커맨드 ID 3개 · view ID `claudeCodeGauge.sidebar` · viewsContainer id `claudeCodeGauge` 불변
   — 사용자 keybindings/tasks 파손, 사이드바 레이아웃 위치 초기화.
4. `src/` 내 **"Claude Code"(Anthropic CLI 참조) 16건 보존** — 특히 `i18n.ts` 9건(4개국어 로그인 안내).
   교체 대상은 **완전일치 `"Claude Code Gauge"` 뿐**. 전역 `sed s/Claude Code/…/` 절대 금지.
5. **README 배지 URL 5건의 `cubha.claude-code-gauge`·`cubha/claude-code-gauge` 보존**
   — 마켓 ID 기반 shields.io 조회라 바꾸면 배지가 죽는다. 제목(H1)만 교체.
6. 디자인 토큰·`styles.css`·차트 색 무변경 → verify.sh D-0~D-4 그린 유지.

## 4. SubTask (전량 [S] — 독립 [P] 후보 3개 < 임계 4)

| ID | 태그 | 내용 | 대상 파일 |
|---|---|---|---|
| ST1 | **[TDD]** | 리브랜딩 불변식 회귀 잠금 테스트 신설. RED 선확인 | `test/unit/branding.invariants.test.ts` (신규) |
| ST2 | — | 마켓 메타 교체: displayName·container title·view name·commands title×3·configuration title·description·keywords | `package.json` |
| ST3 | — | 앱 내부 가시 문자열 11건 | `constants.ts` `extension.ts` `DashboardPanel.ts` `SidebarViewProvider.ts` `StatusBarController.ts` `main.ts` `panelView.ts` `scripts/verify-real-extension-visual.mjs` |
| ST4 | — | 공개 문서: README 제목·서사(배지 URL 보존), CHANGELOG 신규 엔트리, demo.html, CLAUDE.md·verify.sh 헤더 | `README.md` `CHANGELOG.md` `docs/demo/demo.html` `CLAUDE.md` `verify.sh` |
| ST5 | — | 골든 digest 재캡처(사유 명시) + `verify.sh --full` 그린화 | `test/golden/webview-surface.json` |

### TDD 적격 판정 (`--auto --tdd`)
- ST1 = 적격(순수 파일 판독·결정론적·vitest 러너 존재·관측가능 실패). 유일 적격.
- ST2~ST4 = **문자열 치환**. ST1이 이미 전수 단언하므로 별도 test-first 불필요(중복).
- ST5 = 골든 스냅샷. 절대제외(비결정출력 아님이나 스냅샷 갱신 자체가 GREEN 정의).

## 5. 갱신 대상 아님 (명시적 제외)

- `docs/**`의 날짜 박힌 PLAN/RESEARCH/ANALYSIS — **과거 시점 기록물**. 당시 이름이 사실이다.
- `test/`의 `claudepulse-*` tmp 파일 prefix, fixture 경로 문자열 — 제품명이 아니라 경로.
- `.github/workflows/publish.yml`의 아티팩트명 `claudepulse-vsix` — 내부 CI 식별자, 사용자 미노출.
- `test/integration/extension.test.ts:12`의 잘못된 ID `cubha.claudepulse` — **기존 별건**
  (test:integration 3겹 결함과 묶임). 이번 라운드 포함 여부는 scope-critic 판정에 위임.

## 6. 검증 요구

- `bash verify.sh --full` = **PASS 29 / FAIL 0** 유지 (v0.1.56 기준선)
- vitest 전량 그린 + ST1 신규 단언
- 골든 digest 재캡처 시 `reason` 필드에 사유 명시 (허위성공 차단 규약)
- UI 변경 없음 → Playwright 시각검증은 verify.sh FAIL 시에만 진입
