# Claudepulse — 프로젝트 운영 규칙

## 0. 프로젝트 정체성

Claude Code 사용량을 IDE 안에서 실시간으로 시각화하는 VS Code Extension.
ccusage(★14k CLI)의 데이터 정확성 + Claudemeter의 실시간성 - 비공개 API 위험 + IDE 컨텍스트 통합.

## 1. Ground Truth 문서

본 프로젝트의 모든 코드 결정은 다음 문서를 우선한다:

| 문서 | 역할 |
|---|---|
| `docs/research/RESEARCH-claude-usage-dashboard-2026-05-10.md` | 시장·기술·UX 사전 리서치 |
| `docs/design/UX-BRIEF.md` | 화면 맵·스토리보드·구현 원칙 |
| `docs/design/DESIGN-TOKENS.md` | 색·폰트·스페이싱 토큰 (변경 시 styles.css 동기화) |
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
5. **하드코딩 색상 0개** — `var(--vscode-*)` 또는 `var(--c-opus|sonnet|haiku|warn|danger|slate)` 토큰만
6. **5+1 액센트 cap** — 새 색 추가 시 합의 필수
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
