# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.4] - 2026-05-15

### Added
- **Plan badge**: Subscription type and rate-limit tier (e.g. "Max 5x") now displayed as a badge in the sidebar and panel headers, read from `~/.claude/.credentials.json`
- **Overage section**: Dedicated progress bar + Active/Blocked chip for overage (extra usage) quota — shown when the API reports overage state
- **Fallback banner**: Inline warning banner when Claude falls back to reduced speed (e.g. "50% speed") — parsed from `anthropic-ratelimit-unified-fallback` header
- **Bottleneck highlight**: The current limiting window card (5h or 7d) is visually highlighted with an amber border — driven by `anthropic-ratelimit-unified-representative-claim`
- **7d surpassed-threshold badge**: Red `>75%` badge on the Weekly card when a usage threshold has been surpassed

### Internal
- `CredentialsReader` now reads `subscriptionType`, `rateLimitTier`, `organizationUuid` from credentials
- `RateLimitPoller` parses 9 additional API response headers (overage ×3, fallback ×2, representative-claim, 7d-surpassed-threshold, upgrade-paths)
- New types: `PlanInfo`, `OverageWindow`, `FallbackInfo` added to domain model

## [0.0.31] - 2026-05-14

### Changed
- **Status badge placement**: Moved "OK / Warning / Blocked" badge from standalone row to inline right of the title in sidebar and dashboard headers — one badge per view instead of three
- **Removed duplicate status chips**: SESSION and WEEKLY cards no longer show individual OK chips; progress bar color (teal / amber / red) conveys per-window status
- **Sidebar card spacing**: Added 3% horizontal margin to SESSION / WEEKLY cards so they float slightly from the sidebar walls

## [0.0.3] - 2026-05-14

### Fixed
- **Sidebar whitespace**: Removed default `body` margin and card side margins — content now fills full sidebar width
- **Progress bars inverted**: Bars were showing remaining% instead of used% due to block-element default width; now correctly animate from 0 to actual utilization
- **Status badge unstyled "OK"**: CSP blocked inline `style=""` attributes; fixed by adding `'unsafe-inline'` to `style-src` and converting status colors to CSS classes
- **Burn Rate / Safe Until stuck on "Collecting data…"**: Now computes an estimated burn rate from session elapsed time when only one poll point is available (labeled `est.`); shows "No usage yet" when utilization is zero

### Added
- **Trend chart time scope selector**: Toggle between 30m / 2h (default) / 24h views directly on the chart
- **Chart X-axis seconds**: Labels now include `HH:MM:SS` for better granularity in short windows
- **Smart data points**: Shows dot markers when ≤10 data points for readability in sparse views

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
