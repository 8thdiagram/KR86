import type { KickAttempt, KickDefender } from './kick-return-engine';
import type { CarrierBounds, KickMoveInput, KickMoves } from './kick-return-moves';
import { playerSpeed } from './player-pace';
import { CARRIER_BODY_WIDTH } from './player-dimensions';

export const EVADE = Object.freeze({
  spin: .26,
  boost: .42,
  cooldown: .45,
  boostRatio: 1.18,
  bodyWidth: CARRIER_BODY_WIDTH,
  threatRadius: 42,
} as const);
/** Untagged timing belongs to pre-correction saves; finish those moves at
 * their original rate instead of invalidating or snapping a restored runner. */
export const carrierSpinDuration = (active: { duration?: number }) => active.duration ?? .44;
export type EvasionObstacle = { x: number; y: number; vx?: number; vy?: number };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function runningVector(a: KickAttempt, direction: -1 | 0 | 1) {
  const x = playerSpeed((a.difficulty === 'hard' ? 73 : 57) * (a.kickoffBoost ?? 1));
  const y = direction * playerSpeed(a.difficulty === 'hard' ? 86 : 78);
  const speed = Math.hypot(x, y);
  return { x, y, normalX: -y / speed, normalY: x / speed };
}
const eligible = (d: KickDefender) => d.dive?.phase !== 'grounded' && d.dive?.phase !== 'recovering';
function velocity(a: KickAttempt, d: KickDefender) {
  const real = d as KickDefender & EvasionObstacle;
  if (d.dive) return d.dive.phase === 'airborne' ? d.dive : { vx: 0, vy: 0 };
  if (real.vx !== undefined && real.vy !== undefined) return { vx: real.vx, vy: real.vy };
  if (!d.active) return { vx: 0, vy: 0 };
  return { vx: d.motion?.vx ?? d.roamer?.vx ?? -d.speed,
    vy: d.motion?.vy ?? clamp((a.player.y - d.y) * 4, -d.lateralSpeed, d.lateralSpeed) };
}
const gap = (x: number, y: number) => Math.max(Math.abs(x) / 9, Math.abs(y) / 10);

/** Forecast actual approach and both escape corridors, never a random move. */
export function chooseCarrierEvasion(a: KickAttempt, bounds: CarrierBounds, obstacles: readonly EvasionObstacle[] = [],
  direction: -1 | 0 | 1 = 0) {
  const travel = runningVector(a, direction);
  const coverage = a.defenders.filter(eligible);
  const threat = coverage.filter(d => {
    const dx = d.x - a.player.x, dy = d.y - a.player.y, v = velocity(a, d);
    if (Math.hypot(dx, dy) > EVADE.threatRadius) return false;
    const behind = (dx * travel.x + dy * travel.y) / Math.hypot(travel.x, travel.y) < -5;
    if (behind && ![0, .15, .3].some(t => gap(dx + (v.vx - travel.x) * t, dy + (v.vy - travel.y) * t) < 1.5)) return false;
    return [0, .15, .3].some(t => gap(dx + (v.vx - travel.x) * t, dy + (v.vy - travel.y) * t) < 4.2);
  }).sort((d, e) => Math.hypot(d.x - a.player.x, d.y - a.player.y) - Math.hypot(e.x - a.player.x, e.y - a.player.y))[0];
  if (!threat) return { kind: 'boost' as const, side: 0 as const };
  const threatVelocity = velocity(a, threat);
  const approach = (threat.x - a.player.x + threatVelocity.vx * .12) * travel.normalX
    + (threat.y - a.player.y + threatVelocity.vy * .12) * travel.normalY;
  let best: -1 | 1 | undefined, bestScore = -Infinity;
  for (const side of [-1, 1] as const) {
    const endY = a.player.y + travel.y * EVADE.spin + side * EVADE.bodyWidth * travel.normalY;
    if (endY <= bounds.minY || endY >= bounds.maxY) continue;
    let nearest = 100, danger = 0;
    for (let i = 1; i <= 16; i++) {
      const p = i / 16, t = p * EVADE.spin;
      const x = a.player.x + travel.x * t + side * EVADE.bodyWidth * travel.normalX * p;
      const y = a.player.y + travel.y * t + side * EVADE.bodyWidth * travel.normalY * p;
      for (const d of [...coverage, ...obstacles]) {
        const v = 'id' in d ? velocity(a, d as KickDefender) : { vx: d.vx ?? 0, vy: d.vy ?? 0 };
        const clearance = gap(x - d.x - v.vx * t, y - d.y - v.vy * t);
        nearest = Math.min(nearest, clearance);
        danger += Math.max(0, 2 - clearance);
      }
    }
    const preferred = Math.abs(approach) > 1 && side * approach < 0 ? 8 : 0;
    const score = Math.min(nearest, 4) * 20 - danger * 10 + preferred
      + Math.min(endY - bounds.minY, bounds.maxY - endY) * .01;
    if (score > bestScore) { bestScore = score; best = side; }
  }
  return best === undefined ? { kind: 'boost' as const, side: 0 as const }
    : { kind: 'spin' as const, side: best };
}

