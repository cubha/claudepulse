# Claude Code Usage Dashboard IDE Extension — 사전 리서치 보고서

- **작성일**: 2026-05-10
- **조사 범위**: 유사 시스템 / 필수 기능 / 차별화 포인트 / UI 형식
- **참여 에이전트**: market-researcher · tech-researcher · architecture-researcher · ux-researcher (4명, --deep 모드)

---

## 0. Executive Summary

> **시장은 이미 포화 상태다.** VS Code Marketplace에 8개 이상의 유사 익스텐션이 존재하고, ccusage(CLI, ★14k)는 사실상 표준이다. 그럼에도 **"IDE 컨텍스트 인지" + "안정적 영구 저장" + "프로젝트별 인사이트"**를 동시에 충족하는 도구는 아직 없다 — 이 화이트스페이스가 진입 명분이다.

**핵심 결정 3가지 (의사결정 필요)**
1. 데이터 소스: **`~/.claude/projects/**/*.jsonl` 직접 파싱** (claude usage CLI 서브커맨드는 공식 미존재 — Issue #33978에서 feature request 단계)
2. UI 형식: **3중 구조** = StatusBar(상시) + Sidebar Webview View(요약) + Webview Panel(상세 대시보드)
3. 차별화: **"현재 워크스페이스와 Claude 세션 자동 매핑"** — CLI 도구가 구조적으로 못 하는 IDE 독점 기능

---

## 1. 유사 시스템 / 경쟁 제품 (market-researcher)

### 1.1 CLI / 데스크탑 도구

| 도구 | 타입 | Stars | 핵심 | 한계 |
|---|---|---|---|---|
| **ccusage** (ryoppippi) | CLI Node.js | 14k+ | 일/월/세션 리포트, 5h 빌링 블록, MCP 서버 | IDE 통합 없음 |
| **Claude-Code-Usage-Monitor** (Maciek-roboblog) | CLI Python | 8k+ | ML 기반 P90 한계 예측, Rich TUI | IDE 통합 없음, Python 환경 |
| **CCSeva** | macOS 메뉴바 앱 | 790 | 7일 차트, 70/90% 알림 | macOS 전용 |
| **phuryn/claude-usage** | 로컬 웹 대시보드 | 1.5k | Chart.js + SQLite, 30s 폴링 | 실시간성 약함 |

### 1.2 VS Code Marketplace 익스텐션 (현존 5종)

| 익스텐션 | 설치수 | 평점 | UI 형식 | 한계 |
|---|---|---|---|---|
| **ccusage-vscode** (suzuki0430) | **4,247** | 평가 없음 | StatusBar + 클릭 테이블 | 기능 단순, ccusage 의존 |
| **Claudemeter** (hypersec) | 2,183 | ★★★★★ | StatusBar 3모드 | 비공개 Claude.ai HTTP API 의존 (취약) |
| **Claude Token Monitor** (Wilendar) | 883 | ★☆☆☆☆ | Sidebar 패널 | Windows 전용, ccusage 필수 |
| **Claude Usage Analytics** | 603 | 평가 없음 | StatusBar + 4탭 대시보드 | 검증 미흡 |
| **Clusage** | 247 | 평가 없음 | StatusBar + 다크 대시보드 | 신뢰도 낮음, 설치 매우 적음 |

### 1.3 비교 참조군 (타 LLM 도구)

- **Cursor**: Settings → Usage 패널, 팀 어낼리틱스 대시보드 (Enterprise)
- **GitHub Copilot**: StatusBar 클릭 → billing.github.com, 75/90/100% 이메일 알림
- **WakaTime**: StatusBar + 외부 웹 대시보드 (인-에디터 대시보드 없음 — 차별 기회)
- **Cline / Roo Code**: 태스크 루프 내 인라인 비용 표시

### 1.4 시장 트렌드 5가지

1. **CLI 포화 → IDE 통합으로 이동 중** (Anthropic 공식 Issue #33978, #27663에서 IDE 대시보드 요구 증가)
2. **비공개 API 의존 위험** (Claudemeter처럼 Claude.ai 쿠키 스크래핑은 즉시 중단 위험 — JSONL 로컬이 안전판)
3. **프로젝트별 분리 수요 급증** (팀 리더·프리랜서 니즈)
4. **장기 이력 보관 공백** (Claude Code JSONL은 30일 롤링 윈도우 이슈)
5. **실시간성 요구** (30s 폴링 불만 — ccusage statusline OOM 버그 #455)

---

## 2. 필수 기능 항목 (종합)

### 2.1 Must-have (MVP)

| 카테고리 | 기능 | 근거 |
|---|---|---|
| 데이터 | 토큰 분류 (input/output/cache_creation/cache_read) | 모든 경쟁 도구 공통, 비용 정확도 필수 |
| 데이터 | 모델별 분류 (Opus/Sonnet/Haiku 4.x) | ccusage 표준 |
| 집계 | 일·주·월 누적 토큰 + USD | 모든 도구 공통 |
| 집계 | 5h 빌링 윈도우 잔여 | Claude Pro/Max 사용자 핵심 니즈 |
| 표시 | 오늘 토큰/비용 (At-a-glance) | StatusBar 적합 |
| 표시 | 프로젝트별 분포 | Sidebar/Panel 적합 |

### 2.2 Should-have (차별화)

| 기능 | 근거 |
|---|---|
| 30일 시계열 트렌드 차트 | GitHub contribution graph 스타일 히트맵 |
| 임계값 초과 시 VS Code 네이티브 알림 | Copilot은 이메일만, 인-에디터 알림은 공백 |
| 세션 드릴다운 (프로젝트 → 세션 → 메시지) | Deep dive 사용자 |
| 영구 저장 (30일 이상) | JSONL 30일 롤링 한계 보완 |

### 2.3 Nice-to-have (V2+)

| 기능 | 근거 |
|---|---|
| 세션 ↔ Git 커밋 상관관계 | "비용 대비 생산성" 인사이트 — 미존재 영역 |
| 팀/멀티 인스턴스 집계 | Cursor Enterprise 기능의 OSS 대안 |
| MCP 서버 노출 | ccusage 패턴 따라 다른 도구에서 데이터 조회 가능 |

---

## 3. 차별화 포인트 TOP 5

> **포지셔닝**: "ccusage의 데이터 정확성 + Claudemeter의 실시간성 - 비공개 API 위험 + IDE 컨텍스트 통합"

| # | 차별점 | 왜 IDE Extension만 가능한가 |
|---|---|---|
| **1** | **워크스페이스 ↔ 세션 자동 매핑** | CLI는 현재 열린 폴더를 모름. `vscode.workspace.workspaceFolders`로 매핑 후 "지금 작업 중인 프로젝트의 이번 주 비용 $X" 표시 |
| **2** | **VS Code 네이티브 알림 (인-에디터)** | `vscode.window.showWarningMessage` — 임계값 초과 즉시 팝업. Copilot 이메일 알림 대비 즉시성 압도 |
| **3** | **장기 영구 보관 + 트렌드** | JSONL 30일 롤링을 SQLite/JSON 인덱스로 누적 — 6개월/1년 트렌드 가능 |
| **4** | **세션 ↔ Git 변경량 상관** | Git API와 결합 — "이 비용으로 N커밋, M파일 변경" — 현존 도구 0개 |
| **5** | **팀 집계 (선택적 공유)** | 여러 개발자 JSONL을 GitHub Gist/로컬 서버로 — Cursor Enterprise OSS 대안 |

> **주의**: 1, 2번은 MVP에 즉시 포함 가능. 3번은 데이터 모델 선결. 4, 5번은 V2+ 로드맵.

---

## 4. UI 형식 — 최종 권장: **3중 구조**

### 4.1 비교표

| UI | 적합도 | 역할 |
|---|---|---|
| **StatusBar Item** | ⭐⭐⭐ | 오늘 토큰/비용 상시 표시, 클릭 → Panel 오픈 |
| **Sidebar Webview View** | ⭐⭐⭐ | 요약 KPI (3카드) + 5h 잔여 + 프로젝트 Top 3 |
| **Webview Panel (탭)** | ⭐⭐⭐ | 상세 대시보드 (트렌드/히트맵/세션 테이블/드릴다운) |
| Sidebar TreeView | ⭐⭐ | 부적합 — 차트 불가, Webview View로 대체 |
| Output Channel | ⭐ | 부적합 — 텍스트 전용 |
| **Terminal Tab** | ⭐ | **부적합** — VS Code Extension에서 터미널 탭은 외부 프로세스 출력용. 대시보드 UI에 부적합 |

> **사용자가 "Terminal Tab" 후보를 언급했지만**: VS Code Terminal API는 PTY 또는 `vscode.window.createTerminal`로 외부 프로세스를 띄우는 용도다. ccusage CLI를 터미널에서 실행하는 것과 다를 바 없으므로 "시각적 업그레이드" 목표와 어긋난다 → **제외 권장**.

### 4.2 ASCII 와이어프레임

**StatusBar (항상 표시)**
```
[하단 상태바]  ... $(pulse) 124.3K  $(credit-card) $0.87  ...
                    └─ 클릭 시 Webview Panel 오픈
```

**Sidebar Webview View (요약, ~280px 폭)**
```
┌─────────────────────────────┐
│ CLAUDE USAGE          [↗]  │  ← Panel 열기
├─────────────────────────────┤
│ ┌──────────┐ ┌──────────┐  │
│ │ 오늘 토큰 │ │ 세션 비용│  │
│ │ 124.3K   │ │  $0.87  │  │
│ │ ▲12% ↑  │ │ ▲ $0.12 │  │
│ └──────────┘ └──────────┘  │
│ 5h 잔여  ████████░░ 78%    │
├─────────────────────────────┤
│ 프로젝트                    │
│  codebase-viz   43.2K tok  │
│  workspace      28.1K tok  │
│  openclaw        8.0K tok  │
│                 [전체 보기]  │
└─────────────────────────────┘
```

**Webview Panel (상세 대시보드)**
```
┌──────────────────────────────────────────────────────────┐
│ Claude Code Usage  [개요][차트][히트맵][세션][설정]       │
├──────────────────────────────────────────────────────────┤
│  오늘 토큰    이번 달 비용   세션 수    5h 잔여           │
│  124.3K       $18.40        47         78%               │
├──────────────────────────────────────────────────────────┤
│  30일 토큰 트렌드 (AreaChart)          프로젝트 분포     │
│  ╭────────────────────────╮           ╭────────╮        │
│  │    /\    /\/\          │           │  도넛  │        │
│  │   /  \  /    \___      │           │  차트  │        │
│  │__/    \/           ╰──│           ╰────────╯        │
│  ╰──────── 30일 ─────────╯                              │
├──────────────────────────────────────────────────────────┤
│  날짜별 사용 히트맵 (GitHub contribution 스타일)         │
│  Mo ░░▒░▓█▓▒░░░░▒▒▓▓█▓▓▒░░░░░░░▒▒▓▓                   │
│  Tu ░░░░░▒░░░▒▓▓█████▓▒░░░░▒▒▒▓▓▓▓                     │
└──────────────────────────────────────────────────────────┘
```

### 4.3 정보 아키텍처

```
[항상 보임]                    [의도적으로 열기]
StatusBar           Sidebar Webview View     Webview Panel
  ├ 오늘 토큰         ├ 오늘 KPI 카드 (3개)    ├ 30일 토큰 트렌드 (라인)
  ├ 세션 비용         ├ 5h window 잔여 %       ├ 프로젝트별 도넛 차트
  └ (클릭 → Panel)   ├ 프로젝트 Top 3 리스트  ├ 날짜별 히트맵
                     └ (버튼 → Panel 열기)    ├ 세션 테이블 (정렬/필터)
                                              └ 세션 드릴다운
```

---

## 5. 기술 스택 권장안 (tech + architecture)

### 5.1 권장 스택 1-page

```
데이터 소스:    ~/.claude/projects/**/*.jsonl 직접 파싱
              └ message.id로 dedup (필수 — 안 하면 billing 불일치)
              └ sessionId로 세션 그룹화
              └ usage.{input,output,cache_*}_tokens 집계
              └ LiteLLM 가격 스냅샷 임베드로 USD 환산

파일 와처:     chokidar (필수 — vscode.FileSystemWatcher는 워크스페이스
              외부 경로 감시 불가 — 하드 제약)

VS Code UI:   WebviewViewProvider (Sidebar 상시) + StatusBarItem +
              WebviewPanel (상세, 사용자 명시 오픈)

차트:         Chart.js (~60 KB, CSP 안전, 다크모드 내장) [1순위]
              ECharts (~300 KB 트리쉐이킹, 풍부) [2순위]

번들러:       esbuild + tsc --noEmit (타입 체크 분리)

배포:         vsce → VS Marketplace + ovsx → Open VSX (Cursor 필수)
              GitHub Actions 동시 배포

저장:         globalStorageUri + JSON (zero native deps) [MVP]
              SQLite better-sqlite3 [10만+ 레코드 시 마이그]

메시지패싱:   TypeFox vscode-messenger (타입 안전 RPC)
```

### 5.2 핵심 주의사항 (반드시 지킬 것)

> **🔴 CRITICAL: `message.id`로 dedup하지 않으면 billing 불일치 발생**
> Claude Code는 스트리밍 중 동일 assistant 응답을 여러 번 jsonl에 기록한다. ccusage·token-dashboard 모두 이 문제를 dedup으로 해결.

> **🔴 CRITICAL: `vscode.workspace.createFileSystemWatcher`는 워크스페이스 외부 경로 감시 불가**
> `~/.claude/projects/`는 항상 워크스페이스 외부 → chokidar 또는 Node `fs.watch` 필수. 이 결정으로 의존성 트리·번들 크기·플랫폼별 동작이 모두 결정됨.

> **⚠️ `claude usage` CLI 서브커맨드는 공식 미존재** (2026-05 기준, Issue #33978에서 feature request 단계). `/usage`·`/cost` 슬래시 커맨드만 세션 내부에서 동작. 따라서 데이터 소스는 jsonl 직접 파싱으로 가야 함.

> **⚠️ Cursor는 Open VSX로 마켓플레이스 전환 중 (2025)** — VS Marketplace + Open VSX 동시 배포 필수.

### 5.3 디렉토리 구조

```
src/
  extension.ts          # activate()/deactivate(), lazy init
  panel/
    DashboardPanel.ts   # WebviewPanel 단일 인스턴스
    webview/            # Vite 빌드 분리 (React/Svelte)
  services/
    FileWatcher.ts      # chokidar, debounce 300ms
    JsonlParser.ts      # readline 증분 파싱, mtime+offset
    UsageAggregator.ts  # 일/주/월 롤업, 비용 계산
    CacheStore.ts       # globalStorageUri JSON
  providers/
    SidebarViewProvider.ts # WebviewViewProvider
    StatusBarItem.ts
  utils/
    pricing.ts          # LiteLLM 스냅샷
    pathDecoder.ts      # ~/.claude/projects/<encoded> 디코딩
  types/
    index.ts
package.json            # activationEvents, contributes.views
```

### 5.4 데이터 흐름

```
activate() → onStartupFinished
  ├─ CacheStore.load()              (globalStorageUri/cache-v1.json)
  ├─ StatusBarItem.show()           (캐시 기준 즉시 표시)
  └─ FileWatcher.start()            (chokidar ~/.claude/projects/**/*.jsonl)
       └─ onChange → debounce 300ms
            └─ JsonlParser.incremental()  (mtime+offset, 신규 라인만)
                 └─ message.id dedup
                      └─ UsageAggregator.update()
                           └─ CacheStore.save()
                                └─ DashboardPanel.push()  (vscode-messenger)
```

---

## 6. 통합 권장안 (1-page)

### 1순위 조합 (MVP)

| 영역 | 결정 |
|---|---|
| **데이터 소스** | `~/.claude/projects/**/*.jsonl` 직접 파싱 |
| **파일 와처** | chokidar + 300ms debounce |
| **저장** | globalStorageUri JSON 인덱스 (mtime+offset 증분) |
| **UI** | StatusBar + Sidebar Webview View + Webview Panel (3중) |
| **차트** | Chart.js |
| **번들** | esbuild + tsc --noEmit |
| **배포** | vsce + ovsx 동시 |
| **차별화 1** | 워크스페이스 ↔ 세션 자동 매핑 |
| **차별화 2** | VS Code 네이티브 임계값 알림 |

### 2순위 대안

- **Anthropic Admin Usage/Cost API**: API 키 보유 사용자에게 추가 데이터 소스로 토글 제공 (Max 구독자에게는 적용 불가, 보조 옵션)
- **차트 ECharts**: 히트맵·산버스트 등 풍부 차트가 필요해지면 V2에서 교체
- **저장 SQLite**: 레코드 10만+ 또는 6개월 이상 영구 보관 시 마이그레이션

### 주의사항

1. **message.id dedup 필수** — 누락 시 billing 불일치 (CRITICAL)
2. **chokidar 의존** — `vscode.FileSystemWatcher`는 홈 디렉토리 감시 불가 (하드 제약)
3. **CSP 친화 차트만** — Chart.js/ECharts/uPlot ✅, Recharts/Tremor는 React 런타임 부담
4. **Cursor Open VSX 동시 배포** — VS Marketplace만으로는 Cursor 사용자 도달 불가 (2025 정책 변경)
5. **시장 포화 — 차별화 명확히** — 8개 익스텐션 중 4번째에 불과한 ccusage-vscode조차 4,247 설치. 단순 시각화만으로는 부족, "워크스페이스 매핑 + 인-에디터 알림 + 영구 저장" 트리오로 포지셔닝

---

## 7. 다음 단계 추천

1. **`/init-project`** — 본 보고서 권장안을 후보 기본값으로 프로젝트 스캐폴딩
2. **`/ui-plan`** — 3중 구조 와이어프레임을 HTML 프로토타입으로 구체화
3. **`/plan`** — Task/SubTask 분리 (예: `MVP-1: jsonl 파서`, `MVP-2: chokidar 와처`, `MVP-3: StatusBar`, `MVP-4: Sidebar View`, `MVP-5: Panel 차트`, `MVP-6: 워크스페이스 매핑`, `MVP-7: 임계값 알림`)
4. **명칭 결정** — `claude-usage-dashboard`, `clausight`, `ccdash` 등 후보. 마켓플레이스 검색 충돌 회피 권장

---

## 부록 A. 출처 (주요 레퍼런스)

### 경쟁 제품
- [ryoppippi/ccusage](https://github.com/ryoppippi/ccusage) · [DeepWiki 분석](https://deepwiki.com/ryoppippi/ccusage)
- [Maciek-roboblog/Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)
- [CCSeva](https://github.com/Iamshankhadeep/ccseva)
- VS Marketplace: [ccusage-vscode](https://marketplace.visualstudio.com/items?itemName=suzuki0430.ccusage-vscode), [Claudemeter](https://marketplace.visualstudio.com/items?itemName=hypersec.claudemeter), [Claude Token Monitor](https://marketplace.visualstudio.com/items?itemName=Wilendar.claude-usage-monitor)
- Anthropic Issues: [#33978 Built-in Usage Analytics](https://github.com/anthropics/claude-code/issues/33978), [#27663 Official dashboard](https://github.com/anthropics/claude-code/issues/27663)

### 기술 문서
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Bundling Guide](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events)
- [Cursor Open VSX 전환 공지](https://forum.cursor.com/t/extension-marketplace-changes-transition-to-openvsx/109138)
- [Anthropic Usage and Cost Admin API](https://docs.anthropic.com/en/api/usage-cost-api)
- [vscode FileSystemWatcher 외부 경로 이슈 #136725](https://github.com/microsoft/vscode/issues/136725)

### UX 가이드
- [VS Code Webview UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/webviews)
- [VS Code Views UX](https://code.visualstudio.com/api/ux-guidelines/views) · [Status Bar UX](https://code.visualstudio.com/api/ux-guidelines/status-bar) · [Sidebars UX](https://code.visualstudio.com/api/ux-guidelines/sidebars)
- [GitLens Side Bar 패턴](https://help.gitkraken.com/gitlens/side-bar/)
- [Tremor 대시보드 컴포넌트](https://www.tremor.so/)
- [microsoft/vscode-webview-ui-toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit)

### 참고 익스텐션 소스
- [wakatime/vscode-wakatime](https://github.com/wakatime/vscode-wakatime) — StatusBar 패턴
- [eamodio/vscode-gitlens](https://github.com/eamodio/vscode-gitlens) — Sidebar+Panel 조합
- [cline/cline](https://github.com/cline/cline) — Webview heavy 패턴
- [TypeFox/vscode-messenger](https://github.com/TypeFox/vscode-messenger) — 타입 안전 RPC
