import * as chokidar from 'chokidar';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';
import { DEFAULT_USAGE_REFRESH_INTERVAL_MS } from '../constants';

export type FileWatcherEvent = 'change';

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private readonly watchPath: string;
  private readonly minIntervalMs: number;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPath: string | null = null;
  private lastEmitAt = 0;

  constructor(claudeDir?: string, minIntervalMs = DEFAULT_USAGE_REFRESH_INTERVAL_MS) {
    super();
    this.watchPath = path.join(claudeDir ?? path.join(os.homedir(), '.claude'), 'projects');
    this.minIntervalMs = minIntervalMs;
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(this.watchPath, {
      depth: 2,
      usePolling: true,   // WSL2 inotify 한계 우회
      // 감지 주기는 짧게 유지한다 — 비싼 쪽은 stat 스윕이 아니라 aggregate+렌더이고,
      // 그건 아래 스로틀이 막는다. 여기까지 늘리면 스로틀 위에 지연이 한 겹 더 얹힌다.
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
   * jsonl 변경 이벤트를 **스로틀**해 'change' 방출을 minIntervalMs당 1회로 제한한다.
   *
   * - leading edge: 조용하던 구간 뒤 첫 변경은 즉시 방출한다(체감 지연 0).
   * - trailing: 간격 안에 들어온 변경은 경로만 갱신하고 **예약된 타이머를 리셋하지 않는다**.
   *
   * 타이머를 리셋하면 디바운스가 되는데, jsonl은 세션이 살아있는 한 계속 append되므로
   * 디바운스는 작업 중 내내 발화하지 않는다(constants.DEFAULT_USAGE_REFRESH_INTERVAL_MS 주석 참조).
   */
  private schedule(filePath: string): void {
    if (!filePath.endsWith('.jsonl')) return;
    this.pendingPath = filePath;
    if (this.throttleTimer) return;   // 다음 방출이 이미 예약됨 — 리셋 금지

    const elapsed = Date.now() - this.lastEmitAt;
    if (elapsed >= this.minIntervalMs) {
      this.flush();
      return;
    }
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      this.flush();
    }, this.minIntervalMs - elapsed);
  }

  private flush(): void {
    const p = this.pendingPath;
    this.pendingPath = null;
    this.lastEmitAt = Date.now();
    if (p !== null) this.emit('change', p);
  }

  stop(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingPath = null;
    void this.watcher?.close();
    this.watcher = null;
  }
}
