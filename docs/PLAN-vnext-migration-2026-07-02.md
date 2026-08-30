# vNext 마이그레이션 계획 (v0.1.44 → v0.2.0 → post-chore)

> 작성일: 2026-07-02
> 근거: `docs/analysis/ANALYSIS-claudepulse-vnext-audit-2026-07-02.md`(전수 감사) + braintrust 4렌즈 적대검토(정합성/실패모드/실행가능성/기회비용) 종합
> 관계: `docs/PLAN-v0.2.0-codex-provider-2026-06-16.md`를 **대체하지 않음** — 그 앞뒤에 붙는 릴리즈 시퀀스를 확정하고 v0.2.0 PLAN에 3개 델타만 가한다.
> ⚠️ **모든 릴리즈는 구현·검증(패키징+테스트) 완료 후 사용자 ship 명시 명령 대기 (절대원칙)**

---

## 0. 한 줄 요약

**v0.1.44 위생 패치(즉시) → v0.2.0 Phase 0.5 선결 안전망(테스트 백필·webview 분리) → v0.2.0 Codex 본선(fixture는 ST3 verified만 게이트, 나머지 즉시 착수 가능) → post-v0.2.0 툴체인 chore.** 툴체인 메이저를 앞에 두지 않는다 — 시장 창(growthjack 28k 성장·Codex 도구 선점 진행)에서 v0.2.0 지연이 가장 큰 기회비용.

---

## 1. braintrust 검토 핵심 판정 (계획 변경 근거)

| 판정 | 합의 | 내용 |
|---|---|---|
| #9 경로 파라미터화 = 거짓 양성 | 4/4 | `FileWatcher.ts:15`·`WorkspaceMapper.ts:8` 이미 `claudeDir?` 주입 지원. 잔여 = 기본값 계산식 중복 → **ST2 흡수, 독립 항목 삭제** |
| 툴체인 메이저 후행 | 3/4 | vitest 마이그레이션과 신규 테스트 작성이 겹치면 실패 귀속 혼선 + v0.2.0 지연 실비용. eslint 8 EOL은 dev-only(배포 산출물 무관)라 급하지 않음. ※Feasibility 렌즈의 "vitest 4 선행" 소수의견은 유닛 테스트 표면 API(describe/it/expect) 호환성 근거로 기각 |
| chokidar 5 보류 확정 | 3/3 | WSL usePolling HARD 제약 + 현 3.6 검증 완료 + 편익 사실상 0. **재개 조건: chokidar 3 보안 이슈 발생 시** |
| TS 6 조건부 보류 | 2/2 | CLAUDE.md §2 "TypeScript 5.x 변경 금지" 정면 충돌 — **§2 개정(사용자 승인) 전제의 조건부 항목**. 승인해도 v0.2.0 타입 수술 이후 |
| #2 심각도 정정 | 2/2 | "폴링 영구 잠김" 아님(setInterval 다음 회차 발화) — 실 결함은 소켓 누적+무통보 stale. 수정(5줄)은 v0.1.44 유지 |
| 테스트 보강 = v0.2.0 선결 안전망 | 3/4 | ST2 "무행위변경 이관" 게이트가 기존 테스트 그린을 전제 — billing-critical 경로 이관 전 UsageAggregator 코어 무검증이 리스크 본체 |
| v0.2.0 조기 착수 가능 | 2/4 | PLAN Phase 0-1이 이미 "fixture 없으면 ST3 experimental 진행" 허용 — fixture가 게이트하는 것은 ST3 **verified 승격뿐** |
| 서브에이전트 분리 뷰 stale | 1/4(실측) | `UsageAggregator.ts:100-119`에 이미 구현(v0.1.38) — 로드맵에서 삭제 |

---

## 2. 릴리즈 시퀀스

### R1 — v0.1.44 위생 패치 (즉시, 합계 수 시간~1일)

