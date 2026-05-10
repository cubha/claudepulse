# Design Tokens — Clausight

> 생성일: 2026-05-10
> 출처: Claude Design 핸드오프 번들 (`docs/design/handoff/styles.css`, `screen-tokens.jsx`)
> 적용 범위: VS Code Webview · Sidebar Webview View · StatusBar 일체

## 0. 토큰 운영 원칙

1. **VS Code CSS 변수 우선** — 모든 표면(background/foreground/border)은 `var(--vscode-*)`만 사용. 하드코딩 색상 0개 목표
2. **다크/라이트 자동 적응** — `.theme-dark` / `.theme-light` 컨테이너 클래스로 한 번에 토글
3. **액센트는 모델·상태 식별 전용** — 페이지 배경·본문 텍스트로 사용 금지 (5색 cap)
4. **WCAG AA 4.5:1** — 액센트 색상 모두 양 테마 카드 배경 대비 통과
5. **시스템 폰트만** — 외부 폰트 임포트 금지

---

## 1. Color · Theme Tokens (VS Code 변수 매핑)

다크/라이트 페어 — 한 행 = 같은 시맨틱 역할.

| Token | Role | Dark | Light |
|---|---|---|---|
| `--vscode-editor-background` | page background | `#1E1E1E` | `#FFFFFF` |
| `--vscode-card-background` | KPI · 차트 카드 | `#1F1F1F` | `#FBFBFB` |
| `--vscode-card-elevated` | 강조 카드 (hover) | `#232325` | `#F2F2F2` |
| `--vscode-sideBar-background` | 사이드바 · activity bar | `#181818` | `#F8F8F8` |
| `--vscode-titleBar-activeBackground` | 타이틀바 | `#1F1F1F` | `#DDDDDD` |
| `--vscode-statusBar-background` | StatusBar | `#181818` | `#F8F8F8` |
| `--vscode-panel-border` | 카드·divider | `#2D2D30` | `#E5E5E5` |
| `--vscode-divider` | 표 구분선 | `#2D2D30` | `#E5E5E5` |
| `--vscode-grid` | 차트 그리드 | `#2A2A2D` | `#ECECEC` |
| `--vscode-input-background` | input · search | `#2A2A2C` | `#FFFFFF` |
| `--vscode-input-border` | input border | `#3A3A3D` | `#D4D4D4` |
| `--vscode-button-background` | primary 버튼 | `#0E639C` | `#005FB8` |
| `--vscode-button-hoverBackground` | primary hover | `#1177BB` | `#0258A8` |
| `--vscode-list-hoverBackground` | row hover | `#2A2D2E` | `#EFEFEF` |
| `--vscode-list-activeSelectionBackground` | row 선택 | `#2C3E55` | `#DDECF7` |
| `--vscode-focusBorder` | 2px 포커스 outline | `#007FD4` | `#005FB8` |
| `--vscode-foreground` | 본문 텍스트 | `#CCCCCC` | `#3C3C3C` |
| `--vscode-descriptionForeground` | muted · label | `#9D9D9D` | `#6E6E6E` |
| `--vscode-disabledForeground` | 비활성 | `#6B6B6B` | `#A0A0A0` |
| `--vscode-textLink-foreground` | 링크 | `#3794FF` | `#005FB8` |

### Heatmap Scale (5단계, 양 테마)

| Token | Dark | Light | 의미 |
|---|---|---|---|
| `--heat-0` | `#1B1B1D` | `#EDEDED` | 비활성 |
| `--heat-1` | `#1F2937` | `#DBE7F5` | 1Q |
| `--heat-2` | `#1E3A5F` | `#B5D0EC` | 2Q |
| `--heat-3` | `#1D5B95` | `#6FA9DC` | 3Q |
| `--heat-4` | `#2B85D6` | `#2B7ACA` | 피크 |

> 단계 분류는 표시 윈도우의 quartile로 산출 — 절대값 임계 X.

### Tooltip

| Token | Dark | Light |
|---|---|---|
| `--tooltip-bg` | `#2A2A2D` | `#FFFFFF` |
| `--tooltip-border` | `#3A3A3D` | `#D4D4D4` |

---

## 2. Color · Brand Accent (5+1색 cap)

