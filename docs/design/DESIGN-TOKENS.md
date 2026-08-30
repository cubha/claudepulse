# Design Tokens — Claudepulse

> **Ground Truth**: `src/webview/styles.css` — 이 문서는 그 파일의 선언을 서술한다.
> 값이 어긋나면 **styles.css가 옳고 이 문서가 틀린 것**이다.
> 재수립: 2026-08-28 (직전 2026-05-10판은 22토큰만 기술 — 실제의 25%였다). 현재 **75토큰 / 선언 126줄**. 선언 밖 색 리터럴 **0건**.
> 적용 범위: VS Code Webview Panel · Sidebar Webview View · 프로토타입 HTML

## 0. 토큰 운영 원칙

1. **선언과 사용을 가른다** — `styles.css`는 토큰 GT와 스타일시트를 겸한다. 드리프트 판정은 **파일 단위가 아니라 줄 단위**다: `^\s*--x:` 로 시작하는 선언 줄에 hex/rgba가 있는 건 정상, 그 밖은 드리프트다. (파일을 통째로 제외하면 드리프트가 2건으로 보이는 착시가 실제로 났다)
2. **VS Code CSS 변수 우선** — 표면(background/foreground/border)은 `var(--vscode-*)`. 총 142개소 사용 중이며 이는 테마 연동이므로 **드리프트가 아니다**.
3. **액센트는 모델·상태 식별 전용** — 페이지 배경·본문 텍스트 사용 금지. **7+1 cap** (§2)
4. **파생은 값이 아니라 토큰으로** — 배지·칩의 틴트/전경은 `--tint-*` / `--fg-*`를 쓴다. rgba 리터럴 금지 (§2.2)
5. **다크/라이트 페어 의무** — 신규 토큰은 `.theme-dark`·`.theme-light` 양쪽에 선언한다. 현재 **예외 0건**이므로 게이트 D-3 기준선은 **0**이다 (§13)
6. **시스템 폰트만** — 외부 폰트 임포트 금지

---

## 1. Color · Theme Tokens (VS Code 변수 매핑)

> ⚠️ **런타임 실태 (2026-08-28 실측)**: `body class`는 `SidebarViewProvider.ts:48`·`DashboardPanel.ts:67`에
> **`theme-dark`로 하드코딩**돼 있고 `theme-light`를 부착하는 코드 경로는 **0건**이다. 따라서 아래 Light 열과
> 잔존 `.theme-light` 셀렉터 6개는 **프로토타입 HTML에서만 살아있다** — 확장 런타임에서는 매칭되지 않는다.
> 실 VS Code 테마 연동은 **별건**으로 남긴다(본 문서는 선언 사실만 기록한다).

| Token | Role | Dark | Light |
|---|---|---|---|
| `--vscode-editor-background` | page background | `#1E1E1E` | `#FFFFFF` |
| `--vscode-card-background` | KPI · 차트 카드 | `#1F1F1F` | `#FBFBFB` |
| `--vscode-sideBar-background` | 사이드바 · activity bar | `#181818` | `#F8F8F8` |
| `--vscode-panel-border` | 카드·divider | `#2D2D30` | `#E5E5E5` |
| `--vscode-divider` | 표 구분선 | `#2D2D30` | `#E5E5E5` |
| `--vscode-grid` | 차트 그리드 | `#2A2A2D` | `#ECECEC` |
| `--vscode-input-background` | input · search | `#2A2A2C` | `#FFFFFF` |
| `--vscode-input-border` | input border | `#3A3A3D` | `#D4D4D4` |
| `--vscode-button-background` | primary 버튼 | `#0E639C` | `#005FB8` |
| `--vscode-list-hoverBackground` | row hover | `#2A2D2E` | `#EFEFEF` |
| `--vscode-list-activeSelectionBackground` | row 선택 | `#2C3E55` | `#DDECF7` |
| `--vscode-focusBorder` | 2px 포커스 outline | `#007FD4` | `#005FB8` |
| `--vscode-foreground` | 본문 텍스트 | `#CCCCCC` | `#3C3C3C` |
| `--vscode-descriptionForeground` | muted · label | `#9D9D9D` | `#6E6E6E` |
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

