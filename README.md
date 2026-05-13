# Claudepulse

> Claude Max 플랜 구독자를 위한 IDE 내 Rate Limit 대시보드 (VS Code · Cursor).

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-cubha.claudepulse-blue)](https://marketplace.visualstudio.com/items?itemName=cubha.claudepulse)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-cubha.claudepulse-purple)](https://open-vsx.org/extension/cubha/claudepulse)

Claude 계정의 세션 사용률과 주간 사용률을 IDE 안에서 실시간으로 확인. 브라우저 탭 전환 없이 Rate Limit 상태와 소비 속도를 한눈에.

## 핵심 기능

- **StatusBar 상시 표시**: 세션(5h) % · 주간(7d) % — 어느 파일 편집 중에도 우하단에 표시
- **Sidebar 대시보드**: 5h/7d 사용률 + `used% · left%` 동시 표시 + 재설정 카운트다운 + 상태 뱃지(OK/Warning/Blocked)
- **Burn Rate 예측**: 최근 폴링 이력 기반 %/min 소비 속도 + Safe Until 예상 시각
- **Dashboard Panel**: SESSION · WEEKLY · BURN RATE · SAFE UNTIL 4-카드 + 폴링 이력 추세선
- **임계값 알림**: 설정한 % 초과 시 VS Code 네이티브 경고 알림
- **자동 폴링**: 5분마다 Anthropic API에서 최신 Rate Limit 헤더 수신

## 데이터 소스

Claude Code CLI가 생성하는 `~/.claude/.credentials.json`의 OAuth 토큰으로 `POST https://api.anthropic.com/v1/messages`를 5분마다 폴링, 응답 헤더에서 Rate Limit 상태를 읽습니다.

- **로컬 파일 파싱 없음** — jsonl 파일 미접근
- **비공개 API 미사용** — 공식 Anthropic API만 사용
- **폴링 쿼터 소비**: 5분마다 claude-haiku로 1-token 요청 → Rate Limit 자체를 극소량 소비 (1회 폴링 ≈ 5~10 input tokens 수준)

## 요구사항

- VS Code `^1.85.0` 또는 Cursor 최신
- **Claude Max 플랜** 구독
- Claude Code CLI 설치 + 1회 이상 로그인 (`~/.claude/.credentials.json` 존재 필요)

## 설치

VS Code Marketplace 또는 Open VSX에서 **"Claudepulse"** 검색 후 설치.  
설치 즉시 자동으로 credentials를 읽어 폴링을 시작합니다.

## 명령

| Command | 설명 |
|---|---|
| `Claudepulse: Open Dashboard` | Dashboard Panel 열기 |
| `Claudepulse: Refresh` | 즉시 폴링 실행 |

## 설정

`Settings → Extensions → Claudepulse`:

| 설정 | 기본값 | 설명 |
|---|---|---|
| `claudepulse.credentialsPath` | `~/.claude/.credentials.json` | Credentials 파일 경로 오버라이드 |
| `claudepulse.pollIntervalMs` | `300000` (5분) | 폴링 간격 (ms) |
| `claudepulse.utilizationWarnThreshold` | `0.8` (80%) | 경고 알림 임계값 (0–1) |

## 변경 이력

- **v0.1.5** (2026-05-12) — UI 전면 개선: Burn Rate + Safe Until 예측, 4-카드 패널, 프로그레스 바 가시성 개선
- **v0.1.4** (2026-05-11) — acquireVsCodeApi esbuild 번들링 버그 수정
- **v0.1.3** (2026-05-11) — Messenger 초기화 단계별 에러 캐치 개선
- **v0.1.2** (2026-05-11) — Webview 초기화 실패 시 에러 메시지 표시
- **v0.1.1** (2026-05-11) — 로그인 UX 개선 (credentials_missing / token_expired 상태 분기)
- **v0.1.0** (2026-05-11) — Rate Limit 대시보드로 전면 재설계. OAuth 폴링 기반, 5h/7d 사용률·재설정 시간 표시.
- **v0.0.2** (2026-05-10) — MVP 구현 (jsonl 파서 기반, 현재 폐기).
- **v0.0.1** (2026-05-10) — Initial scaffold.

전체 변경 이력: [CHANGELOG.md](./CHANGELOG.md)

## 라이선스

MIT — [LICENSE](./LICENSE)
