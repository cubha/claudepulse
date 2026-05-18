import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type { RateLimitSnapshot, UnifiedWindow } from '../types';

export class StatusBarController {
  private item5h: vscode.StatusBarItem;
  private item7d: vscode.StatusBarItem;

  constructor() {
    // 5H item이 더 왼쪽에 오도록 priority를 7D보다 높게
    this.item5h = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1001);
    this.item5h.command = COMMANDS.openDashboard;

    this.item7d = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    this.item7d.command = COMMANDS.openDashboard;
  }

  show(): void {
    this.item5h.show();
    this.item7d.show();
  }

  update(snapshot: RateLimitSnapshot, todayCostUsd?: number): void {
    const fh = snapshot.fiveHour;
    const sd = snapshot.sevenDay;

    // 5H item
    this.item5h.text = `5H ${this.pctToSquares(fh.utilization)} ${this.fmtPct(fh.utilization)}`;
    this.item5h.backgroundColor = this.windowBackground(fh);
    this.item5h.color = this.windowColor(fh);
    this.item5h.tooltip = this.buildTooltip(snapshot, todayCostUsd);

    // 7D item
    this.item7d.text = `7D ${this.pctToSquares(sd.utilization)} ${this.fmtPct(sd.utilization)}`;
    this.item7d.backgroundColor = this.windowBackground(sd);
    this.item7d.color = this.windowColor(sd);
    this.item7d.tooltip = undefined;
  }

  dispose(): void {
    this.item5h.dispose();
    this.item7d.dispose();
  }

  /** API status 우선, utilization % fallback */
  private windowBackground(w: UnifiedWindow): vscode.ThemeColor | undefined {
    if (w.status === 'blocked' || w.utilization > 0.8) {
      return new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    if (w.status === 'allowed_warning' || w.utilization > 0.6) {
      return new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    return undefined;
  }

  /** warning/error는 backgroundColor가 foreground를 자동 처리, 정상만 파란색 명시 */
  private windowColor(w: UnifiedWindow): string | undefined {
    if (w.status === 'blocked' || w.utilization > 0.8) return undefined;
    if (w.status === 'allowed_warning' || w.utilization > 0.6) return undefined;
    return '#3B82F6';
  }

  private pctToSquares(pct: number): string {
    const filled = pct < 0.10 ? 0
      : pct < 0.30 ? 1
      : pct < 0.50 ? 2
      : pct < 0.70 ? 3
      : pct < 0.90 ? 4
      : 5;
    const sq = pct < 0.50 ? '🟦' : pct < 0.90 ? '🟨' : '🟥';
    return sq.repeat(filled) + '⬜'.repeat(5 - filled);
  }

  private fmtPct(pct: number): string {
    return `${(pct * 100).toFixed(0)}%`;
  }

  private buildTooltip(snapshot: RateLimitSnapshot, todayCostUsd?: number): vscode.MarkdownString {
    const fh = snapshot.fiveHour;
    const sd = snapshot.sevenDay;
    const costLine = todayCostUsd != null ? `\n\nToday: **$${todayCostUsd.toFixed(2)}**` : '';
    return new vscode.MarkdownString(
      `**Claude Code Gauge**\n\n` +
      `Session (5h): **${this.fmtPct(fh.utilization)}** · resets in ${this.fmtReset(fh.msUntilReset)}\n\n` +
      `Weekly (7d): **${this.fmtPct(sd.utilization)}** · resets in ${this.fmtReset(sd.msUntilReset)}` +
      costLine + `\n\n_Click to open dashboard_`
    );
  }

  private fmtReset(ms: number): string {
    if (ms <= 0) return 'now';
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
}
