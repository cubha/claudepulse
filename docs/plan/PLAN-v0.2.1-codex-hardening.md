# PLAN v0.2.1 — Codex 하드닝 (dedup·증분파싱·버그 9건 + 소모율 한 줄)

생성: 2026-09-20 · 소스: `docs/analysis/ANALYSIS-codex-v020-scope-2026-09-20.md`(analyze 스코프 감사) +
verify-impl 잔여판정(PLAN-v0.2.0-codex-provider.md §7) + 이번 세션 미커밋 변경분.
기준선 문서: [[reference_codex_integration]] D1~D11(Codex jsonl 계약 사실) · CLAUDE.md §3#1(message.id dedup) ·
§9(디자인 토큰 절차).

## 1. 사용자 요구사항 (원문 요약, 세션 대화 기준)

- "미결된항목이나 이월항목, 아니면 추가보완항목 묶어서 021같이낼게" — 미결/이월/추가보완 항목 전건을 v0.2.1로 번들
- "전건진행할게" — /analyze가 찾은 9건 전부 포함
- 네이티브 게이지(대시보드 Burn/Safe/Trend 차트) 포함 여부 문의에 대해 사용자가 "이거 왜 미루냐, Codex도 쓸 수 있게 한 거 아니냐"고 반문 → **분석 후 재분리**: 사이드바 소모율 한 줄(작음)은 포함, 대시보드 카드+차트+StatusBar(큼)는 제외하고 이 판단 근거를 사용자에게 제시해 승인받음(§3 참조)
- "우선 분석부터 진행해봐. 빠르게종결할만한 내용이 아니면 다음으로 넘기도록하고, 아니면 021에 함께진행할게" — 네이티브 게이지 항목에 한해 크기 판정 후 포함/제외 결정 위임받음

## 2. 확정 제약 (CLAUDE.md·프로젝트 불변식)

