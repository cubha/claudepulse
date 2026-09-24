# AgentVitals (claudepulse) — 프로젝트 운영 규칙

## 0. 프로젝트 정체성

Claude Code 사용량을 IDE 안에서 실시간으로 시각화하는 VS Code Extension.
ccusage(★14k CLI)의 데이터 정확성 + Claudemeter의 실시간성 - 비공개 API 위험 + IDE 컨텍스트 통합.

## 1. Ground Truth 문서

본 프로젝트의 모든 코드 결정은 다음 문서를 우선한다:

| 문서 | 역할 |
|---|---|
| `docs/research/RESEARCH-claude-usage-dashboard-2026-05-10.md` | 시장·기술·UX 사전 리서치 |
| `docs/design/UX-BRIEF.md` | 화면 맵·스토리보드·구현 원칙 |
| `src/webview/styles.css` | **토큰 Ground Truth**(75토큰/126줄) — 값이 어긋나면 이 파일이 옳다 |
| `docs/design/DESIGN-TOKENS.md` | 위 선언의 서술 + 의도적 잔존·dead 인벤토리 (§9 바인딩) |
| `docs/design/prototype/00-clausight-canvas.html` | 시각 Ground Truth (브라우저로 열어 확인) |
| `docs/INIT-PLAN-2026-05-10.md` | 채택 스택 + 디렉토리 구조 |

## 2. 채택 스택 (변경 금지 — RESEARCH 권장 1순위)

- TypeScript 5.x + esbuild + tsc --noEmit
- chokidar (vscode.FileSystemWatcher 외부 경로 감시 불가 — HARD)
- Chart.js (Webview CSP 안전, ~60KB)
- WebviewViewProvider + StatusBarItem + WebviewPanel (3중 UI)
- vscode-messenger (TypeFox, 타입 안전 RPC)
- globalStorageUri JSON 인덱스 (10만+ 시 SQLite 마이그)
- LiteLLM 가격 스냅샷 임베드 (오프라인 USD 환산)
- vsce + ovsx 동시 배포 (Cursor용 Open VSX 필수)

## 3. ⚠️ CRITICAL — 절대 위반 금지

1. **`message.id` dedup 필수** — Claude Code는 스트리밍 중 동일 assistant 응답을 여러 번 jsonl에 기록한다. dedup 누락 시 billing 불일치 (ccusage·token-dashboard 검증)
2. **`vscode.workspace.createFileSystemWatcher` 사용 금지** — 워크스페이스 외부(`~/.claude/`) 감시 불가. chokidar 필수
3. **claude.ai 비공개 HTTP API 사용 금지** — Claudemeter 방식. 즉시 중단 위험. jsonl 직접 파싱만 허용
4. **`unsafe-eval` 의존 차트 라이브러리 사용 금지** — Webview CSP 위배 (Recharts/Tremor 제외)
5. **선언 밖 색 리터럴 금지** — `styles.css`의 `--x:` 선언 줄 밖에서는 hex/rgba 금지. `var(--vscode-*)` · `var(--c-*)` · `var(--tint-*|--fg-*|--shadow-*|--btn-*)` 토큰만. **현재 0건이며 게이트가 `fail`로 막는다** (예외는 `design-lint-ignore` 주석 + DESIGN-TOKENS.md §12.1 등재 필수)
6. **7+1 액센트 cap** — fable·opus·sonnet·haiku·warn·danger·success + slate(중립). 8번째 추가 시 합의 필수
7. **외부 폰트 임포트 금지** — 시스템 폰트만 (`-apple-system, "Segoe UI", system-ui, sans-serif`)

## 4. 디렉토리 책임

