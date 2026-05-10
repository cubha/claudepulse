import * as vscode from 'vscode';
import { Logger } from './logger';
import { COMMANDS } from './constants';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger('Claudepulse');
  logger.info('extension activating...');

  // TODO: wire up FileWatcher · CacheStore · UsageAggregator · WorkspaceMapper
  // TODO: register SidebarViewProvider (claudepulse.sidebar)
  // TODO: register StatusBarController
  // TODO: register DashboardPanel command (openDashboard)

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.openDashboard, () => {
      vscode.window.showInformationMessage('Claudepulse: Dashboard (TODO — Phase: implement DashboardPanel)');
    }),
    vscode.commands.registerCommand(COMMANDS.refresh, () => {
      vscode.window.showInformationMessage('Claudepulse: Refresh (TODO)');
    })
  );

  logger.info('extension activated.');
}

export function deactivate(): void {
  // TODO: dispose FileWatcher, flush CacheStore
}
