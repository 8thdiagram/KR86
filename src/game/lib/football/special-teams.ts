import { createKickAttempt, stepKickAttempt, kickWitnessDirection, kickSeed, KR } from '../kick-return-engine';
import { FOOTBALL_SIDELINES } from './sidelines';
import { clamp, other, random, type Athlete, type FootballGame, type FootballInput, type Side, type SpecialTeams } from './types';
import { startField } from './field';
import { fieldGoalDistance } from './playbook';
import { fieldGoalAim, fieldGoalHeight, fieldGoalMeterAccuracy, fieldGoalMeterSpeed } from './field-goal-geometry';
import { FIELD_GOAL_FLIGHT_SCALE } from './celebration-timing';
import { canDefensiveAction, startNearestDive } from './defensive-action';
import { ELITE, eliteSlots } from './secondary';
import { franchiseFactor, franchiseKickControl } from './franchise-upgrades';
import { chaosOpportunity, SPECIAL_EXECUTION_SPEED } from './clutch';
import { advanceKickLoose, advanceKickRush, contactKickBlock, receptionMuff } from './kick-events';
import { looseBall, tryFumble } from './rare-events';
import { playerSpeed } from '../player-pace';

const point = (a: Athlete, x: number, y: number, speed: number, dt: number) => {
  const dx = x - a.x, dy = y - a.y, n = Math.hypot(dx, dy), f = n ? Math.min(1, playerSpeed(speed) * dt / n) : 0;
  a.vx = dx * f / dt; a.vy = dy * f / dt; a.x += dx * f; a.y += dy * f;
};
const stage = (s: SpecialTeams, next: SpecialTeams['stage']) => { s.stage = next; s.stageAge = 0; };
const actor = (id: number, side: Athlete['side'], x: number, y: number): Athlete =>
  ({ id, side, role: id === 6 ? 'QB' : id === 13 ? 'RB' : side === 'offense' ? 'WR' : 'DB',
    x, y, startX: x, startY: y, vx: 0, vy: 0, engaged: 0, route: 0, beaten: 0 });

/** Full Game coverage only: distinct lanes and a deeper central safety. */
function coverageLane(s: SpecialTeams, id: number) {
  if (id === s.kicker) return 96;
  const lanes = s.athletes.filter(a => a.side !== (s.returnGroup ?? 'defense') && a.id !== s.kicker)
    .sort((a, b) => a.startY - b.startY || a.id - b.id);
  return 29 + Math.max(0, lanes.findIndex(a => a.id === id)) * 126 / Math.max(1, lanes.length - 1);
}

export function setReturnCoverageZones(g: FootballGame) {
  const s = g.special!, a = g.returnAttempt!;
  const nearest = a.defenders.filter(d => !d.dive).sort((d, e) =>
    Math.hypot(d.x - a.player.x, d.y - a.player.y) - Math.hypot(e.x - a.player.x, e.y - a.player.y) || d.id - e.id);
  for (const d of a.defenders) {
    const distance = Math.hypot(d.x - a.player.x, d.y - a.player.y);
    const lane = coverageLane(s, d.id);
    const shift = clamp((a.player.y - 96) * .12, -7, 7);
    const center = clamp(lane + shift, 29, 163);
    // Only the nearest pressure defenders leave their zones at closing distance.
    const closing = !!a.pursuitVersion && (distance < 180 || a.player.x >= d.x - 24) ||
      nearest[0]?.id === d.id && distance < 72 || nearest[1]?.id === d.id && distance < 52 ||
      a.fullCoverage?.elite.includes(d.id) && distance < 220;
    const safety = d.id === s.kicker && s.kind === 'full';
    // The kicker stays deep and central, then breaks across the field once the returner nears him.
    const lastResort = safety && distance < 130;
    d.minY = closing || lastResort ? 24 : safety ? 62 : Math.max(24, center - 6);
    d.maxY = closing || lastResort ? 168 : safety ? 130 : Math.min(168, center + 6);
  }
}

