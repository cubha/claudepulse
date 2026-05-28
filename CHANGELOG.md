# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.32] - 2026-05-28

### Fixed
- **Usage Trend chart on first open**: Dashboard now pre-hydrates the trend chart with historical poll data on first open, eliminating the "Collecting data…" placeholder that appeared before the first manual refresh. The extension maintains a rolling buffer of up to 60 poll snapshots (`PollHistoryPoint[]`) and delivers them via the new `GetPollHistory` RPC before the initial `GetRateLimit` request, ensuring the chart renders immediately if the extension has been running.

## [0.1.31] - 2026-05-26

### Fixed
- **Overage billing link URL**: Corrected link target from `claude.ai/settings/billing` to `claude.ai/settings/usage` where the Usage Credits toggle actually lives.
- **Overage link label**: Updated text from "사용 크레딧 설정 →" to "사용량 설정 →" to match the correct page.

## [0.1.3] - 2026-05-26

### Changed
- **Overage Usage section redesign** (Sidebar): Removed show/hide pill toggle. Status is now always visible as a chip (`ACTIVE` / `BLOCKED`). Replaced `disabledReason` text with a `Usage Credits →` link button that opens `claude.ai/settings/billing` directly in the browser.

### Added
- `RequestOpenBillingSettings` message contract — webview notifies extension host, which calls `vscode.env.openExternal` to open the billing settings page.

## [0.1.2] - 2026-05-26

### Added
- **Overage section toggle** (Sidebar): Pill-style on/off toggle switch added to the Overage Usage section header. When toggled off, the progress bar and status chip are hidden while the header row remains visible for re-activation. Preference is persisted in `localStorage` (`ccg-show-overage`) and survives page reloads.

## [0.1.1] - 2026-05-25

### Added
- **Long-term cost persistence** (`CacheStore`): Daily usage snapshots are now saved to `globalStorageUri/ccg-history.json`. Each `refreshUsage()` cycle merges the latest 7 days into the store — data survives jsonl rotation (30-day rolling window) so 6-month and 1-year views are possible.
- **Long-term trend chart** (Dashboard): New section below Git ROI — line chart showing daily cost over 30 / 90 / 180 days (scope toggle). Data comes from `CacheStore` so it accumulates across sessions.
- **Monthly cost bar chart** (Dashboard): Aggregates historical daily data by YYYY-MM and renders a bar chart — see at a glance which month was most expensive.
- **This-month chip** (Sidebar): New `◑ this month $X.XX / ≈$Y.YY` chip below the branch row — current month accumulated cost plus a projected end-of-month estimate (linear extrapolation from elapsed days).
- **i18n**: 8 new translation keys for long-term trend UI (`this_month`, `projected`, `long_term_trend`, `monthly_cost`, `scope_30d`, `scope_90d`, `scope_180d`, `no_history_data`) in all 4 languages.

### Changed
- `UsageSummary` gains a new `historicalDays: DailyUsage[]` field — all persisted daily snapshots from `CacheStore`, sorted by date ascending and injected by the extension before each broadcast.
- Login command reverted to simple `claude login` in an integrated terminal (no platform-specific path detection — straightforward and works for the majority of setups).

## [0.1.0] - 2026-05-24

### Added
- **Git ROI — Branch cost tracking**: Every assistant response in `~/.claude/projects/**/*.jsonl` now includes a `gitBranch` field. Claude Code Gauge parses it directly — no `vscode.git` API needed.
- **Sidebar branch chip**: Active branch name + cumulative cost for that branch displayed as a `⎇ main · $0.42` chip below the tool usage row.
- **Dashboard Git ROI table**: New "Git ROI" section at the bottom of the Dashboard Panel — lists all branches with **Cost · Tokens · Sessions · Last Active** columns, sorted by cost descending.
- **Branch aggregation**: `UsageAggregator` now emits `branchBreakdown` (cost-sorted array) and `activeBranch` (most recent branch from latest record) in every `UsageSummary` push.
- **i18n**: 6 new translation keys (`branch_cost`, `git_roi`, `branch_label`, `sessions_label`, `last_active`, `no_branch_data`) added in all 4 supported languages (ko/en/ja/zh).

## [0.0.80] - 2026-05-21

### Fixed
- **Overage usage %**: Sidebar overage section now displays the actual utilization percentage (e.g., 101%) alongside the status chip. Previously only the "차단됨/활성" badge was shown with no numeric value.

### Changed
- **Section label clarity**: Renamed sidebar/panel labels — `세션 (5h)` → `세션사용량 (5h)`, `주간 (7d)` → `주간사용량 (7d)`, `초과` → `초과사용량`. Same change applied to all supported languages (en/ja/zh).

