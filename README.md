# Claudepulse

> Claude Code 사용량을 IDE 안에서 실시간으로 시각화하는 대시보드 (VS Code · Cursor).

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-cubha.claudepulse-blue)](https://marketplace.visualstudio.com/items?itemName=cubha.claudepulse)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-cubha.claudepulse-purple)](https://open-vsx.org/extension/cubha/claudepulse)

ccusage(★14k CLI)의 데이터 정확성 + 실시간 watch — claude.ai 비공개 API 회피, IDE 컨텍스트(현재 워크스페이스) 자동 매핑.

## 핵심 기능

- **At-a-glance**: StatusBar에 오늘 토큰·세션 비용 상시 표시
- **Sidebar Webview View**: 오늘 KPI 4-카드 + 5h 빌링 윈도우 + Top 프로젝트
- **Webview Panel**: 30일 토큰 트렌드 (Opus/Sonnet/Haiku stacked) + 프로젝트 분포 도넛 + 12주 히트맵 + 세션 드릴다운
- **워크스페이스 자동 매핑**: 현재 작업 중인 프로젝트의 비용을 자동 계산
- **인-에디터 임계값 알림**: 월 누적 비용 임계값 초과 시 VS Code 네이티브 알림
- **장기 영구 보관**: jsonl 30일 롤링 윈도우 한계를 자체 캐시로 보완

## 데이터 소스

`~/.claude/projects/**/*.jsonl` 로컬 파일 직접 파싱. **외부 API 호출 0회 · 추가 결제 0원 · 100% 오프라인**.

## 요구사항

- VS Code `^1.85.0` 또는 Cursor 최신
- Claude Code 설치 + `~/.claude/projects/` 디렉토리 존재

## 설치

VS Code Marketplace · Open VSX에서 "Claudepulse" 검색.

## 명령

| Command | 설명 |
|---|---|
| `Claudepulse: Open Dashboard` | Webview Panel 오픈 |
| `Claudepulse: Refresh` | 강제 재집계 |

## 설정

`Settings → Claudepulse`:
- `claudepulse.claudeProjectsPath`: `~/.claude/projects` 경로 오버라이드
- `claudepulse.costAlertThresholdUsd`: MTD 비용 알림 임계값 (USD)
- `claudepulse.refreshDebounceMs`: 파일 와처 디바운스 (ms)

## 개발

```bash
npm install
npm run watch     # 빌드 watch
# F5로 Extension Development Host 실행
```

## 기술 스택

- **언어/빌드**: TypeScript 5.x · esbuild · `tsc --noEmit`
- **파일 감시**: chokidar (`vscode.workspace.createFileSystemWatcher`는 `~/.claude` 외부 경로 감시 불가 — HARD)
- **차트**: Chart.js (~60KB, Webview CSP 안전)
- **UI**: WebviewViewProvider + StatusBarItem + WebviewPanel 3중
- **RPC**: vscode-messenger (TypeFox, 타입 안전)
- **저장**: globalStorageUri JSON 인덱스 (10만+ 누적 시 SQLite 마이그)
- **가격**: LiteLLM 가격 스냅샷 임베드 (오프라인 USD 환산)
- **배포**: vsce + ovsx 동시 (Cursor 호환을 위해 Open VSX 필수)

## 개발 로드맵

| 단계 | 상태 |
|---|---|
| `/init-project` (스캐폴딩 + 보일러플레이트) | ✅ 완료 (2026-05-10) |
| `/plan` (MVP 10 SubTask + Wave 1~6 DAG) | ✅ 완료 (2026-05-10) |
| Wave 1 — MVP-1 Parser + MVP-2 Watcher | ✅ 완료 (2026-05-10) |
| Wave 2 — MVP-3 UsageAggregator | ✅ 완료 (2026-05-10) |
| Wave 3 — MVP-4 Orchestrator + StatusBar | ✅ 완료 (2026-05-10) |
| Wave 4 — MVP-5 Sidebar + MVP-6 Panel + MVP-7 WSMap + MVP-8 Alert | ✅ 완료 (2026-05-10) |
| Wave 5 — MVP-9 Sessions 탭 + Drilldown | ✅ 완료 (2026-05-10) |
| Wave 6 — MVP-10 vitest 단위 테스트 (19 cases) | ✅ 완료 (2026-05-10) |
| `/ship` (vsce + ovsx 배포) | 🔜 다음 |

전체 SubTask·의존성·DoD: **[`docs/PLAN-MVP-2026-05-10.md`](./docs/PLAN-MVP-2026-05-10.md)**

```
Wave 1 (병렬) ─ MVP-1 Parser   + MVP-2 Watcher          ✅
Wave 2        ─ MVP-3 Aggregator                          ✅
Wave 3        ─ MVP-4 Orchestrator + StatusBar            ✅  ← 단일 통합 지점
Wave 4 (병렬) ─ MVP-5 Sidebar + MVP-6 Panel + MVP-7 WSMap + MVP-8 Alert  ✅
Wave 5        ─ MVP-9 Sessions + Drilldown                ✅
Wave 6 (병렬) ─ MVP-10 Tests (vitest 19 cases, verify.sh 10/10)          ✅
```

## CRITICAL 원칙 (`CLAUDE.md §3`)

위반 시 즉시 차단:

1. `message.id` dedup 필수 — 누락 시 billing 불일치 (Claude Code는 스트리밍 중 동일 응답을 jsonl에 여러 번 기록)
2. `vscode.workspace.createFileSystemWatcher` 금지 — 외부 경로 감시 불가, chokidar 필수
3. claude.ai 비공개 HTTP API 사용 금지 — 즉시 중단 위험, jsonl 직접 파싱만
4. `unsafe-eval` 의존 차트 라이브러리 금지 — Webview CSP 위배 (Recharts/Tremor 제외)
5. 하드코딩 색상 0개 — `var(--vscode-*)` / `var(--c-opus|sonnet|haiku|warn|danger|slate)` 토큰만
6. 5+1 액센트 cap — 새 색 추가 시 합의 필수
7. 외부 폰트 임포트 금지 — 시스템 폰트만

## 변경 이력

- **2026-05-10** — MVP-1~10 전체 구현 완료. jsonl 증분 파서(dedup), chokidar 와처, UsageAggregator(today/MTD/5h Window/Sessions), Orchestrator, Sidebar/Panel Chart.js(stacked area·donut·drilldown), WorkspaceMapper, 임계값 알림, vitest 19 케이스 — verify.sh 10/10 PASS
- **2026-05-10** — `/plan` 완료. MVP 10 SubTask + Wave 1~6 DAG 정의 (`docs/PLAN-MVP-2026-05-10.md`)
- **2026-05-10** — Minimal wiring: Sidebar/StatusBar/Panel placeholder 렌더링, F5 Extension Development Host 검증
- **2026-05-10** — `/init-project` 완료: TS + esbuild + chokidar + Chart.js + WebviewViewProvider/Panel/StatusBar 3중 스택 채택, GitHub `cubha/claudepulse` public

## 라이선스

MIT — [LICENSE](./LICENSE)
