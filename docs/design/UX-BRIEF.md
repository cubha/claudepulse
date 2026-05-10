# UX Brief — Clausight (Claude Code Usage Dashboard)

> 생성일: 2026-05-10
> 기반 입력: `docs/research/RESEARCH-claude-usage-dashboard-2026-05-10.md` + Claude Design 핸드오프 번들 (`docs/design/handoff/`)
> 소스: `--source=handoff` (Claude Design 채택)
> 톤/컨셉: VS Code 네이티브 일체감 + Tremor·Vercel·Linear 톤의 모던 데이터 대시보드

---

## 1. 프로젝트 UX 컨텍스트

### 1.1 한 줄 정의
ccusage CLI를 IDE 안으로 가져온 대시보드. 현재 워크스페이스가 어느 Claude 세션에서 얼마를 쓰고 있는지 실시간으로 보여준다.

### 1.2 타겟 사용자
- Claude Code (Pro/Max) **헤비 유저** — 일 5h 윈도우를 자주 소진
- **비용 의식** 있는 개발자 — MTD 비용을 자주 확인
- **프리랜서·팀 리더** — 프로젝트별 분배가 청구·정산에 직결

### 1.3 핵심 인터랙션
- **At-a-glance** (초고빈도, 0.5초 이내): 오늘 토큰·비용·5h 잔여
- **요약 탐색** (중빈도, 5초): 프로젝트별 분포·델타
- **Deep dive** (저빈도, 30초+): 세션 드릴다운·30일 트렌드·히트맵

### 1.4 디자인 원칙 (compile from research)
1. **VS Code 네이티브 일체감** — 외부 SaaS 톤은 실패. 사용자가 VS Code 기본 기능으로 착각하도록
2. **3중 정보 위계** — StatusBar(상시) → Sidebar(요약) → Panel(상세)
3. **모델 식별 컬러 일관성** — Opus violet · Sonnet blue · Haiku teal (5+1색 cap)
4. **무료 데이터만** — `~/.claude/projects/**/*.jsonl` 단일 소스, 비공개 API·외부 SaaS 0
5. **워크스페이스 자동 매핑** — IDE 독점 차별점 (CLI 도구는 구조적으로 불가)

---

## 2. 화면 맵

```
[VS Code Window]
   │
   ├─ Layer 1 · StatusBar (상시 표시)
   │     └─ click → Layer 3 오픈
   │
   ├─ Layer 2 · Sidebar Webview View (좌측 액티비티 바, 280px)
   │     ├─ KPI 4-카드
   │     ├─ 5h Window
   │     ├─ Top Projects
   │     └─ "Open full dashboard" → Layer 3 오픈
   │
   └─ Layer 3 · Webview Panel (에디터 탭)
         ├─ Overview ← 기본
         ├─ Charts        (V1.x)
         ├─ Heatmap       (V1.x)
         ├─ Sessions
         │     └─ 행 클릭 → 우측 380px Drilldown
         └─ Settings      (V2)
```

**MVP 기준 5개 아트보드** (디자인 핸드오프 채택):

| # | 화면 | 우선순위 | 핸드오프 위치 |
|---|---|---|---|
| 01 | StatusBar (zoomed slice) | P0 | `screen-statusbar.jsx` |
| 02 | Sidebar Webview View — Dark | P0 | `screen-sidebar.jsx` (theme=dark) |
| 03 | Sidebar Webview View — Light | P0 | `screen-sidebar.jsx` (theme=light) |
| 04 | Panel · Overview · Dark | P0 | `screen-overview.jsx` |
| 05 | Panel · Sessions · Dark | P0 | `screen-sessions.jsx` |
| (Foundation) | Design Tokens | reference | `screen-tokens.jsx` |

---

## 3. 영역별 스토리보드

### 3.1 Layer 1 · StatusBar

| 영역 | 목적 | 사용자 행동 | 데이터 | 인터랙션 | 우선순위 |
|---|---|---|---|---|---|
| **Item Pill** | 상시 비용·토큰 노출 | 글랜스 (0.5초) | `오늘 토큰` + `세션 비용` + live dot | hover → tooltip · click → Panel | 1 |
| **Hover Tooltip** | 4개 핵심 지표 즉시 확인 | 마우스 머무름 | Today / Active session(model+dur) / 5h window / MTD | 단축키 안내 (`⌘⇧U`) | 2 |

### 3.2 Layer 2 · Sidebar Webview View (280px)

