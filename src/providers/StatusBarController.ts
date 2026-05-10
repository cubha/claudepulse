import * as vscode from 'vscode';
import { COMMANDS } from '../constants';

export class StatusBarController {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = COMMANDS.openDashboard;
    this.item.text = '$(pulse) ...';
    this.item.tooltip = 'Claudepulse — Loading...';
  }

  show(): void {
    this.item.show();
  }

  update(opts: { tokensToday: number; sessionCostUsd: number }): void {
    const tokens = formatTokens(opts.tokensToday);
    const cost = `$${opts.sessionCostUsd.toFixed(2)}`;
    this.item.text = `$(pulse) ${tokens} · ${cost}`;
    this.item.tooltip = new vscode.MarkdownString(
      `**Claudepulse**\n\nToday: ${tokens} · ${cost}\n\n_Click to open dashboard_`
    );
  }

  dispose(): void {
    this.item.dispose();
  }
}

function formatTokens(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
