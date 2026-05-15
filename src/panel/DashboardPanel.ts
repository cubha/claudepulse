import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';
import { EXTENSION_NAME } from '../constants';
import { PushPollerError, PushRateLimit } from '../messaging/contracts';

export class DashboardPanel {
  private static current: DashboardPanel | null = null;
  private panel: vscode.WebviewPanel;

  static createOrShow(extensionUri: vscode.Uri, messenger: Messenger): void {
    if (DashboardPanel.current) {
      DashboardPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'claudeCodeGauge.dashboard',
      `${EXTENSION_NAME} Dashboard`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')]
      }
    );
    DashboardPanel.current = new DashboardPanel(panel, extensionUri, messenger);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, messenger: Messenger) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml(extensionUri);
    this.panel.onDidDispose(() => {
      DashboardPanel.current = null;
    });
    messenger.registerWebviewPanel(panel, { broadcastMethods: [PushRateLimit.method, PushPollerError.method] });
  }

  private getHtml(extensionUri: vscode.Uri): string {
    const webview = this.panel.webview;
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'styles.css')
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js')
    );
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `img-src ${webview.cspSource} data:`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`
    ].join('; ');
    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${cssUri}">
<title>Claude Code Gauge Dashboard</title>
</head><body class="theme-dark" data-mode="panel">
<div id="root">Loading…</div>
<script nonce="${nonce}" src="${jsUri}"></script>
</body></html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let n = '';
  for (let i = 0; i < 32; i++) n += chars.charAt(Math.floor(Math.random() * chars.length));
  return n;
}
