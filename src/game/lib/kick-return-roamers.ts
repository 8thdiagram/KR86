import type { KickDefender } from './kick-return-engine';

export const ROAMER = { speedBoost: 1.15, lateralBoost: 1.12, reach: 40 } as const;
export type RoamerMotion = { vx: number; stride: number; tier?: 'medium' };
export const roamerSpeedBoost = (d: KickDefender) => d.roamer?.tier === 'medium' ? 1.075 : ROAMER.speedBoost;
export const roamerLateralBoost = (d: KickDefender) => d.roamer?.tier === 'medium' ? 1.06 : ROAMER.lateralBoost;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function roamerAnchorX(d: KickDefender, playerX: number): number {
  // Keep advancing with the original coverage wave rather than forming a new wall.
  const elapsed = Math.max(0, (playerX - (d.homeX - 215)) / 73);
  return d.homeX - (d.speed / roamerSpeedBoost(d)) * elapsed;
}

/** Modest local repositioning, not another full-field free safety. */
export function stepKickRoamer(d: KickDefender, playerX: number, targetY: number, dt: number, progressX = playerX): KickDefender {
  const motion = d.roamer!;
  const anchor = roamerAnchorX(d, progressX);
  const targetX = clamp(playerX + 22, anchor - ROAMER.reach, anchor + ROAMER.reach);
  const desired = clamp((targetX - d.x) * 2, -d.speed, d.speed);
  const vx = motion.vx + clamp(desired - motion.vx, -d.speed * 3 * dt, d.speed * 3 * dt);
  // A soft target permits braking distance instead of snapping at a patrol edge.
  const x = d.x + vx * dt;
  const y = d.y + clamp(targetY - d.y, -d.lateralSpeed * dt, d.lateralSpeed * dt);
  return { ...d, active: true, x, y, roamer: { ...motion,
    vx: (x - d.x) / dt,
    stride: motion.stride + Math.hypot(x - d.x, y - d.y) / 5,
  } };
}
