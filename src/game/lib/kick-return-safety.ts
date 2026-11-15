import type { KickAttempt, KickDefender } from './kick-return-engine';
import { playerSpeed } from './player-pace';

/** Same independent-axis speed system as the runner, including diagonal travel. */
export const SAFETY = {
  ratio: 1.12, forward: 73 * 1.12, lateral: 86 * 1.12,
  reaction: .22, acceleration: 3.2, turnAcceleration: 1.9,
} as const;
export type SafetyMotion = {
  vx: number; vy: number; targetX: number; targetY: number;
  reactionLeft: number; stride: number; facing: -1 | 1;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Reads elapsed movement only, never the current input or future button presses. */
export function stepFreeSafety(a: KickAttempt, d: KickDefender, dt: number,
  blockers: KickDefender[], fakeTargetY?: number): KickDefender {
  const forward = playerSpeed(SAFETY.forward), lateral = playerSpeed(SAFETY.lateral);
  const m: SafetyMotion = d.motion ?? {
    vx: 0, vy: 0, targetX: d.x, targetY: d.y, reactionLeft: 0, stride: 0, facing: -1,
  };
  let { targetX, targetY } = m;
  let reactionLeft = m.reactionLeft - dt;
  const active = d.active || a.player.x >= d.homeX - 350;
  if (!active) return d;
  if (reactionLeft <= 0) {
    // Sample the already-observed lateral displacement, including sideline stops.
    const vx = a.moves?.vx ?? playerSpeed(a.difficulty === 'hard' ? 73 : 57);
    const vy = clamp((a.player.y - (d.observedY ?? a.player.y)) /
      (d.observedY === undefined ? dt : SAFETY.reaction), -playerSpeed(86), playerSpeed(86));
    const distance = Math.hypot(d.x - a.player.x, d.y - a.player.y);
    const lead = clamp(distance / 240, .18, .65);
    targetY = clamp(a.player.y + vy * lead, 24, 168);
    // Hold depth while the first waves are in play, then close the predicted lane.
    // A cross-field approach can concede ground rather than blindly charge past.
    targetX = d.x - a.player.x > 200
      ? Math.max(d.homeX - 90, a.player.x + 110)
      : Math.min(1096, a.player.x + vx * lead);
    reactionLeft += SAFETY.reaction;
  }
  if (fakeTargetY !== undefined) targetY = fakeTargetY;
   const dx = (targetX - d.x) / forward;
   const dy = (targetY - d.y) / lateral;
  const norm = Math.max(Math.abs(dx), Math.abs(dy));
  // Arrive without oscillation; each axis is capped at 112% of the runner's.
  const scale = norm > 0 ? Math.min(1, norm / .12) / norm : 0;
  const desiredX = dx * scale, desiredY = dy * scale;
   const oldX = m.vx / forward, oldY = m.vy / lateral;
  const changeX = desiredX - oldX, changeY = desiredY - oldY;
  const change = Math.hypot(changeX, changeY);
  const reversing = oldX * desiredX + oldY * desiredY < 0;
  const blend = change > 0 ? Math.min(1,
    (reversing ? SAFETY.turnAcceleration : SAFETY.acceleration) * dt / change) : 0;
   let vx = (oldX + changeX * blend) * forward;
   let vy = (oldY + changeY * blend) * lateral;
  let x = clamp(d.x + vx * dt, 100, 1096);
  let y = clamp(d.y + vy * dt, 24, 168);
  // Other defenders remain untouched. Stop/slide, never phase through a teammate.
  const occupied = (px: number, py: number) =>
    blockers.some(b => b.id !== d.id && Math.abs(px - b.x) < 9 && Math.abs(py - b.y) < 10);
  if (occupied(x, y)) {
    if (!occupied(d.x, y)) { x = d.x; vx = 0; }
    else if (!occupied(x, d.y)) { y = d.y; vy = 0; }
    else { x = d.x; y = d.y; vx = 0; vy = 0; }
  }
  if (x === 100 || x === 1096) vx = 0;
  if (y === 24 || y === 168) vy = 0;
  return { ...d, active, x, y,
    observedY: reactionLeft > m.reactionLeft ? a.player.y : d.observedY,
    motion: { vx, vy, targetX, targetY, reactionLeft,
      stride: m.stride + Math.hypot(x - d.x, y - d.y) / 5,
      facing: Math.abs(a.player.x - x) > 8 ? (a.player.x < x ? -1 : 1) : m.facing } };
}
