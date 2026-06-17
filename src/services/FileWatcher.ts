import * as chokidar from 'chokidar';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';

export type FileWatcherEvent = 'change';

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private readonly watchPath: string;
  private readonly debounceMs: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPath: string | null = null;

  constructor(claudeDir?: string, debounceMs = 500) {
    super();
    this.watchPath = path.join(claudeDir ?? path.join(os.homedir(), '.claude'), 'projects');
    this.debounceMs = debounceMs;
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(this.watchPath, {
      depth: 2,
      usePolling: true,   // WSL2 inotify 한계 우회
      interval: 3000,
      ignoreInitial: true,
      persistent: true,
      ignored: (p: string) => {
        const base = path.basename(p);
        return base.startsWith('.') && base !== '.claude';
      },
    });

    this.watcher.on('add', (p: string) => this.schedule(p));
    this.watcher.on('change', (p: string) => this.schedule(p));
  }

  /**
   * jsonl 변경 이벤트를 디바운스해 다발 이벤트를 1회 'change' 로 합친다.
   * (chokidar polling이 짧은 시간에 다수 이벤트를 쏟아도 refreshUsage 1회만 트리거)
   */
  private schedule(filePath: string): void {
    if (!filePath.endsWith('.jsonl')) return;
    this.pendingPath = filePath;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const p = this.pendingPath;
      this.pendingPath = null;
      if (p !== null) this.emit('change', p);
    }, this.debounceMs);
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingPath = null;
    void this.watcher?.close();
    this.watcher = null;
  }
}
