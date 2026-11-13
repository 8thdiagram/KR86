import { franchiseAthleteFactor, upgradedPassingBaseline } from './franchise-upgrades';
import { passProjection } from './passing-safety';
import { routePoint } from './route-geometry';
import { clamp, type Athlete, type FootballGame, type PassType } from './types';

/** One delivery estimate, shared by human/CPU and target ranking. No success roll,
 * defender-separation penalty, play-history modifier, or generic late-clock decay. */
export function throwAccuracy(g: FootballGame, a: Athlete, type: PassType) {
  const l = g.live!, qb = l.athletes[5]!, projection = passProjection(l, a, type);
  const distance = Math.hypot(qb.x - a.x, qb.y - a.y);
  const horizon = projection.duration * .7;
  const speed = Math.hypot(a.vx, a.vy);
  let dx: number, dy: number;
  if (a.scrambleTarget) {
    const x = a.scrambleTarget.x - a.x, y = a.scrambleTarget.y - a.y;
    const fraction = Math.min(1, speed * horizon / Math.max(1, Math.hypot(x, y)));
    dx = x * fraction; dy = y * fraction;
  } else {
    const upgrade = franchiseAthleteFactor(g, a);
    const now = routePoint(l, a, upgrade);
    const future = routePoint({ ...l, time: l.time + horizon }, a, upgrade);
    dx = future.x - now.x; dy = future.y - now.y;
  }
  // A cut/stop within this particular pass's travel horizon makes linear leading
  // less predictable. A stable route, even late or after a scramble, stays valid.
  const deviation = Math.hypot(dx - a.vx * horizon, dy - a.vy * horizon);
  const stability = 1 - clamp(deviation / Math.max(20, speed * horizon + 12), 0, 1);
  const moving = Math.min(.05, Math.abs(qb.vy) / 1200 + (l.scrambled ? Math.abs(qb.vx) / 1800 : 0));
  const accuracy = clamp(upgradedPassingBaseline(g, .30 + g.profiles[g.possession].qb * .43) +
    stability * .15 + l.advantage * .18 - l.pressure * .14 -
    Math.max(0, distance - 200) / 2500 - moving, .12, .94);
  // Bounded angular placement error grows with distance. This replaces the
  // nearly always catchable fixed scatter; it does not change speed/arc/lead.
  const range = clamp(distance - 80, 0, 400);
  return { accuracy, stability, projection,
    spreadX: (45 + range * .90) * (1 - accuracy),
    spreadY: (35 + range * .65) * (1 - accuracy) };
}