| 영역 | 목적 | 사용자 행동 | 데이터 | 인터랙션 | 우선순위 |
|---|---|---|---|---|---|
| **헤더 (Clausight + refresh)** | 정체성·수동 갱신 | 갱신 클릭 | 라벨 only | refresh / kebab(설정) | 3 |
| **Today KPI 2×2** | 오늘 핵심 지표 4개 | 글랜스 (1-2초) | Tokens · Session $ · Month $ · Sessions count + 각 delta % | (hover만) | 1 |
| **5h Window Card** | 빌링 윈도우 잔여 | 글랜스 + 시각 확인 | % 잔여 · 리셋 시각 · 시작-종료 시각 · gradient progress | (read-only) | 1 |
| **Top Projects (3)** | 어디에 토큰 쓰고 있나 | 스캔 + 현재 프로젝트 식별 | 프로젝트명 · 토큰 · 비용 · sparkline · 현재 워크스페이스 표시 | row hover · click → Panel sessions filter | 2 |
| **Footer CTA** | Panel 진입 + 설정 | 클릭 | "Open full dashboard" + gear | → Panel / Settings | 2 |

### 3.3 Layer 3 · Webview Panel — Overview Tab

| 영역 | 목적 | 사용자 행동 | 데이터 | 인터랙션 | 우선순위 |
|---|---|---|---|---|---|
| **Tab strip + 좌측 vtab** | 패널 네비게이션 | 탭 전환 | Overview/Charts/Heatmap/Sessions/Settings | click | 2 |
| **Live Status Footer** | 트래킹 상태 확인 | 글랜스 | Live dot · 활성 모델 · jsonl 경로 · event count | (read-only) | 3 |
| **Toolbar** | 범위·필터 조정 | 클릭 | 화면 타이틀 · 현재 워크스페이스 chip · range picker (Today/7d/30d/90d/MTD) · model filter · export | range click · filter open · export | 1 |
| **KPI 4-카드** | 핵심 지표 + sparkline | 글랜스 + 추세 인지 | Tokens(in/out/cache 분류 sub) · MTD(projected sub) · Sessions 30d(avg dur sub) · 5h Window(progress) | (hover tooltip 후속) | 1 |
| **Trend Card (60% 폭)** | 30일 stacked area | 트렌드 분석 + 모델별 비중 | Opus/Sonnet/Haiku stacked, hover crosshair + 일별 분해 tooltip | hover crosshair | 1 |
| **Donut Card (40% 폭)** | 프로젝트 분포 | share 파악 | 프로젝트별 % + 컬러 dot legend + 중앙 총합 | hover segment highlight | 2 |
| **Heatmap Card** | 12주 일별 활동 | 패턴 인지 (요일·연속성) | 12×7 cells (0-4 quartile) · active days · peak day | hover cell tooltip | 2 |
| **Recent Sessions Card** | 최근 6개 세션 미리보기 | 스캔 → "View all" | project · model badge · tokens · cost · started | row click → Sessions tab + 드릴다운 | 2 |

### 3.4 Layer 3 · Webview Panel — Sessions Tab

| 영역 | 목적 | 사용자 행동 | 데이터 | 인터랙션 | 우선순위 |
|---|---|---|---|---|---|
| **Toolbar** | 검색·필터·내보내기 | 입력·클릭 | 총 세션 수 chip · 검색 input · "3 filters" 버튼 · Export CSV | 검색 typing · filter modal · CSV export | 1 |
| **Filter Bar (chip)** | 활성 필터 시각화 | chip × 클릭 제거 | Range · Model · Project · Cost ≥ chip + "Add filter" | chip remove · add filter | 2 |
| **Sessions Table** | 전체 세션 정렬·선택 | 정렬·행 선택 | status dot · started · duration · project · model badge · msgs · input · output · cache · cost | 행 click → 드릴다운 · 헤더 click → 정렬 | 1 |
| **Pagination Footer** | 페이지 이동 | prev/next 클릭 | "10 of 247" · "1 / 25" | prev · next | 3 |
| **Drilldown (380px right)** | 선택 세션 상세 | 스크롤 + 액션 | total cost($/msg) · total tokens · breakdown bar(in/out/cache) · activity sparkline · files touched · "Open transcript" | scroll · "Copy ID" · "Open transcript" → external | 1 |

---

## 4. 핵심 사용자 플로우 (해피 패스)

