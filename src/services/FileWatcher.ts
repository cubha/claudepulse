import * as chokidar from 'chokidar';
import { Logger } from '../logger';

/**
 * chokidar 래퍼.
 *
 * ⚠️ vscode.workspace.createFileSystemWatcher는 워크스페이스 외부(~/.claude) 감시 불가 (HARD).
 *    chokidar 필수.
 */
export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly rootPath: string,
    private readonly debounceMs: number,
    private readonly onChange: () => void | Promise<void>,
    private readonly logger: Logger
  ) {}

  start(): void {
    if (this.watcher) return;
    this.watcher = chokidar.watch(this.rootPath, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: true,
      depth: 4
    });
    this.watcher.on('add', (p) => this.schedule(p, 'add'));
    this.watcher.on('change', (p) => this.schedule(p, 'change'));
    this.logger.info(`FileWatcher started: ${this.rootPath}`);
    // TODO: handle .jsonl 필터링, 초기 스캔 트리거
  }

  private schedule(_path: string, _kind: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.onChange();
    }, this.debounceMs);
  }

  async dispose(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    await this.watcher?.close();
    this.watcher = null;
  }
}