전부 국소·저위험 수정. 호출 체인 변경(#4류) 배제 — "패치=무위험" 계약 유지.

| # | 작업 | 위치 | 수정 방향 |
|---|---|---|---|
| 1 | 🔴 webview 하드코딩 색상 5곳 | `main.ts:35,156,641,675,712` | `#f48771`→`var(--vscode-errorForeground)`, `#8a8a8a`→`var(--vscode-descriptionForeground)` (`--vscode-*`는 VS Code가 모든 webview에 기본 주입 — Messenger 실패와 무관하게 가용) |
| 2 | 🟡 폴러 HTTP 타임아웃 | `RateLimitPoller.ts:106-141` | `req.setTimeout(15_000, () => req.destroy(new Error('TIMEOUT')))` — 소켓 누적+무통보 stale 차단 |
| 3 | 🟡 StatusBar `#3B82F6` | `StatusBarController.ts:53` | 1안 `undefined`(테마 기본색 수용, 더 안전) / 2안 `new vscode.ThemeColor('charts.blue')` |
| 4 | 🟢 nonce 유틸 통합 | `DashboardPanel.ts:73-77`, `SidebarViewProvider.ts:54-58` | `src/utils/nonce.ts` 신설 — `crypto.randomBytes(16).toString('hex')`, 중복 제거 |
| 5 | 🟢 statSync → promises | `JsonlParser.ts:42` | `await fs.promises.stat` 1줄 (위생). billing-critical 핫패스이므로 기존 증분 파싱 테스트 그린 확인 필수 |
| 6 | 🟢 disposable 위생 | `extension.ts:236,246` | startPoller 재호출 시 구 dispose 항목 제거 (누수 아님 — 위생) |
| 7 | 🟢 @types/chokidar 제거 + chart.js 4.5.1 | package.json | vscode-messenger 범프는 여기 **제외**(R2로 — 0.x 마이너는 breaking 허용 + RPC 코어 회귀 이력) |

게이트: `bash verify.sh` 전량 그린 + 기존 vitest 15개 그린 → 패키징 → **ship 대기**.

### R2 — v0.2.0 Phase 0.5: 선결 안전망 — ✅ v0.1.54로 승격·완료 (2026-08-30)

원래는 "버전 릴리즈 없이 main 누적 가능"으로 계획했으나, 사용자 결정(2026-08-29)으로 별도 릴리즈
체크포인트 **v0.1.54**로 승격해 완료. 상세: `docs/plan/PLAN-v0.1.54.md`(ST0~ST7) +
`docs/plan/verify-spec/ST*-v0.1.54.md`. ④는 실행 중 3분할(sidebarView/panelView/webviewApi)이
"기계적 추출" 전제와 충돌해 4분할(+`webviewShared.ts`, 교차사용 헬퍼 전용)로 정정됐고, `panelCharts.ts`
(DOM+Chart 생성이 한 함수 안에 있어 분리 불가)는 2차로 v0.2.0 이후 연기. ⑥(fixture 요청)은 여전히 미발신 —
아래 원문 유지, 별도 처리. R3(v0.2.0) 착수는 이 완료를 선행조건으로 한다.

v0.2.0 PLAN Phase 0 앞에 삽입하는 신규 페이즈. **vitest 1 그대로** 작성(툴체인과 절연).

| 작업 | 근거 |
|---|---|
| ① UsageAggregator 코어 롤업 + CacheStore + WorkspaceMapper 유닛 테스트 백필 | ST2 "무행위변경 이관" 게이트의 전제. `aggregate(SessionRecord[])→UsageSummary` 행위 수준 시임이라 v0.2.0 후에도 생존(PLAN §1 "정규화 모델 재사용") |
| ② `tsconfig.test.json` 신설 + verify.sh 편입 | braintrust 신규 발견 #13 — 테스트 전체가 tsc 사각지대(#11의 근본 원인 동시 해소) |
| ③ WorkspaceMapper·체인 async 전환 (#4) | ST2가 래핑할 시그니처 — ST2 **전에** 끝내야 한 번만 래핑 |
| ④ webview `main.ts` **완전 분리** (sidebar/panel/차트 모듈) | ST6/ST7이 main.ts를 수정 대상으로 잡음 — 절반 분리가 최악. 기계적 추출 + **Playwright 캡처 동등성 게이트**(기존 헤드리스 하네스 재사용, `feedback_webview_ui_verification` 교훈) |
| ⑤ vscode-messenger 0.5→0.6 | e2e broadcast 라운드트립(`test:e2e`) 통과를 게이트로 |
| ⑥ **Codex 실 fixture 확보 요청 발신(사용자)** + 가격 수동검증(PLAN 0-2) | fixture는 ST3 verified 승격의 유일 게이트 — 대기시간을 앞으로 당김 |

### R3 — v0.2.0 Codex 본선 (기존 PLAN + 델타 3개)

`PLAN-v0.2.0-codex-provider-2026-06-16.md` 그대로 진행하되:

1. **ST2 델타**: 기본 경로 `~/.claude` 계산식을 상수 1곳으로 승격 + `extension.ts:53-54` 주입 결선 (구 #9 흡수)
2. **착수 시점 델타**: ST1·ST2·ST5 Claude측·ST6/ST7 UI 골격은 fixture 없이 즉시 착수 가능 — ST3만 fixture 전까지 experimental 표기(PLAN 0-1 준수)
3. **Phase 0.5 선행 확인**: R2 ①~④ 완료가 ST2 진입 조건

### R4 — post-v0.2.0 툴체인 chore (독립 릴리즈)

| 항목 | 내용 |
|---|---|
| eslint 8→10 | flat config 전환 (dev-only) |
| vitest 1→4 | 백필된 테스트 일괄 마이그레이션 (한 번만) |
| esbuild 0.20→0.28 | 2타깃 config 검증 |
| @vscode/vsce 2→3 + ovsx | publish.yml 태그 배포 1회로 파이프라인 검증 |

### 보류 (재개 조건 명시)

| 항목 | 재개 조건 |
|---|---|
| chokidar 3→5 | chokidar 3 보안 이슈 발생 시에만 (WSL usePolling HARD 재검증 동반) |
| TypeScript 5.x→6 | CLAUDE.md §2 개정 — **사용자 승인 게이트**. 승인 시에도 R4 이후 |
| allRecords 메모리 전략 (#10) | 장기 사용자·Codex 추가로 실측 증가 확인 시 |
| Cursor 계측 | Cursor 개인 공식 usage API 출시 시 (기존 결정 유지) |

### 후보 (미확정 — 사용자 확정 게이트 필요, 로드맵 아님)

- 잔여 미활용 jsonl 필드(entrypoint·web_fetch/code_execution·service_tier) — 실측 전량 standard/cli라 차별화 기여 낮음, 우선순위 최하

---

## 3. 리스크 요약

| 리스크 | 완화 |
|---|---|
| R1 #5가 billing-critical 핫패스 | 증분 파싱 테스트 그린 게이트 |
| R2 ④ webview 분리 회귀 | Playwright 캡처 동등성 게이트 (목업 검증 금지 — 실빌드+fake postMessage) |
| R3 ST3 스키마 미검증 | fixture 확보 전 experimental 표기 유지 (PLAN BLOCKER 준수) |
| R4 배포 파이프라인 변경 | v0.2.0과 절연된 독립 chore + 태그 배포 1회 검증 |

---

> 이 계획은 `/analyze` 전수 감사 + `/braintrust` 4렌즈 적대검토를 거쳐 확정되었습니다.
