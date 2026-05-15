import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type { RateLimitSnapshot } from '../types';

export class StatusBarController {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = COMMANDS.openDashboard;
    this.item.text = '$(pulse) ...';
    this.item.tooltip = 'Claude Code Gauge — Loading...';
  }

  show(): void {
    this.item.show();
  }

  update(snapshot: RateLimitSnapshot): void {
    const fh = (snapshot.fiveHour.utilization * 100).toFixed(0);
    const sd = (snapshot.sevenDay.utilization * 100).toFixed(0);
    const icon = this.statusIcon(snapshot.overallStatus);

    this.item.text = `${icon} ${fh}% · ${sd}%`;

    const fhReset = this.fmtReset(snapshot.fiveHour.msUntilReset);
    const sdReset = this.fmtReset(snapshot.sevenDay.msUntilReset);
    this.item.tooltip = new vscode.MarkdownString(
      `**Claude Code Gauge Rate Limits**\n\n` +
      `Session (5h): **${fh}%** · resets in ${fhReset}\n\n` +
      `Weekly (7d): **${sd}%** · resets in ${sdReset}\n\n` +
      `_Click to open dashboard_`
    );
  }

  dispose(): void {
    this.item.dispose();
  }

  private statusIcon(status: RateLimitSnapshot['overallStatus']): string {
    if (status === 'blocked') return '$(pulse)$(error)';
    if (status === 'allowed_warning') return '$(pulse)$(warning)';
    return '$(pulse)';
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