### Tooltip · Chrome

| Token | Dark | Light |
|---|---|---|
| `--tooltip-bg` | `#2A2A2D` | `#FFFFFF` |
| `--tooltip-border` | `#3A3A3D` | `#D4D4D4` |

---

## 2. Color · Brand Accent (**7+1 cap**)

페이지 배경·본문 텍스트로 절대 사용 금지. 모델 식별 + 상태 강조 전용.
`:root`에 선언되어 **양 테마 불변**이다.

### 2.1 기본 액센트 (7 + 중립 1)

| Token | Hex | 용도 |
|---|---|---|
| _(솔리드 토큰 없음)_ | `#E0529C` | Fable 모델 식별 (rose) — 최상위 티어. `--c-fable`은 미사용이라 2026-08-28 제거했고, 현재는 파생 `--tint-fable`/`--fg-fable`로만 구현된다 (§2.2) |
| `--c-opus` | `#8B5CF6` | Opus 모델 식별 (violet) |
| `--c-sonnet` | `#3B82F6` | Sonnet 모델 식별 (blue) — primary brand |
| `--c-haiku` | `#14B8A6` | Haiku 모델 식별 (teal) |
| `--c-warn` | `#F59E0B` | 비용 경고 (amber) |
| `--c-danger` | `#F43F5E` | 한도 초과 · 에러 (rose) |
| `--c-success` | `#22C55E` | 상승 delta · 성공 (green) — **2026-08-28 승격** |
| `--c-slate` | `#64748B` | 중립 데이터 (**+1** — cap 산정 시 액센트로 세지 않는다) |
| `--fg-on-accent` | `#FFFFFF` | 액센트 배경 위 전경 (버튼) — 양 테마 불변 |

> **cap 표기 이력**: 이전 문서·CLAUDE.md가 "5+1"과 "6+1"을 혼용했고 실제 선언은 7종이었다.
> 2026-08-28 **7+1**로 통일했다(7 액센트 + slate 중립). 8번째 액센트 추가는 합의 필요.

### 2.2 파생 토큰 — 배지·칩 (테마별 선언, **직접 rgba 금지**)

배지·칩의 배경/전경은 아래 토큰만 쓴다. 값 리터럴을 다시 쓰면 게이트(§13 규칙 D-2)가 잡는다.

| 액센트 | `--tint-*` (배경) dark / light | `--fg-*` (전경) dark / light |
|---|---|---|
| fable | `rgba(224,82,156,0.14)` / `0.10` | `#F9A8D4` / `#BE185D` |
| opus | `rgba(139,92,246,0.14)` / `0.10` | `#C4B5FD` / `#6D28D9` |
| sonnet | `rgba(59,130,246,0.14)` / `0.10` | `#93C5FD` / `#1D4ED8` |
| haiku | `rgba(20,184,166,0.14)` / `0.10` | `#5EEAD4` / `#0F766E` |
| slate | `rgba(100,116,139,0.14)` / `0.10` | `#94A3B8` / `#475569` |
| warn | `rgba(245,158,11,0.14)` / `0.10` | `#FCD34D` / `#B45309` |
| danger | `rgba(244,63,94,0.14)` / `0.10` | — (전경은 `var(--c-danger)` 솔리드) |

**규약**: 배경 = 다크 **14%** / 라이트 **10%**. 전경 = 다크 tint-300 / 라이트 shade-700.

### 2.3 파생 토큰 — 보더 · outline · 중립

| Token | Dark | Light | 용도 |
|---|---|---|---|
| `--tint-neutral` | `rgba(100,116,139,0.12)` | `rgba(100,116,139,0.08)` | 브랜치·클릭 칩 표면 (액센트 아님) |
| `--tint-sonnet-border` | `rgba(59,130,246,0.27)` | 동일 | `.status-badge` 보더 |
| `--tint-warn-border` | `rgba(245,158,11,0.27)` | 동일 | `.status-badge` · `.fallback-banner` 보더 |
| `--tint-danger-border` | `rgba(244,63,94,0.27)` | 동일 | `.status-badge` 보더 |
| `--outline-sonnet` | `rgba(59,130,246,0.55)` | 동일 | `.rate-bar` outline · 대시보드 버튼 hover |
| `--outline-warn` | `rgba(245,158,11,0.65)` | 동일 | `.rate-bar` outline |
| `--outline-danger` | `rgba(244,63,94,0.65)` | 동일 | `.rate-bar` outline |

