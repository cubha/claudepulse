import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { Messenger } from 'vscode-messenger';
import { BROADCAST } from 'vscode-messenger-common';
import { Logger } from './logger';
import { COMMANDS, CONFIG_KEYS, DEFAULT_CLAUDE_PROJECTS_PATH, VIEW_IDS } from './constants';
import { SidebarViewProvider } from './providers/SidebarViewProvider';
import { StatusBarController } from './providers/StatusBarController';
import { DashboardPanel } from './panel/DashboardPanel';
import { FileWatcher } from './services/FileWatcher';
import { JsonlParser } from './services/JsonlParser';
import { UsageAggregator } from './services/UsageAggregator';
import { CacheStore } from './services/CacheStore';
import { PushSnapshot } from './messaging/contracts';
import { registerHandlers } from './messaging/handlers';

let lastAlertedThreshold = -1;

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger('Claudepulse');
  logger.info('extension activating...');

  // --- 서비스 계층 초기화 ---
  const cacheStore = new CacheStore(context.globalStorageUri);
  const parser = new JsonlParser();
  const aggregator = new UsageAggregator();
  const messenger = new Messenger();

  let fileIndex: Record<string, { mtime: number; byteOffset: number }> = {};
  let lastSnapshot = null as import('./types').SnapshotPayload | null;

  // --- StatusBar ---
  const statusBar = new StatusBarController();
  statusBar.update({ tokensToday: 0, sessionCostUsd: 0 });
  statusBar.show();

  // --- Messenger handlers ---
  registerHandlers(messenger, () => lastSnapshot, () => runIncrementalScan([]), aggregator);

  // --- Sidebar ---
  const sidebarProvider = new SidebarViewProvider(context.extensionUri, messenger);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_IDS.sidebar, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // --- Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.openDashboard, () => {
      DashboardPanel.createOrShow(context.extensionUri, messenger);
    }),
    vscode.commands.registerCommand(COMMANDS.refresh, () => {
      void runIncrementalScan([]);
    })
  );

  context.subscriptions.push(statusBar, logger);

  // --- MVP-8: 임계값 설정 변경 감지 ---
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(CONFIG_KEYS.costAlertThresholdUsd)) {
        const newThreshold = vscode.workspace
          .getConfiguration('claudepulse')
          .get<number>(CONFIG_KEYS.costAlertThresholdUsd) ?? 10;
        if (newThreshold > lastAlertedThreshold) {
          lastAlertedThreshold = -1;
        }
      }
    })
  );

  // --- 초기화: file-index 로드 → FileWatcher 시작 ---
  void (async () => {
    fileIndex = await cacheStore.loadFileIndex();

    const claudeProjectsPath = vscode.workspace
      .getConfiguration('claudepulse')
      .get<string>(CONFIG_KEYS.claudeProjectsPath) || DEFAULT_CLAUDE_PROJECTS_PATH;

    const debounceMs = vscode.workspace
      .getConfiguration('claudepulse')
      .get<number>(CONFIG_KEYS.refreshDebounceMs) ?? 300;

    const watcher = new FileWatcher(
      claudeProjectsPath,
      debounceMs,
      (changedPaths) => runIncrementalScan(changedPaths),
      logger
    );
    watcher.start();
    context.subscriptions.push({ dispose: () => void watcher.dispose() });
  })();

  // --- Orchestrator ---
  async function runIncrementalScan(changedPaths: string[]): Promise<void> {
    const pathsToScan = changedPaths.length > 0
      ? changedPaths
      : await getAllJsonlPaths(
          vscode.workspace
            .getConfiguration('claudepulse')
            .get<string>(CONFIG_KEYS.claudeProjectsPath) || DEFAULT_CLAUDE_PROJECTS_PATH
        );

    const newRecords: import('./types').UsageRecord[] = [];

    for (const filePath of pathsToScan) {
      try {
        const stat = await fs.stat(filePath);
        const cached = fileIndex[filePath];
        // mtime이 같으면 이전 offset 이어서, 달라졌으면 0부터
        const byteOffset = cached?.mtime === stat.mtimeMs ? cached.byteOffset : 0;
        const { records, newOffset } = await parser.parseIncremental(filePath, byteOffset);
        fileIndex[filePath] = { mtime: stat.mtimeMs, byteOffset: newOffset };
        newRecords.push(...records);
      } catch {
        // 파일 삭제 또는 접근 불가 — 인덱스에서 제거
        delete fileIndex[filePath];
      }
    }

    logger.info(`incremental scan: ${pathsToScan.length} files, ${newRecords.length} new records`);

    if (newRecords.length > 0) {
      aggregator.ingest(newRecords);
    }

    // 현재 워크스페이스 경로 → UsageRecord.projectPath(decoded)와 직접 비교
    const wsPath = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
    const snapshot = aggregator.buildSnapshot(new Date(), wsPath);
    lastSnapshot = snapshot;

    statusBar.update({
      tokensToday: snapshot.today.totalTokens,
      sessionCostUsd: snapshot.today.cost
    });
    messenger.sendNotification(PushSnapshot, BROADCAST, snapshot);

    // MVP-8: 임계값 초과 알림
    checkCostThreshold(snapshot.monthToDate.cost);

    await cacheStore.saveFileIndex(fileIndex);
  }

  function checkCostThreshold(mtdCost: number): void {
    const threshold = vscode.workspace
      .getConfiguration('claudepulse')
      .get<number>(CONFIG_KEYS.costAlertThresholdUsd) ?? 10;
    if (mtdCost > threshold && lastAlertedThreshold < threshold) {
      lastAlertedThreshold = threshold;
      void vscode.window
        .showWarningMessage(
          `Claudepulse: Monthly cost $${mtdCost.toFixed(2)} exceeded $${threshold.toFixed(2)}`,
          'Open Dashboard',
          'Adjust threshold'
        )
        .then(selection => {
          if (selection === 'Open Dashboard') {
            void vscode.commands.executeCommand(COMMANDS.openDashboard);
          } else if (selection === 'Adjust threshold') {
            void vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_KEYS.costAlertThresholdUsd);
          }
        });
    }
  }

  logger.info('extension activated.');
}

export function deactivate(): void {
  // dispose는 context.subscriptions가 자동 처리
}

async function getAllJsonlPaths(rootPath: string): Promise<string[]> {
  const result: string[] = [];
  try {
    await walk(rootPath, result, 0);
  } catch {
    // 경로 접근 불가 — 빈 배열 반환
  }
  return result;
}

async function walk(dir: string, out: string[], depth: number): Promise<void> {
  if (depth > 4) return;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(full, out, depth + 1);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
}