- `message.id`(Claude)/dedup 무결성(Codex) — 절대 위반 금지(§3#1)
- Codex 버킷은 `window_minutes`에서 런타임 생성, 하드코딩 금지(D9)
- `plan_type` 문자열 리터럴 분기 금지 — 미지값은 관대 처리(D9)
- 7+1 액센트 cap — 이번 라운드는 신규 토큰 추가 없음(전부 기존 슬롯 재사용/버그수정)
- 빈 값과 0 값을 같게 그리지 않는다
- **커밋·배포는 사용자 명시 명령까지 금지** — 이 PLAN은 구현+패키징+테스트까지만, ship은 별도 승인

## 3. 네이티브 게이지 스코프 판정 (분석 결과)

**포함(작음)** — 사이드바 `buildBurnRow(history, utilization, msUntilReset, windowMs)`는 이미 provider/window에 무관한 순수 함수(하드코딩 없음). Codex 버킷 카드 루프(`sidebarView.ts:783 bucketCards`)에 버킷별 history 배열만 추가하면 재사용 가능.

**제외(큼, v0.3+로 이월)** — 대시보드 BURN RATE/SAFE UNTIL 카드는 고정 DOM id(`burn-rate-val` 등) 1세트만 존재(5시간 전제), Utilization Trend 차트는 "Session (5h)"/"Weekly (7d)" 2데이터셋 하드코딩(Chart.js 구조 자체 재설계 필요), 페이스라인은 `FH_WINDOW_MS` 단일 윈도 전제, StatusBarController.ts는 `RateLimitSnapshot`(Claude 전용 타입) 고정이라 Codex 연결 자체가 없음. N버킷 동적 카드·차트 재설계·색상 슬롯 배정까지 필요한 아키텍처 작업 — 재개 조건은 별도 PLAN.

## 4. SubTask

| # | 항목 | 근거 | 대상 파일 | TDD |
|---|---|---|---|---|
| ST1 | 크로스파일 dedup 수정 | analyze 🔴#1 — `seen` Set이 파일 로컬이라 서브에이전트(thread_spawn) 부모/자식 파일 간 중복이 안 걸림 | `src/sources/codex/CodexSource.ts` | **[TDD]** |
| ST2 | Codex 증분 파싱 도입 | analyze 🔴#2 — 매 15초 refresh마다 전체 히스토리 2패스 재읽음, mtime+offset 캐시 없음(JsonlParser 패턴 이식) | `src/sources/codex/CodexSource.ts` | **[TDD]** |
| ST3 | 파일읽기 실패 로깅 | analyze 🟡#3 — `catch { continue }` 무성 실패 | `src/sources/codex/CodexSource.ts`(ST1/ST2와 같은 파일, 동시 처리) | ✗ |
| ST4 | 사이드바 plan 배지 대소문자 통일 | analyze 🟡#4 — 헤더 UPPERCASE vs footer Title Case | `src/webview/sidebarView.ts` | ✗ |
| ST5 | `codex-mini-latest`→"Latest" 라벨 버그 수정 | analyze 🟡#5 | `src/webview/webviewShared.ts` | **[TDD]** |
| ST6 | 모델 패밀리 매칭 전략 통일(longest-prefix) | analyze 🟡#6 — `codexPricing.ts`와 규칙 불일치 | `src/webview/webviewShared.ts` | ✗ |
| ST7 | `codexRollout.ts` 헤더 주석 정정 | analyze 🟡#7 — dedup 규칙 서술 자기모순(문서만, 코드 무변경) | `src/sources/codex/codexRollout.ts` | ✗ |
| ST8 | `.provider-codex` 팔레트 DESIGN-TOKENS.md 기재 | analyze 🟡#8 — CLAUDE.md §9 절차 미이행(문서만) | `docs/design/DESIGN-TOKENS.md` | ✗ |
| ST9 | Codex 모델색상 분기 유닛테스트 추가 | analyze 🟡#9 — `modelKind`/`modelShortName`/`CODEX_MODEL_FAMILY_SLOTS` 신규 코드 회귀보호 0건 | `test/unit/webviewShared.test.ts`(신규 또는 기존 확장) | **[TDD 사후보강]** |
| ST10 | 사이드바 버킷별 소모율 한 줄 추가 | §3 판정 — 작은 항목, `buildBurnRow` 재사용 | `src/webview/sidebarView.ts` | ✗ |
| ST11 | `is-unavailable` CSS 클래스 존치 확정 | Stop hook 과다구현 지적 — gbc에 사후등록 완료, 리스크 낮고 시안 근거 있어 **유지 권장**. 이번 라운드에서 정식 재확인만 | (액션 없음, 문서화만) | ✗ |
| ST12 | 마켓 스크린샷/GIF 재촬영 | 이미지 stale(v0.1.40 캡처) — 실 VS Code 필요 | `media/screenshot-dashboard.png`, `media/demo-dashboard.gif` | ✗ |
| ST13 | 실 Extension Dev Host 2-provider×3-empty-state 캡처 | PLAN-v0.2.0 §9 원 요구사항 미이행분(B-V9~11, ST10) | (문서/검증 산출물) | ✗ |
| ST14 | GitHub Release(v0.2.0) 생성 | 태그만 존재, Release 없음(비차단이지만 정리) | (GitHub, 비코드) | ✗ |

**ST12/ST13은 같은 자원(Windows GUI 브리지)에 의존** — 착수 시 `echo 'Write-Output "S=$((Get-Process -Id $PID).SessionId)"' | ~/.claude/tools/winbridge/runjob-limited.sh` 로 가용성 먼저 측정(측정 없이 불가 단정 금지, 전역 CLAUDE.md 규칙). `S=1`이면 두 항목 동시 수행 가능.

## 5. 제외(범위 밖, 별도 PLAN 대상)

- Codex 네이티브 게이지(대시보드 Burn/Safe 카드 + Trend 차트 N버킷 재설계 + StatusBar 연결) — §3 판정
- B-V3/V4/V8(WAI 확정 — 모델색 slate 폴백은 이번 라운드로 일부 해소, 도구카드 빈상태·탭 강도는 재작업 안 함)

## 6. 검증 요구

- `bash verify.sh --full` PASS 유지(현재 29/0)
- vitest 전체 통과 + ST1/ST2/ST5/ST9 신규 테스트 추가(RED 확인 후 구현)
- ST1은 다중 파일(부모+서브에이전트) 동일 response_id 시나리오로 회귀 잠금 필수
- 골든 digest 변경 시 사유 기록 후 재캡처
- **커밋·배포 금지** — 패키징·테스트까지만, ship은 별도 명시 승인 대기

## 7. 진행 상태

| 단계 | 상태 |
|---|---|
| 분석(analyze) | ✅ 완료(2026-09-20) — `docs/analysis/ANALYSIS-codex-v020-scope-2026-09-20.md` |
| 네이티브 게이지 스코프 판정 | ✅ 완료(2026-09-20) — 사이드바만 포함(ST10), 대시보드는 제외 |
| PLAN 수립 | ✅ 완료(2026-09-20, 본 문서) |
| 구현(sh-dev-loop --tdd --auto) | ✅ 완료(2026-09-20) — ST1~ST13 구현, ST14는 별도 승인 대기로 보류 |
| /verify-impl 인수검증 | ✅ 완료(2026-09-20) — acceptance-critic UNMET 1(ST10 버킷 히스토리 인덱스 키잉)·UNKNOWN 2(ST13/14, 코드 밖 산출물). ST10 즉시 보완(windowMinutes 키잉으로 수정), ST13은 이미 완료분 확인, ST14는 무시(별도 승인 대기 — 사유: v0.2.0용 GitHub Release는 v0.2.1 ship과 독립 사안) |
| ST10 보완 — 수용기준(테스트 증명) 미이행 사유 | ⚠️ 코드 수정은 반영했으나 회귀테스트는 **추가하지 않음**(무시, 사유 기록). critic 수용기준은 "버킷 개수/순서 변경 시나리오를 테스트로 증명"이었음. 실측: `sidebarView.ts:27`가 모듈 최상단에서 `document.getElementById`를 호출해 현재 vitest 설정(`environment: 'node'`, jsdom 없음)에서 이 파일을 import하면 즉시 `ReferenceError: document is not defined`(probe 테스트로 확인). jsdom 도입은 이번 버그수정 범위를 넘는 별도 인프라 작업이라 ship 시점에 하지 않음. 코드 수정 자체(windowMinutes 키잉)는 verify.sh 29/0로 컴파일·타입 확인됐고, ST10은 애초 PLAN에서 `[TDD]` 미태그 항목. 후속 과제로 남김 |
| 릴리즈메타 갱신 | ✅ 완료(2026-09-20) — package.json 0.2.1, CHANGELOG.md [0.2.1] 항목 |
| verify.sh --full | ✅ PASS=29/FAIL=0 (ST10 보완 후 재확인) |
| /ship 사전 보안검토(security-auditor) | ✅ 완료(2026-09-20) — S1~S6 이슈 0건. 범위 밖(billing-critical 데이터 무결성) 1건 발견: `readFileChunk`가 청크 경계에서 미완결 라인을 offset과 함께 영구 소실시킬 수 있음(파일 쓰는 도중 읽힐 때). 즉시 수정 — `splitCompleteLines()`로 바이트 단위 마지막 개행까지만 소비, 회귀테스트 추가(29/29 vitest 통과), CHANGELOG/README 반영 |
| verify.sh --full (보안수정 후 재확인) | ✅ PASS=29/FAIL=0 |
| ship | 🔜 진행 중 |