> 보더·outline은 라이트 전용 값 선례가 없어 **양 테마 동일**하게 선언했다. 라이트 테마를 실제로
> 살릴 때 재검토 대상이다.

### 2.4 크롬 토큰 — 그림자 · 트랙 · 3D 버튼 (테마별)

액센트가 아닌 표면 효과다. `box-shadow`·`linear-gradient`처럼 **복합값을 통째로** 담는다
(design-lint `D-EFFECT-02`가 shadow에 `var(--shadow-*)` 참조를 요구한다).

| Token | Dark | Light |
|---|---|---|
| `--shadow-tooltip` | `0 4px 16px rgba(0,0,0,0.35)` | `0 4px 16px rgba(0,0,0,0.10)` |
| `--track-neutral` | `rgba(128,128,128,0.15)` | 동일 |
| `--btn-face` | 흰 7% → 검정 5% 그라디언트 | `#ffffff` → `#f3f3f3` |
| `--btn-face-hover` | 흰 11% → 흰 3% | `#eef5ff` → `#e2eeff` |
| `--btn-face-active` | 검정 4% → 흰 4% | 동일(라이트 전용 선언이 없었음 — 기존 렌더값 고정) |
| `--btn-edge` | `rgba(0,0,0,0.3)` | `rgba(0,0,0,0.18)` |
| `--shadow-btn` / `-hover` / `-active` | 인셋 하이라이트 + 드롭섀도 | 라이트 값 별도 |

> 초안에서는 이들을 "알파-온-미지배경이라 토큰화 가치 없음"으로 분류해 **의도적 잔존**으로 두려 했다.
> **그 판단은 틀렸다** — `.tooltip`·`.sb-dashboard-btn`은 라이트 전용 값이 따로 있었으므로 테마 불변 상수가
> 아니었고, 정확히 테마 토큰이 푸는 문제였다. 토큰화하자 `.theme-light` 오버라이드 3규칙이 사라졌다.

---

## 3. Typography

### Family

| Token | Stack | 용도 |
|---|---|---|
| `--ff-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", system-ui, sans-serif` | 본문 · UI |
| `--ff-mono` | `ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace` | 숫자 · 시각·코드 |

> 외부 폰트 임포트 금지. `font-feature-settings: 'tnum', 'zero'`로 mono 숫자 정렬.
> **`--ff-display`는 존재하지 않는다** — `.panel-title`이 참조하던 미선언 토큰이었고(선언째 폐기되어
> `--ff-sans` 상속이 실제 렌더값이었다) 2026-08-28 제거했다. 신규 페이스 추가는 §0.6 위반이다.

### Scale

| Token | px | 용도 |
|---|---|---|
| `--fs-h2` | 16px | 카드 헤더 |
| `--fs-body` | 13px | 본문 |
| `--fs-label` | 11px | KPI 라벨 (uppercase, `letter-spacing: 0.04em`) |
| `--fs-mono-lg` | 22px | 대형 mono |
| `--fs-mono-md` | 15px | 보조 mono |

**letter-spacing 규칙**: 24px 이상 → `-0.02em`. uppercase label → `0.04em`. 그 외 normal.

> `--fs-label`(11px)은 VS Code 네이티브 UI와 맞춘 **의도적** 값이다. design-lint `D-TYPE-07`
> (12px 미만 error)가 상시 발화하지만 결함이 아니다 — §13 알려진 상시 error 참조.

---

## 4. Spacing (4px base grid)

| Token | px |
|---|---|
| `--sp-1` | 4px |
| `--sp-2` | 8px |
| `--sp-3` | 12px |
| `--sp-4` | 16px |
| `--sp-6` | 24px |
| `--sp-8` | 32px |

> 임의 px 추가 금지. 새 단계 필요 시 token 먼저 추가.

---

## 5. Radius

