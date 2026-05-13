# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.5] - 2026-05-12

### Added
- **Burn Rate**: 최근 2개 폴링 포인트 기반 %/min · %/hr 실시간 소비 속도 계산
- **Safe Until**: 현재 burn rate 기준 5h 잔여 quota 소진 예상 시각 표시
- **Projected at reset**: 리셋 시점 잔여량 예측 (`proj N% left`)

### Changed
- Sidebar: 사용률 표시 `used%` → `used% · left% left` 동시 표시
- Sidebar: 프로그레스 바 두께 8px → 12px, 상태별 색상 (초록 OK / 노랑 Warning / 빨강 Blocked)
- Sidebar: "updated just now" 고정 문자 → 실제 폴링 타임스탬프 (`HH:MM:SS`) 표시
- Sidebar: Refresh 버튼 중복 제거 — 헤더 ↻ 단일화
- Panel: 반원 doughnut 게이지 → SESSION / WEEKLY / BURN RATE / SAFE UNTIL 4-카드 레이아웃으로 교체

## [0.1.4] - 2026-05-11

### Fixed
- `acquireVsCodeApi` esbuild 번들링 문제: `globalThis.acquireVsCodeApi()` 직접 호출 후 Messenger 생성자에 전달하는 방식으로 해결

## [0.1.3] - 2026-05-11

### Fixed
- Messenger 초기화 전 로딩 상태를 먼저 렌더링해 초기화 실패 시에도 빈 화면 방지
- 초기화 단계별 (Messenger init → start → sendRequest) 에러 캐치 추가

## [0.1.2] - 2026-05-11

### Fixed
- Webview 초기화 실패 시 에러 메시지 표시 (빈 흰 화면 대신 명확한 안내)

## [0.1.1] - 2026-05-11

### Added
- 로그인 UX 개선: `credentials_missing` / `token_expired` 상태 명확 분기
- 에러 UI: 상태별 아이콘 · 메시지 · 로그인 버튼 (`claude login` 실행)
- 401 토큰 만료 명확 감지 (`TOKEN_EXPIRED` 에러)
- 로그인 후 안내 문구 ("↻ 버튼을 눌러 새로고침하세요")

## [0.1.0] - 2026-05-11

### Changed
- **전면 재설계**: jsonl 파서 기반 → Anthropic API 직접 폴링 방식으로 전환
- `~/.claude/.credentials.json` OAuth 토큰으로 `POST /v1/messages` 5분마다 폴링
- 응답 헤더에서 5h/7d Rate Limit 상태 파싱 → StatusBar · Sidebar · Panel 표시
- chokidar · jsonl 파서 · UsageAggregator · CacheStore 제거 (API 기반으로 대체)

## [0.0.3] - 2026-05-10

### Changed
- Marketplace 배포용 README 정리 (내부 개발 내용 제거)
- `.vscodeignore` 최적화 (`.playwright-mcp`, `CLAUDE.md`, pricing 디렉토리 제외)

## [0.0.2] - 2026-05-10

### Added
- MVP 구현: jsonl 파서 + `message.id` dedup + Chart.js 사용량 대시보드
- StatusBar · Sidebar · Dashboard Panel 3중 UI 초안
- esbuild 빌드 (extension + webview 분리 entry)
- 아이콘 추가 (128×128 PNG · SVG)

## [0.0.1] - 2026-05-10

### Added
- Initial scaffold: VS Code extension 기본 구조
- TypeScript 5.x + esbuild 빌드 시스템
- vsce + ovsx 동시 배포 스크립트
