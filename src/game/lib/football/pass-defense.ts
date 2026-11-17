import { clamp, other, random, type Athlete, type FootballGame } from './types';
import { intercept } from './interception';
import { chaosOpportunity } from './clutch';
import { turnoverSkill } from './franchise-upgrades';

/** Per physically reached contest, NOT per pass or per frame. Conservative arcade
 * calibration: most attempts miss, break up, or allow a completion. Aggregate
 * interception rate is measured in complete matches, not claimed as historical data.
 */
export const PASS_DEFENSE = { interceptionChance: .075, maxInterceptionChance: .14, breakupChance: .36,
  reactionSeconds: .12, actionCooldown: .48, reach: 13, maxAttemptDistance: 38, idealMultiplier: 1.2 } as const;

export function idealInterceptionPosition(g: FootballGame, d: Athlete, horizon: number) {
  const f = g.live!.flight!;
  const dx = f.toX - f.fromX, dy = f.toY - f.fromY, length = Math.max(.001, dx * dx + dy * dy);
  const along = ((d.x - f.fromX) * dx + (d.y - f.fromY) * dy) / length;
  const across = Math.hypot(d.x - f.fromX - dx * along, d.y - f.fromY - dy * along);
  return along >= .05 && along <= 1.02 && across <= 16 && horizon <= .28;
}