| Token | px | 용도 |
|---|---|---|
| `--r-sm` | 4px | badge · heat-cell |
| `--r-md` | 6px | input · button · vtab · chip |
| `--r-lg` | 8px | card |
| pill | 999px | live dot · 둥근 chip |

---

## 6. Shadow / Elevation

> **거의 사용하지 않는다.** VS Code는 평면적이며, 카드 구분은 보더 + 배경 톤 차이로 처리.
> 사용하는 두 곳은 **전부 토큰이다**(§2.4) — 리터럴 `box-shadow` 금지.

| 사용처 | 토큰 |
|---|---|
| 일반 카드 | `none` (보더만) |
| Tooltip | `var(--shadow-tooltip)` |
| 사이드바 대시보드 버튼 | `var(--shadow-btn)` / `-hover` / `-active` |

---

## 7. Motion

| 토큰 | 값 | 용도 |
|---|---|---|
| 호버 톤 변화 | `transition: background 120ms ease` | row · button |
| rate-bar 채움 | `transition: width .4s ease` | 사용량 바 |
| 차트 호버 dot | `transition: r 100ms ease` | crosshair circle |

> elevation 효과(translateY)는 원칙적으로 금지. 예외 1건: `.sb-dashboard-btn:active`의
> `translateY(1px)` — 물리 버튼 피드백으로 합의된 잔존.

---

## 8. Component Recipes (현재 코드 기준)

### Card
```css
.card { background: var(--vscode-card-background); border: 1px solid var(--vscode-panel-border); border-radius: var(--r-lg); }
.card-flat { background: transparent; border: 1px solid var(--vscode-panel-border); border-radius: var(--r-lg); }
```

### KPI
```css
.kpi-label { font-size: var(--fs-label); color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.04em; }
.kpi-value { font-family: var(--ff-mono); font-feature-settings: 'tnum','zero'; font-weight: 600; letter-spacing: -0.02em; }
.kpi-delta.up   { color: var(--c-success); }
.kpi-delta.down { color: var(--c-danger); }
.kpi-delta.flat { color: var(--vscode-descriptionForeground); }
```

### Button
```css
.btn-primary { background: var(--vscode-button-background); color: var(--fg-on-accent); }
.btn-ghost   { background: transparent; border: 1px solid var(--vscode-panel-border); }
.btn-ghost:hover { background: var(--vscode-list-hoverBackground); }
```

### Badge (Model) · Chip (Model/Tool)
18px 높이, mono uppercase. **토큰만 사용** — 테마 오버라이드 불필요:
```css
.badge.opus          { background: var(--tint-opus);   color: var(--fg-opus); }
.sb-chip--model.opus { background: var(--tint-opus);   color: var(--fg-opus); }
.sb-chip--tool.tool-bash { background: var(--tint-warn); color: var(--fg-warn); }
```

### Status Badge / Status Chip
틴트 배경 + **솔리드 액센트 전경** (배지 전경 tint와 다른 규약):
```css
.status-badge.danger { background: var(--tint-danger); color: var(--c-danger); border-color: var(--tint-danger-border); }
.rate-status-chip.allowed { background: var(--tint-sonnet); color: var(--c-sonnet); }
```

### Progress / Rate bar
6px~12px 높이. 채움 = 솔리드 액센트, outline = `--outline-*`:
```css
.rate-bar-fill[data-status="danger"] { background: var(--c-danger); }
.rate-bar:has(.rate-bar-fill[data-status="danger"]) { outline-color: var(--outline-danger); }
```

### Heatmap Cell
12×12px, 2px gap, `var(--heat-0~4)` 배경.

### Tooltip
8-10px padding, `--tooltip-bg/border`, 그림자는 §12.1 잔존.

### Table
- header: `--fs-label` uppercase + sticky
- row hover: `var(--vscode-list-hoverBackground)`
- row selected: `var(--vscode-list-activeSelectionBackground)`

---

## 9. Iconography

- **Codicons** (VS Code 공식 아이콘 폰트) 단일 채택
- 외부 SVG 아이콘 추가 금지
- **브랜드 로고마크**: 인라인 SVG (16×16 viewBox, abstract pulse "C"). Anthropic 마크 차용 금지

---

## 10. 사용 금지 사항

