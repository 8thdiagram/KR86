import { canEvadeKickDive, isKickContact, type KickAttempt, type KickDefender } from './kick-return-engine';

export const DIVE = { windup: .18, flight: .28, speed: 170, steady: .24, spacing: .9, recovery: 1.05, pushUp: .35 } as const;
/** Short final extension: at most half a ~16px body beyond normal axis reach,
 * and never more than one body of airborne travel. Old saved launches stay intact. */
export const LUNGE = { windup: .10, movingPlant: .06, flight: .18, extraReach: 8, maxTravel: 16 } as const;
export type DiveRead = { y: number; vy: number; steadyFor: number };
export type KickDive = {
  phase: 'windup' | 'airborne' | 'grounded' | 'recovering'; elapsed: number;
  vx: number; vy: number; angle: number;
  compact?: true;
  /** New admissions keep their rated approach momentum through the foot plant.
   * Already-launched saves without this field retain their original timing. */
  approach?: { vx: number; vy: number };
};
export const kickDiveTiming = (dive: KickDive) => dive.compact
  ? { windup: dive.approach ? LUNGE.movingPlant : LUNGE.windup, flight: LUNGE.flight } : DIVE;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Observe the previous completed movement, never the incoming button press. */
export function readDiveTrajectory(a: KickAttempt, dt: number): DiveRead {
  const previous = a.diveRead;
  const vy = previous ? (a.player.y - previous.y) / dt : 0;
  return { y: a.player.y, vy,
    steadyFor: previous && Math.abs(previous.vy - vy) < 1 ? Math.min(10, previous.steadyFor + dt) : 0 };
}

/** One committed attempt, reserved for a close, physically bounded lunge. */
export function startKickDive(a: KickAttempt, d: KickDefender, read: DiveRead): KickDefender {
   if (a.divePolicy === 3 && a.mechanicsVersion === 2) return startCompactDive(a, d, read);
   if (a.divePolicy === 2 && a.mechanicsVersion === 2) return startReachableDive(a, d, read);
   const upgraded = a.mechanicsVersion === 2;
   const medium = d.roamer?.tier === 'medium';
   if (!d.active || d.dive || d.diveSpent || !(d.roamer || d.id === 10 && d.motion) ||
       read.steadyFor < (upgraded ? medium ? .18 : .08 : DIVE.steady) || isKickContact(a.player, d) ||
       a.lastDiveTime !== undefined && a.returnTime - a.lastDiveTime < (upgraded ? 1.2 : DIVE.spacing)) return d;
  const dx = d.x - a.player.x, dy = d.y - a.player.y;
   if (dx < (upgraded ? -10 : -14) || dx > (upgraded ? medium ? 32 : 48 : 22) ||
       Math.abs(dy) > (upgraded ? medium ? 24 : 34 : 22) || Math.hypot(dx, dy) < 13) return d;
  // Last-ditch only: the runner is at/passing this defender's tackling angle.
  const intercept = DIVE.flight * .65;
  const horizon = DIVE.windup + intercept;
  const targetX = a.player.x + (a.moves?.vx ?? 73) * horizon;
  const targetY = clamp(a.player.y + read.vy * horizon, 24, 168);
  const vx = (targetX - d.x) / intercept, vy = (targetY - d.y) / intercept;
  if (Math.hypot(vx, vy) > DIVE.speed || targetX > 1096 || targetX < 8) return d;
   const committed: KickDefender = { ...d, ...(upgraded ? { diveSpent: true } : {}),
    dive: { phase: 'windup', elapsed: 0, vx, vy, angle: Math.atan2(vy, vx) } };
  // Don't spend a dive on a crowded lane with no reasonable immediate cut.
  return canEvadeKickDive(a, committed) ? committed : d;
}

export function fitsCompactDive(d: KickDefender, vx: number, vy: number): boolean {
  const x = Math.abs(vx) * LUNGE.flight, y = Math.abs(vy) * LUNGE.flight;
  const extraX = Math.max(0, x - d.speed * LUNGE.flight);
  const extraY = Math.max(0, y - d.lateralSpeed * LUNGE.flight);
  return Math.hypot(x, y) <= LUNGE.maxTravel + 1e-9 &&
    Math.hypot(extraX, extraY) <= LUNGE.extraReach + 1e-9;
}

