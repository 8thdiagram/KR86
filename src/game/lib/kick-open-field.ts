import type { KickAttempt, KickDefender } from './kick-return-engine';
import { pursuitPoint } from './open-field-pursuit';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** New-return steering. All players read last tick's motion, not the new input.
 * Lanes organize the approach, but never imprison a nearby or beaten tackler.
 */
export function stepOpenFieldCoverage(a: KickAttempt, d: KickDefender, dt: number,
  speed = d.speed, lateral = d.lateralSpeed): KickDefender {
  const m = d.motion ?? { vx: 0, vy: 0, targetX: d.x, targetY: d.y,
    reactionLeft: 0, stride: 0, facing: -1 as const };
  let left = m.reactionLeft - dt, tx = m.targetX, ty = m.targetY;
  const distance = Math.hypot(d.x - a.player.x, d.y - a.player.y);
  const minY = a.fullCoverage ? 12 : 24;
  if (left <= 0) {
    const point = pursuitPoint(d, a.player, a.moves?.vx ?? 73, a.diveRead?.vy ?? 0, speed, lateral, minY, 168);
    tx = point.x; ty = point.y;
    if (!a.fullCoverage && d.id === 10 && d.x - a.player.x > 200) {
      tx = Math.min(1096, Math.max(d.homeX - 90, a.player.x + 110));
    } else if (distance > 180 && a.player.x < d.x - 24) {
      ty = clamp(ty, d.minY, d.maxY);
    }
    if (d.jukeRead && d.jukeRead.until > a.returnTime) ty = d.jukeRead.targetY;
    left = .08;
  }
  let sx = 0, sy = 0;
  if (distance > 24) for (const mate of a.defenders) {
    if (mate.id === d.id) continue;
    const dx = d.x - mate.x, dy = d.y - mate.y, n = Math.hypot(dx, dy);
    if (n > .01 && n < 12) { sx += dx / n * (12 - n) * .75; sy += dy / n * (12 - n) * .75; }
  }
  const arrival = Math.max(dt, Math.abs(tx - d.x) / Math.max(.001, speed), Math.abs(ty - d.y) / Math.max(.001, lateral));
  const wantedX = clamp((tx - d.x) / arrival + sx, -speed, speed);
  const wantedY = clamp((ty - d.y) / arrival + sy, -lateral, lateral);
  const dx = wantedX - m.vx, dy = wantedY - m.vy, change = Math.hypot(dx, dy);
  const fraction = Math.min(1, 650 * dt / Math.max(.001, change));
  const vx = m.vx + dx * fraction, vy = m.vy + dy * fraction;
  return { ...d, active: true, x: clamp(d.x + vx * dt, 8, 1180),
    y: clamp(d.y + vy * dt, minY, 168), motion: {
      vx, vy, targetX: tx, targetY: ty, reactionLeft: left,
      stride: m.stride + Math.hypot(vx, vy) * dt / 5,
      facing: vx < 0 ? -1 : 1,
    } };
}