export function kickoffSequence(g: FootballGame, kind: 'full' | 'squib' | 'onside'): SpecialTeams {
  const receiver = g.kickReceiver, kicking = other(receiver), fromX = 750;
  const toX = kind === 'onside' ? 630 : kind === 'squib' ? 300 + random(g) * 100 : 60 + random(g) * 130;
  const toY = 40 + random(g) * 112, athletes: Athlete[] = [];
  for (let i = 0; i < 7; i++) athletes.push(actor(i, 'offense', fromX + (i === 6 ? 25 : 8), i === 6 ? 96 : 29 + i * 25.2));
  for (let i = 0; i < 7; i++) athletes.push(actor(7 + i, 'defense', i === 6 ? toX - 16 : kind === 'onside' ? 590 : 440 - i * 13,
    i === 6 ? toY : 29 + i * 25.2));
  const chance = clamp(.12 + (g.profiles[kicking].line - g.profiles[receiver].line) * .08, .08, .17);
  return { kind, stage: 'lineup', age: 0, stageAge: 0, receiver, kicking, fromX, fromY: 96, toX, toY,
    ball: { x: fromX, y: 96, z: 0 }, duration: kind === 'full' ? 2.25 : kind === 'squib' ? 1.65 : 1.45,
    athletes, kicker: 6, returner: 13, ...(kind === 'onside' ? { onsideWinner: random(g) < chance ? kicking : receiver } : {}) };
}

/** Punt and fake punt share startField's identical punt formation and backfield snap. */
export function puntSequence(g: FootballGame): SpecialTeams {
  const l = g.live!, travel = 33 + random(g) * 18;
  const fromX = 1200 - l.athletes[5]!.x, toX = 1100 - (g.spot + travel) * 10;
  const athletes = l.athletes.map(a => ({ ...a, x: 1200 - a.x, startX: 1200 - a.startX, vx: 0, vy: 0 }));
  // A dedicated deep returner is visible before the snap, not spawned on reception.
  const returner = athletes.length - 1;
  const ret = athletes[returner]!; ret.x = clamp(toX - 18, 36, 1080); ret.y = 96; ret.startX = ret.x; ret.startY = 96;
  return { kind: 'punt', stage: 'snap', age: 0, stageAge: 0, receiver: other(g.possession), kicking: g.possession,
    fromX, fromY: 96, toX: Math.max(35, toX), toY: 40 + random(g) * 112, duration: 2.35,
    ball: { x: 1200 - (100 + g.spot * 10), y: 96, z: 0 }, athletes, kicker: 5, returner,
    travel, touchback: toX <= 100 };
}

export function fieldGoalSequence(g: FootballGame): SpecialTeams {
  const l = g.live!, accuracy = l.kickAccuracy;
  const aim = accuracy === undefined ? { toY: 96 } : fieldGoalAim(g, accuracy);
  const athletes = l.athletes.map(a => ({ ...a, vx: 0, vy: 0 }));
  const holder = athletes[6]!, kicker = athletes[5]!;
  holder.x = 100 + g.spot * 10 - 55;
  holder.y = Number.isFinite(g.fieldGoalSpotY)
    ? clamp(g.fieldGoalSpotY!, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY) : holder.y;
  kicker.x = holder.x - 22; kicker.y = holder.y + 12;
  // The same continuous goal-plane aim drives both flight and scoring.
  return { kind: 'field-goal', stage: 'snap', age: 0, stageAge: 0, receiver: other(g.possession), kicking: g.possession,
    fromX: holder.x, fromY: holder.y, toX: 1194, ...aim, duration: 1.65,
    ball: { x: 100 + g.spot * 10, y: holder.y, z: 0 }, athletes, kicker: 5, returner: 6, accuracy };
}