| 경로 | 책임 |
|---|---|
| `src/extension.ts` | activate/deactivate 진입점, lazy init |
| `src/services/FileWatcher.ts` | chokidar 래퍼, 디바운스 |
| `src/services/JsonlParser.ts` | readline 증분 파싱, mtime+offset, message.id dedup |
| `src/services/UsageAggregator.ts` | 일/주/월 롤업, 비용 계산, 5h window |
| `src/services/CacheStore.ts` | globalStorageUri JSON 인덱스 |
| `src/services/WorkspaceMapper.ts` | 워크스페이스 ↔ 프로젝트 매핑 (차별점 1) |
| `src/providers/SidebarViewProvider.ts` | WebviewViewProvider |
| `src/providers/StatusBarController.ts` | StatusBarItem |
| `src/panel/DashboardPanel.ts` | WebviewPanel 단일 인스턴스 |
| `src/messaging/` | vscode-messenger contracts + handlers |
| `src/webview/` | Webview 런타임 (별도 esbuild target) |
| `src/utils/pricing.ts` | LiteLLM 가격 스냅샷 |
| `src/utils/pathDecoder.ts` | `~/.claude/projects/<encoded>` 디코딩 |

## 5. 빌드·검증

| 명령 | 동작 |
|---|---|
| `npm run build` | esbuild + tsc --noEmit |
| `npm run watch` | esbuild watch (extension + webview) |
| `npm run typecheck` | tsc --noEmit |
| `npm run lint` | eslint |
| `npm run test:unit` | vitest |
| `npm run test:integration` | @vscode/test-electron |
| `bash verify.sh` | 통합 검증 (build + lint + typecheck + smoke) |

## 6. 차별화 (마케팅·구현 모두 의식)

1. **워크스페이스 ↔ 세션 자동 매핑** — `vscode.workspace.workspaceFolders` ↔ jsonl 폴더 디코딩 (CLI 구조적 불가)
2. **VS Code 네이티브 임계값 알림** — `showWarningMessage` (Copilot은 이메일만)
3. **장기 영구 보관** — globalStorage로 jsonl 30일 롤링 보완

## 7. 후속 단계

```
[현재] /init-project 완료
   ↓
/plan        → MVP SubTask 분리
/sh-dev-loop → 또는 /team-dev로 구현
/ship        → vsce + ovsx 배포
```

## 8. 가격 데이터 갱신

`pricing/litellm-snapshot.json`은 빌드 타임 임베드. 모델 가격 변경 시:
1. https://github.com/BerriAI/litellm 의 model_prices_and_context_window.json 참조
2. 본 파일 수동 갱신
3. CHANGELOG에 기록

---

## 9. 🎨 디자인 토큰 바인딩

| 항목 | 값 |
|---|---|
| **Ground Truth** | `src/webview/styles.css` — 토큰 선언과 스타일시트를 **겸한다** |
| **문서(서술)** | `docs/design/DESIGN-TOKENS.md` — 코드가 우선, 문서가 따라간다 |
| 토큰 실체 | CSS 커스텀 프로퍼티 **76개** (`:root` 25 · `.theme-dark` 51 · `.theme-light` 51). dead 0 · 미정의 0 · 페어 미충족 0 |
| 네임스페이스 | `--sp-*` `--fs-*` `--r-*` `--ff-*` (불변) · `--c-*` `--fg-on-accent` (액센트, `:root`) · `--vscode-*` `--heat-*` `--tooltip-*` `--tint-*` `--fg-*` `--outline-*` (테마별) |
| 소비 형태 | CSS `var(--x)` 단일. `.ts`는 색을 갖지 않는다(실측 hex 2건 = HTML 엔티티 `&#9888;`) |
| 예외 표기 | 같은 줄 `design-lint-ignore` 주석 |
| 현재 드리프트 | **0건** (착수 시 122). `.theme-light` 오버라이드 규칙도 25→0 — 전부 토큰이 흡수했다 |

### 판정 규약 (틀리기 쉬운 지점)

- **줄 단위로 가른다.** `styles.css`를 "토큰 파일"이라며 통째 제외하면 드리프트가 2건으로 보인다(실제로 그 착시가 났다). 반대로 통째로 세면 선언의 hex 112건이 전부 위반으로 잡힌다. 기준은 `^\s*--x:` 선언 줄 여부다.
- **hex만 세지 않는다.** 이 repo는 rgba가 더 많았다(hex 41 < rgba 81). 두 패턴을 함께 센다.
- **`var(--vscode-*)` 142건은 정상이다.** VS Code 테마 연동이며 치환 대상이 아니다.
- **측정 시 `.vscode-test/` 제외.** 다운로드된 VS Code 바이너리까지 세면 hex가 65,742로 잡힌다. 게이트는 `styles.css` 단일 파일만 보므로 이 함정을 구조적으로 회피한다.

