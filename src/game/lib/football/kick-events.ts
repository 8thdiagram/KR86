import { looseBall, noteRare, RARE, stepLoose } from './rare-events';
import { canDefensiveAction, startNearestDive } from './defensive-action';
import { clamp, random, type Athlete, type FootballGame, type FootballInput, type SpecialTeams } from './types';
import { chaosOpportunity } from './clutch';

/** Original kick orientation: punt/kickoff receiving side attacks right;
 * field-goal receiving side attacks left. Compare with the neutral zone. */
export function kickRecoveryEligible(s: SpecialTeams, g: FootballGame, a: Athlete) {
  if (a.side === 'defense' || s.rareOrigin === 'fumble' || s.rareOrigin === 'muff') return true;
  if (s.kind === 'full' || s.kind === 'squib' || s.kind === 'onside') return s.fromX - s.ball.x >= 100;
  const los = s.kind === 'punt' ? 1200 - (100 + g.spot * 10) : 100 + g.spot * 10;
  return s.kind === 'punt' ? s.ball.x >= los : s.ball.x <= los;
}
export function advanceKickRush(g: FootballGame, s: SpecialTeams, dt: number) {
  if (!s.blockChecked && (s.kind === 'punt' || s.kind === 'field-goal') && s.stage === 'snap') {
    s.blockChecked = true;
    const protect = g.profiles[s.kicking].line, rush = g.profiles[s.receiver].rush;
    const chance = (s.kind === 'punt' ? RARE.puntBlockAttempt : RARE.fieldGoalBlockAttempt) *
      clamp(1 + (rush - protect) * .7, .65, 1.35);
    if (random(g) < chaosOpportunity(g, chance)) {
      const edges = s.athletes.filter(a => a.side === 'defense' && a.role === 'DL' && a.id !== s.returner && Math.abs(a.y - 96) > 8);
      const d = edges[Math.floor(random(g) * edges.length)];
      if (d) s.blockAttempt = { defender: d.id, side: d.y < 96 ? -1 : 1 };
    }
  }
  const attempt = s.blockAttempt;
  if (!attempt || attempt.contacted || !['snap', 'hold', 'approach', 'flight'].includes(s.stage) ||
      s.stage === 'flight' && s.stageAge > .12) return;
  const d = s.athletes[attempt.defender]!, punt = s.kind === 'punt';
  const los = punt ? 1200 - (100 + g.spot * 10) : 100 + g.spot * 10;
  const edge = { x: los + (punt ? 8 : -8), y: 96 + attempt.side * 33 };
  if (Math.hypot(d.x - edge.x, d.y - edge.y) < 5) attempt.cleared = true;
  const target = attempt.cleared ? { x: s.fromX, y: s.fromY } : edge;
  const speed = 53 + g.profiles[s.receiver].rush * 18;
  const dx = target.x - d.x, dy = target.y - d.y, n = Math.hypot(dx, dy), f = Math.min(1, speed * dt / Math.max(.001, n));
  d.vx = dx * f / dt; d.vy = dy * f / dt; d.x += dx * f; d.y += dy * f;
  const blocker = s.athletes.filter(a => a.side === 'offense' && a.role === 'OL')
    .sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
  if (blocker && Math.hypot(blocker.x - d.x, blocker.y - d.y) < 20) blocker.engaged = s.age + .08;
}
export function contactKickBlock(g: FootballGame, s: SpecialTeams) {
  const attempt = s.blockAttempt;
  if (!attempt || attempt.tested) return false;
  const d = s.athletes[attempt.defender]!;
  // Sprite shoulder/raised-hand reach, including the visible short block leap.
  // Testing only foot height made quick short field goals physically immune.
  if (s.ball.z > 16 || Math.hypot(d.x - s.ball.x, d.y - s.ball.y) > 13) return false;
  attempt.tested = true;
  const success = clamp(.68 + (g.profiles[s.receiver].rush - g.profiles[s.kicking].line) * .18 +
    Math.abs((s.accuracy ?? .5) - .5) * .08, .5, .82);
  if (random(g) >= success) return false;
  attempt.contacted = true; s.rareOrigin = 'block'; s.good = false;
  s.loose = looseBall(s.athletes, 'block', s.ball.x, s.ball.y, s.kicking, s.kicker, random(g),
    a => kickRecoveryEligible(s, g, a));
  s.stage = 'loose'; s.stageAge = 0;
  d.defensiveAttempt = { kind: 'recover', at: s.age };
  noteRare(g, s.kind === 'punt' ? 'blockedPunts' : 'blockedFieldGoals');
  g.message = `BLOCKED ${s.kind === 'punt' ? 'PUNT' : 'FIELD GOAL'} — LIVE BALL!`;
  return true;
}
export function receptionMuff(g: FootballGame, s: SpecialTeams) {
  if (s.receptionChecked || s.kind === 'onside' || s.kind === 'field-goal') return false;
  s.receptionChecked = true;
  const ret = s.athletes[s.returner]!;
  const pressure = Math.min(...s.athletes.filter(a => a.side === 'offense').map(a => Math.hypot(a.x - ret.x, a.y - ret.y)));
  const chance = (s.kind === 'punt' ? RARE.puntMuff : RARE.kickoffMuff) *
    (1.5 - g.profiles[s.receiver].back * .65) * (pressure < 35 ? 1.2 : 1) * (s.kind === 'squib' ? 1.12 : 1);
  if (random(g) >= chance) return false;
  const variant = random(g);
  s.rareOrigin = 'muff';
  s.loose = looseBall(s.athletes, 'muff', s.ball.x,
    s.ball.y, s.receiver, ret.id, variant);
  s.stage = 'loose'; s.stageAge = 0; s.recovery = undefined; s.recoveryFrom = undefined;
  noteRare(g, s.kind === 'punt' ? 'puntMuffs' : 'kickoffMuffs');
  g.message = `${s.kind === 'punt' ? 'PUNT' : 'KICKOFF'} ${variant < .33 ? 'BOBBLED' : variant < .66 ? 'MISJUDGED' : 'DROPPED'} — LIVE BALL!`;
  return true;
}
export function advanceKickLoose(g: FootballGame, s: SpecialTeams, input: FootballInput, dt: number) {
  const ball = s.loose!;
  if (input.action && canDefensiveAction(g)) {
    const group = s.kicking === 'home' ? 'offense' : 'defense';
    const candidates = s.athletes.filter(a => a.side === group && kickRecoveryEligible(s, g, a));
    const diver = startNearestDive(candidates, ball, s.age);
    if (diver) diver.defensiveAttempt = { kind: 'recover', at: s.age };
  }
  const a = stepLoose(ball, s.athletes, dt);
  s.ball = { x: ball.x, y: ball.y, z: ball.z ?? 0 };
  if (a) { s.recovery = a.id; s.recoveryFrom = { x: a.x, y: a.y }; }
  return a;
}