export type SpecialResult = { kind: 'return' | 'touchdown' | 'recovery' | 'touchback' | 'good' | 'miss' | 'scrimmage' | 'safety'; side: Side; spot: number; detail?: string };
function beginReturn(g: FootballGame, s: SpecialTeams, carrier = s.returner, side = s.receiver) {
  const group = s.athletes[carrier]!.side;
  const mirror = (s.kind === 'field-goal') !== (side === s.kicking);
  // Only the reused return-engine coordinates mirror. Keep every rendered
  // athlete and football in its continuous physical field coordinates.
  s.mirrored = mirror;
  s.returner = carrier; s.returnSide = side; s.returnGroup = group;
  const coverage = s.athletes.filter(a => a.side !== group), secondary = coverage.filter(a => a.role === 'DB');
  const slots = eliteSlots(g, other(side));
  const elites = slots.map(slot => (secondary.length >= 3 ? secondary[slot]! : coverage.slice(3, 6)[slot]!)?.id).filter((id): id is number => id !== undefined);
  const a = createKickAttempt(Math.floor(random(g) * 2147483647), g.plays + 1);
  if (s.kind === 'punt' || s.kind === 'field-goal') delete a.kickoffBoost;
  a.teams = side === 'home' ? g.teams : { player: g.teams.opponent, opponent: g.teams.player };
  a.phase = 'returning'; a.time = 0; a.returnTime = 0;
  a.player = { x: mirror ? 1200 - s.ball.x : s.ball.x, y: s.ball.y }; a.landing = { ...a.player };
  a.moves = { ...a.moves!, furthestX: a.player.x };
  // Stable unit assignments: the team's three secondary slots cover as 3/4/5;
  // the kicker and front coverage players never become elite by accident.
  a.fullCoverage = { elite: elites };
  const kickReturn = s.kind === 'full' || s.kind === 'squib' || s.kind === 'onside';
  if (kickReturn && franchiseFactor(g, 'KR1', side) !== 1)
    a.fullCoverage.returnSpeed = franchiseFactor(g, 'KR1', side);
  if (franchiseFactor(g, 'DB1', other(side)) !== 1) {
    const db = secondary.length >= 3 ? secondary[0] : coverage[3];
    if (db) a.fullCoverage.defenderSpeed = { id: db.id, factor: franchiseFactor(g, 'DB1', other(side)) };
  }
  if (s.kind === 'full' || s.kind === 'squib' || s.kind === 'onside') {
    // Promote one ordinary coverage player without replacing the team's elite
    // personnel or drawing from the outcome RNG. Persist the choice for this return.
    const pool = coverage.filter(d => !elites.includes(d.id));
    a.fullCoverage.speedMatch = pool[kickSeed(`${a.seed}:kickoff-pace:${s.kicking}`) % pool.length]!.id;
    const extraPool = pool.filter(d => d.id !== a.fullCoverage!.speedMatch);
    a.fullCoverage.extraSpeedMatch = extraPool[kickSeed(`${a.seed}:extra-kickoff-pace:${s.kicking}`) % extraPool.length]!.id;
  }
  a.defenders = a.defenders.slice(0, coverage.length).map((d, i) => ({ ...d, id: coverage[i]!.id, x: mirror ? 1200 - coverage[i]!.x : coverage[i]!.x, y: coverage[i]!.y,
    homeX: mirror ? 1200 - coverage[i]!.x : coverage[i]!.x, minY: 24, maxY: 168, active: true,
    speed: elites.includes(coverage[i]!.id) ? ELITE.forward : 44 + i % 3 * 3,
    lateralSpeed: elites.includes(coverage[i]!.id) ? ELITE.lateral : 48,
    roamer: elites.includes(coverage[i]!.id) || i % 3 === 0 && coverage[i]!.id !== s.kicker ? { vx: 0, stride: 0 } : undefined,
    motion: undefined }));
  for (const matched of a.defenders.filter(d => d.id === a.fullCoverage!.speedMatch || d.id === a.fullCoverage!.extraSpeedMatch)) {
    matched.speed = KR.forwardSpeed * (a.kickoffBoost ?? 1);
    matched.lateralSpeed = KR.lateralSpeed;
  }
  const upgraded = a.defenders.find(d => d.id === a.fullCoverage!.defenderSpeed?.id);
  if (upgraded) {
    upgraded.speed *= a.fullCoverage.defenderSpeed!.factor;
    upgraded.lateralSpeed *= a.fullCoverage.defenderSpeed!.factor;
  }
  g.returnAttempt = a;
  g.possession = side; // possession changes at fielding, not at the eventual tackle
  s.loose = undefined;
  stage(s, 'return'); g.message = `${s.rareOrigin ? `${s.rareOrigin.toUpperCase()} RECOVERED` : s.kind === 'punt' ? 'PUNT FIELDED' : 'KICKOFF FIELDED'} — ${side === 'home' ? 'UP/DOWN + ACTION' : 'CPU RETURN'}`;
}

