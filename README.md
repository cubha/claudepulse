# Claude Code Gauge

> Real-time Claude Max rate limit monitor — right inside VS Code & Cursor.

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/cubha.claude-code-gauge?label=VS%20Marketplace&color=0078d4)](https://marketplace.visualstudio.com/items?itemName=cubha.claude-code-gauge)
[![Open VSX](https://img.shields.io/open-vsx/v/cubha/claude-code-gauge?label=Open%20VSX&color=a855f7)](https://open-vsx.org/extension/cubha/claude-code-gauge)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/cubha.claude-code-gauge?color=22c55e)](https://marketplace.visualstudio.com/items?itemName=cubha.claude-code-gauge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Stop switching to your browser to check Claude rate limits. See your **5-hour session**, **7-day weekly usage**, **today's token cost**, **what Claude actually did**, **which skill & branch cost how much**, and **how much your subagents spend** — with burn rate predictions, tool usage breakdowns, per-skill cost attribution, and Git branch ROI — without leaving your editor.

## Features

### Rate Limit Monitor (API headers)
- **StatusBar**: Two independent items — `5H 🟦🟦⬜⬜⬜ 28%` and `7D 🟦⬜⬜⬜⬜ 14%` — emoji fill count based on utilization %; color (🟦🟨🟥), background, and font based on utilization thresholds (0–80 % blue · 80–90 % amber · 90–<100 % red Danger · 100 % red Blocked)
- **Sidebar**: Three labeled sections — **세션사용량 (5h)** · **주간사용량 (7d)** · **초과사용량** — each with `used% · left%` display + status-colored progress bars (blue OK / amber Warning / red Danger·Blocked) + overall status badge inline with title
- **Plan badge**: Your subscription tier (e.g. `Max 5x`) shown in the header — read from local credentials, no extra API call
- **Burn Rate**: `%/min` consumption speed — estimated from session elapsed time on first open, then refined from poll history
- **Safe Until**: Predicted time when your 5h quota runs out at current burn rate
- **Dashboard Panel**: SESSION · WEEKLY · BURN RATE · SAFE UNTIL 4-card layout + utilization trend chart
- **Trend Chart Scope**: Toggle 30m / 2h / 24h view window directly on the chart
- **Bottleneck highlight**: The currently limiting window (5h or 7d) is outlined in amber so you instantly see what's constraining you
- **Overage section**: Progress bar + status chip for your overage (extra usage) quota — shows the overage rate-limit utilization **only when active** (amber), and a `DISABLED` chip when overage is rejected/disabled instead of a misleading "0%". A help tooltip clarifies this is the overage *rate-limit* usage (consumed after your base 5h/7d quota is exhausted), distinct from the claude.ai "Usage Credits" dollar-spend figure
- **Fallback banner**: Inline warning when Claude throttles to reduced speed (e.g. 50%)
- **7d threshold badge**: Red badge on the Weekly card when a usage threshold has been surpassed
- **Threshold alerts**: Native VS Code warning notification when usage exceeds your configured limit
- **Auto-polling**: Fetches latest rate limit headers from Anthropic API every 5 minutes

### Token & Cost Analytics (local `.jsonl` — v0.0.5+)
- **Today's usage**: Sidebar shows "N tokens · ~$X.XX" — parsed directly from `~/.claude/projects/**/*.jsonl`, no API call
- **Model chip**: Color-coded Fable / Opus / Sonnet / Haiku chip showing today's primary model in the sidebar
- **Cache hit rate chip**: Today's cache hit rate (e.g. `⚡ 72%`) with saved cost in tooltip — pure local calculation
- **7-day cost bar chart**: Dashboard panel shows daily spend for the past 7 days
- **Model breakdown**: Doughnut chart + bar list showing per-model cost share for today (v0.0.60)
- **Cache efficiency**: Hit rate KPI, cumulative saved cost, and 7-day sparkline in the dashboard (v0.0.60)
- **Session history**: Up to 20 recent sessions with start time, working directory, token count, and estimated cost
- **LiteLLM pricing**: Offline cost calculation using embedded model price snapshot (fable-5 / opus-4.5–4.8 / sonnet-4.5–4.6 / haiku-4.5, with legacy fallbacks)

### Language Support (v0.0.72+)
- **4-language UI**: Switch between 한국어 / English / 日本語 / 中文 via the compact dropdown in the sidebar header — all labels, section names, error messages, and burn-rate strings update instantly
- **Full dashboard translation**: Dashboard panel section headers, metric labels, chart titles, and empty states are all translated (v0.0.73+)
- **Real-time sync**: Changing language in the sidebar instantly updates the dashboard panel without reopening — broadcast via extension messaging (v0.0.73+)
- **Auto-detection**: Defaults to your system language (`navigator.language`) on first install; persists your choice across sessions via extension `globalState`

### Sidebar Navigation (v0.0.73+)
- **Open Dashboard button**: Persistent button at the bottom of the sidebar — tactile depth styling with gradient and press effect — opens the full Dashboard Panel in one click

### Action Insights — *what Claude did* (local `.jsonl` — v0.0.70+)
- **Tool usage chips** (sidebar): `Edit N · Write N · Bash N · Read N · Grep N · 🔍 N · 🌐 N · MCP N` — today's tool call counts at a glance, with `Read`, `Grep`/`Glob`, `WebFetch`, and `MCP` (`mcp__*`) broken out from the old catch-all bucket (v0.1.34)
- **Tool usage histogram** (dashboard): Stacked bar chart of Edit / Write / Bash / Search per day for the last 7 days — spot heavy editing vs. execution sessions
- **Recently edited files** (dashboard): Up to 20 files touched in recent sessions, ordered by last activity — filename + full path

### Cost Attribution — *where the cost went* (local `.jsonl` — v0.1.34+)
- **Cost by Skill** (dashboard): Ranked bar list of cost per `attributionSkill` (sh-dev-loop, ship, plan, research, …) — see which Claude Code skills drive your spend
- **Subagent vs. main split** (dashboard): Subagent consumption share, cost, and unique-agent count from `isSidechain`/`agentId` — separate background subagent usage from your main session

### Long-term Cost Tracking (local persistence — v0.1.1+)
- **CacheStore**: Daily usage snapshots persist to `globalStorageUri/ccg-history.json` — survives jsonl rotation so history accumulates across months
- **Long-term trend chart** (dashboard): Daily cost line chart with 30d / 90d / 180d scope toggle — see spending patterns across months
- **Monthly cost bar chart** (dashboard): Month-by-month cost aggregation — spot your most expensive periods
- **This-month chip** (sidebar): `◑ This month $X.XX / ≈$Y.YY` — current month spend + projected end-of-month cost (linear extrapolation)

### Git Branch ROI (local `.jsonl` — v0.1.0+)
- **Branch cost chip** (sidebar): `⎇ main · $0.42` chip showing the active branch and its cumulative cost — parsed directly from `gitBranch` field in every jsonl entry, no Git API dependency
- **Git ROI table** (dashboard): Full branch breakdown — **Branch · Cost · Tokens · Sessions · Last Active** — sorted by cost so your most expensive branches surface first

## How it works

Claude Code Gauge uses **two data sources**:

| Source | What it tracks | How |
|---|---|---|
| `~/.claude/.credentials.json` + Anthropic API | Rate limit windows (5h / 7d), plan tier | OAuth token + minimal API poll every 5 min |
| `~/.claude/projects/**/*.jsonl` | Token count, cost per session/day | Local file parsing — no network, no private API |

- **No private APIs** — official Anthropic API only for rate limits
- **Minimal quota usage**: 1-token haiku request per poll ≈ 5–10 input tokens
- **Streaming dedup**: `requestId` + `message.id` dual dedup prevents double-counting streamed responses

## Requirements

- VS Code `^1.85.0` or Cursor (latest)
- **Claude Max plan** subscription
- Claude Code CLI installed and logged in (`~/.claude/.credentials.json` must exist)

## Installation

Search **"Claude Code Gauge"** in the VS Code Extensions panel or Open VSX Registry and install.  
The extension activates automatically on startup and begins polling immediately.

## Commands

| Command | Description |
|---|---|
| `Claude Code Gauge: Open Dashboard` | Open the full Dashboard Panel |
| `Claude Code Gauge: Refresh` | Force an immediate poll |

## Settings

`Settings → Extensions → Claude Code Gauge`:

| Setting | Default | Description |
|---|---|---|
| `claudeCodeGauge.credentialsPath` | `~/.claude/.credentials.json` | Override credentials file path |
| `claudeCodeGauge.pollIntervalMs` | `300000` (5 min) | Polling interval in ms |
| `claudeCodeGauge.utilizationWarnThreshold` | `0.8` (80%) | Warning alert threshold (0–1) |

## Changelog

See [CHANGELOG.md](./CHANGELOG.md)

## License

MIT — [LICENSE](./LICENSE)