## [0.0.79] - 2026-05-20

### Fixed
- **Danger status color**: `danger` CSS class rules were missing — status badge, progress bar fill, progress bar outline, and rate-status chip now correctly render red (same as `blocked`) for the 90–<100 % range.

## [0.0.78] - 2026-05-20

### Changed
- **Status label refinement**: 90–100 % now displays **Danger** (위험) instead of Blocked — reserved **Blocked** (차단) exclusively for 100 % reached. Color scheme unchanged (both red). Applies consistently across StatusBar, Sidebar, and Dashboard Panel. A new `'danger'` status value was introduced in the internal type system; `worstStatus` priority order is `blocked > danger > allowed_warning > allowed`.

## [0.0.77] - 2026-05-19

### Changed
- **Status color thresholds**: Color decisions (StatusBar emoji 🟦🟨🟥 / background / font, Sidebar section dots / % text / progress bars, Dashboard progress bars / badge) now use fixed utilization % thresholds instead of raw Anthropic API status headers — 0–80 % blue · 80–90 % amber · 90–100 % red. API status header parsing is preserved in code for future re-enablement.

## [0.0.76] - 2026-05-19

### Changed
- **Status color unification**: StatusBar emoji gauge (🟦🟨🟥), background, font color and Sidebar section dots, utilization % text, progress bars now all derive color exclusively from the Anthropic API status value (`allowed` → blue · `allowed_warning` → amber · `blocked` → red). The previous utilization-% fallback thresholds (60%/80%) for preemptive color changes have been removed — color changes only when the API signals a state change.

## [0.0.75] - 2026-05-18

### Fixed
- **Dashboard loading state**: All data-dependent sections (Model Breakdown, Cache Efficiency, Tool Usage, Recently Edited Files, Recent Sessions) now show a pulsing "Collecting data…" indicator instead of an empty-state message while data is loading — prevents confusing "No data" flash on first open
- **Chart canvas overflow**: Daily Cost and Tool Usage canvases are now hidden until data arrives, preventing layout overflow that caused loading text to bleed into adjacent sections

## [0.0.74] - 2026-05-18

### Changed
- **Activity Bar icon**: Speedometer gauge SVG now correctly applied (16×16, semicircle track + active arc + needle + hub)
- **Marketplace icon**: Resized `icon.png` from 1024×1024 (~991 KB) to 256×256 (~27 KB) — 97% size reduction, faster extension panel load
- **README badges**: Replaced static badges with live shields.io badges — VS Marketplace version, Open VSX version, download count, MIT license

## [0.0.73] - 2026-05-18

### Added
- **StatusBar dual items**: Split into two independent `StatusBarItem` instances — `5H` and `7D` — each with its own emoji gauge and background color (yellow=warning / red=blocked)
- **StatusBar emoji gauge**: Usage level visualized as 5 colored squares (`🟦🟦🟦⬜⬜`) — blue for normal (0–50%), yellow for warning (50–90%), red for danger (90–100%)
- **Open Dashboard button**: Persistent button at the sidebar bottom — tactile depth styling (gradient + inner glow + press effect) — opens Dashboard Panel on click
- **Dashboard i18n**: All dashboard text (section headers, metric labels, chart titles, empty states, cache labels) fully translated via `t()` — respects the same 4-language setting as the sidebar
- **i18n real-time sync**: Language changes in the sidebar broadcast `PushLang` to the dashboard panel instantly — no panel reopen needed
- **New icon**: Speedometer gauge icon (PNG Marketplace + SVG Activity Bar) matching the extension's usage-monitoring identity

### Fixed
- **Overage section border**: Added `border-bottom` to the overage section for clear visual separation
- **Dashboard header spacing**: Removed duplicate `margin-left` on plan badge and status badge — consistent `gap: 4px` via flex container

### Internal
- `RequestSetLang` / `GetLang` / `PushLang` messaging contracts for cross-webview language sync
- `broadcastMethods` in `DashboardPanel` and `SidebarViewProvider` extended with `PushLang.method`
- Extension `globalState` persists language preference as `ccg-lang`

## [0.0.72] - 2026-05-18

### Changed
- **Sidebar title**: VS Code panel section name changed from `RATE LIMITS` → `CLAUDE CODE GAUGE` — eliminates redundant label duplication
- **Header layout**: Removed inner "Claude Code Gauge" title text; plan badge (`MAX 5X`) and status badge (`OK`) now lead the header row, followed by language selector, timestamp, and refresh button