- **선언 밖 hex/rgba 색 리터럴** — `var(--*)` 토큰만. 정당한 예외는 같은 줄 `design-lint-ignore` 주석
- **배지·칩에 rgba 직접 사용** — `--tint-*` / `--fg-*` 사용 (§2.2)
- 합의 없는 신규 액센트 — **7+1 cap** 초과 금지
- 외부 폰트 임포트 (Inter / Roboto / Geist 등) — 시스템 폰트만
- `unsafe-eval` 의존 차트 라이브러리 — Webview CSP 위배
- elevation animation (translateY/scale) — `.sb-dashboard-btn:active` 1건 외 금지

---

## 11. 토큰 변경 절차

1. `styles.css` 수정 → **본 문서 동시 갱신** (drift 방지)
2. 신규 토큰은 **다크/라이트 페어 모두 정의** — 예외는 §12.2에 사유와 함께 등재
3. 액센트는 합의 후만 추가 (7+1 cap)
4. `bash verify.sh --full`로 게이트 통과 확인 (§13)

---

## 12. 의도적 잔존 · 미사용 인벤토리

> **드리프트 0이 목표가 아니다.** 아래는 토큰화하지 않기로 **판단한** 것들이며, 게이트는 이를 warn으로
> 보고한다. 목록에 없는 신규 발생분이 진짜 드리프트다.
> 2026-08-28 실측: 선언 밖 색 리터럴 **122건 → 0건** · `.theme-light` 오버라이드 규칙 **25 → 0**.

### 12.1 의도적 잔존 — ✅ **0건**

착수 시 122건이던 선언 밖 색 리터럴이 **0**이다. 초안에서 "크롬 알파 오버레이 24건은 토큰화 가치가 없다"고
분류했으나 재검토 결과 **그 판단이 틀렸다**(§2.4). 잔존 24건은 `.tooltip`·`.rate-bar` 트랙·
`.sb-dashboard-btn` **3개 컴포넌트에만** 몰려 있었고, 앞의 둘은 라이트 전용 값이 따로 있어 테마 불변 상수가
아니었다. 전량 토큰화했다.

따라서 게이트 D-1의 기준선은 **0이며 severity는 `fail`이다**(§13). 정당한 예외가 생기면 같은 줄
`design-lint-ignore` 주석으로 면제하고 그 사유를 이 절에 등재한다 — **면제는 여기 기록이 있어야 유효하다.**

### 12.2 미사용(dead) 토큰 — ✅ 21개 전량 제거 완료 (2026-08-28)

인벤토리로 남겼다가 **사용자 결정으로 삭제**했다. 삭제 전 `src/webview/styles.css`·`src/**/*.ts`·
`docs/design/prototype/`(자체 `styles.css` 포함) 전 경로에서 `var(--x)` 참조 0건을 확인했다 —
프로토타입 HTML은 `src/webview/styles.css`가 아니라 **별개의 `docs/design/prototype/styles.css`(383줄)**를
링크하므로 영향이 없다.

제거 목록: `--activityBar-bg|-fg|-active` · `--tab-active-bg|-inactive-bg|-border` · `--bg-elevated-hover` ·
`--c-tone-50` · `--c-fable` · `--fs-h1` · `--fs-mono-xl` · `--sp-5` · `--sp-10` ·
`--vscode-button-hoverBackground|-card-elevated|-charts-blue|-disabledForeground|-panel-background|-statusBar-background|-statusBar-foreground|-titleBar-activeBackground`

결과: 토큰 87→**66**, 선언 108줄, dead **0**, 다크/라이트 페어 미충족 **9→0**(제거된 다크 전용 9개가 전부 dead였다).

> ⚠️ **`--c-fable` 재도입 조건**: fable만 솔리드 토큰이 없는 비대칭 상태다(opus·sonnet·haiku·warn·danger·success·slate는 있다).
> Fable에 솔리드 색이 필요해지면(차트 시리즈·`.rate-bar-fill` 등) **하드코딩하지 말고 `--c-fable: #E0529C;`를 되살린다.**
> 이 줄이 없으면 다음 사람이 `#E0529C`를 그대로 박을 가능성이 높다 — 방금 없앤 드리프트가 그렇게 생겼다.