페이지 배경·본문 텍스트로 절대 사용 금지. 모델 식별 + 상태 강조 전용.

| Token | Hex | 용도 |
|---|---|---|
| `--c-opus` | `#8B5CF6` | Opus 모델 식별 (violet) |
| `--c-sonnet` | `#3B82F6` | Sonnet 모델 식별 (blue) — primary brand |
| `--c-haiku` | `#14B8A6` | Haiku 모델 식별 (teal) |
| `--c-warn` | `#F59E0B` | 비용 경고 (amber) |
| `--c-danger` | `#F43F5E` | 한도 초과 · 에러 (rose) |
| `--c-slate` | `#64748B` | 중립 데이터 |

**파생 변형**

| 사용처 | 패턴 | 예 |
|---|---|---|
| 진행률 바 | linear-gradient | `linear-gradient(90deg, var(--c-sonnet), var(--c-opus))` |
| Badge bg (dark) | rgba 14% | `rgba(139,92,246,0.14)` (Opus) |
| Badge fg (dark) | tint-300 | `#C4B5FD` (Opus) / `#93C5FD` (Sonnet) / `#5EEAD4` (Haiku) |
| Badge bg (light) | rgba 10% | `rgba(139,92,246,0.10)` |
| Badge fg (light) | shade-700 | `#6D28D9` / `#1D4ED8` / `#0F766E` |
| Live dot | solid + glow | `#22C55E` + `box-shadow 0 0 0 2px rgba(34,197,94,0.18)` |

---

## 3. Typography

### Family

| Token | Stack | 용도 |
|---|---|---|
| `--ff-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", system-ui, sans-serif` | 본문 · UI |
| `--ff-mono` | `ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace` | 숫자 · 시각·코드 |

> 외부 폰트 임포트 금지. `font-feature-settings: 'tnum', 'zero'`로 mono 숫자 정렬.

### Scale

| Token | Size / Line / Weight | 용도 | 예 |
|---|---|---|---|
| `--fs-h1` | 24 / 30 / 600 | 패널 타이틀 (mono) | `124.3K tokens` |
| `--fs-h2` | 16 / 22 / 600 | 카드 헤더 | `Token usage · 30 days` |
| `--fs-body` | 13 / 18 / 400 | 본문 | `Resets in 02:14:37 · Sonnet 4.5` |
| `--fs-label` | 11 / 14 / 500 (uppercase) | KPI 라벨 | `TODAY · MONTH-TO-DATE` |
| `--fs-mono-xl` | 28 / 32 / 600 | 메인 KPI 값 | `$42.31` |
| `--fs-mono-md` | 15 / 20 / 600 | 보조 mono | `02:14:37` |

**letter-spacing 규칙**: 24px 이상 → `-0.02em`. uppercase label → `0.04em`. 그 외 normal.

---

## 4. Spacing (4px base grid)

| Token | px |
|---|---|
| `--sp-1` | 4 |
| `--sp-2` | 8 |
| `--sp-3` | 12 |
| `--sp-4` | 16 |
| `--sp-5` | 20 |
| `--sp-6` | 24 |
| `--sp-8` | 32 |
| `--sp-10` | 40 |

> 임의 px 추가 금지. 새 단계 필요 시 token 먼저 추가.

---

## 5. Radius

| Token | px | 용도 |
|---|---|---|
| `--r-sm` | 4 | badge · heat-cell |
| `--r-md` | 6 | input · button · vtab · chip |
| `--r-lg` | 8 | card |
| pill | 999 | live dot · 둥근 chip |

---

## 6. Shadow / Elevation

> **거의 사용하지 않는다.** VS Code는 평면적이며, 카드 구분은 보더 + 배경 톤 차이로 처리.

| 사용처 | 값 |
|---|---|
| 일반 카드 | `none` (보더만) |
| Tooltip (dark) | `0 4px 16px rgba(0,0,0,0.35)` |
| Tooltip (light) | `0 4px 16px rgba(0,0,0,0.10)` |
| StatusBar 호버 툴팁 | `0 8px 24px rgba(0,0,0,0.5)` (강조) |

---

## 7. Motion

