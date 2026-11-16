import { DIVE, stepCommittedDive, type KickDive } from '../kick-return-dive';
import type { KickDefender } from '../kick-return-engine';
import type { Athlete, FootballGame } from './types';

/** ACTION belongs to the team defending the current carrier, including returns. */
export function defensiveActionKind(g: FootballGame): 'tackle' | 'intercept' | 'recover' | undefined {
  if (g.tackleScene || g.playResult || !['live', 'kickoff'].includes(g.phase)) return;
  if (g.special) return g.special.stage === 'loose' ? 'recover' :
    g.special.stage === 'return' && (g.special.returnSide ?? g.special.receiver) === 'away' ? 'tackle' : undefined;
  if (g.phase === 'kickoff') return g.kickReceiver === 'away' && g.returnAttempt?.phase === 'returning' ? 'tackle' : undefined;
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
export const DEFENSIVE_DIVE_SPEED = DIVE.speed;
/** Find a reachable contact point after the actual plant, rather than aiming
 * every dive at the same arbitrary future time. Only observed velocity is read.
 * Commit once: later cuts can still beat the launch, and the contact box is unchanged. */
function diveVelocity(d: Diver, runner: { x: number; y: number; vx?: number; vy?: number }) {
  for (let flight = 1 / 60; flight <= DIVE.flight + 1e-9; flight += 1 / 120) {
    const time = DIVE.windup + flight;
    const dx = runner.x + (runner.vx ?? 0) * time - d.x;
    const dy = Math.max(24, Math.min(168, runner.y + (runner.vy ?? 0) * time)) - d.y;
    // Aim comfortably inside ordinary contact, not at its exact outside edge.
    const vx = (dx - Math.max(-6, Math.min(6, dx))) / flight;
    const vy = (dy - Math.max(-7, Math.min(7, dy))) / flight;
    if (Math.hypot(vx, vy) <= DEFENSIVE_DIVE_SPEED) return { vx, vy };
  }
  return undefined;
}
/** Commit toward observed motion once. A miss has a real landing/recovery cost. */
export function startNearestDive<T extends Diver>(players: T[], runner: { x: number; y: number; vx?: number; vy?: number }, now = Infinity) {
  if (players.some(d => d.dive?.phase === 'windup' || d.dive?.phase === 'airborne')) return;
  const nearest = players.filter(a => !a.dive && (a.engaged ?? 0) <= now &&
    Math.hypot(a.x - runner.x, a.y - runner.y) <= 60)
    .map(d => ({ d, velocity: diveVelocity(d, runner) })).filter(a => a.velocity)
    .sort((a, b) => Math.hypot(a.d.x - runner.x, a.d.y - runner.y) -
      Math.hypot(b.d.x - runner.x, b.d.y - runner.y) || a.d.id - b.d.id)[0];
  if (!nearest?.velocity) return;
  const { d, velocity: { vx, vy } } = nearest;
  d.dive = { phase: 'windup', elapsed: 0, vx, vy, angle: Math.atan2(vy, vx) };
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
