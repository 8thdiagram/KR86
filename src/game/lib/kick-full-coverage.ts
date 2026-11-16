import type { KickAttempt, KickDefender } from './kick-return-engine';
import { openFieldGain, OPEN_FIELD } from './football/athleticism';
import { stepOpenFieldCoverage } from './kick-open-field';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** Full Game adapter only. New returns share observed-motion pursuit for every
 * coverage player; historical returns retain their saved lane/reaction rules. */
export function stepFullCoverage(a: KickAttempt, d: KickDefender, dt: number, position?: { x: number; y: number }): KickDefender {
  const elite = a.fullCoverage!.elite.includes(d.id);
  const gain = openFieldGain(d, [a.player], dt, !d.dive);
  if (a.pursuitVersion) return stepOpenFieldCoverage(a, d, dt, d.speed * gain, d.lateralSpeed * gain, position);
  const m = d.motion ?? { vx: 0, vy: 0, targetX: d.x, targetY: d.y,
    reactionLeft: 0, stride: 0, facing: -1 as const };
  let left = m.reactionLeft - dt, tx = m.targetX, ty = m.targetY;
  const distance = Math.hypot(d.x - a.player.x, d.y - a.player.y);
  if (left <= 0) {
    const vx = a.moves?.vx ?? 73;
    const vy = d.observedY === undefined ? 0 : clamp((a.player.y - d.observedY) / (elite ? .16 : .24), -86, 86);
    const lead = clamp(distance / (elite ? 190 : 220), .08, elite ? .85 : .5);
    tx = a.player.x + vx * lead;
    ty = clamp(a.player.y + vy * lead, d.minY, d.maxY);
    // Supporting coverage retains its assigned lane until close enough.
    if (!elite && distance > 72) ty = clamp(ty, d.minY, d.maxY);
    left += elite ? .16 : .24;
  }
  let sx = 0, sy = 0;
  if (distance > 24) for (const b of a.defenders) {
    if (b.id === d.id) continue;
    const dx = d.x - b.x, dy = d.y - b.y, n = Math.hypot(dx, dy);
    if (n > .01 && n < 21) { sx += dx / n * (21 - n) * 2; sy += dy / n * (21 - n) * 2; }
  }
  const steerX = position?.x ?? tx, steerY = position?.y ?? ty;
  const arrival = Math.max(dt, Math.abs(steerX - d.x) / (d.speed * gain), Math.abs(steerY - d.y) / (d.lateralSpeed * gain));
  const desiredX = clamp((steerX - d.x) / arrival + sx, -d.speed * gain, d.speed * gain);
  const desiredY = clamp((steerY - d.y) / arrival + sy, -d.lateralSpeed * gain, d.lateralSpeed * gain);
  const changeX = desiredX - m.vx, changeY = desiredY - m.vy, change = Math.hypot(changeX, changeY);
  const fraction = Math.min(1, (elite ? 380 : 280) * (gain > 1 ? OPEN_FIELD.acceleration : 1) * dt / Math.max(.001, change));
  const vx = m.vx + changeX * fraction, vy = m.vy + changeY * fraction;
  return { ...d, active: true, x: clamp(d.x + vx * dt, 8, 1180),
    y: clamp(d.y + vy * dt, 24, 168),
    observedY: left > m.reactionLeft ? a.player.y : d.observedY,
    motion: { vx, vy, targetX: tx, targetY: ty, reactionLeft: left,
      stride: m.stride + Math.hypot(vx, vy) * dt / 5, facing: vx < 0 ? -1 : 1 } };
}