| 토큰 | 값 | 용도 |
|---|---|---|
| 호버 톤 변화 | `transition: background 120ms ease` | row · button |
| 차트 호버 dot | `transition: r 100ms ease` | crosshair circle |
| 라이브 dot pulse | 별도 keyframes (선택) | 향후 추가 |

> elevation 효과(translateY)는 사용 금지 — VS Code 네이티브 톤과 어긋남.

---

## 8. Component Recipes

### Card
```
.card { background: var(--vscode-card-background); border: 1px solid var(--vscode-panel-border); border-radius: var(--r-lg); }
.card-flat { background: transparent; border: 1px solid var(--vscode-panel-border); border-radius: var(--r-lg); }
```

### KPI
```
.kpi-label { font-size: var(--fs-label); color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.04em; }
.kpi-value { font-family: var(--ff-mono); font-feature-settings: 'tnum','zero'; font-weight: 600; letter-spacing: -0.02em; }
.kpi-delta.up   { color: #22C55E; }
.kpi-delta.down { color: var(--c-danger); }
.kpi-delta.flat { color: var(--vscode-descriptionForeground); }
```

### Button
- `.btn-primary` — `var(--vscode-button-background)`, 흰 텍스트, 28px 높이
- `.btn-ghost` — 투명 + 보더, hover 시 `var(--vscode-list-hoverBackground)`

### Badge (Model)
18px 높이, mono uppercase, accent 14%/10% 배경 + tint-300/shade-700 텍스트. `.opus` / `.sonnet` / `.haiku`.

### Chip (Filter · Status)
20-24px 높이, 보더 라운드 10px, 옵션 dot/icon 좌측. cost 경고 변형: amber 보더.

### Tab (Vertical, in Panel)
30px 높이, 좌측 아이콘 + 라벨, `.active` = `var(--vscode-list-activeSelectionBackground)`.

### Progress
6px 높이, gradient `var(--c-sonnet) → var(--c-opus)`. 5h Window 전용.

### Heatmap Cell
12×12px, 2px gap, `var(--heat-0~4)` 배경.

### Tooltip
8-10px padding, `--tooltip-bg/border`, 다크 그림자 `0 4px 16px rgba(0,0,0,0.35)`.

### Search Input
28px 높이, `var(--vscode-input-*)`, `:focus-within` 시 border = `var(--vscode-focusBorder)`.

### Table
- header: `--fs-label` uppercase + sticky
- row hover: `var(--vscode-list-hoverBackground)`
- row selected: `var(--vscode-list-activeSelectionBackground)` + 좌측 inset shadow `2px 0 0 var(--vscode-focusBorder)`

---

## 9. Iconography

- **Codicons** (VS Code 공식 아이콘 폰트, `@vscode/codicons`) 단일 채택
- 사용 아이콘 셋: `pulse` · `clock` · `credit-card` · `calendar` · `comment-discussion` · `dashboard` · `graph` · `flame` · `list-tree` · `settings-gear` · `folder-active` · `filter` · `export` · `refresh` · `chevron-down` · `arrow-up-right` · `link-external` · `gear` · `search` · `kebab-vertical` · `file-code` · `play` · `copy` · `bell`
- 외부 SVG 아이콘 추가 금지 (Codicons로 대체)

**브랜드 로고마크**: 인라인 SVG (16×16 viewBox, abstract pulse "C"). Anthropic 마크 차용 금지 — 프로젝트 자체 글리프.

---

## 10. 사용 금지 사항

- 하드코딩 색상 (특히 `#000`, `#FFF`) — `--vscode-foreground/background` 사용
- elevation `box-shadow` (Tooltip 외) — VS Code 평면 톤 위배
- 5번째 액센트 추가 — 5+1색 cap (slate 포함) 초과 금지
- `unsafe-eval` 의존 차트 라이브러리 — Webview CSP 위배
- 외부 폰트 임포트 (Inter / Roboto / Geist 등) — 시스템 폰트만
- elevation animation (translateY/scale) — `opacity`만 허용

---

## 11. 토큰 변경 절차

1. styles.css 수정 → 본 문서 동시 갱신 (drift 방지)
2. 신규 토큰 추가 시 다크/라이트 페어 모두 정의 의무
3. 액센트는 합의 후만 추가 (5+1 cap 의식)
4. WCAG AA 검증 도구로 콘트라스트 재확인
