import { describe, it, expect, vi, afterEach } from 'vitest';
import { FileWatcher } from '../../src/services/FileWatcher';

// Mock vscode-dependent Logger before any imports resolve it
vi.mock('../../src/logger', () => ({
  Logger: class {
    info() {}
    warn() {}
    error() {}
    show() {}
    dispose() {}
  },
}));

// Mock chokidar so tests don't need real filesystem events
const mockOn = vi.fn().mockReturnThis();
const mockClose = vi.fn().mockResolvedValue(undefined);
vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({ on: mockOn, close: mockClose })),
}));

import { Logger } from '../../src/logger';

describe('FileWatcher', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnThis();
    mockClose.mockResolvedValue(undefined);
  });

  it('debounces multiple rapid events into a single callback', async () => {
    const capturedHandlers: Record<string, (p: string) => void> = {};
    mockOn.mockImplementation((event: string, handler: (p: string) => void) => {
      capturedHandlers[event] = handler;
      return { on: mockOn, close: mockClose };
    });

    const logger = new Logger('test');
    const calls: string[][] = [];
    const watcher = new FileWatcher('/some/root', 100, (paths) => calls.push(paths), logger);
    watcher.start();

    const handler = capturedHandlers['change'];
    expect(handler).toBeDefined();

    // Fire 5 rapid events
    for (let i = 0; i < 5; i++) {
      handler('/some/root/session.jsonl');
    }

    await new Promise(r => setTimeout(r, 250));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/some/root/session.jsonl');

    await watcher.dispose();
  });

  it('ignores non-jsonl files', async () => {
    const capturedHandlers: Record<string, (p: string) => void> = {};
    mockOn.mockImplementation((event: string, handler: (p: string) => void) => {
      capturedHandlers[event] = handler;
      return { on: mockOn, close: mockClose };
    });

    const logger = new Logger('test');
    const calls: string[][] = [];
    const watcher = new FileWatcher('/some/root', 50, (paths) => calls.push(paths), logger);
    watcher.start();

    const handler = capturedHandlers['change'];
    handler('/some/root/README.md');
    handler('/some/root/settings.json');
    handler('/some/root/todo.txt');

    await new Promise(r => setTimeout(r, 150));
    expect(calls).toHaveLength(0);

    await watcher.dispose();
  });
});
