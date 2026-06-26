import * as chokidar from 'chokidar';
import { EventEmitter } from 'node:events';

export type CredentialsWatcherEvent = 'change';

/**
 * ~/.claude/.credentials.json 단일 파일 감시 래퍼.
 *
 * Claude Code CLI는 accessToken을 refreshToken으로 갱신할 때 이 파일을 다시 쓴다.
 * 변경을 감지해 즉시 재폴링하면, CLI 활성 구간에서 stale 토큰으로 인한
 * "토큰 갱신 필요" 오탐 윈도우를 제거한다(RateLimitPoller의 분류는 사후 분류일 뿐
 * 실시간 회복은 이 감시가 담당). 익스텐션이 직접 토큰을 갱신하지는 않는다(ToS/CRITICAL #3).
 *
 * vscode.workspace.createFileSystemWatcher는 워크스페이스 외부(~/.claude)를 감시할 수 없어
 * FileWatcher와 동일하게 chokidar polling을 쓴다(WSL2 inotify 한계 우회).
 */
export class CredentialsWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly debounceMs = 800
  ) {
    super();
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(this.filePath, {
      usePolling: true,   // WSL2 inotify 한계 우회 (FileWatcher와 동일 근거)
      interval: 3000,
      ignoreInitial: true,
      persistent: true,
    });

    const onHit = (): void => this.schedule();
    this.watcher.on('add', onHit);
    this.watcher.on('change', onHit);
  }

  /** 토큰 재기록(truncate+write/atomic rename)이 다발 이벤트를 내도 'change' 1회로 합친다. */
  private schedule(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.emit('change');
    }, this.debounceMs);
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }
  }
}
