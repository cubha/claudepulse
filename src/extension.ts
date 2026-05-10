import * as vscode from 'vscode';
import { Logger } from './logger';
import { COMMANDS, VIEW_IDS } from './constants';
import { SidebarViewProvider } from './providers/SidebarViewProvider';
import { StatusBarController } from './providers/StatusBarController';
import { DashboardPanel } from './panel/DashboardPanel';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger('Claudepulse');
  logger.info('extension activating...');

  // StatusBar — placeholder 값으로 즉시 표시 (실제 집계는 /sh-dev-loop에서 wire)
  const statusBar = new StatusBarController();
  statusBar.update({ tokensToday: 0, sessionCostUsd: 0 });
  statusBar.show();

  // Sidebar Webview View — 패널 등록 (HTML placeholder 렌더, 데이터 바인딩은 다음 Phase)
  const sidebarProvider = new SidebarViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_IDS.sidebar, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.openDashboard, () => {
      DashboardPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand(COMMANDS.refresh, () => {
      vscode.window.showInformationMessage('Claudepulse: Refresh (TODO — wire UsageAggregator in /sh-dev-loop)');
    })
  );

  context.subscriptions.push(statusBar, logger);

  // TODO (다음 단계 /sh-dev-loop):
  //  - FileWatcher.start() (chokidar)
  //  - JsonlParser 증분 + message.id dedup
  //  - UsageAggregator.buildSnapshot() → SidebarView/Panel push (vscode-messenger)
  //  - WorkspaceMapper로 현재 워크스페이스 매핑
  //  - costAlertThresholdUsd 임계값 알림

  logger.info('extension activated. (placeholder wiring — data layer pending)');
}

export function deactivate(): void {
  // dispose는 context.subscriptions가 자동 처리
}
