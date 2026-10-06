import type { JournalEvent, TurnHookStats } from '../../types';

const DAYS = 7;
const DAY_MS = 86_400_000;
/** 앞에 오는 인터프리터는 이름에서 뺀다 — 무엇을 실행했는지가 정보다. */
const INTERPRETERS = new Set(['node', 'bash', 'sh', 'zsh', 'python', 'python3', 'deno', 'bun', 'npx', 'tsx', 'pwsh', 'powershell']);

function stripQuotes(t: string): string {
  return t.replace(/^["']|["']$/g, '');
}

/**
 * 훅 command → 표시명(v0.2.6 ST8). command는 로컬 경로를 담고 있어 그대로 그리면 대시보드
 * 스크린샷(마켓 이미지 포함)에 사용자 디렉토리가 노출된다 — 경로 토큰은 basename만 남긴다.
 * 인자는 최대 3개까지 둔다(`cli.js hook stop`처럼 서브커맨드가 구분 정보다).
 */
export function hookDisplayName(command: string): string {
  const tokens = command.trim().split(/\s+/).map(stripQuotes).filter(Boolean);
  if (tokens.length > 1 && INTERPRETERS.has(tokens[0])) tokens.shift();
  const shown = tokens.slice(0, 4).map(t => (t.includes('/') || t.includes('\\')) ? (t.split(/[/\\]/).filter(Boolean).pop() ?? t) : t);
  return shown.join(' ');
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 턴 지연·훅 오버헤드(v0.2.6 ST8) — 최근 7일(UTC 일, 오늘 포함).
 * 훅 비율 = 턴당 평균 훅 시간 / 턴 중앙값(이상치에 강건 — TurnHookStats.hookShare 주석).
 * 30일 실측: 턴당 훅 1.38s · 턴 중앙값 94s ≈ 1.5%(벽시계 합계 대비로는 0.21%).
 * 사이드체인 턴은 부모 턴 시간 안에 포함되므로 빼서 이중계산하지 않는다(실측 0건이나 계약으로 둔다).
 */
export function computeTurnHooks(events: JournalEvent[], now: Date): TurnHookStats {
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMs = todayStart - (DAYS - 1) * DAY_MS;
  const dayKeys: string[] = [];
  for (let i = 0; i < DAYS; i++) dayKeys.push(new Date(sinceMs + i * DAY_MS).toISOString().slice(0, 10));
  const sinceIso = new Date(sinceMs).toISOString();

  const durations: number[] = [];
  const perDay = new Map<string, number[]>(dayKeys.map(k => [k, []]));
  const hooks = new Map<string, { totalMs: number; count: number }>();
  let hookTotalMs = 0;
  let hookRuns = 0;
  let hookErrorCount = 0;

  for (const e of events) {
    if (e.timestamp < sinceIso) continue;
    if (e.kind === 'turn_duration') {
      if (e.isSidechain) continue;
      durations.push(e.durationMs);
      perDay.get(e.timestamp.slice(0, 10))?.push(e.durationMs);
    } else if (e.kind === 'stop_hooks') {
      if (e.isSidechain) continue;
      hookErrorCount += e.errorCount;
      hookRuns++;
      for (const h of e.hooks) {
        const name = hookDisplayName(h.command);
        const agg = hooks.get(name) ?? { totalMs: 0, count: 0 };
        agg.totalMs += h.durationMs;
        agg.count++;
        hooks.set(name, agg);
        hookTotalMs += h.durationMs;
      }
    }
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const totalTurnMs = sorted.reduce((s, x) => s + x, 0);
  const medianMs = quantile(sorted, 0.5);
  const avgHookMsPerTurn = hookRuns > 0 ? hookTotalMs / hookRuns : null;
  return {
    turnCount: sorted.length,
    totalTurnMs,
    medianMs,
    p90Ms: quantile(sorted, 0.9),
    maxMs: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    daily: dayKeys.map(date => {
      const d = [...(perDay.get(date) ?? [])].sort((a, b) => a - b);
      return { date, count: d.length, medianMs: quantile(d, 0.5) };
    }),
    hooks: [...hooks.entries()]
      .map(([name, a]) => ({ name, totalMs: a.totalMs, count: a.count, avgMs: a.totalMs / a.count }))
      .sort((a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name)),
    hookTotalMs,
    avgHookMsPerTurn,
    hookShare: avgHookMsPerTurn !== null && medianMs ? avgHookMsPerTurn / medianMs : null,
    hookErrorCount,
  };
}