### Flow A: "지금 비용 얼마지?" (At-a-glance, 빈도 ★★★★★)
```
[StatusBar item 글랜스] → 끝 (0.5초)
   └─ 더 보고 싶으면 hover → tooltip (4지표) → 끝 (3초)
```

### Flow B: "5h 윈도우 얼마 남았지?" (빈도 ★★★★)
```
[Sidebar 열림 — 항상 좌측에 있음]
   → "5h Window" 카드 글랜스 (% + 리셋 시각) → 끝 (2초)
```

### Flow C: "이번 달 어느 프로젝트에 제일 많이 썼지?" (빈도 ★★★)
```
[Sidebar Top Projects 3개 스캔]
   → 4번째 이하 궁금 → "Open full dashboard" 클릭
   → Panel Overview · Donut Card 보고 분포 파악
   → 특정 프로젝트 segment hover → tooltip 상세
```

### Flow D: "어제 그 비싼 세션이 뭐였지?" (빈도 ★★)
```
[Panel Overview · Recent Sessions 카드]
   → 어제 row 발견 → click
   → Sessions tab 자동 전환 + 해당 행 선택 + Drilldown 열림
   → cost / token breakdown / files touched 확인
   → "Open transcript" 클릭 → 외부에서 raw 확인
```

### Flow E: "임계값 넘기 직전 알림" (빈도 ★ — 자동 트리거, V1.x)
```
[Background 감시] → MTD 비용 임계값 도달 감지
   → vscode.window.showWarningMessage 팝업
   → "View dashboard" CTA → Panel Overview 자동 오픈
```

---

## 5. 프로토타입 링크

### 5.1 단일 캔버스 (모든 화면 통합)
- **`docs/design/prototype/00-clausight-canvas.html`** — 브라우저로 직접 열어 5개 아트보드 동시 확인

### 5.2 화면별 React 모듈 (구현 시 변환 참조)
| 파일 | 화면 |
|---|---|
| `docs/design/prototype/screen-statusbar.jsx` | StatusBar |
| `docs/design/prototype/screen-sidebar.jsx` | Sidebar (theme prop으로 dark/light) |
| `docs/design/prototype/screen-overview.jsx` | Panel · Overview |
| `docs/design/prototype/screen-sessions.jsx` | Panel · Sessions (drilldown 포함) |
| `docs/design/prototype/screen-tokens.jsx` | Foundation (참조용) |
| `docs/design/prototype/shared.jsx` | mock data + inline SVG 차트 (Sparkline · AreaTrend · Donut · Heatmap) |
| `docs/design/prototype/styles.css` | VS Code CSS 변수 + 컴포넌트 클래스 |

### 5.3 핸드오프 원본 보존
- `docs/design/handoff/` — Claude Design export 번들 원본 (편집 금지)

### 5.4 사용 방법
```
# 브라우저로 직접 확인
xdg-open docs/design/prototype/00-clausight-canvas.html  # Linux
open docs/design/prototype/00-clausight-canvas.html      # macOS
start docs/design/prototype/00-clausight-canvas.html     # Windows

# 또는 간이 서버
npx serve docs/design/prototype
```

---

## 6. 디자인 토큰 요약

> 전체 토큰 정의: **`docs/design/DESIGN-TOKENS.md`**

핵심 운영 원칙 4가지:

1. 모든 표면은 `var(--vscode-*)` — 하드코딩 색상 0개
2. 액센트(`--c-opus/sonnet/haiku/warn/danger/slate`)는 **모델·상태 식별 전용**, 페이지 배경·본문 텍스트 금지
3. 다크/라이트는 `.theme-dark` / `.theme-light` 컨테이너 토글
4. 시스템 폰트만 (`--ff-sans`, `--ff-mono`), 외부 폰트 임포트 금지

| 카테고리 | 토큰 수 | 비고 |
|---|---|---|
| Theme color (dark+light pair) | 20개 | VS Code 변수 매핑 |
| Heatmap scale | 5단계 × 2테마 | quartile |
| Brand accent | 6개 (5+1) | cap 엄수 |
| Typography scale | 6단계 | sans + mono 조합 |
| Spacing | 8단계 (4px 그리드) | sp-1~sp-10 |
| Radius | 3단계 + pill | sm/md/lg |

---

## 7. 구현 시 준수 원칙 (Ground Truth)