### 게이트 (`bash verify.sh`)

| 규칙 | 판정 | 기준선 |
|---|---|---|
| D-0 측정 온전성(선언 수) | **fail** | ≥50 (붕괴가 '개선'으로 읽히는 것 차단) |
| D-1 선언 밖 색 리터럴 | **fail** | **0** (백로그 청소 후 승격. 예외는 `design-lint-ignore` + DESIGN-TOKENS §12.1 등재) |
| D-2 미정의 토큰 참조 | **fail** | 0 |
| D-3 다크/라이트 페어 미충족 | warn | **0** (dead 21개 제거로 예외 소멸) |
| design-lint (프로토타입 HTML) | 보고 전용 | — |

**D-2가 fail인 이유**: 선언되지 않은 `var(--x)`는 브라우저가 **선언째 폐기**한다 — tsc·eslint·빌드가 전부 통과하고 스타일만 사라지는 무성 실패다. 실제로 `.panel-title`의 `--ff-display`가 v0.1.52까지 이 상태였다.

**design-lint에 `--gate`를 걸지 않는 이유**: `D-TYPE-07`이 `--fs-label`(11px, VS Code 네이티브 규격)에 상시 발화해 영원히 녹색이 될 수 없다. 게이트를 걸면 프로토타입을 고치는 방향으로 스코프가 샌다. `D-TOKEN-01`도 상시 잔존 대상이다 — harvest가 spacing과 font-size/border-width를 구분하지 않는 flat 집합이라, 0으로 스냅하면 정리가 아니라 왜곡이다(DESIGN-TOKENS.md §13.1). 기준선 **error 6 · warn 29**(v0.2.3 재확인, `--token-source src/webview/styles.css` 기준 — 플래그가 바뀌면 숫자도 바뀐다). v0.2.0에서 프로토타입이 1개 늘며 error가 9로 올랐던 것을 v0.2.3이 기준선으로 되돌렸다 — 드리프트한 색 리터럴 2종(`#93C5FD`·`#FCD34D`)을 `--fg-sonnet`·`--fg-warn`으로 치환. **솔리드 `--c-*`가 아니라 `--fg-*`인 이유**: 같은 hue의 틴트 배경 위에 솔리드 액센트를 전경으로 올리면 대비가 무너진다(실측 — `.scope-toggle button.active`가 2.96:1). `--fg-*`는 6.62:1이다. 남은 error 6은 전부 D-TOKEN-01·D-TYPE-07 — §13.1의 상시 잔존 대상이다.

⚠️ **`design-lint-ignore` 주석은 프로토타입 HTML에서 동작하지 않는다** — 이 마커는 `--tokens`/`--token-source`가 가리키는 토큰 소스 문서의 harvest 줄 필터 전용이다. §3#5의 `design-lint-ignore` 예외는 `verify.sh` D-1(`styles.css`) 컨벤션이며 별개 메커니즘이다.

⚠️ **(구 `--tokens` 경로 한정, 현재 미사용) DESIGN-TOKENS.md에 위반 사례를 hex/px 값으로 적지 말 것** — 문서 전체를 정규식으로 긁는 unstructured harvest라 위반값을 적으면 탐지기가 삼켜 눈이 먼다(실측: error 9→6, `80px`·`9px` 재발). v0.1.53부터 `--token-source`(실 선언 harvest)로 전환해 이 문서 문구는 더 이상 허용집합에 영향을 주지 않지만, 설명 기술 관행은 유지한다(§13.1).

### 신규 토큰 추가 시

1. `.theme-dark`·`.theme-light` **양쪽에** 선언 (§11.2 — 예외는 §12.2에 사유와 함께 등재)
2. `DESIGN-TOKENS.md` 해당 표에 동시 기재
3. 액센트라면 7+1 cap 확인 (§3#6). **Fable 솔리드가 필요하면 `--c-fable: #E0529C;`를 되살린다** — 하드코딩 금지(DESIGN-TOKENS §12.2)
4. `bash verify.sh --full`로 D-1~3 통과 확인
