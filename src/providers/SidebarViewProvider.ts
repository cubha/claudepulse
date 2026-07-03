import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';
import { VIEW_IDS } from '../constants';
import { WEBVIEW_BROADCAST_METHODS } from '../messaging/contracts';
import { getNonce } from '../utils/nonce';

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = VIEW_IDS.sidebar;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly messenger: Messenger
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    this.messenger.registerWebviewView(webviewView, { broadcastMethods: WEBVIEW_BROADCAST_METHODS });
  }

  private getHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'styles.css')
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.js')
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
<title>Claude Code Gauge Sidebar</title>
</head><body class="theme-dark" data-mode="sidebar">
<div id="root">Loading…</div>
<script nonce="${nonce}" src="${jsUri}"></script>
</body></html>`;
  }
}
