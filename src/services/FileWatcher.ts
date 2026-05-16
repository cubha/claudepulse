import * as chokidar from 'chokidar';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';

export type FileWatcherEvent = 'change';

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private readonly watchPath: string;

  constructor(claudeDir?: string) {
    super();
    this.watchPath = path.join(claudeDir ?? path.join(os.homedir(), '.claude'), 'projects');
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

    const emit = (filePath: string) => {
      if (filePath.endsWith('.jsonl')) {
        this.emit('change', filePath);
      }
    };

    this.watcher.on('add', emit);
    this.watcher.on('change', emit);
  }

  stop(): void {
    void this.watcher?.close();
    this.watcher = null;
  }
}
