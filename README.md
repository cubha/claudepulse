# Claudepulse

Claude Code 사용량을 IDE 안에서 실시간으로 시각화하는 대시보드 (VS Code · Cursor).

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

## 라이선스

MIT
