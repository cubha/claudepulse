# Claude Design 프롬프트 — Claude Code Usage Dashboard IDE Extension

> 아래 블록을 Claude Design(claude.ai/design)에 그대로 붙여넣으세요.
> 화면 5개 + 디자인 토큰을 한 번의 세션에서 산출하는 것이 목표입니다.
> 결과물(HTML/디자인 핸드오프)은 이후 `/ui-plan` 스킬의 입력으로 사용됩니다.

---

## 📋 복사용 프롬프트 (아래부터)

```
# Claude Code Usage Dashboard — VS Code Extension UI Design

VS Code(및 Cursor) Extension으로 동작하는 "Claude Code 사용량 대시보드"의 UI를 디자인해 주세요.
대략적인 방향성과 톤·레이아웃·핵심 컴포넌트를 잡는 단계입니다 — 픽셀 단위 정밀도보다
일관된 시각 언어와 정보 위계 확립이 목표입니다.

═══════════════════════════════════════════════════════════════
## 1. 제품 정체성

- **이름(가칭)**: Clausight (또는 Claude Usage Dashboard)
- **한 줄 설명**: ccusage CLI를 IDE 안으로 가져온 대시보드.
  현재 워크스페이스가 어느 Claude 세션에서 얼마를 쓰고 있는지 실시간으로 보여준다.
- **타겟 사용자**: Claude Code(Pro/Max) 헤비 유저, 비용 의식 있는 개발자, 프리랜서·팀 리더
- **포지셔닝**: ccusage(터미널)의 시각적 업그레이드 + 워크스페이스 컨텍스트 인지

═══════════════════════════════════════════════════════════════
## 2. UI 구조 — 3중 레이어 (모두 디자인 필요)

VS Code Extension이라는 컨텍스트 때문에 단일 화면이 아닌 3개의 진입점이 공존합니다.

### Layer 1. StatusBar (하단 상태바, 항상 표시)
- 위치: VS Code 하단 상태바 좌측 또는 우측 슬롯
- 표시: 아이콘 + "오늘 토큰 124.3K" + "$0.87" 한 줄
- 호버 시 툴팁(미니 정보), 클릭 시 Layer 3(Panel) 오픈

### Layer 2. Sidebar Webview View (좌측 액티비티 바 → 패널, 폭 ~280px)
- 항상 사이드바에 머무르는 요약 패널
- 자주 보는 정보만 — At-a-glance
- 핵심 컴포넌트:
  · KPI 카드 2x2 (오늘 토큰 / 세션 비용 / 이번 달 / 활성 세션 수)
    - 각 카드 = 큰 숫자 + 라벨 + 전일/전월 대비 delta(▲▼ + %)
  · 5h 빌링 윈도우 잔여 (프로그레스 바 + "78% 잔여 · 02:14:37 후 리셋")
  · 프로젝트 Top 3 리스트 (프로젝트명 + 토큰 + sparkline)
  · 하단 "전체 대시보드 열기 ↗" CTA → Layer 3로 이동

### Layer 3. Webview Panel (에디터 탭으로 열리는 풀 대시보드)
- 사용자가 명시 오픈한 상세 화면
- 좌측 탭 네비게이션: [개요][차트][히트맵][세션][설정]
- "개요" 탭 기준 디자인:
  · 상단 KPI 4-카드 (오늘 토큰 · 이번 달 비용 · 세션 수 · 5h 잔여)
  · 메인 영역 2단 그리드:
    좌측 → 30일 토큰 트렌드 AreaChart (모델별 stacked)
    우측 → 프로젝트 분포 도넛 차트
  · 하단 → 날짜별 히트맵 (GitHub contribution graph 스타일, 7행 x 12주)
  · 우측 끝 → 세션 테이블 (최근 10개, 정렬·필터)

═══════════════════════════════════════════════════════════════
## 3. 디자인 방향 (Visual Direction)

### 톤 & 무드
- **VS Code 네이티브 일체감 (필수)** — 외부 SaaS처럼 보이면 실패.
  VS Code가 직접 만든 기본 기능처럼 느껴져야 함.
- **모던 데이터 대시보드 (Vercel · Linear · Tremor · Stripe Dashboard 톤)** —
  여백 충분 · 미세한 보더 · 라운드 8px · 굵은 숫자 + 작은 라벨
- **정보 밀도 균형** — 사이드바는 미니멀, 패널은 정보 풍부 (다만 압도적이지 않게)

### 컬러 팔레트
- **베이스**: VS Code CSS 변수 사용 (`var(--vscode-editor-background)`,
  `var(--vscode-foreground)`, `var(--vscode-panel-border)` 등) → 다크/라이트 자동 적응
- **다크 모드(메인)**: 베이스 #1E1E1E 계열, 카드 면 #252526, 보더 #2D2D30
- **라이트 모드**: 베이스 #FFFFFF, 카드 면 #F8F8F8, 보더 #E5E5E5
- **액센트 컬러 (모델 분류 + 카테고리)**:
  · Opus     → Violet  (#8B5CF6)
  · Sonnet   → Blue    (#3B82F6)
  · Haiku    → Teal    (#14B8A6)
  · 비용 경고 → Amber  (#F59E0B)
  · 한도 초과 → Rose   (#F43F5E)
  · 중립 데이터 → Slate (#64748B)
- **WCAG AA (4.5:1) 대비** 필수, 5색 이내 카테고리 유지

### 타이포그래피
- 시스템 폰트 (VS Code와 동일: SF Pro · Segoe UI · system-ui)
- 모노스페이스(숫자): "SF Mono", "Cascadia Code", monospace — KPI 큰 숫자에 사용
- 위계: H1 24px / H2 16px / Body 13px / Label 11px (VS Code 기본 13px 기준)

### 컴포넌트 스타일
- 라운드: 6-8px (VS Code 기본보다 살짝 모던)
- 보더: 1px solid `var(--vscode-panel-border)`
- 그림자: 거의 사용 안 함 (보더 + 배경 톤 차이로 구분)
- 호버: 미세한 배경 톤 변화 (elevation 효과 X — VS Code는 평면적)
- 포커스: `var(--vscode-focusBorder)` 2px 아웃라인

### 차트 스타일
- 라인/에어리어: 굵기 2px, 그리드 점선, 호버 시 크로스헤어 + 툴팁
- 도넛: 두께 24px, 중앙에 총합 표시, 외곽 레이블
- 히트맵: 5단계 톤 (베이스 → 강도 100%), 셀 12x12px + 갭 2px

═══════════════════════════════════════════════════════════════
## 4. 산출물 요청 (5개 화면 + 디자인 토큰)

다음을 각각 생성해 주세요:

1. **StatusBar 화면** — VS Code 하단 바 일부를 확대해서 표시
   (아이템이 어떻게 자리잡는지, 호버 툴팁 포함)

2. **Sidebar Webview View — 다크 모드** (280px x 600px 정도)

3. **Sidebar Webview View — 라이트 모드** (다크와 동일 레이아웃, 톤만 전환)

4. **Webview Panel "개요" 탭 — 다크 모드** (1280px x 800px 풀 화면)
   - 상단 4-KPI · 좌측 트렌드 차트 · 우측 도넛 · 하단 히트맵 · 우측 세션 테이블

5. **Webview Panel "세션" 탭 — 다크 모드** (1280px x 800px)
   - 세션 테이블 (정렬·필터·검색) + 행 클릭 시 우측 슬라이드오버 드릴다운
   (프로젝트 / 모델 / 시작-종료 / 토큰 분류 / 비용 / 메시지 수)

6. **디자인 토큰 요약**
   - 컬러 토큰 (다크/라이트 페어)
   - 타이포 스케일
   - 스페이싱 스케일 (4px grid)
   - 컴포넌트 변형 (Card / Button / Badge / Tab)

═══════════════════════════════════════════════════════════════
## 5. 레퍼런스 & 영감

- **Tremor (tremor.so)** — KPI 카드 + AreaChart 패턴
- **Vercel Dashboard** — 정보 위계, 미니멀 보더
- **Linear Insights** — 차트 톤, 데이터 밀도
- **Stripe Dashboard** — 테이블 + 드릴다운
- **GitHub Contribution Graph** — 히트맵
- **VS Code 기본 GitLens 패널** — Sidebar Webview View 톤 (네이티브 일체감)
- **Cursor Settings → Usage** — 동일 도메인 비교군

═══════════════════════════════════════════════════════════════
## 6. 제약사항 (지킬 것)

- **VS Code CSS 변수 우선** — 하드코딩 색상 0개 목표 (다크/라이트 자동 적응)
- **Webview CSP 호환** — `unsafe-eval` 의존 금지 (Chart.js/ECharts/uPlot 호환되는 구조로)
- **외부 폰트 임포트 금지** — 시스템 폰트만
- **아이콘은 Codicons (codicon.css) 우선** — `$(graph)` `$(pulse)` `$(clock)` `$(credit-card)` 등
- **접근성**: 키보드 네비게이션 가능한 구조, ARIA 라벨 표기, 색상만으로 정보 전달 금지

═══════════════════════════════════════════════════════════════
## 7. 의도적으로 빠진 것 (이번 세션에서 다루지 X)

- 설정 화면 (Settings 탭) — V2
- 임계값 알림 모달 — 별도 세션
- 온보딩 플로우 — V2
- 팀 집계 화면 — V2

이 4개 화면 + 토큰만 정확히 잡아 주시면 됩니다.
세부 마이크로카피는 placeholder로 두고, 시각 언어와 정보 구조 확립이 우선입니다.
```

---

## 📌 사용 가이드

1. **claude.ai/design 접속** → 새 프로젝트 생성
2. **위 코드 블록 전체 복사** → 첫 메시지로 붙여넣기
3. Claude Design이 5개 화면 + 토큰 산출 → 핸드오프 번들 다운로드 (HTML/PNG/JSON)
4. 결과물을 `docs/design/handoff/` 디렉토리에 저장
5. **`/ui-plan claude design 핸드오프 docs/design/handoff/` 실행** → 화면 맵·스토리보드·HTML 프로토타입 정밀화

## 💡 보완 팁

- 첫 응답이 부족하면 **"Sidebar 라이트 모드만 다시"** 같은 화면 단위 후속 요청
- 색상이 너무 밝거나 어둡다 싶으면 **"VS Code Default Dark+ 테마와 더 가깝게"** 직접 지정
- Tremor 톤이 강하다 싶으면 **"보더와 여백을 더 줄여 정보 밀도 높여 줘"** 조정
- 다크/라이트 두 벌이 어려우면 다크만 먼저 확정 → 라이트는 토큰 변환만
