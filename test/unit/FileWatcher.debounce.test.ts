import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileWatcher } from '../../src/services/FileWatcher';

/** private schedule()을 직접 구동해 디바운스 계약만 검증(화이트박스). */
function fire(fw: FileWatcher, p: string): void {
  (fw as unknown as { schedule(p: string): void }).schedule(p);
}

describe('FileWatcher — 디바운스 (#2)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('다발 이벤트를 1회 change 로 합치고 마지막 경로를 emit', () => {
    const fw = new FileWatcher('/tmp/none', 500);
    const changes: string[] = [];
    fw.on('change', (p: string) => changes.push(p));

    fire(fw, '/a/1.jsonl');
    fire(fw, '/a/2.jsonl');
    fire(fw, '/a/3.jsonl');
    expect(changes).toHaveLength(0); // 아직 디바운스 윈도 내

    vi.advanceTimersByTime(500);
    expect(changes).toEqual(['/a/3.jsonl']);
  });

  it('윈도가 지나면 다음 버스트는 별도 emit', () => {
    const fw = new FileWatcher('/tmp/none', 500);
    const changes: string[] = [];
    fw.on('change', (p: string) => changes.push(p));

    fire(fw, '/a/1.jsonl');
    vi.advanceTimersByTime(500);
    fire(fw, '/a/2.jsonl');
    vi.advanceTimersByTime(500);
    expect(changes).toEqual(['/a/1.jsonl', '/a/2.jsonl']);
  });

  it('jsonl 이 아니면 무시', () => {
    const fw = new FileWatcher('/tmp/none', 500);
    const changes: string[] = [];
    fw.on('change', (p: string) => changes.push(p));

    fire(fw, '/a/notes.txt');
    vi.advanceTimersByTime(500);
    expect(changes).toHaveLength(0);
  });

  it('stop() 은 대기 중인 타이머를 취소', () => {
    const fw = new FileWatcher('/tmp/none', 500);
    const changes: string[] = [];
    fw.on('change', (p: string) => changes.push(p));

    fire(fw, '/a/1.jsonl');
    fw.stop();
    vi.advanceTimersByTime(500);
    expect(changes).toHaveLength(0);
  });
});