export function specialBallLive(s: SpecialTeams) {
  return !['lineup', 'approach', 'resolved'].includes(s.stage) || s.kind === 'field-goal' || s.kind === 'punt';
}

export function stepSpecialTeams(g: FootballGame, input: FootballInput, dt: number): SpecialResult | undefined {
  const s = g.special!; s.age += dt; s.stageAge += dt;
  const kicker = s.athletes[s.kicker]!, ret = s.athletes[s.returner]!;
  advanceKickRush(g, s, dt);
  if (s.stage === 'loose') {
    const a = advanceKickLoose(g, s, input, dt);
    if (!a) return;
    const side = a.side === 'offense' ? s.kicking : s.receiver;
    if (side !== s.kicking) s.scrimmageReturn = false;
    if (s.loose!.owner !== side && (s.rareOrigin === 'fumble' || s.rareOrigin === 'muff')) {
      g.stats[s.loose!.owner!].turnovers++;
    }
    const fg = s.kind === 'field-goal', kickingRecovery = side === s.kicking;
    const originalX = a.x;
    const spot = fg ? (originalX - 100) / 10 : (1100 - originalX) / 10;
    if (s.rareOrigin === 'muff' && kickingRecovery)
      return { kind: (fg ? originalX >= 1100 : originalX <= 100) ? 'touchdown' : 'recovery', side,
        spot: clamp(spot, 0, 100), detail: 'MUFFED KICK — KICKING TEAM RECOVERS; NO ADVANCE' };
    if (!kickingRecovery && s.rareOrigin !== 'fumble' && (fg ? originalX >= 1100 : originalX <= 100))
      return { kind: 'touchback', side, spot: 20, detail: 'LOOSE KICK RECOVERED IN END ZONE — TOUCHBACK' };
    const restricted = g.down === 4 || !g.overtime && (g.quarter === 2 || g.quarter === 4) && g.clock <= 120;
    if (s.rareOrigin === 'fumble' && side === s.loose!.owner && a.id !== s.loose!.lostBy && restricted)
      return { kind: 'return', side, spot: clamp(((s.mirrored ? Math.min(1200 - (s.loose!.originX ?? a.x), 1200 - a.x) : Math.min(s.loose!.originX ?? a.x, a.x)) - 100) / 10, 0, 100),
        detail: 'FUMBLE RECOVERED BY TEAMMATE — NO ADVANCE' };
    if (s.rareOrigin === 'block' && kickingRecovery) s.scrimmageReturn = true;
    beginReturn(g, s, a.id, side); return;
  }
  if (s.stage === 'lineup') { if (s.stageAge >= .38) stage(s, 'approach'); return; }
  if (s.stage === 'snap') {
    const t = clamp(s.stageAge / .28, 0, 1);
    const los = s.kind === 'punt' ? 1200 - (100 + g.spot * 10) : 100 + g.spot * 10;
    s.ball = { x: los + (s.fromX - los) * t, y: s.fromY, z: Math.sin(t * Math.PI) * 3 };
    if (t >= 1) stage(s, s.kind === 'field-goal' && s.accuracy === undefined ? 'hold' : 'approach');
    return;
  }
  if (s.stage === 'hold') {
    const l = g.live!, distance = fieldGoalDistance(g);
    const control = franchiseKickControl(g, g.possession);
    l.time += dt; l.kickMeter = .5 + Math.sin(l.time * fieldGoalMeterSpeed(distance) * control * Math.PI * 2) * .5;
    if (g.possession === 'home' ? input.action : s.stageAge > .8) {
      const error = g.possession === 'home' ? 0 : (random(g) - .5) * (.24 + Math.max(0, distance - 35) * .009) * control;
      s.accuracy = l.kickAccuracy = g.possession === 'home' ? fieldGoalMeterAccuracy(g, s, l.kickMeter) : clamp(.5 + error, 0, 1);
      Object.assign(s, fieldGoalAim(g, s.accuracy)); stage(s, 'approach');
    }
    return;
  }
  if (s.stage === 'approach') {
    const x = s.kind === 'punt' ? s.fromX : s.fromX + (s.kind === 'field-goal' ? -3 : 0);
    point(kicker, x, s.fromY, 70, dt);
    if (s.stageAge >= (s.kind === 'punt' ? 1.05 : .34)) {
      kicker.x = x; kicker.y = s.fromY; stage(s, 'flight'); g.kickSounds = (g.kickSounds ?? 0) + 1;
      contactKickBlock(g, s);
    }
    return;
  }
  if (s.stage === 'flight' || s.stage === 'bounce') {
    const flightDuration = s.duration * (s.kind === 'field-goal' ? FIELD_GOAL_FLIGHT_SCALE : 1);
    const t = clamp(s.stageAge / flightDuration, 0, 1);
    s.ball.x = s.fromX + (s.toX - s.fromX) * t;
    // Bouncing kicks wander deterministically; no renderer-only random trajectory.
    s.ball.y = s.fromY + (s.toY - s.fromY) * t + (s.kind === 'squib' || s.kind === 'onside' ? Math.sin(t * 19) * 5 * t : 0);
    s.ball.z = s.kind === 'squib' || s.kind === 'onside'
      ? Math.abs(Math.sin(t * Math.PI * (s.kind === 'squib' ? 4 : 3))) * (1 - t * .65) * 12
      : s.kind === 'field-goal' ? fieldGoalHeight(g, t) : Math.sin(t * Math.PI) * 55;
    // The overhead sideline-height clamp is not a physical altitude limit.
    if (s.kind !== 'field-goal') s.ball.z = Math.min(s.ball.z, s.ball.y - 24);
    if (s.stageAge <= .12 && contactKickBlock(g, s)) return;
    if ((s.kind === 'squib' || s.kind === 'onside') && s.stage === 'flight' && t > .25) s.stage = 'bounce'; // retain flight age
    if (s.kind !== 'field-goal') {
      for (const a of s.athletes) {
        if (s.kind === 'onside') {
          // The historical recovery probability determines a visible receiving-team
          // misread or secure fielding, not a second random winner at the end.
          const isWinner = a.side === (s.onsideWinner === s.kicking ? 'offense' : 'defense');
          const primary = a.id === (a.side === 'offense' ? 4 : s.returner);
          point(a, s.toX + (isWinner && primary ? 0 : a.side === 'offense' ? 28 : -28), s.toY + (primary ? 0 : (a.id % 5 - 2) * 16),
            primary && isWinner ? 115 : 48, dt);
        } else if (a.id === s.returner) point(a, s.toX, s.toY, 66, dt);
        else if (a.side === 'offense' && a.id === s.kicker && s.kind === 'full') point(a, a.startX - 40, 96, 40, dt); // hangs back as the last-resort safety
        else if (a.side === 'offense') point(a, Math.max(s.toX + 44, a.startX - 170) + (a.id === s.kicker ? 55 : 0),
          clamp(coverageLane(s, a.id) + (s.toY - 96) * .12, 24, 168), a.id === s.kicker ? 54 : 64, dt);
        else {
          const blockers = s.athletes.filter(b => b.side === 'defense' && b.id !== s.returner);
          point(a, s.toX + 90 + a.id % 3 * 30, 30 + blockers.findIndex(b => b.id === a.id) * 126 / Math.max(1, blockers.length - 1), 48, dt);
        }
      }
    }
    if (t < 1) return;
    if (s.kind === 'field-goal') { stage(s, 'resolved'); return; }
    if (s.kind === 'onside') {
      // Kicking players only become eligible after the ball has gone ten yards.
      const eligible = s.athletes.filter(a => a.side === 'defense' || s.fromX - s.ball.x >= 100);
      const nearest = [...eligible].sort((a, b) => Math.hypot(a.x - s.ball.x, a.y - s.ball.y) - Math.hypot(b.x - s.ball.x, b.y - s.ball.y) || a.id - b.id)[0]!;
      s.recovery = nearest.id; s.recoveryFrom = { x: nearest.x, y: nearest.y }; stage(s, 'recovery'); return;
    }
    if (s.touchback || s.toX <= 100 && s.kind === 'punt') { stage(s, 'resolved'); return; }
    // Descend to the waiting returner, then visibly secure possession before movement.
    if (Math.hypot(ret.x - s.ball.x, ret.y - s.ball.y) > 8) {
      point(ret, s.ball.x, s.ball.y, 85, dt); return;
    }
    if (receptionMuff(g, s)) return;
    s.recovery = s.returner; s.recoveryFrom = { x: ret.x, y: ret.y }; stage(s, 'recovery'); return;
  }
  if (s.stage === 'recovery') {
    const a = s.athletes[s.recovery!]!, from = s.recoveryFrom!, t = clamp(s.stageAge / .32, 0, 1);
    a.x = from.x + (s.ball.x - from.x) * t; a.y = from.y + (s.ball.y - from.y) * t;
    if (t < 1) return;
    if (s.kind === 'onside') {
      const side = a.side === 'offense' ? s.kicking : s.receiver;
      return { kind: 'recovery', side, spot: side === s.receiver ? (s.ball.x - 100) / 10 : 100 - (s.ball.x - 100) / 10 };
    }
    beginReturn(g, s); return;
  }
  if (s.stage === 'resolved') {
    if (s.stageAge < .45) return;
    if (s.kind === 'field-goal') return { kind: s.good ? 'good' : 'miss', side: s.kicking, spot: g.spot };
    return { kind: 'touchback', side: s.receiver, spot: 20 };
  }
  if (s.stage === 'return') {
    const a = g.returnAttempt!;
    const side = s.returnSide ?? s.receiver;
    const burst = (id: number) => g.clutchActive !== undefined && a.returnTime < 4 &&
      kickSeed(`${g.seed}:${g.plays}:special-moment:${id}:${side}`) / 4294967296 < chaosOpportunity(g, .0672) ? SPECIAL_EXECUTION_SPEED : 1;
    if (a.fullCoverage) {
      // Re-derive from award counts, including resumed historical returns.
      a.fullCoverage.returnSpeed = ['full', 'squib', 'onside'].includes(s.kind) ? franchiseFactor(g, 'KR1', side) : 1;
      a.fullCoverage.executionSpeed = burst(s.returner);
      if (a.fullCoverage.defenderSpeed) a.fullCoverage.defenderSpeed.factor = franchiseFactor(g, 'DB1', other(side));
    }
    if (input.action && canDefensiveAction(g)) startNearestDive(a.defenders, { ...a.player, vx: KR.forwardSpeed });
    setReturnCoverageZones(g);
    if (a.fullCoverage) for (const d of a.defenders) {
      const elite = a.fullCoverage.elite.includes(d.id);
      const matched = a.fullCoverage.speedMatch === d.id || a.fullCoverage.extraSpeedMatch === d.id;
      d.speed = matched ? KR.forwardSpeed * (a.kickoffBoost ?? 1) : elite ? ELITE.forward : 44 + d.id % 3 * 3;
      d.lateralSpeed = matched ? KR.lateralSpeed : elite ? ELITE.lateral : 48;
      if (d.id === a.fullCoverage.defenderSpeed?.id) {
        d.speed *= a.fullCoverage.defenderSpeed.factor;
        d.lateralSpeed *= a.fullCoverage.defenderSpeed.factor;
      }
      d.speed *= burst(d.id); d.lateralSpeed *= burst(d.id);
    }
    // Receiving teammates block nearby coverage, preserving actual visible contact.
    const blocked = new Set<number>();
    const physicalX = (x: number) => s.mirrored ? 1200 - x : x;
    for (const b of s.athletes.filter(a => a.side === (s.returnGroup ?? 'defense') && a.id !== s.returner)) {
      const d = a.defenders.filter(d => d.x > a.player.x - 30 && !blocked.has(d.id)).sort((d, e) =>
        Math.hypot(physicalX(d.x) - b.x, d.y - b.y) - Math.hypot(physicalX(e.x) - b.x, e.y - b.y))[0];
      if (d) {
        blocked.add(d.id);
        point(b, physicalX(d.x - 5), d.y, 57, dt);
        if (Math.hypot(b.x - physicalX(d.x), b.y - d.y) < 12 && Math.hypot(a.player.x - d.x, a.player.y - d.y) > 13) {
          d.speed = 12; d.lateralSpeed = 12;
        } else if (!a.fullCoverage) { d.speed = 44; d.lateralSpeed = 48; }
      }
    }
    const returnSide = s.returnSide ?? s.receiver;
    const direction = returnSide === 'home' ? input.direction ?? 0 : kickWitnessDirection(a);
    const next = stepKickAttempt(a, direction, dt, returnSide === 'home' ? { juke: !!input.action || !!input.juke, evasion: true, hesitate: !input.action && !input.juke && input.hesitate } : {}, FOOTBALL_SIDELINES);
    g.returnAttempt = next;
    for (const d of next.defenders) { const actor = s.athletes[d.id]!, x = physicalX(d.x);
      actor.vx = (x - actor.x) / dt; actor.vy = (d.y - actor.y) / dt; actor.x = x; actor.y = d.y; }
    ret.vx = (physicalX(next.player.x) - ret.x) / dt; ret.vy = (next.player.y - ret.y) / dt;
    ret.x = physicalX(next.player.x); ret.y = next.player.y; s.ball = { x: ret.x, y: ret.y, z: 0 };
    if (next.phase === 'touchdown') return { kind: 'touchdown', side: returnSide, spot: 100 };
    if (next.phase === 'tackled') {
      const contact = next.endReason !== 'out-of-bounds' && next.defenders.find(d =>
        Math.abs(d.x - next.player.x) < 10 && Math.abs(d.y - next.player.y) < 11);
      const tackler = contact && s.athletes[contact.id];
      if (tackler && tryFumble(g, returnSide, ret, tackler)) {
        s.rareOrigin = 'fumble';
        s.loose = looseBall(s.athletes, 'fumble', ret.x + 6, ret.y, returnSide, ret.id, random(g));
        // Returns already use canonical coordinates. Any next recovery must
        // convert according to the current carrier, not the original kick.
        s.stage = 'loose'; s.stageAge = 0;
        g.tackleSounds = (g.tackleSounds ?? 0) + 1;
        g.returnAttempt = undefined; g.message = 'RETURN FUMBLE — LIVE BALL!'; return;
      }
      g.tackleSounds = (g.tackleSounds ?? 0) + 1;
      return next.player.x <= 100 ? { kind: s.scrimmageReturn ? 'safety' : 'touchback', side: returnSide, spot: 20 }
        : { kind: s.scrimmageReturn ? 'scrimmage' : 'return', side: returnSide, spot: clamp((next.player.x - 100) / 10, 1, 99),
          ...(s.rareOrigin ? { detail: `${s.rareOrigin.toUpperCase()} — RECOVERY RETURN ENDS` } : {}) };
    }
  }
  return undefined;
}
