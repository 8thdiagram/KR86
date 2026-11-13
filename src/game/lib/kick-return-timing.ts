import type { KickAttempt, KickReturnProgress } from './kick-return-engine';

export type KickReturnRecord = {
  down: number; durationMs: number; outcome: 'touchdown' | 'tackled' | 'out-of-bounds'; yards: number; seed: number;
};
export function formatKickTime(ms: number | undefined): string {
  if (ms === undefined) return '—';
  const hundredths = Math.floor(Math.max(0, ms) / 10 + 1e-7);
  return `${String(Math.floor(hundredths / 6000)).padStart(2, '0')}:${String(Math.floor(hundredths / 100) % 60).padStart(2, '0')}.${String(hundredths % 100).padStart(2, '0')}`;
}
export function kickTimingStats(records: KickReturnRecord[]) {
  const touchdowns = records.filter(r => r.outcome === 'touchdown');
  return { count: records.length,
    averageMs: records.length ? records.reduce((n, r) => n + r.durationMs, 0) / records.length : null,
    fastestTouchdownMs: touchdowns.length ? Math.min(...touchdowns.map(r => r.durationMs)) : null,
    latest: records.at(-1) ?? null };
}
export function isKickReturnRecord(r: KickReturnRecord): boolean {
  return !!r && Number.isInteger(r.down) && r.down >= 1 && r.down <= 4 &&
    Number.isSafeInteger(r.durationMs) && r.durationMs > 0 && r.durationMs <= 86400000 &&
    ['touchdown', 'tackled', 'out-of-bounds'].includes(r.outcome) &&
    Number.isInteger(r.yards) && r.yards >= 0 && r.yards <= 106 && Number.isSafeInteger(r.seed);
}
/** Monotonic active interval, not frame count. Physics remains bounded separately.
 * Pro-rate the catch and terminal frames; callers discard paused intervals. */
export function kickClockFrame(before: KickAttempt, after: KickAttempt, realMs: number, simulatedAvailable: number): number | undefined {
  if (before.elapsedMs === undefined || after.elapsedMs === undefined) return undefined;
  const simulation = Math.max(0, after.time - before.time);
  if (before.phase === 'touchdown' || before.phase === 'tackled') return before.elapsedMs;
  const ended = after.phase === 'tackled' || after.phase === 'touchdown';
  if (ended && before.phase === 'returning' && simulatedAvailable > 0)
    return Math.max(0, before.elapsedMs + Math.max(0, realMs) - Math.max(0, simulatedAvailable - simulation) * 1000);
  if (!simulation) return before.elapsedMs + (before.phase === 'returning' && after.phase === 'returning' ? Math.max(0, realMs) : 0);
  const returning = before.phase === 'kickoff' ? Math.max(0, after.time - 1.55) : simulation;
  const denominator = ended ? Math.max(simulation, simulatedAvailable) : simulation;
  return before.elapsedMs + Math.max(0, realMs) * Math.min(1, returning / denominator);
}
export function recordKickReturn(p: KickReturnProgress, a: KickAttempt, yards: number): KickReturnRecord[] | undefined {
  if (!['tackled', 'touchdown'].includes(a.phase) || a.elapsedMs === undefined || a.elapsedMs <= 0) return p.returns;
  const record: KickReturnRecord = { down: a.number, durationMs: Math.round(a.elapsedMs),
    outcome: a.phase === 'touchdown' ? 'touchdown' : a.endReason ?? 'tackled', yards, seed: a.seed };
  return [...(p.returns ?? []).filter(r => r.down !== a.number), record].sort((x, y) => x.down - y.down);
}