function startCompactDive(a: KickAttempt, d: KickDefender, read: DiveRead): KickDefender {
  if (!d.active || d.dive || d.diveSpent || !(d.roamer || d.id === 10 && d.motion) ||
      isKickContact(a.player, d)) return d;
  const dx = d.x - a.player.x, dy = d.y - a.player.y;
  const distance = Math.hypot(dx, dy);
  if (dx < -12 || dx > 40 || Math.abs(dy) > 34 || distance > 40) return d;
  const approach = {
    vx: clamp(d.motion?.vx ?? d.roamer?.vx ?? -d.speed, -d.speed, d.speed),
    vy: clamp(d.motion?.vy ?? (clamp(a.player.y, d.minY, d.maxY) - d.y) * 4, -d.lateralSpeed, d.lateralSpeed),
  };
  const runnerVX = a.moves?.vx ?? 73;
  const closing = (dx * (runnerVX - approach.vx) + dy * (read.vy - approach.vy)) / Math.max(1, distance);
  if (closing <= 0 && distance > 18) return d;
  const target = (t: number) => ({ x: a.player.x + runnerVX * t,
    y: clamp(a.player.y + read.vy * t, 24, 168) });
  const plant = { x: d.x + approach.vx * LUNGE.movingPlant, y: d.y + approach.vy * LUNGE.movingPlant };
  let best: { vx: number; vy: number; gap: number } | undefined;
  for (const intercept of [.10, .12, .14, .16, .18]) {
    const runner = target(LUNGE.movingPlant + intercept);
    const wanted = { vx: (runner.x + clamp(plant.x - runner.x, -6, 6) - plant.x) / intercept,
      vy: (runner.y + clamp(plant.y - runner.y, -6, 6) - plant.y) / intercept };
    // Clamp a real attempt to its physical reach rather than requiring a
    // guaranteed future hit. Near misses are valid last-ditch tackles too.
    let lo = 0, hi = 1;
    for (let i = 0; i < 18; i++) {
      const ratio = (lo + hi) / 2;
      if (fitsCompactDive(d, wanted.vx * ratio, wanted.vy * ratio)) lo = ratio; else hi = ratio;
    }
    const vx = wanted.vx * lo, vy = wanted.vy * lo;
    let gap = Infinity;
    for (let t = 0; t <= LUNGE.flight + 1e-9; t += 1 / 60) {
      const p = target(LUNGE.movingPlant + t);
      gap = Math.min(gap, Math.max(Math.abs(p.x - plant.x - vx * t) / 9,
        Math.abs(p.y - plant.y - vy * t) / 10));
    }
    if (!best || gap < best.gap) best = { vx, vy, gap };
  }
  // Only close, approaching encounters: never leap at a distant departing runner.
  // No whole-field escape/cooldown veto suppresses this defender's local chance.
  if (!best || best.gap > 1.65 || dx < 0 && best.gap >= 1) return d;
  return { ...d, diveSpent: true, dive: { compact: true, approach, phase: 'windup', elapsed: 0,
    vx: best.vx, vy: best.vy, angle: Math.atan2(best.vy, best.vx) } };
}

/** Admit a reachable interception, including lateral motion, without waiting for
 * a steady-direction timer. Read only previous movement, not the next input.
 * Ordinary contact is never suppressed or delayed to manufacture an animation. */
function startReachableDive(a: KickAttempt, d: KickDefender, read: DiveRead): KickDefender {
  if (!d.active || d.dive || d.diveSpent || !(d.roamer || d.id === 10 && d.motion) ||
      isKickContact(a.player, d) || a.lastDiveTime !== undefined && a.returnTime - a.lastDiveTime < .65) return d;
  const medium = d.roamer?.tier === 'medium';
  const dx = d.x - a.player.x, dy = d.y - a.player.y;
  if (dx < (medium ? -12 : -16) || dx > (medium ? 48 : 62) ||
      Math.abs(dy) > (medium ? 34 : 42) || Math.hypot(dx, dy) > (medium ? 55 : 70)) return d;
  const runnerVX = a.moves?.vx ?? 73;
  const target = (t: number) => ({ x: a.player.x + runnerVX * t, y: clamp(a.player.y + read.vy * t, 24, 168) });
  // If planting would merely permit a normal tackle, keep running instead.
  for (let t = 0; t <= DIVE.windup; t += 1 / 60)
    if (isKickContact(target(t), d)) return d;
  for (let flight = .14; flight <= DIVE.flight + .000001; flight += 1 / 60) {
    const point = target(DIVE.windup + Math.min(flight, DIVE.flight));
    const vx = (point.x - d.x) / flight, vy = (point.y - d.y) / flight;
    if (Math.hypot(vx, vy) > DIVE.speed || point.x > 1096 || point.x < 8) continue;
    // Require three genuinely airborne frames before predicted contact, not a
    // windup immediately replaced by a tackle banner. Hitboxes stay unchanged.
    let visible = true;
    for (let t = 0; t <= .05; t += 1 / 60) {
      if (isKickContact(target(DIVE.windup + t), { x: d.x + vx * t, y: d.y + vy * t })) visible = false;
    }
    if (!visible) continue;
    const committed: KickDefender = { ...d, diveSpent: true,
      dive: { phase: 'windup', elapsed: 0, vx, vy, angle: Math.atan2(vy, vx) } };
    return canEvadeKickDive(a, committed) ? committed : d;
  }
  return d;
}

