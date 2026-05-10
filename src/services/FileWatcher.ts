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
  private pendingPaths = new Set<string>();

  constructor(
    private readonly rootPath: string,
    private readonly debounceMs: number,
    private readonly onChange: (changedPaths: string[]) => void | Promise<void>,
    private readonly logger: Logger
  ) {}

  start(): void {
    if (this.watcher) return;
    this.watcher = chokidar.watch(this.rootPath, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: false,
      depth: 4
    });
    this.watcher.on('add', (p) => this.schedule(p));
    this.watcher.on('change', (p) => this.schedule(p));
    this.watcher.on('unlink', (p) => this.schedule(p));
    this.logger.info(`FileWatcher started: ${this.rootPath}`);
  }

  private schedule(path: string): void {
    if (!path.endsWith('.jsonl')) return;
    this.pendingPaths.add(path);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const paths = Array.from(this.pendingPaths);
      this.pendingPaths.clear();
      this.debounceTimer = null;
      Promise.resolve(this.onChange(paths)).catch((err: unknown) =>
        this.logger.error('FileWatcher onChange failed', err)
      );
    }, this.debounceMs);
  }

  async dispose(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingPaths.clear();
    await this.watcher?.close();
    this.watcher = null;
  }
}
