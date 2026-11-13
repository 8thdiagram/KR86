import { clamp, type Athlete, type LivePlay, type PassType } from './types';

/** Same travel time and unperturbed lead as releasePass; no changes to flight physics. */
export function passProjection(l: LivePlay, a: Athlete, type: PassType) {
  const qb = l.athletes[5]!, distance = Math.hypot(qb.x - a.x, qb.y - a.y);
  const duration = type === 'bullet' ? clamp(distance / 440, .12, .8) : clamp(distance / 220, .26, 1.5);
  return { duration, x: clamp(a.x + a.vx * duration * .7, 30, 1115),
    y: clamp(a.y + a.vy * duration * .65, 20, 172) };
}

/** Relative safe-completion estimate, not a calibrated probability or a new catch lottery.
 * Sample the existing arc and allow defenders reaction, momentum and closing time.
 * A lob ignores midfield bodies while high, but not defenders who can reach its landing. */
export function safeCompletionScore(l: LivePlay, a: Athlete, type: PassType, accuracy: number) {
  const qb = l.athletes[5]!, aim = passProjection(l, a, type);
  let survival = 1;
  for (const d of l.athletes.filter(d => d.side === 'defense')) {
    let danger = 0;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, seconds = aim.duration * t;
      const z = Math.sin(t * Math.PI) * (type === 'bullet' ? 6 : 30);
      if (z > 13) continue;
      const x = qb.x + (aim.x - qb.x) * t, y = qb.y + (aim.y - qb.y) * t;
      const reaction = type === 'bullet' ? .025 : .12;
      const available = Math.max(0, seconds - Math.max(reaction, d.engaged - l.time));
      const momentum = Math.min(available, .16);
      const gap = Math.hypot(x - d.x - d.vx * momentum, y - d.y - d.vy * momentum);
      // Use observed speed; stationary coverage can still react at its ordinary pace.
      const closing = Math.max(26, Math.hypot(d.vx, d.vy)) * Math.max(0, available - momentum);
      const uncertainty = (1 - accuracy) * 12 * t;
      danger = Math.max(danger, clamp((13 + closing + uncertainty - gap) / 30, 0, .95));
    }
    survival *= 1 - danger * .8;
  }
  return accuracy * survival;
}
