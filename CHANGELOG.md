# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2] - 2026-05-13

### Changed
- Extension renamed to Claude Code Gauge (claude-code-gauge)
- README and marketplace listing updated

## [0.0.1] - 2026-05-12

### Added
- **StatusBar**: Always-visible session (5h) % · weekly (7d) % indicator
- **Sidebar**: `used% · left%` dual display, 12px status-colored progress bars (green OK / amber Warning / red Blocked), real-time `HH:MM:SS` timestamp
- **Burn Rate**: `%/min` and `%/hr` consumption speed from polling history
- **Safe Until**: Predicted quota exhaustion time + projected remaining at reset
- **Dashboard Panel**: SESSION · WEEKLY · BURN RATE · SAFE UNTIL 4-card layout + utilization trend chart
- **Threshold alerts**: Native VS Code warning notification on utilization threshold breach
- **Auto-polling**: 5-minute interval polling via Anthropic `/v1/messages` API headers
- **Error UI**: `credentials_missing` / `token_expired` / `network_error` state differentiation with login prompt