### Added
- **Language selector** (sidebar header): Compact dropdown (`한국어 · English · 日本語 · 中文`) placed immediately after the OK badge — persists selection in `localStorage`, auto-detects from `navigator.language` on first open
- **i18n system** (`src/webview/i18n.ts`): 4-language dictionary (ko / en / ja / zh-CN) with `t()` lookup, `getLang()` / `setLang()` helpers, and `navigator.language` auto-detection fallback
- **Full UI translation**: All sidebar text — section labels, reset/burn/safe-until strings, error messages, login hints, overage labels — rendered in the selected language

## [0.0.71] - 2026-05-18

### Fixed
- **Sidebar section flattening** (P0): Removed nested card wrappers from Session and Weekly sections; replaced with flat `left-accent` bottleneck highlight and `sb-spacer` bottom fill — eliminates double-card layering artifact

## [0.0.70] - 2026-05-18

### Added
- **Tool usage chips** (sidebar): Color-coded `Edit N · Write N · Bash N · 🔍 N` chip row below the model/cache chips — shows today's tool call counts at a glance
- **Web search count** (sidebar): `🔍 N` chip sourced from `server_tool_use.web_search_requests` in `.jsonl` usage field
- **Tool usage histogram** (dashboard): Stacked bar chart showing Edit / Write / Bash / Search counts per day for the last 7 days
- **Recently edited files** (dashboard): List of up to 20 files touched in recent sessions, ordered by most-recent activity — shows filename and parent directory path

### Fixed
- **Sidebar card backgrounds** (P0): Session (5h) and Weekly (7d) rate cards now use `var(--vscode-sideBar-background)` instead of the slightly lighter card background — eliminates the double-card visual artifact
- **Dashboard section alignment** (P0): Cache Efficiency and Recent Sessions cards now have consistent `margin: 0 var(--sp-4)` matching all other dashboard sections — all 7 section cards align at the same left baseline as the 4-card metric grid

### Internal
- `ToolUseCounts` and `DailyToolStats` interfaces added to domain model
- `SessionRecord` extended with `toolCounts` and `editedFiles` fields
- `JsonlParser`: parses `message.content` tool_use blocks (Edit / MultiEdit / Write / Bash / WebSearch) and `usage.server_tool_use.web_search_requests`
- `UsageAggregator`: per-day tool rollup, recent-file tracking (last-seen timestamp dedup), `todayToolCounts` / `last7DaysTools` / `recentEditedFiles` added to `UsageSummary`

## [0.0.60] - 2026-05-17

### Added
- **Model chip**: Sidebar now shows today's top model (Opus / Sonnet / Haiku) as a color-coded chip below the token count row
- **Cache hit rate chip**: Sidebar shows today's cache hit rate (e.g. `⚡ 72%`) with saved cost in tooltip — powered by `cache_read_input_tokens` from `.jsonl`, no private API
- **Model breakdown section**: Dashboard panel includes a doughnut chart + bar list showing per-model cost share (Opus / Sonnet / Haiku) for today
- **Cache efficiency section**: Dashboard panel shows today's cache hit rate KPI, cumulative saved cost, and a 7-day hit rate sparkline

### Internal
- `ModelBreakdown` and `CacheStats` interfaces added to domain model
- `DailyUsage` extended with `cacheHitRate` field for per-day sparkline
- `UsageSummary` extended with `modelBreakdown[]` and `cacheStats`
- `UsageAggregator`: per-model token/cost rollup, cache hit rate formula (`cache_read / (input + cache_creation + cache_read)`), cache saved cost via LiteLLM price delta

## [0.0.5] - 2026-05-16

### Added
- **Today's usage summary**: Sidebar now shows "오늘 N tokens · ~$X.XX" one-line row — powered by local `.jsonl` parsing, no extra API call
- **7-day cost bar chart**: Dashboard panel now includes a daily cost chart for the last 7 days
- **Recent sessions list**: Dashboard shows up to 20 most recent sessions with start time, working directory, token count, and cost

### Infrastructure
- `FileWatcher`: chokidar v3 file watcher with WSL `usePolling` fallback, `depth:2`, 3 s polling interval
- `JsonlParser`: incremental `readline` parser with `mtime`+`offset` cache, `progress`/`file-history-snapshot` type filter, dual dedup via `requestId` (streaming) + `message.id` (cross-file)
- `UsageAggregator`: daily/weekly/monthly rollup with LiteLLM-based cost calculation
- `WorkspaceMapper`: encode-then-match pattern for `~/.claude/projects/<encoded>` resolution
- `src/utils/pricing.ts`: Claude model price snapshot (opus-4 / sonnet-4-5 / haiku-4-5)
- New messaging contracts: `GetUsageSummary` / `PushUsageSummary`

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