`/init-project` · `/sh-dev-loop` · `/team-dev` · `/frontend-design` 모든 후속 단계가 본 문서를 truth로 삼는다.

### 7.1 Tokens
- 프로토타입 `styles.css`의 토큰 값을 그대로 채택 — 임의 컬러·스페이싱·라운드 추가 금지
- 새 토큰 필요 시 `DESIGN-TOKENS.md`에 먼저 정의 → 다크/라이트 페어 의무

### 7.2 Layout 위계
- StatusBar → Sidebar → Panel 3중 구조 유지
- Sidebar는 280px 폭 유지 (사용자가 늘리면 KPI 카드 그리드만 확장, 로직 분기 X)
- Panel은 좌측 168px vtab + 우측 content area 고정

### 7.3 Component 재사용
프로토타입의 클래스명·구조 유지 — 동일 클래스로 구현하면 VS Code 테마 자동 적응 보장:
- `.card` / `.card-flat` / `.kpi-label` / `.kpi-value` / `.kpi-delta`
- `.btn-primary` / `.btn-ghost` / `.chip` / `.badge.{opus|sonnet|haiku}`
- `.vtab` / `.tbl` / `.tooltip` / `.search` / `.progress` / `.heat-cell`

### 7.4 차트 구현
- 프로토타입은 inline SVG 직접 작성 (외부 의존 0)
- 실제 구현은 Chart.js 채택 권장 (RESEARCH 결정), 단 inline SVG 패턴도 허용 (sparkline·heatmap은 SVG가 단순)
- 색상은 항상 CSS 변수 참조 (`var(--c-sonnet)` 등) — 차트 라이브러리 옵션에 직접 hex 박지 말 것

### 7.5 Iconography
- Codicons만 사용 (`@vscode/codicons` npm)
- 사용 셋(약 24개)은 DESIGN-TOKENS.md §9 참조
- 외부 SVG 아이콘 추가 금지

### 7.6 Accessibility 필수
- 키보드 네비게이션: Tab/Enter/Arrow — Webview 내부도 동일
- ARIA: KPI 카드 `aria-label="오늘 토큰: 124,300"` 식 명시
- 차트: `role="img"` + 요약 텍스트 alt
- 색상만으로 정보 전달 금지 (delta는 ▲▼ 화살표 + 색상 병행 — 이미 적용됨)
- 포커스: `var(--vscode-focusBorder)` 2px outline, 커스텀 outline 제거 금지

### 7.7 임의 변경 금지 사항
- 5+1 액센트 cap 초과 (새 색 추가 시 합의 필수)
- elevation `box-shadow` (Tooltip 외)
- `unsafe-eval` 의존 차트 라이브러리
- 외부 폰트 임포트 (Inter / Roboto / Geist 등)
- `translateY`/`scale` animation (opacity만 허용)

---

## 8. 의도적으로 빠진 것 (V2+)

본 브리프에서는 다루지 않는다 — 별도 ui-plan 라운드 필요:

- **Settings 화면** — 임계값·갱신 주기·표시 항목 토글
- **임계값 알림 모달** — 디자인 톤 결정 필요
- **온보딩 플로우** — 첫 설치 시 권한 안내·jsonl 경로 확인
- **팀 집계 화면** — 멀티 인스턴스 (V2)
- **Files touched (Drilldown 일부)** — 디자인은 있으나 jsonl 깊은 파싱 부담 → 첫 출시 제외 권장
- **Charts 단독 탭 / Heatmap 단독 탭** — Overview에 이미 포함, 단독 탭은 V1.x 확장 시

---

## 9. 다음 단계

```
[현재] /ui-plan --source=handoff 완료
   ↓
[다음] /init-project
       └ 권장 스택: Node.js + TypeScript + esbuild + Chart.js + chokidar + vsce/ovsx
       └ DESIGN-TOKENS.md → src/webview/styles.css 자동 주입
   ↓
[그 다음] /plan
       └ MVP SubTask 분해 (jsonl 파서 / 와처 / StatusBar / Sidebar / Panel / 워크스페이스 매핑 / 임계값 알림)
   ↓
[구현] /sh-dev-loop 또는 /team-dev
       └ 본 UX-BRIEF + DESIGN-TOKENS를 truth로 사용
```

---

## 부록: 갱신 이력

| 날짜 | 변경 | 비고 |
|---|---|---|
| 2026-05-10 | 최초 작성 | Claude Design 핸드오프 채택, RESEARCH 보고서 통합 |
