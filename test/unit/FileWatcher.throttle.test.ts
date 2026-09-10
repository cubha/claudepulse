import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileWatcher } from '../../src/services/FileWatcher';

/** private schedule()을 직접 구동해 스로틀 계약만 검증(화이트박스). */
function fire(fw: FileWatcher, p: string): void {
  (fw as unknown as { schedule(p: string): void }).schedule(p);
}

/**
 * v0.1.56: 디바운스 → 스로틀 전환.
 *
 * 기존 계약(디바운스)은 "마지막 이벤트 후 N ms 조용해야 발화"였다. jsonl은 Claude Code 세션이
 * 살아있는 한 3초 폴링마다 계속 변경되므로, 간격을 늘리는 순간 **작업 중에는 영영 발화하지 않고**
 * 손을 뗀 뒤에야 1회 갱신되는 회귀가 된다. 아래 두 번째 테스트가 그 회귀를 잠근다.
 */
describe('FileWatcher — 스로틀 (#2)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('조용하던 뒤 첫 변경은 즉시 방출한다 (leading edge)', () => {
    const fw = new FileWatcher('/tmp/none', 1000);
    const changes: string[] = [];
    fw.on('change', (p: string) => changes.push(p));

    fire(fw, '/a/1.jsonl');
    expect(changes).toEqual(['/a/1.jsonl']);   // 타이머 진행 없이 바로
  });

  it('끊이지 않는 이벤트 스트림에서도 간격마다 발화한다 (디바운스 회귀 잠금)', () => {
    const fw = new FileWatcher('/tmp/none', 1000);
    const changes: string[] = [];
    fw.on('change', (p: string) => changes.push(p));

    // 300ms마다 끝없이 변경 — 디바운스였다면 첫 1건 뒤로 영영 0건이다.
    for (let t = 0; t < 3000; t += 300) {
      fire(fw, `/a/${t}.jsonl`);
      vi.advanceTimersByTime(300);
    }

    // t=0 즉시 1건 + 1000ms 간격 경계마다 1건
    expect(changes.length).toBe(4);
  });

  it('간격 안의 다발 이벤트는 1회로 합치고 마지막 경로를 emit', () => {
    const fw = new FileWatcher('/tmp/none', 1000);
    const changes: string[] = [];
    fw.on('change', (p: string) => changes.push(p));

    fire(fw, '/a/1.jsonl');            // leading edge — 즉시
    expect(changes).toEqual(['/a/1.jsonl']);

    fire(fw, '/a/2.jsonl');
    fire(fw, '/a/3.jsonl');
    fire(fw, '/a/4.jsonl');
    expect(changes).toHaveLength(1);   // 아직 간격 내

    vi.advanceTimersByTime(1000);
    expect(changes).toEqual(['/a/1.jsonl', '/a/4.jsonl']);
  });

  it('후속 이벤트가 예약된 타이머를 뒤로 밀지 않는다', () => {
    const fw = new FileWatcher('/tmp/none', 1000);
    const changes: string[] = [];
    fw.on('change', (p: string) => changes.push(p));

    fire(fw, '/a/1.jsonl');            // t=0 즉시 방출, 다음 경계 t=1000
    vi.advanceTimersByTime(200);
    fire(fw, '/a/2.jsonl');            // t=200 → t=1000에 예약
    vi.advanceTimersByTime(700);
    fire(fw, '/a/3.jsonl');            // t=900 — 예약을 t=1900으로 밀면 디바운스다
    vi.advanceTimersByTime(100);       // t=1000

    expect(changes).toEqual(['/a/1.jsonl', '/a/3.jsonl']);
  });

  it('jsonl 이 아니면 무시', () => {
    const fw = new FileWatcher('/tmp/none', 1000);
    const changes: string[] = [];
    fw.on('change', (p: string) => changes.push(p));

    fire(fw, '/a/notes.txt');
    vi.advanceTimersByTime(1000);
    expect(changes).toHaveLength(0);
  });

  it('stop() 은 대기 중인 타이머를 취소', () => {
    const fw = new FileWatcher('/tmp/none', 1000);
    const changes: string[] = [];
    fw.on('change', (p: string) => changes.push(p));

    fire(fw, '/a/1.jsonl');            // leading edge 소진
    fire(fw, '/a/2.jsonl');            // 예약
    fw.stop();
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual(['/a/1.jsonl']);
  });
});
