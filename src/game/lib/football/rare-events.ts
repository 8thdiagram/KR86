import { clamp, random, type Athlete, type FootballGame, type LooseBall, type Side } from './types';
import { chaosOpportunity } from './clutch';
import { turnoverSkill } from './franchise-upgrades';
import { playerSpeed } from '../player-pace';
import { legendaryAthleteFactor } from './legendary';

/** Per ELIGIBLE contact/catch/kick only. Never consume score, clock, prior
 * drought or event counters. These conservative constants are calibration knobs. */
export const RARE = { fumble: .008, kickoffMuff: .009, puntMuff: .012,
  puntBlockAttempt: .018, fieldGoalBlockAttempt: .028 } as const;
export function noteRare(g: FootballGame, event: keyof NonNullable<FootballGame['rareEvents']>) {
  const counts = g.rareEvents ??= {}; counts[event] = (counts[event] ?? 0) + 1;
}
export function fumbleChance(g: FootballGame, owner: Side, carrier: Pick<Athlete, 'role' | 'vx' | 'vy'>,
  defender: Pick<Athlete, 'vx' | 'vy'>) {
  const p = g.profiles[owner], security = carrier.role === 'QB' ? p.qb :
    carrier.role === 'WR' || carrier.role === 'TE' ? p.receivers : p.back;
  const severity = clamp(Math.hypot(carrier.vx - defender.vx, carrier.vy - defender.vy) / 155, 0, 1);
  const angle = Math.abs(carrier.vy - defender.vy) / 120;
  return clamp(RARE.fumble * (1.35 - security * .65) *
    (.8 + severity * .45 + Math.min(.2, angle * .12)) *
    (.8 + g.profiles[owner === 'home' ? 'away' : 'home'].rush * .35), .003, .016);
}
export function tryFumble(g: FootballGame, owner: Side, carrier: Athlete, defender: Athlete) {
  if (random(g) >= Math.min(.12, chaosOpportunity(g, fumbleChance(g, owner, carrier, defender)) * turnoverSkill(g, defender) /
    legendaryAthleteFactor(g, carrier))) return false;
  noteRare(g, 'fumbles'); return true;
}
/** Lock the nearest ELIGIBLE athlete at loss, as in historical recoveries.
 * The ball and pursuit still travel physically; pressing ACTION cannot reroll it. */
export function looseBall(players: Athlete[], kind: NonNullable<LooseBall['kind']>, x: number, y: number,
  owner: Side, lostBy: number, variant: number, eligible: (a: Athlete) => boolean = () => true): LooseBall {
  const nearest = players.filter(eligible).sort((a, b) =>
    Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || a.id - b.id)[0];
  if (!nearest) throw new Error('Live loose ball requires an eligible recovery player');
  return { x, y, z: 2, time: 0, kind, owner, lostBy, variant,
    originX: x, originY: y, vx: (variant < .5 ? -1 : 1) * (kind === 'block' ? 75 : 24),
    vy: (variant - .5) * 42, recoverer: nearest.id, fromX: nearest.x, fromY: nearest.y, secure: 0 };
}
export function stepLoose(ball: LooseBall, players: Athlete[], dt: number) {
  ball.time += dt;
  // Historical frozen-ball saves retain their old proximity winner but gain
  // safe bounded travel. No random draw occurs during presentation/recovery.
  ball.vx ??= 0; ball.vy ??= 0; ball.z ??= 0;
  ball.x += ball.vx * dt; ball.y = clamp(ball.y + ball.vy * dt, 25, 167);
  ball.vx *= Math.exp(-3.5 * dt); ball.vy *= Math.exp(-3.5 * dt);
  const bobble = ball.kind === 'muff' && (ball.variant ?? 0) < .33;
  const height = ball.kind === 'muff' ? bobble ? 16 : (ball.variant ?? 0) < .66 ? 8 : 6 : 8;
  ball.z = Math.abs(Math.sin(ball.time * (bobble ? 9 : 14))) * height * Math.exp(-2.8 * ball.time);
  const nearest = players.find(a => a.id === ball.recoverer);
  if (!nearest) throw new Error('Missing saved loose-ball recovery athlete');
  for (const a of players) {
    if (ball.kind === 'fumble' && a.id === ball.lostBy && ball.time < .36) { a.vx = 0; a.vy = 0; continue; }
    const dx = ball.x - a.x, dy = ball.y - a.y + (a.id === nearest.id ? 0 : (a.id % 3 - 1) * 10);
    const n = Math.hypot(dx, dy), travel = Math.min(n, playerSpeed(a.id === nearest.id ? 78 : 53) * dt);
    a.vx = n ? dx / n * travel / dt : 0; a.vy = n ? dy / n * travel / dt : 0;
    a.x += a.vx * dt; a.y += a.vy * dt;
  }
  if (ball.time >= .48 && ball.z < 3 && Math.hypot(nearest.x - ball.x, nearest.y - ball.y) < 7)
    ball.secure = (ball.secure ?? 0) + dt;
  return (ball.secure ?? 0) >= .24 && ball.time >= (ball.kind === 'fumble' ? 1.06 : .72) ? nearest : undefined;
}
