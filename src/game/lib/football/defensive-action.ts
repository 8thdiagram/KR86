import { stepCommittedDive, type KickDive } from '../kick-return-dive';
import type { KickDefender } from '../kick-return-engine';
import type { Athlete, FootballGame } from './types';

/** ACTION belongs to the team defending the current carrier, including returns. */
export function defensiveActionKind(g: FootballGame): 'tackle' | 'intercept' | 'recover' | undefined {
  if (g.special) return g.special.stage === 'loose' ? 'recover' :
    g.special.stage === 'return' && (g.special.returnSide ?? g.special.receiver) === 'away' ? 'tackle' : undefined;
  if (g.phase !== 'live' || !g.live) return;
  if (g.live.mode === 'return') return g.live.offense === 'home' && !g.live.flight ? 'tackle' : undefined;
  if (g.possession !== 'away') return;
  if (g.live.mode === 'loose') return 'recover';
  if (g.live.mode === 'flight') return g.live.flight && !g.live.flight.deflected ? 'intercept' : undefined;
  if (g.live.mode !== 'kick') return 'tackle';
  return undefined;
}
export function canDefensiveAction(g: FootballGame) {
  return defensiveActionKind(g) !== undefined;
}
type Diver = { id: number; x: number; y: number; dive?: KickDive; engaged?: number };
/** Commit toward observed motion once. A miss has a real landing/recovery cost. */
export function startNearestDive<T extends Diver>(players: T[], runner: { x: number; y: number; vx?: number; vy?: number }, now = Infinity) {
  if (players.some(d => d.dive?.phase === 'windup' || d.dive?.phase === 'airborne')) return;
  const reachable = (a: T) => [.24, .34, .46].some(t =>
    Math.hypot(runner.x + (runner.vx ?? 0) * t - a.x, runner.y + (runner.vy ?? 0) * t - a.y) <=
      130 * (t - .18) + 15);
  const d = players.filter(a => !a.dive && (a.engaged ?? 0) <= now &&
    Math.hypot(a.x - runner.x, a.y - runner.y) <= 60 && reachable(a)).sort((a, b) => Math.hypot(a.x - runner.x, a.y - runner.y) -
    Math.hypot(b.x - runner.x, b.y - runner.y) || a.id - b.id)[0];
  if (!d) return;
  // Include the foot plant as well as the flight, or every moving runner is
  // already past the predicted contact point before the defender arrives.
  const dx = runner.x + (runner.vx ?? 0) * .38 - d.x;
  const dy = runner.y + (runner.vy ?? 0) * .38 - d.y;
  const n = Math.max(.001, Math.hypot(dx, dy));
  d.dive = { phase: 'windup', elapsed: 0, vx: dx / n * 130, vy: dy / n * 130, angle: Math.atan2(dy, dx) };
  return d;
}
export const canTackle = (d: Diver) => !d.dive || d.dive.phase === 'airborne';
export function stepAthleteDive(d: Athlete, dt: number) {
  if (!d.dive) return false;
  const before = { x: d.x, y: d.y };
  const next = stepCommittedDive({ ...d, homeX: d.startX, minY: 24, maxY: 168,
    speed: 0, lateralSpeed: 0, active: true } as KickDefender, dt, true);
  d.x = next.x; d.y = next.y; d.dive = next.dive;
  d.vx = (d.x - before.x) / dt; d.vy = (d.y - before.y) / dt;
  return true;
}
