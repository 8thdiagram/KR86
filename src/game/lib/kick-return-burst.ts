import type { KickAttempt, KickDefender, KickDirection } from './kick-return-engine';

export const BURST = { duration: .30, dive: .34, ratio: 1.25, goalZone: 40, reach: 10, cooldown: 1 } as const;
const ORIGINAL_DIVE = { duration: BURST.dive, goalZone: BURST.goalZone, reach: BURST.reach };
const FIVE_YARD_DIVE = { duration: .42, goalZone: 50, reach: 14 };
export const kickDiveRules = (a?: Pick<KickAttempt, 'returnUpgrade'>) => a?.returnUpgrade === 1 ? FIVE_YARD_DIVE : ORIGINAL_DIVE;
export function kickDiveBallReach(elapsed: number, a?: Pick<KickAttempt, 'returnUpgrade'>): number {
  const rules = kickDiveRules(a);
  return rules.reach * Math.max(0, Math.min(1, elapsed / .1, (rules.duration - elapsed) / .09));
}
export function kickBurstVelocity(a: KickAttempt, side: KickDirection) {
  // Preserve the existing independent forward/lateral axes. Normal diagonal
  // running is already faster than forward-only running; normalizing this
  // burst to forward speed would accidentally slow a steering player down.
  return { vx: (a.difficulty === 'hard' ? 73 : 57) * BURST.ratio,
    vy: side * (a.difficulty === 'hard' ? 86 : 78) * BURST.ratio };
}
function velocity(a: KickAttempt, d: KickDefender) {
  if (d.dive) return d.dive.phase === 'airborne' ? { vx: d.dive.vx, vy: d.dive.vy } : { vx: 0, vy: 0 };
  return { vx: d.motion?.vx ?? d.roamer?.vx ?? -d.speed,
    vy: d.motion?.vy ?? Math.max(-d.lateralSpeed, Math.min(d.lateralSpeed, (a.player.y - d.y) * 4)) };
}
/** Sample all three real paths against moving coverage, not just a defender's
 * current point. No invulnerability or changes to the actual defenders. */
export function chooseKickBurst(a: KickAttempt): KickDirection {
  let best: KickDirection = 0, bestScore = -Infinity;
  for (const side of [0, -1, 1] as const) {
    const v = kickBurstVelocity(a, side);
    const rules = kickDiveRules(a);
    const duration = a.player.x >= 1100 - rules.goalZone ? rules.duration : BURST.duration;
    const endY = a.player.y + v.vy * duration;
    if (endY < 24 || endY > 168) continue;
    let clearance = 100, danger = 0;
    for (let t = 0; t <= duration + 1e-9; t += 1 / 60) {
      for (const d of a.defenders) {
        if (d.dive?.phase === 'grounded' || d.dive?.phase === 'recovering') continue;
        if (Math.hypot(d.x - a.player.x, d.y - a.player.y) > 140) continue;
        const dv = velocity(a, d);
        const gap = Math.max(Math.abs(a.player.x + v.vx * t - d.x - dv.vx * t) / 9,
          Math.abs(a.player.y + v.vy * t - d.y - dv.vy * t) / 10);
        clearance = Math.min(clearance, gap);
        danger += Math.max(0, 3 - gap);
      }
    }
    const score = Math.min(3, clearance) * 100 - danger + (side === 0 ? .1 : 0);
    if (score > bestScore) { bestScore = score; best = side; }
  }
  return best;
}
/** Independent mixed seed per action: varied animation, deterministic reloads.
 * Direction never comes from this random bit. */
export function kickBurstKind(a: KickAttempt, sequence: number): 'spin' | 'stutter' {
  let n = (a.seed ^ Math.imul(a.number, 0x9e3779b9) ^ Math.imul(sequence + 1, 0x85ebca6b)) >>> 0;
  n = Math.imul(n ^ n >>> 16, 0x7feb352d);
  n = Math.imul(n ^ n >>> 15, 0x846ca68b);
  return (n ^ n >>> 16) & 1 ? 'spin' : 'stutter';
}

/** Continuous rectangle contact fraction for a goal-line dive. Equal-time contact
 * wins over a touchdown; grounded defenders remain non-tackling. */
export function kickDiveFinish(a: KickAttempt, player: KickAttempt['player'], defenders: KickDefender[],
  reach: number): { phase: 'returning' | 'tackled' | 'touchdown'; fraction: number } {
  const oldReach = a.moves?.active?.kind === 'dive' ? kickDiveBallReach(a.moves.active.elapsed, a) : 0;
  const from = a.player.x + oldReach, to = player.x + reach;
  const score = to >= 1100 ? Math.max(0, (1100 - from) / Math.max(1e-9, to - from)) : Infinity;
  let contact = Infinity;
  for (const d of defenders) {
    if (d.dive?.phase === 'grounded' || d.dive?.phase === 'recovering') continue;
    const old = a.defenders.find(p => p.id === d.id)!;
    let entry = 0, exit = 1;
    for (const [axis, radius] of [['x', 9], ['y', 10]] as const) {
      const start = a.player[axis] - old[axis], delta = player[axis] - d[axis] - start;
      if (Math.abs(delta) < 1e-9) { if (Math.abs(start) >= radius) exit = -1; }
      else {
        const first = (-radius - start) / delta, last = (radius - start) / delta;
        entry = Math.max(entry, Math.min(first, last));
        exit = Math.min(exit, Math.max(first, last));
      }
    }
    if (entry < exit && entry <= 1 && exit >= 0) contact = Math.min(contact, entry);
  }
  return contact <= score && contact <= 1 ? { phase: 'tackled', fraction: contact }
    : score <= 1 ? { phase: 'touchdown', fraction: score } : { phase: 'returning', fraction: 1 };
}
