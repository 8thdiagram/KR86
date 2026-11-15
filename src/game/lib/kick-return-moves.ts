import type { KickAttempt, KickDefender, KickDirection } from './kick-return-engine';
import { playerSpeed } from './player-pace';
import { BURST, chooseKickBurst, kickBurstKind, kickBurstVelocity, kickDiveRules } from './kick-return-burst';

export const JUKE = { holdMs: 200, spin: .34, stutter: .36, dive: .34, cooldown: 1, backwardRatio: .7 } as const;
export type KickMoveInput = { backward?: boolean; hesitate?: boolean; juke?: boolean };
export type CarrierBounds = { minY: number; maxY: number };
export type KickMoves = {
  version: 1 | 2; sequence: number; readyAt: number; backward: boolean; vx: number; furthestX: number;
  hesitating?: boolean;
  active?: { kind: 'spin' | 'stutter' | 'dive'; elapsed: number; side: KickDirection };
};
export type JukeRead = { until: number; targetY: number };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Real bounded displacement; no invulnerability, collision exemption or teleport. */
export function stepKickMoves(a: KickAttempt, direction: KickDirection, dt: number, input: KickMoveInput,
  bounds: CarrierBounds = { minY: 24, maxY: 168 }) {
  if (a.moves?.version === 2) return stepBurst(a, direction, dt, input, bounds);
   const forward = playerSpeed((a.difficulty === 'hard' ? 73 : 57) * (a.kickoffBoost ?? 1));
   const lateral = playerSpeed(a.difficulty === 'hard' ? 86 : 78);
  if (!a.moves) return { player: { x: a.player.x + forward * dt,
    y: clamp(a.player.y + direction * lateral * dt, bounds.minY, bounds.maxY) }, started: false, moves: undefined };
  let moves: KickMoves = { ...a.moves, backward: !!input.backward };
  let started = false;
  if (input.juke && !input.backward && !moves.active && a.returnTime + 1e-9 >= moves.readyAt) {
    const kind = moves.sequence % 2 ? 'stutter' : 'spin';
     const side = a.mechanicsVersion === 2 ? chooseJukeSide(a, direction) : direction || (a.player.y > 96 ? -1 : 1);
    moves = { ...moves, sequence: moves.sequence + 1,
      readyAt: a.returnTime + JUKE[kind] + JUKE.cooldown,
      active: { kind, side, elapsed: 0 } };
    started = true;
  }
  if (input.backward) moves.active = undefined;
  const active = moves.active;
  let vx = input.backward ? -forward * JUKE.backwardRatio : forward;
  let vy = direction * lateral;
  if (active) {
     if (a.mechanicsVersion === 2) {
       vx = 0;
       // Lock the chosen exit for a learnable move; steering resumes afterwards.
       // Spin: 10px (one sprite width). Stutter: small fake then 6px exit.
       vy = active.kind === 'spin' ? active.side * 10 / JUKE.spin
         : active.elapsed < .1 ? -active.side * 18
         : active.side * 7.8 / (JUKE.stutter - .1);
     } else if (active.kind === 'spin') {
      vx *= .9;
      if (active.elapsed < .24) vy = (direction || active.side) * lateral;
    } else {
      vx *= active.elapsed < .08 ? .45 : .98;
      if (active.elapsed < .08) vy = -active.side * lateral * .55;
      else if (active.elapsed < .3) vy = active.side * lateral;
    }
    const elapsed = Math.min(JUKE[active.kind], active.elapsed + dt);
    moves.active = elapsed + 1e-9 >= JUKE[active.kind] ? undefined : { ...active, elapsed };
  }
  const player = { x: clamp(a.player.x + vx * dt, 8, 1101),
    y: clamp(a.player.y + vy * dt, bounds.minY, bounds.maxY) };
  moves.vx = (player.x - a.player.x) / dt;
  moves.furthestX = Math.max(moves.furthestX, player.x);
  return { player, moves, started };
}