### 12.3 토큰화 시 정규화된 값 (2026-08-28)

값 보존 리팩터가 원칙이나, **한 역할에 두 알파가 공존하던 드리프트**는 규약값으로 수렴시켰다.
전부 알파 ≤4% 차이로 지각 불가 수준이다.

| 컴포넌트 | 항목 | 이전 (dark / light) | 이후 (dark / light) |
|---|---|---|---|
| `.status-badge.*` | 배경 | `.13` / (없음) | `0.14` / `0.10` |
| `.rate-status-chip.*` | 배경 | `.13` / (없음) | `0.14` / `0.10` |
| `.overage-status-chip.*` | 배경 | `0.13` / (없음) | `0.14` / `0.10` |
| `.threshold-badge` | 배경 | `0.14` / (없음) | `0.14` / `0.10` |
| `.fallback-banner` | 배경 | `0.10` / (없음) | `0.14` / `0.10` |
| `.fallback-banner` | 보더 | `0.30` / (없음) | `0.27` / `0.27` |
| `.sb-chip--clickable` | 배경 | `0.12` / (없음) | `0.12` / `0.08` |
| `.sb-chip--monthly` | 배경 | `0.10` / `0.07` | `0.14` / `0.10` |

그 외 **모든** 치환은 색값 동등이다(배지·칩·outline 전체). 표기만 정규화된 것이 있다 —
`#fff`→`#FFFFFF`, `.13`→`0.13` 형태이며 계산색은 같다.

**검증 방법**: 치환 전후 파일에서 셀렉터별 최종 계산값(다크·라이트 각각, `.theme-light` 오버라이드 반영)을
기계로 대조했다. 차이가 난 지점은 위 표 + 표기 정규화가 **전부**이며 미해석 토큰 0건이다. Playwright MCP가
연결 실패 상태라 스크린샷 대신 쓴 방법이고, 값 대조가 스크린샷보다 강한 판정이다.

---

## 13. 게이트 (강제 층)

산문 규칙은 write-time 유도일 뿐이다. 강제는 `verify.sh`가 한다 — 규칙 상세는
프로젝트 `CLAUDE.md` 「🎨 디자인 토큰 바인딩」 참조.

| 규칙 | 대상 | 판정 |
|---|---|---|
| D-0 측정 온전성 | 토큰 선언 수 ≥ 50 | **fail** (측정 붕괴가 '개선'으로 읽히는 것 차단) |
| D-1 선언 밖 색 리터럴 | `src/webview/styles.css` (선언 줄 제외) | **fail** (기준선 0 — 백로그 청소 후 승격) |
| D-2 미정의 토큰 참조 | 동일 | **fail** (무성 실패 클래스) |
| D-3 다크/라이트 페어 | `.theme-dark` vs `.theme-light` | warn (기준선 **0** — 예외 없음) |
| design-lint | `docs/design/prototype/*.html` | 보고 전용 (§13.1) |

### 13.1 design-lint — 보고 전용인 이유와 현재 기준선

프로토타입 HTML은 `--gate` 없이 **보고 전용**으로 돌린다. 2026-08-28 기준선 **error 6 · warn 29**
(호출: `--token-source src/webview/styles.css`). **기준선 숫자는 이 호출 플래그와 짝으로만 유효하다** —
다른 플래그(예: 구 `--tokens docs/design/DESIGN-TOKENS.md`)로 돌리면 다른 숫자가 나온다(§ 하단 참조).

**v0.1.53에서 `--tokens` → `--token-source`로 전환**: 구 `--tokens`는 이 문서 전체를 정규식으로
긁는 unstructured 경로라, 문서에 위반값을 적으면 그 값이 허용집합에 흡수되는 결함이 있었다(아래
"과거 결함" 참조). design-lint 스킬이 `--token-source <css>`(실 선언 harvest, `structured:true`)를
지원하도록 개선되어 이 프로젝트가 채택했다 — 프롬프트 생성으로 이관했던 개선 과제가 해소된 것.

