# Claude Code Gauge

> Real-time Claude Max rate limit monitor — right inside VS Code & Cursor.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-cubha.claude--usage--dashboard-purple)](https://open-vsx.org/extension/cubha/claude-code-gauge)

Stop switching to your browser to check Claude rate limits. See your **5-hour session**, **7-day weekly usage**, and **today's token cost** at a glance — with burn rate predictions and safe-until estimates — without leaving your editor.

## Features

### Rate Limit Monitor (API headers)
- **StatusBar**: Always-visible `⚡ 29% · 98%` — session and weekly usage at a glance
- **Sidebar**: `used% · left%` dual display + status-colored progress bars (teal OK / amber Warning / red Blocked) + overall status badge inline with title
- **Plan badge**: Your subscription tier (e.g. `Max 5x`) shown in the header — read from local credentials, no extra API call
- **Burn Rate**: `%/min` consumption speed — estimated from session elapsed time on first open, then refined from poll history
- **Safe Until**: Predicted time when your 5h quota runs out at current burn rate
- **Dashboard Panel**: SESSION · WEEKLY · BURN RATE · SAFE UNTIL 4-card layout + utilization trend chart
- **Trend Chart Scope**: Toggle 30m / 2h / 24h view window directly on the chart
- **Bottleneck highlight**: The currently limiting window (5h or 7d) is outlined in amber so you instantly see what's constraining you
- **Overage section**: Progress bar + status chip for your overage (extra usage) quota when active
- **Fallback banner**: Inline warning when Claude throttles to reduced speed (e.g. 50%)
- **7d threshold badge**: Red badge on the Weekly card when a usage threshold has been surpassed
- **Threshold alerts**: Native VS Code warning notification when usage exceeds your configured limit
- **Auto-polling**: Fetches latest rate limit headers from Anthropic API every 5 minutes

### Token & Cost Analytics (local `.jsonl` — v0.0.5+)
- **Today's usage**: Sidebar shows "N tokens · ~$X.XX" — parsed directly from `~/.claude/projects/**/*.jsonl`, no API call
- **Model chip**: Color-coded Opus / Sonnet / Haiku chip showing today's primary model in the sidebar
- **Cache hit rate chip**: Today's cache hit rate (e.g. `⚡ 72%`) with saved cost in tooltip — pure local calculation
- **7-day cost bar chart**: Dashboard panel shows daily spend for the past 7 days
- **Model breakdown**: Doughnut chart + bar list showing per-model cost share for today (v0.0.60)
- **Cache efficiency**: Hit rate KPI, cumulative saved cost, and 7-day sparkline in the dashboard (v0.0.60)
- **Session history**: Up to 20 recent sessions with start time, working directory, token count, and estimated cost
- **LiteLLM pricing**: Offline cost calculation using embedded model price snapshot (opus-4 / sonnet-4-5 / haiku-4-5)

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
