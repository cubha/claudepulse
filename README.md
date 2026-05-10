# Claudepulse

> Claude Code 사용량을 IDE 안에서 실시간으로 시각화하는 대시보드 (VS Code · Cursor).

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-cubha.claudepulse-blue)](https://marketplace.visualstudio.com/items?itemName=cubha.claudepulse)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-cubha.claudepulse-purple)](https://open-vsx.org/extension/cubha/claudepulse)

ccusage(★14k CLI)의 데이터 정확성 + 실시간 watch — claude.ai 비공개 API 회피, IDE 컨텍스트(현재 워크스페이스) 자동 매핑.

## 핵심 기능

- **At-a-glance StatusBar**: 오늘 토큰 수·세션 비용 상시 표시
- **Sidebar 대시보드**: 오늘 KPI 4-카드 + 5h 빌링 윈도우 + Top 프로젝트
- **Dashboard Panel**: 30일 토큰 트렌드 (Opus/Sonnet/Haiku stacked) + 프로젝트 분포 도넛
- **Sessions 탭**: 세션 목록 + 클릭 시 5분 버킷 토큰 사용량 드릴다운
- **워크스페이스 자동 매핑**: 현재 열린 프로젝트의 비용을 사이드바에 자동 강조
- **인-에디터 비용 알림**: 월 누적 비용 임계값 초과 시 VS Code 네이티브 알림

## 데이터 소스

`~/.claude/projects/**/*.jsonl` 로컬 파일 직접 파싱.  
**외부 API 호출 0회 · 추가 결제 0원 · 100% 오프라인**.

## 요구사항

- VS Code `^1.85.0` 또는 Cursor 최신
- Claude Code CLI 설치 + `~/.claude/projects/` 디렉토리 존재

## 설치

VS Code Marketplace 또는 Open VSX에서 **"Claudepulse"** 검색 후 설치.

## 명령

| Command | 설명 |
|---|---|
| `Claudepulse: Open Dashboard` | Dashboard Panel 열기 |
| `Claudepulse: Refresh` | 수동 재집계 |

## 설정

`Settings → Extensions → Claudepulse`:

| 설정 | 기본값 | 설명 |
|---|---|---|
| `claudepulse.claudeProjectsPath` | `~/.claude/projects` | jsonl 루트 경로 오버라이드 |
| `claudepulse.costAlertThresholdUsd` | `10` | 월 누적 비용 알림 임계값 (USD) |
| `claudepulse.refreshDebounceMs` | `300` | 파일 변경 감지 디바운스 (ms) |

## 변경 이력

- **v0.0.2** (2026-05-10) — 초기 릴리즈. Sessions 탭 드릴다운, 워크스페이스 자동 매핑, 비용 알림, 30일 차트.

## 라이선스

MIT — [LICENSE](./LICENSE)
