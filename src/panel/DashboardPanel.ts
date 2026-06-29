import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';
import { EXTENSION_NAME } from '../constants';
import { WEBVIEW_BROADCAST_METHODS } from '../messaging/contracts';

export class DashboardPanel {
  private static current: DashboardPanel | null = null;
  private panel: vscode.WebviewPanel;

  /**
   * 패널 오픈 여부. extension이 회고 build+push를 이 게이트로 제한한다
   * (패널 닫힌 동안 파일 변경마다 백그라운드 git 셸아웃이 도는 회귀 방지).
   */
  static get isOpen(): boolean {
    return DashboardPanel.current !== null;
  }

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
    messenger.registerWebviewPanel(panel, { broadcastMethods: WEBVIEW_BROADCAST_METHODS });
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
