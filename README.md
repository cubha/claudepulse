# Claude Code Gauge

> Real-time Claude Max rate limit monitor — right inside VS Code & Cursor.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-cubha.claude--usage--dashboard-purple)](https://open-vsx.org/extension/cubha/claude-code-gauge)

Stop switching to your browser to check Claude rate limits. See your **5-hour session** and **7-day weekly** usage at a glance — with burn rate predictions and safe-until estimates — without leaving your editor.

## Features

- **StatusBar**: Always-visible `⚡ 29% · 98%` — session and weekly usage at a glance
- **Sidebar**: `used% · left%` dual display + status-colored progress bars (teal OK / amber Warning / red Blocked) + overall status badge inline with title
- **Burn Rate**: `%/min` consumption speed — estimated from session elapsed time on first open, then refined from poll history
- **Safe Until**: Predicted time when your 5h quota runs out at current burn rate
- **Dashboard Panel**: SESSION · WEEKLY · BURN RATE · SAFE UNTIL 4-card layout + utilization trend chart
- **Trend Chart Scope**: Toggle 30m / 2h / 24h view window directly on the chart
- **Threshold alerts**: Native VS Code warning notification when usage exceeds your configured limit
- **Auto-polling**: Fetches latest rate limit headers from Anthropic API every 5 minutes

## How it works

Claude Code Gauge reads the OAuth token from `~/.claude/.credentials.json` (created by Claude Code CLI) and polls `POST https://api.anthropic.com/v1/messages` every 5 minutes. Rate limit status is extracted directly from the response headers.

- **No local file parsing** — does not touch your `.jsonl` session files
- **No private APIs** — official Anthropic API only
- **Minimal quota usage**: 1-token haiku request per poll ≈ 5–10 input tokens

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