function stepBurst(a: KickAttempt, direction: KickDirection, dt: number, input: KickMoveInput, bounds: CarrierBounds) {
  const forward = playerSpeed((a.difficulty === 'hard' ? 73 : 57) * (a.kickoffBoost ?? 1)), lateral = playerSpeed(a.difficulty === 'hard' ? 86 : 78);
  const diveRules = kickDiveRules(a);
  const held = !!(input.hesitate ?? input.backward);
  let moves: KickMoves = { ...a.moves!, backward: false, hesitating: held };
  let started = false;
  if (held) moves.active = undefined;
  else if (input.juke && !moves.active && a.returnTime + 1e-9 >= moves.readyAt) {
    const kind = a.player.x >= 1100 - diveRules.goalZone ? 'dive' : kickBurstKind(a, moves.sequence);
    const duration = kind === 'dive' ? diveRules.duration : BURST.duration;
    moves = { ...moves, sequence: moves.sequence + 1, readyAt: a.returnTime + duration + BURST.cooldown,
      active: { kind, side: chooseKickBurst(a), elapsed: 0 } };
    started = true;
  }
  let vx = held ? 0 : forward, vy = direction * lateral;
  const diving = moves.active?.kind === 'dive';
  if (moves.active) {
    ({ vx, vy } = kickBurstVelocity(a, moves.active.side));
     vx = playerSpeed(vx); vy = playerSpeed(vy);
    const duration = moves.active.kind === 'dive' ? diveRules.duration : BURST.duration;
    if (a.returnUpgrade === 1 && moves.active.kind === 'dive') {
      const fraction = Math.min(dt, duration - moves.active.elapsed) / dt;
      vx *= fraction; vy *= fraction;
    }
    const elapsed = Math.min(duration, moves.active.elapsed + dt);
    moves.active = elapsed + 1e-9 >= duration ? undefined : { ...moves.active, elapsed };
  }
  const player = { x: clamp(a.player.x + vx * dt, 8, 1101), y: clamp(a.player.y + vy * dt, bounds.minY, bounds.maxY) };
  const targetY = a.player.y + vy * dt;
  const outAt = diving && (targetY < bounds.minY || targetY > bounds.maxY)
    ? Math.max(0, Math.min(1, ((targetY < bounds.minY ? bounds.minY : bounds.maxY) - a.player.y) / (vy * dt))) : undefined;
  moves.vx = (player.x - a.player.x) / dt;
  moves.furthestX = Math.max(moves.furthestX, player.x);
  return { player, moves, started, outAt };
}

/** Prefer input when there is room; otherwise exit away from close coverage. */
function chooseJukeSide(a: KickAttempt, direction: KickDirection): -1 | 1 {
  const room = (side: number) => side < 0 ? a.player.y - 24 : 168 - a.player.y;
  if (direction && room(direction) >= 12) return direction;
  const nearest = a.defenders.filter(d => d.dive?.phase !== 'grounded' && d.dive?.phase !== 'recovering' &&
    Math.abs(d.x - a.player.x) < 60).sort((a1, b) =>
      Math.hypot(a1.x - a.player.x, a1.y - a.player.y) - Math.hypot(b.x - a.player.x, b.y - a.player.y))[0];
  const side = nearest && Math.abs(nearest.y - a.player.y) > 1
    ? nearest.y > a.player.y ? -1 : 1 : a.player.y > 96 ? -1 : 1;
  return room(side) >= 12 ? side : side === 1 ? -1 : 1;
}

/** A local fake can prolong an existing bad pursuit angle, not beat clean contact.
 * Committed divers are never re-aimed. At most two nearby pursuers can be fooled. */
export function readKickJuke(a: KickAttempt, moves: KickMoves): Set<number> {
  if (moves.version === 2) return new Set();
  const side = moves.active!.side;
  return new Set(a.defenders.filter(d => {
    if (!d.active || d.dive) return false;
    const dx = d.x - a.player.x, dy = a.player.y - d.y;
    const vy = d.motion?.vy ?? clamp(dy * 4, -d.lateralSpeed, d.lateralSpeed);
    return dx > -18 && dx < 58 && Math.abs(dy) > 10 && Math.abs(dy) < 36 && vy * side < -8;
  }).sort((a1, b) => Math.hypot(a1.x - a.player.x, a1.y - a.player.y) -
    Math.hypot(b.x - a.player.x, b.y - a.player.y)).slice(0, 2).map(d => d.id));
}

export function jukePursuitRead(a: KickAttempt, d: KickDefender, side: KickDirection): JukeRead {
  return { until: a.returnTime + (d.id === 10 ? .12 : .18),
    targetY: clamp(a.player.y - side * 18, d.minY, d.maxY) };
}

export function isKickMoves(value: KickMoves | undefined, a: KickAttempt): boolean {
  if (!value) return value === undefined;
  const m = value, active = m.active;
  return [1, 2].includes(m.version) && (m.hesitating === undefined || m.version === 2 && typeof m.hesitating === 'boolean') &&
    Number.isSafeInteger(m.sequence) && m.sequence >= 0 &&
     Number.isFinite(m.readyAt) && m.readyAt >= 0 && m.readyAt <= a.returnTime + (a.returnUpgrade === 1 ? 1.5 : 1.4) &&
    typeof m.backward === 'boolean' && (m.version !== 2 || !m.backward) && Number.isFinite(m.vx) && Math.abs(m.vx) <= playerSpeed(m.version === 2 ? 100 : 86) &&
    Number.isFinite(m.furthestX) && m.furthestX >= 0 && m.furthestX <= 1101 &&
    m.furthestX + .000001 >= a.player.x &&
    (active === undefined || !!active && (m.version === 2 ? ['spin', 'stutter', 'dive'] : ['spin', 'stutter']).includes(active.kind) &&
      (active.side === -1 || active.side === 1 || m.version === 2 && active.side === 0) && Number.isFinite(active.elapsed) &&
       active.elapsed >= 0 && active.elapsed <= (m.version === 2
         ? active.kind === 'dive' ? kickDiveRules(a).duration : BURST.duration : JUKE[active.kind]));
}