export function stepCommittedDive(d: KickDefender, dt: number, recover = false): KickDefender {
  const dive = d.dive!;
  const timing = kickDiveTiming(dive);
   if (dive.phase === 'grounded') {
     if (!recover) return d;
     const elapsed = Math.min(DIVE.recovery, dive.elapsed + dt);
     return { ...d, dive: { ...dive, elapsed: elapsed >= DIVE.recovery ? 0 : elapsed,
       phase: elapsed >= DIVE.recovery ? 'recovering' : 'grounded' } };
   }
   if (dive.phase === 'recovering') {
     const elapsed = dive.elapsed + dt;
     return { ...d, dive: elapsed + 1e-9 >= DIVE.pushUp ? undefined : { ...dive, elapsed },
       ...(elapsed + 1e-9 >= DIVE.pushUp ? {
         roamer: d.roamer ? { ...d.roamer, vx: 0 } : undefined,
         motion: d.motion ? { ...d.motion, vx: 0, vy: 0, reactionLeft: .18 } : undefined,
       } : {}) };
   }
  if (dive.phase === 'windup') {
    const elapsed = dive.elapsed + dt;
    const spill = Math.max(0, elapsed - timing.windup);
    const plantTime = Math.min(dt, Math.max(0, timing.windup - dive.elapsed));
    const launched = elapsed + (dive.compact ? 1e-9 : 0) >= timing.windup;
    return { ...d, x: clamp(d.x + (dive.approach?.vx ?? 0) * plantTime + dive.vx * spill, 0, 1200),
      y: clamp(d.y + (dive.approach?.vy ?? 0) * plantTime + dive.vy * spill, 24, 168),
      dive: { ...dive, phase: launched ? 'airborne' : 'windup',
        elapsed: launched ? spill : elapsed } };
  }
  const travel = Math.min(dt, Math.max(0, timing.flight - dive.elapsed));
  const elapsed = Math.min(timing.flight, dive.elapsed + dt);
  return { ...d, x: clamp(d.x + dive.vx * travel, 0, 1200),
    y: clamp(d.y + dive.vy * travel, 24, 168),
     dive: { ...dive, elapsed: recover && elapsed >= timing.flight ? 0 : elapsed,
       phase: elapsed >= timing.flight ? 'grounded' : 'airborne' } };
}

/** Old saved attempts keep their purely cosmetic dive presentation. */
export function kickDivePose(a: KickAttempt, d: KickDefender, terminalSeconds = 0): {
  amount: number; angle: number; phase?: KickDive['phase']; landed: boolean; lift: number;
} | null {
  if (a.diveVersion === 1) {
    if (!d.dive) return null;
      const timing = kickDiveTiming(d.dive);
      // Physics and the clock stop on contact, but the short visual commitment
      // finishes before landing. Never replace an airborne hit with running.
      if (a.phase === 'tackled' && d.dive.approach && ['windup', 'airborne'].includes(d.dive.phase)) {
        const elapsed = d.dive.elapsed + terminalSeconds;
        const flightTime = d.dive.phase === 'windup' ? elapsed - timing.windup : elapsed;
        const phase = flightTime < 0 ? 'windup' : flightTime < timing.flight ? 'airborne' : 'grounded';
        return kickDivePose({ ...a, phase: 'returning' }, { ...d,
          dive: { ...d.dive, phase, elapsed: phase === 'windup' ? elapsed : Math.max(0, Math.min(timing.flight, flightTime)) } });
      }
      const up = clamp(d.dive.elapsed / DIVE.pushUp, 0, 1);
      const amount = d.dive.phase === 'recovering' ? 1 - up * up * (3 - 2 * up)
       : d.dive.phase === 'windup' ? .15 + .2 * d.dive.elapsed / timing.windup
      : d.dive.phase === 'grounded' || a.phase === 'tackled' ? 1
      : d.dive.compact ? .4 + .3 * Math.min(1, d.dive.elapsed / timing.flight)
      : .8 + .2 * Math.min(1, d.dive.elapsed / (timing.flight * .35));
    return { amount, angle: d.dive.angle, phase: d.dive.phase,
      landed: d.dive.phase === 'grounded' || a.phase === 'tackled',
      lift: d.dive.phase === 'airborne' && a.phase === 'returning'
         ? Math.sin(Math.PI * Math.min(1, d.dive.elapsed / timing.flight)) * (d.dive.compact ? 1 : 5) : 0 };
  }
  if (!d.active || !(d.roamer || d.id === 10 && d.motion) ||
      a.phase !== 'returning' && a.phase !== 'tackled') return null;
  const dx = a.player.x - d.x, dy = a.player.y - d.y;
  const landed = a.phase === 'tackled' && isKickContact(a.player, d);
  if (a.phase === 'tackled' && !landed || Math.abs(dx) > 24 || Math.abs(dy) > 18) return null;
  return {
    amount: landed ? 1 : Math.max(0, Math.min(1, (28 - Math.hypot(dx, dy)) / 18)),
    angle: Math.atan2(dy, dx),
    landed,
    lift: landed ? 0 : Math.sin(Math.PI * Math.max(0, Math.min(1, (28 - Math.hypot(dx, dy)) / 18))) * 2,
  };
}