/** Sweep the existing contact box; stop just inside contact, not outside as a shield. */
export function sweptCarrierContact(from: EvasionObstacle, to: EvasionObstacle, obstacles: readonly EvasionObstacle[], dt: number) {
  let fraction = 1;
  for (const d of obstacles) {
    let entry = 0, exit = 1;
    for (const [pos, delta, radius] of [
      [from.x - d.x, to.x - from.x - (d.vx ?? 0) * dt, 9],
      [from.y - d.y, to.y - from.y - (d.vy ?? 0) * dt, 10],
    ]) {
      if (Math.abs(delta!) < 1e-9) { if (Math.abs(pos!) >= radius!) { exit = -1; break; } }
      else {
        const a = (-radius! - pos!) / delta!, b = (radius! - pos!) / delta!;
        entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (entry <= exit && entry <= 1 && exit >= 0) fraction = Math.min(fraction, Math.min(1, Math.max(0, entry) + 1e-5));
  }
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

/** Recheck after existing rating/execution multipliers, using actual contact positions. */
export function constrainEvasionStep(from: EvasionObstacle, to: EvasionObstacle,
  defenders: readonly KickDefender[], blockers: readonly EvasionObstacle[] = []) {
  // Old blocking physics can already overlap teammates. Let the carrier
  // separate from that overlap rather than trapping him inside his own blocker.
  const solidBlockers = blockers.filter(d => gap(from.x - d.x, from.y - d.y) >= 1 ||
    gap(to.x - d.x, to.y - d.y) < gap(from.x - d.x, from.y - d.y));
  return sweptCarrierContact(from, to, [...defenders.filter(eligible), ...solidBlockers].map(d => ({ x: d.x, y: d.y })), 0);
}

export function stepCarrierEvasion(a: KickAttempt, direction: -1 | 0 | 1, dt: number, input: KickMoveInput, bounds: CarrierBounds) {
  const forward = playerSpeed((a.difficulty === 'hard' ? 73 : 57) * (a.kickoffBoost ?? 1));
  const lateral = playerSpeed(a.difficulty === 'hard' ? 86 : 78);
  const moves: KickMoves = a.moves ? { ...a.moves, version: 2, backward: false, hesitating: false }
    : { version: 2, backward: false, sequence: 0, readyAt: 0, vx: forward, furthestX: a.player.x };
  let started = false;
  if (input.juke && !moves.active && a.returnTime + 1e-9 >= moves.readyAt) {
    const move = chooseCarrierEvasion(a, bounds, input.obstacles, direction);
    moves.active = { ...move, elapsed: 0, evasive: true,
      ...(move.kind === 'spin' ? { duration: EVADE.spin, spinDirection: direction } : {}) };
    moves.sequence++; moves.readyAt = a.returnTime + EVADE[move.kind] + EVADE.cooldown; started = true;
  }
  const active = moves.active;
  let dx = forward * dt, dy = direction * lateral * dt;
  const spinStep = active?.kind === 'spin';
  if (active) {
    const duration = active.kind === 'spin' ? carrierSpinDuration(active) : EVADE.boost;
    const used = Math.min(dt, Math.max(0, duration - active.elapsed)), rest = dt - used;
    const p0 = active.elapsed / duration, p1 = Math.min(1, (active.elapsed + used) / duration);
    if (active.kind === 'spin') {
      // Freeze the approach heading for this short committed juke, then resume
      // current steering. Displace real coordinates perpendicular to travel,
      // starting at full lateral rate on the first frame, not a visual offset.
      // Older saves without heading metadata retain their existing world-Y move.
      const travel = runningVector(a, active.spinDirection ?? 0);
      const progress = (p: number) => active.spinDirection === undefined ? p * p * (3 - 2 * p) : p;
      const shift = active.side * EVADE.bodyWidth * (progress(p1) - progress(p0));
      dx = forward * dt + travel.normalX * shift;
      dy = travel.y * used + travel.normalY * shift + direction * lateral * rest;
    } else {
      const p = (p0 + p1) / 2, gain = Math.max(0, Math.min(1, p / .12, (1 - p) / .2));
      dx = forward * ((1 + (EVADE.boostRatio - 1) * gain) * used + rest);
    }
    moves.active = p1 >= 1 - 1e-9 ? undefined : { ...active, elapsed: active.elapsed + used };
  }
  let player = { x: clamp(a.player.x + dx, 8, 1101), y: clamp(a.player.y + dy, bounds.minY, bounds.maxY) };
  if (active) player = constrainEvasionStep(a.player, player, a.defenders, spinStep ? input.obstacles : []);
  moves.vx = (player.x - a.player.x) / dt; moves.furthestX = Math.max(moves.furthestX, player.x);
  return { player, moves, started, spinStep, evasiveStep: !!active };
}