export function eligiblePassDefenders(g: FootballGame) {
  const l = g.live!, f = l.flight;
  if (!f || f.deflected || l.mode !== 'flight' ||
      f.age < (f.type === 'bullet' ? .025 : PASS_DEFENSE.reactionSeconds)) return [];
  const remaining = f.duration - f.age;
  if (remaining < .045) return [];
  const normal = f.type !== 'bullet';
  if (!normal) {
    // Read a ball already released, including the actual plant and bounded dive
    // travel. A flat lane gives anticipation, not teleportation or free picks.
    return l.athletes.filter(d => d.side === 'defense' && !d.dive &&
      d.engaged <= l.time && !f.attempted?.includes(d.id)).flatMap(d => {
      const plant = { x: d.x + d.vx * .06, y: d.y + d.vy * .06 };
      for (const horizon of [.075, .10, .13, .16, .20, .23]) {
        if (horizon > remaining) continue;
        const t = (f.age + horizon) / f.duration;
        const target = { x: f.fromX + (f.toX - f.fromX) * t,
          y: f.fromY + (f.toY - f.fromY) * t };
        const distance = Math.hypot(plant.x - target.x, plant.y - target.y);
        if (distance <= PASS_DEFENSE.reach + 130 * Math.min(.18, horizon - .06) &&
            Math.hypot(d.x - target.x, d.y - target.y) <= PASS_DEFENSE.maxAttemptDistance)
          return [{ d, target, horizon }];
      }
      return [];
    }).sort((a, b) => a.horizon - b.horizon || a.d.id - b.d.id);
  }
  // High normal arcs can ONLY be contested near their intended landing point.
  if (normal && remaining > .34) return [];
  // A bullet can cross several bodies during the plant. Aim at the first
  // reachable arrival, not a fixed far-ahead point the defender can never catch.
  const horizon = Math.min(normal ? remaining : .10, remaining);
  const t = clamp((f.age + horizon) / f.duration, 0, 1);
  const target = { x: normal ? f.toX : f.fromX + (f.toX - f.fromX) * t,
    y: normal ? f.toY : f.fromY + (f.toY - f.fromY) * t };
  return l.athletes.filter(d => d.side === 'defense' && !d.dive && d.engaged <= l.time &&
    !f.attempted?.includes(d.id) && Math.hypot(d.x - target.x, d.y - target.y) <=
      Math.min(PASS_DEFENSE.maxAttemptDistance, 13 + Math.max(0, horizon - .10) * 130) &&
    (!normal || Math.hypot(d.x - f.toX, d.y - f.toY) < 30))
    .sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y) || a.id - b.id)
    .map(d => ({ d, target, horizon }));
}
export function attemptPassDefense(g: FootballGame, onlyId?: number) {
  const l = g.live!;
  if (l.time - (l.defensiveActionAt ?? -Infinity) < PASS_DEFENSE.actionCooldown) return;
  const choices=eligiblePassDefenders(g);
  const choice = onlyId===undefined ? choices[0] : choices.find(choice=>choice.d.id===onlyId);
  if (!choice) return;
  const { d, target, horizon } = choice;
  const bullet = l.flight!.type === 'bullet', plant = bullet ? .06 : .10;
  const flight = Math.max(.015, horizon - plant);
  const dx = target.x - d.x - (bullet ? d.vx * plant : 0);
  const dy = target.y - d.y - (bullet ? d.vy * plant : 0);
  const cap = Math.min(1, 130 * flight / Math.max(.001, Math.hypot(dx, dy)));
  d.dive = { compact: true, phase: 'windup', elapsed: 0, vx: dx / flight * cap,
    vy: dy / flight * cap, angle: Math.atan2(dy, dx),
    ...(bullet ? { approach: { vx: d.vx, vy: d.vy } } : {}) };
  d.defensiveAttempt = { kind: 'intercept', at: l.time, ideal: idealInterceptionPosition(g, d, horizon) };
  (l.flight!.attempted ??= []).push(d.id);
  l.defensiveActionAt = l.time;
  return d;
}
/** Same eligibility and timing for CPU; no knowledge of an unthrown play. */
export function cpuPassDefense(g: FootballGame) {
  const l = g.live!;
  if (g.possession !== 'home' || l.time < (l.cpuActionAt ?? 0)) return;
  l.cpuActionAt = l.time + (l.flight?.type === 'bullet' ? .04 : .12);
  if (eligiblePassDefenders(g).length && random(g) < .58) attemptPassDefense(g);
}
export function resolvePassDefense(g: FootballGame, oldX: number, oldY: number): 'interception' | 'breakup' | undefined {
  const l = g.live!, f = l.flight!, profile = g.profiles[other(g.possession)], offense = g.profiles[g.possession];
  const defenders = l.athletes.filter(a => a.side === 'defense');
  for (const d of defenders) {
    const attempt = d.defensiveAttempt;
    if (!d.dive || d.dive.phase !== 'airborne' || attempt?.kind !== 'intercept' || attempt.resolved ||
        !f.attempted?.includes(d.id) || f.z > 13) continue;
    if (f.type !== 'bullet' && (Math.hypot(d.x - f.toX, d.y - f.toY) > 26 || f.age / f.duration < .78)) continue;
    const dx = f.x - oldX, dy = f.y - oldY;
    const t = clamp(((d.x - oldX) * dx + (d.y - oldY) * dy) / Math.max(.001, dx * dx + dy * dy), 0, 1);
    const distance = Math.hypot(d.x - oldX - dx * t, d.y - oldY - dy * t);
    if (distance > PASS_DEFENSE.reach) continue;
    attempt.resolved = true;
    (f.contested ??= []).push(d.id);
    const receiver = l.athletes[f.receiver]!;
    const separation = Math.hypot(d.x - receiver.x, d.y - receiver.y);
    const nearby = defenders.filter(a => Math.hypot(a.x - f.toX, a.y - f.toY) < 24).length;
    const timing = 1 - distance / PASS_DEFENSE.reach;
    const baseChance = clamp(PASS_DEFENSE.interceptionChance + (profile.coverage - offense.qb) * .045 +
      (1 - f.accuracy) * .035 + timing * .015 + Math.min(2, nearby) * .005 -
      Math.min(40, separation) * .0006 + (f.type === 'bullet' ? .005 : 0), .025, PASS_DEFENSE.maxInterceptionChance);
    const ideal = attempt.ideal && distance <= 8 && f.z <= 10 && l.time - attempt.at <= .32;
    const chance = Math.min(.65, chaosOpportunity(g, baseChance * (ideal ? PASS_DEFENSE.idealMultiplier : 1)) * turnoverSkill(g, d));
    const roll = random(g);
    if (roll < chance) { intercept(l, d); return 'interception'; }
    if (roll < Math.min(.94, chance + chaosOpportunity(g, PASS_DEFENSE.breakupChance + timing * .08))) return 'breakup';
    // The committed diver stays out of position. Catch adjudication still runs.
  }
  return undefined;
}