**D-COLOR-02는 이번에 0으로 해소**했다(4색 → 0). 방법: 각 프로토타입 파일 자체의 `:root`에
`--canvas-surface`·`--qp-surface`·`--exp-b` 같은 로컬 커스텀 프로퍼티를 선언하고 `var()`로
참조 — 렌더 값은 바이트 동일, `styles.css` 토큰 체계에 편입한 것은 아니다(standalone HTML이라
공유하지 않는 것은 여전히 사실). 덤으로 `usage-heatmap.html`의 `background: #143;`(직후
`#0f3d36`에 즉시 덮어써지는 죽은 선언)도 함께 제거했다.

**`D-TOKEN-01`·`D-TYPE-07`은 0으로 만들지 않는다 — 만들면 오히려 왜곡이다.**

| ID | 내용 | 판정 |
|---|---|---|
| `D-TYPE-07` | `11px` 1건 | **의도** — `--fs-label`, VS Code 규격 |
| `D-TYPE-07` | 11px 미만 다수 | **드리프트이나 미조치** — 12px 미만 다건을 12px+로 올리면 프로토타입의 조밀한 sidebar/뱃지 레이아웃이 시각적으로 달라진다. 값은 여기 적지 않는다 |
| `D-TOKEN-01` | 4px 그리드 밖 다수 | **탐지 자체가 근거 불충분 — 아래 사유로 미조치**. 값은 여기 적지 않는다 |

**D-TOKEN-01을 미조치하는 이유(측정으로 확인)**: `--token-source`의 허용 px 집합은
`src/webview/styles.css`에 등장하는 **모든** px 값의 평평한 집합이다 — spacing(`--sp-*`)과
font-size·border-width를 구분하지 않는다. 예컨대 프로토타입의 `gap: 10px`이 위반으로 뜨는 건
10이 spacing 스케일에 없어서가 아니라, 11px(`--fs-label`의 font-size)만 집합에 있고 10이
없기 때문이다. 이 상태에서 `10px→11px`로 스냅하면 spacing을 font-size 우연치에 맞추는
것이라 **정리가 아니라 왜곡**이다. property-type을 구분하는 harvest가 되기 전까지는 손대지
않는다 — D-TOKEN-01도 별도 개선 과제 후보로 남긴다(design-lint 스킬 측 작업).

> ⚠️ **이 문서에 위반값을 적으면 그 값이 합법화된다 — hex도 px도 마찬가지다.** 이 위험은
> **구 `--tokens` 경로에서만** 성립한다(이 문서 전체를 긁는 unstructured harvest). 현재 verify.sh는
> `--token-source src/webview/styles.css`를 쓰므로 이 문서의 문구는 허용집합에 영향을 주지 않는다.
> 그래도 위반 목록은 값이 아니라 **설명으로** 적는다 — 누군가 `--tokens`로 수동 실행할 가능성까지
>차단하기 위함. 실값은 `design-lint` 출력에서 본다. (과거 실측: 위반 hex를 문서에 적어
> error 9→6으로 떨어진 사례, `80px`·`9px`를 단위째 적어 재발한 사례 — 둘 다 `--tokens` 시절.)
>
> ⚠️ **`design-lint-ignore` 주석은 프로토타입 HTML(피검사 대상)에서 동작하지 않는다.** 이 마커는
> `--tokens`/`--token-source`가 가리키는 **토큰 소스 문서**의 줄 필터에만 적용된다(design-lint.mjs
> `MD_IGNORE_REGION`/줄 필터, harvest 경로 한정). CLAUDE.md §3#5의 `design-lint-ignore` 예외는
> `verify.sh`의 D-1(`styles.css`) 전용 컨벤션이며, **다른 표면·다른 메커니즘**이다 — 프로토타입
> HTML 안에 이 주석을 달아도 해당 줄의 finding은 사라지지 않는다.
>
> **문서 형식 주의**: `D-TOKEN-01`의 허용 스케일은(구 `--tokens` 경로에 한해) 이 문서 안의
> `\d+px` 문자열을 **전부 긁어** 만든다(표 구조를 파싱하지 않는다). §3·§4·§5 표의 값 칸에서 `px`
> 단위를 빼면 스케일이 조용히 좁아져 `20px`·`32px` 같은 **정상 토큰값이 위반으로 뜬다**. 값 칸에는
> 반드시 단위를 붙인다.
