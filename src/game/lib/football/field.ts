import { createKickAttempt, isKickContact, kickSeed, KR, type KickDirection } from '../kick-return-engine';
import { stepKickMoves } from '../kick-return-moves';
import { kickDiveBallReach, kickDiveFinish } from '../kick-return-burst';
import { PLAYBOOK, executionPlay, matchupAdvantage } from './playbook';
import { canForwardPass, progression, releasePass, scramblePoint } from './passing';
import { stepDefense } from './pursuit';
import { stepInterception } from './interception';
import { canDefensiveAction, canTackle, startNearestDive, stepAthleteDive } from './defensive-action';
import { attemptPassDefense, cpuPassDefense, resolvePassDefense, PASS_DEFENSE } from './pass-defense';
import { EXECUTION, primaryPlayer, skillExecution, runApproach } from './execution';
import { eliteSlots } from './secondary';
import { pressureTicket, stepPenetration } from './penetration';
import { looseBall, stepLoose, tryFumble } from './rare-events';
import { openFieldGain } from './athleticism';
import { franchiseAthleteFactor, linebackerSkill } from './franchise-upgrades';
import { eligibleReceivers } from './coverage';
import { cpuReadOpen, observeCoachingRun, prepareCoaching } from './coaching-execution';
import { OPTION, stepSpeedOption } from './speed-option';
import { MOMENTS, primaryMoment, momentRoute, interiorBlockBonus, canSeal, carrierMoment, contactEscapeOpportunity } from './execution-moments';
import { FOOTBALL_SIDELINES, outsideFootballSideline } from './sidelines';
import { resolveReception } from './receiving';
import { routePoint } from './route-geometry';
import { playerSpeed } from '../player-pace';
import { constrainEvasionStep, cpuCarrierAction } from '../carrier-evasion';
export { routePoint } from './route-geometry';
export { releasePass } from './passing';
import { clamp, isBlitz, other, random, type Athlete, type Defense, type FootballGame, type FootballInput, type LivePlay, type PlayId } from './types';

const move = (a: Athlete, x: number, y: number, speed: number, dt: number) => {
  const dx = x - a.x, dy = y - a.y, d = Math.hypot(dx, dy), f = d > 0 ? Math.min(1, playerSpeed(speed) * dt / d) : 0;
  a.vx = dx * f / dt; a.vy = dy * f / dt; a.x += dx * f; a.y = clamp(a.y + dy * f, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY);
};
export function startField(g: FootballGame, id: PlayId, defense: Defense): LivePlay {
  const play = executionPlay(id, defense), los = 100 + g.spot * 10, off = g.profiles[g.possession], def = g.profiles[other(g.possession)];
  const athletes: Athlete[] = [];
  const add = (side: Athlete['side'], role: Athlete['role'], x: number, y: number, route = 0) => {
    athletes.push({ id: athletes.length, side, role, x, y, startX: x, startY: y, vx: 0, vy: 0, engaged: 0, route, beaten: 0 });
  };
  for (let i = 0; i < 3; i++) add('offense', 'OL', los - 2, 83 + i * 13);
  // Keep QB/RB slots stable for existing movement, snaps and kick controls.
  add('offense', 'WR', los - 2, 30, 0);
  add('offense', 'TE', los - 3, 160, 3);
  const back = play.formation === 'shotgun' ? 34 : play.formation === 'pistol' ? 24 : play.formation === 'punt' ? 60 : 10;
  add('offense', 'QB', los - back, 96);
  add('offense', 'RB', los - (play.formation === 'I' ? 37 : 47), id === 'sweep' ? 116 : 96);
  if(id==='flood') {athletes[3]!.y=athletes[3]!.startY=112;athletes[4]!.y=athletes[4]!.startY=140;athletes[6]!.y=athletes[6]!.startY=110;}
  if(id==='speed-option') athletes[6]!.y=athletes[6]!.startY=122;
  if (id === 'verticals') { athletes[6]!.route = 2; athletes[2]!.route = 1; }
  const goal = defense === 'goal-line', inside = defense === 'run' || isBlitz(defense) || goal;
  for (let i = 0; i < 3; i++) add('defense', 'DL', los + (goal ? 5 : inside ? 10 : 16), (goal ? 80 : 81) + i * (goal ? 16 : 15));
  add('defense', 'LB', los + (goal ? 19 : inside ? 28 : 45), 96);
  for (let i = 0; i < 3; i++) add('defense', 'DB', los + (goal ? [10, 35, 22][i]! : defense === 'prevent' ? 190 : defense === 'pass' ? 82 : defense === 'man' ? 50 : 60), goal ? [43, 96, 139][i]! : 30 + i * 65);
  if(defense==='contain') {
    athletes.filter(a=>a.role==='DL').forEach((a,i)=>{a.y=a.startY=[48,96,144][i]!;});
    const spy=athletes.find(a=>a.role==='LB')!;spy.x=spy.startX=los+40;
  }
  const movement = createKickAttempt(g.seed, g.plays + 1);
  delete movement.kickoffBoost;
  movement.phase = 'returning'; movement.time = 0; movement.returnTime = 0; movement.defenders = [];
  movement.player = { x: los - back, y: 96 }; movement.teams = g.teams;
  movement.moves!.furthestX = movement.player.x;
  const live: LivePlay = { offense: g.possession, play: id, defense, time: 0, snapSpot: g.spot, athletes, carrier: 5,
    mode: play.kind === 'kick' ? 'kick' : play.kind === 'pass' ? 'dropback' : 'handoff',
    movement, pressure: 0, advantage: clamp(matchupAdvantage(id, defense) + (off.line - def.rush) * .3 + (random(g) - .5) * .24, -.6, .6),
    broken: 0, contact: 0, passCaught: false, kickMeter: .5, kickAge: 0,
    target: play.develop + .15 + random(g) * .7 };
  live.penetration = pressureTicket(g, live);
  live.executionSeed = kickSeed(`${g.seed}:${g.plays}:${g.spot}:${g.possession}:individual-execution`);
  // A rare sharp read is a personnel execution opportunity, not knowledge of
  // the called play. It only acts on a back's observed lateral handoff motion.
  const read = kickSeed(`${g.seed}:${g.plays}:${g.spot}:execution-read`) / 4294967296;
  if (read < MOMENTS.opportunity) {
    const reader = athletes.filter(a => a.role === 'DB')[Math.floor(read / MOMENTS.opportunity * 3)]!;
    live.executionRead = reader.id;
    // An occasional visible press alignment, chosen without the current play.
    // Normal depth/coverage still belongs to the defensive strategy.
    reader.x = reader.startX = los + 18;
  }
  prepareCoaching(g,live);
  if(id==='speed-option') {live.mode='run';live.option={phase:'read',edge:1,until:OPTION.ends};live.rusher=5;}
  return live;
}
export type FieldResult = { reason: 'tackle' | 'sack' | 'incomplete' | 'interception' | 'fumble' | 'touchdown' | 'out-of-bounds' | 'safety'; spot: number; detail?: string; recovered?: 'home' | 'away'; recoverySide?: Athlete['side']; outOfBounds?: boolean };
/** End the individual route, not every route when the QB's last read expires. */
export function routeComplete(l: LivePlay, a: Athlete, speedFactor = 1) {
  if (a.scrambleTarget) return true;
  const expires = progression(l).expires;
  if (l.time < expires) return false;
  const end = routePoint({ ...l, time: l.play === 'screen' ? expires : 60 }, a, speedFactor);
  return Math.hypot(a.x - end.x, a.y - end.y) < 8;
}
function fieldSpot(x: number) { return (x - 100) / 10; }
export function nearestRecoverer(l: LivePlay, x: number, y: number) {
  return [...l.athletes].sort((a, b) => {
    const delta = Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y);
    return Math.abs(delta) < 1e-6 ? a.id - b.id : delta;
  })[0]!;
}
export const fumbleEligible = (l: LivePlay) => ['run', 'scramble', 'dropback', 'return'].includes(l.mode);
export function contactFumble(g: FootballGame, runner: Athlete, defender: Athlete) {
  const l = g.live!, owner = l.mode === 'return' ? other(l.offense ?? other(g.possession)) : l.offense ?? g.possession;
  if (!fumbleEligible(l) || !tryFumble(g, owner, runner, defender)) return false;
  const variant = random(g);
  if (owner === (l.offense ?? g.possession)) l.turnoverSpot ??= fieldSpot(runner.x);
  if ((l.mode === 'dropback' || l.mode === 'scramble') && runner.role === 'QB' &&
      runner.x < 100 + l.snapSpot * 10) g.stats[owner].sacks++;
  l.loose = looseBall(l.athletes, 'fumble', runner.x + (variant < .5 ? -6 : 6),
    clamp(runner.y + (variant - .5) * 10, 25, 167), owner, runner.id, variant);
  l.mode = 'loose'; l.flight = undefined; l.interception = undefined; l.holdingPass = false; l.lockedReceiver = undefined;
  g.tackleSounds = (g.tackleSounds ?? 0) + 1; g.message = 'FUMBLE — LIVE BALL!';
  return true;
}

export function stepField(g: FootballGame, input: FootballInput, dt: number): FieldResult | undefined {
  const l = g.live!, p = executionPlay(l.play, l.defense), profile = g.profiles[g.possession], defenseProfile = g.profiles[other(g.possession)];
  if (input.passCancel) { l.holdingPass = false; l.lockedReceiver = undefined; }
  if (input.passPress && canForwardPass(l) && !l.holdingPass) {
    l.holdingPass = true; l.holdStarted = l.time;
    l.lockedReceiver = l.mode === 'dropback' ? input.passTarget : undefined;
  }
  l.time += dt; l.contact = Math.max(0, l.contact - dt);
  if (l.mode === 'return') {
    const result = stepInterception(g, input, dt);
    const kind = l.returnKind ?? 'interception';
    return result ? { reason: kind, spot: result.spot, outOfBounds: result.outOfBounds,
      ...(kind === 'fumble' ? { recoverySide: l.athletes[l.carrier]!.side } : {}),
      detail: result.touchdown ? `${kind.toUpperCase()} RETURN TOUCHDOWN` : `${kind.toUpperCase()} RETURN ENDS` } : undefined;
  }
  // A real center-to-backfield snap; fake punt and punt are indistinguishable here.
  if (l.snapAge !== undefined && l.snapAge < .18) { l.snapAge = Math.min(.18, l.snapAge + dt); return; }
  const los = 100 + l.snapSpot * 10, offense = l.athletes.filter(a => a.side === 'offense'), defenders = l.athletes.filter(a => a.side === 'defense');
  if (l.mode === 'loose' && l.loose) {
    const ball = l.loose;
    // Lock proximity at the instant of the fumble; running speeds must never reroll recovery.
    const nearest = l.athletes[ball.recoverer ??= nearestRecoverer(l, ball.x, ball.y).id]!;
    ball.fromX ??= nearest.x; ball.fromY ??= nearest.y;
    if ((input.action && canDefensiveAction(g) || g.possession === 'home') &&
        l.time - (l.defensiveActionAt ?? -Infinity) >= PASS_DEFENSE.actionCooldown) {
      const d = startNearestDive(defenders, ball, l.time);
      if (d) { d.defensiveAttempt = { kind: 'recover', at: l.time }; l.defensiveActionAt = l.time; }
    }
    const recovered = stepLoose(ball, l.athletes, dt);
    if (recovered) {
      const priorReturn = ball.owner !== undefined && ball.owner !== (l.offense ?? g.possession);
      if (recovered.side === 'defense') {
        l.carrier = recovered.id; l.mode = 'return';
        l.returnKind = 'fumble';
        l.interception = { catcher: recovered.id, age: 0, catchX: recovered.x, catchY: recovered.y };
        recovered.dive = undefined; l.loose = undefined;
        g.possession = other(l.offense ?? g.possession);
        l.movement.player = { x: 1200 - recovered.x, y: recovered.y };
        l.movement.moves = { ...l.movement.moves!, active: undefined, furthestX: l.movement.player.x, readyAt: 0, backward: false };
        g.message = 'FUMBLE — DEFENSE RECOVERS — RETURN!'; return;
      }
      const restricted = g.down === 4 || !g.overtime && (g.quarter === 2 || g.quarter === 4) && g.clock <= 120;
      const x = restricted && ball.lostBy !== recovered.id ? Math.min(ball.originX ?? ball.x, ball.x) : ball.x;
      return { reason: 'tackle', spot: fieldSpot(x), detail: 'FUMBLE — OFFENSE RECOVERS', recoverySide: recovered.side,
        ...(priorReturn ? { recovered: l.offense ?? g.possession } : {}) };
    }
    return undefined;
  }
  if (l.flight?.deflected) {
    const f = l.flight, b = f.deflected!;
    b.age += dt;
    const t = clamp(b.age / .22, 0, 1);
    f.x = b.x + (b.toX - b.x) * t; f.y = b.y + (b.toY - b.y) * t;
    f.z = Math.max(0, b.z * (1 - t) + Math.sin(t * Math.PI) * 3);
    for (const d of defenders) stepAthleteDive(d, dt);
    return t >= 1 ? { reason: 'incomplete', spot: l.snapSpot, detail: b.detail } : undefined;
  }
  const qb = l.athletes[5]!, back = l.athletes[6]!;
  const optionInput=!!l.option&&['read','pitch'].includes(l.option.phase);
  stepSpeedOption(g,input,dt);
  if(l.mode==='loose') return;
  stepPenetration(g);
  if (l.mode === 'scramble' && qb.x >= los) l.crossedLos = true;
  if (l.mode === 'dropback' && input.qbScramble && g.possession === 'home' && canForwardPass(l)) {
    l.mode = 'scramble'; l.scrambled = true; l.carrier = 5; l.movement.player = { x: qb.x, y: qb.y };
    l.holdingPass = false; l.lockedReceiver = undefined;
    g.message = 'SCRAMBLE — release, then press ACTION to pass before the line. Run only beyond it.';
  }
  const releasing = eligibleReceivers(l);
  for (const a of offense) {
    if(a.id===6&&l.option&&['read','pitch'].includes(l.option.phase)) continue;
    if (a.id === l.carrier && (l.mode === 'run' || l.mode === 'scramble')) continue;
    if (a.role === 'OL' && !(l.play === 'verticals' && releasing.includes(a) && l.time > .85) || (p.kind === 'run' && a.role !== 'QB' && (a.id !== 6||l.option?.phase==='kept') &&
        !(l.play === 'draw' && l.mode === 'handoff'))) {
      const event = l.penetration?.event;
      const protecting = a.role === 'OL' && (l.mode === 'dropback' && l.play !== 'screen' ||
        l.mode === 'handoff' && l.play === 'draw');
      const assigned = protecting ? defenders.filter(d => d.role === 'DL')[offense.filter(o => o.role === 'OL').indexOf(a)] : undefined;
      const eligible = (d: Athlete) =>
        !((l.mode === 'dropback' || l.mode === 'scramble' || l.mode === 'flight') &&
          l.lineRush?.winners.some(w => w.defender === d.id)) &&
        // A beaten blocker may not instantly reacquire his slipping opponent.
        !(event?.defender === d.id && a.id === event.blocker &&
          (event.cleared === undefined || l.time < event.at + .8));
      // Sustain the actual protection engagement rather than abandoning a held
      // lineman each frame to chase another one. Uncovered gaps still exist.
      const sealing = a.runSeal && l.time >= a.runSeal.starts && l.time < a.runSeal.until &&
        (l.mode === 'run' || l.mode === 'handoff' && l.play !== 'draw')
        ? defenders.find(d => d.id === a.runSeal!.defender && eligible(d) && d.engaged > l.time) : undefined;
      const nearest = sealing ?? (assigned && eligible(assigned) ? assigned : defenders.filter(d => d.engaged <= l.time && eligible(d))
        .sort((a1, b) => Math.hypot(a1.x - a.x, a1.y - a.y) - Math.hypot(b.x - a.x, b.y - a.y))[0]);
      const gapY = l.play === 'sweep' ? 142 : l.play === 'counter' ? l.time < .34 ? 124 : 82
        : l.play === 'draw' && l.time > .55 ? 110 : 96;
      // Screen linemen sell protection, then release into the outlet lane.
      // A lost/late block still exposes the QB and the caught receiver.
      const screenRelease = l.play === 'screen' && l.time > .55 && a.role === 'OL' && a.id !== 1;
      const screenX = (l.passCaught ? l.athletes[l.carrier]!.x : back.x) + 25 + a.id * 8;
      const screenY = (l.passCaught ? l.athletes[l.carrier]!.y : back.y) + (a.id - 1) * 15;
      if (nearest && !screenRelease) move(a, Math.min(los + 65, nearest.x - 5), a.role === 'OL' ? a.startY + (gapY - 96) * .25 +
        Math.sign(a.startY - 96) * EXECUTION.blockSpread + (sealing ? a.runSeal!.side * 6 : 0) : nearest.y, 32 + profile.line * 15, dt);
      if (screenRelease) move(a, Math.min(los + 80, screenX), clamp(screenY, 28, 164), 43 + profile.line * 15, dt);
      if (nearest && Math.hypot(a.x - nearest.x, a.y - nearest.y) < 13 && nearest.beaten <= l.time) {
        const passProtection = p.kind === 'pass' && l.play !== 'screen';
        // The group pressure ticket replaces repeated independent OL/DL losses
        // during protection. Run-block leverage and genuine uncovered gaps keep
        // their existing contests; no second pressure lottery runs beside this.
        const protectedMatchup = a.role === 'OL' && nearest.role === 'DL' &&
          ((l.mode === 'dropback' || l.mode === 'scramble') && p.kind === 'pass' ||
            l.mode === 'handoff' && l.play === 'draw');
        const base = .64 + (l.play === 'sneak' ? .1 + (profile.qb - .7) * .08 : 0) + (profile.line - defenseProfile.rush) * .4 + l.advantage * .48;
        const block = clamp(base + interiorBlockBonus(g, a, base), .22, .86);
        // LB awards increase block-beating EXECUTION, not running speed.
        const rushSkill = passProtection ? linebackerSkill(g, nearest) : 1;
        const win = protectedMatchup || random(g) < 1 - Math.min(.92, (1 - block) * rushSkill);
        const hold = win ? screenRelease ? .4 + profile.line * .35 + random(g) * .2
          : (passProtection ? 1.65 : .85) + profile.line * .9 + random(g) * .45 : 0;
        nearest.engaged = l.time + (win ? hold : .12);
        nearest.beaten = nearest.engaged + (win ? .12 : .38);
        a.engaged = nearest.engaged;
        if (win && canSeal(g, a)) {
          const gap = runApproach({ ...l, time: p.develop }).y;
          const starts = Math.max(l.time, l.play === 'draw' ? p.develop : l.play === 'counter' ? .34 : 0);
          a.runSeal = { defender: nearest.id, side: (Math.sign(a.startY - gap) || (a.id % 2 ? -1 : 1)) as -1 | 1,
            starts, until: starts + MOMENTS.sealSeconds };
        }
      }
      if (sealing && Math.hypot(a.x - sealing.x, a.y - sealing.y) < 16) {
        const gap = runApproach({ ...l, time: p.develop }).y;
        const dy = clamp(gap + a.runSeal!.side * 20 - sealing.y, -playerSpeed(MOMENTS.sealSpeed) * dt, playerSpeed(MOMENTS.sealSpeed) * dt);
        sealing.y = clamp(sealing.y + dy, 25, 167); sealing.vy = dy / dt;
      }
    } else if (a.role === 'WR' || a.role === 'TE' || p.kind === 'pass' && releasing.includes(a)) {
      const upgrade = franchiseAthleteFactor(g, a);
      const expired = p.kind === 'pass' && routeComplete(l, a, upgrade);
      const landing = l.flight?.receiver === a.id && l.mode === 'flight' && !l.flight.deflected;
      const point = landing ? { x: l.flight!.toX, y: l.flight!.toY }
        : expired ? scramblePoint(l, a) : routePoint(l, a, upgrade);
      const gain = openFieldGain(a, defenders, dt, a.role === 'WR' || a.role === 'RB');
      const moment = expired ? 0 : primaryMoment(g, a);
      const target = landing ? point : momentRoute(a, point, moment, defenders);
      move(a, target.x, target.y, (58 + profile.receivers * 14) * skillExecution(l, a) * gain * upgrade *
        (1 + MOMENTS.routeSpeed * moment), dt);
    }
  }
  if (l.mode === 'handoff') {
    const path = runApproach(l);
    if (l.play === 'sneak') {
      l.carrier = 5; l.mode = 'run'; l.movement.player = { x: qb.x, y: qb.y };
    } else {
      move(qb, los - (l.play === 'fake-punt' ? 55 : l.play === 'draw' ? 40 : 16), 100, 30, dt);
      move(back, path.x, path.y, 52 * skillExecution(l, back) * franchiseAthleteFactor(g, back), dt);
      if (l.time >= p.develop) { l.carrier = 6; l.mode = 'run'; l.movement.player = { x: back.x, y: back.y }; }
    }
  }
  if(l.option?.phase==='pitch') {
    // Ball is airborne: no QB tackle can end the play as if he still held it.
    qb.x+=Math.max(0,qb.vx)*dt;
    stepDefense(g,dt);return;
  }
  if (l.mode === 'dropback') {
    // The scripted dropback owns x; UP/DOWN exclusively reposition the pocket laterally.
    const pocketX = Math.max(12, los - (p.formation === 'shotgun' ? 48 : 36));
    qb.vx = (Math.max(pocketX, qb.x - playerSpeed(31) * dt) - qb.x) / dt;
    qb.x += qb.vx * dt;
    const lateral = g.possession === 'home' ? input.direction ?? 0
      : l.pressure > .3 ? (qb.y < 96 ? -1 : 1) : 0;
    const beforeY = qb.y;
    qb.y = clamp(qb.y + lateral * playerSpeed(KR.lateralSpeed) * dt, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY);
    qb.vy = (qb.y - beforeY) / dt;
  }
  if (l.mode === 'flight') {
    if (input.action && canDefensiveAction(g)) attemptPassDefense(g);
    cpuPassDefense(g);
  } else if (l.time - (l.defensiveActionAt ?? -Infinity) >= PASS_DEFENSE.actionCooldown) {
    const runner = l.athletes[l.carrier]!;
    const cpuDive = g.possession === 'home' && (l.mode === 'run' || l.mode === 'scramble') &&
      l.time >= (l.cpuActionAt ?? 0);
    if (cpuDive) l.cpuActionAt = l.time + .18;
    // AI uses observed carrier motion and the same close-range admission, never next input.
    if (input.action && canDefensiveAction(g) || cpuDive && random(g) < .12) {
      const secondary = defenders.filter(d => d.role === 'DB');
      const elite = eliteSlots(g, other(g.possession));
      // A fast back already gaining from behind should finish the running
      // tackle, not surrender that advantage by planting for a hopeful dive.
      // Human ACTION still uses the unchanged nearest-eligible dive rules.
      const candidates = cpuDive ? defenders.filter(d => !(elite.includes(secondary.indexOf(d)) &&
        d.x < runner.x && d.vx > runner.vx && runner.vx > 0 && Math.abs(d.y - runner.y) < 18)) : defenders;
      const d = startNearestDive(candidates, runner, l.time);
      if (d) { d.defensiveAttempt = { kind: 'tackle', at: l.time }; l.defensiveActionAt = l.time; }
    }
  }
  observeCoachingRun(l);
  stepDefense(g, dt);
  l.pressure = clamp(defenders.filter(d => Math.hypot(d.x - qb.x, d.y - qb.y) < 34).length / 2, 0, 2);
  if ((l.mode === 'dropback' || l.mode === 'scramble') && !l.crossedLos && qb.x < los &&
      defenders.some(d => canTackle(d) && d.engaged <= l.time && isKickContact(qb, d))) {
    const tackler = defenders.find(d => canTackle(d) && d.engaged <= l.time && isKickContact(qb, d))!;
    if (contactFumble(g, qb, tackler)) return;
    return { reason: 'sack', spot: fieldSpot(qb.x) };
  }
  if (canForwardPass(l)) {
    if (g.possession === 'home') {
      if (input.passRelease || input.action) releasePass(g, input.passRelease ?? 'normal', l.lockedReceiver);
    } else if (l.time >= (l.target ?? p.develop)) {
      const receiver=progression(l).receiver;
      if (cpuReadOpen(l,receiver)) releasePass(g,random(g)<.25 ? 'bullet' : 'normal');
    }
  } else if (input.passRelease) { l.holdingPass = false; l.lockedReceiver = undefined; }
  if (l.mode === 'dropback' || l.mode === 'flight') {
    const f = l.flight;
    if (f) {
      const oldX = f.x, oldY = f.y;
      f.age += dt; const t = clamp(f.age / f.duration, 0, 1);
      f.x = f.fromX + (f.toX - f.fromX) * t; f.y = f.fromY + (f.toY - f.fromY) * t;
      f.z = Math.sin(t * Math.PI) * (f.type === 'bullet' ? 6 : 30);
      const contest = resolvePassDefense(g, oldX, oldY);
      if (contest === 'interception') return;
      if (contest === 'breakup') {
        const deflector = l.athletes[f.contested!.at(-1)!]!;
        const detail = f.type === 'bullet' ? 'BULLET DEFLECTED IN THE LANE' : 'DIVING PASS BREAKUP';
        f.deflected = { age: 0, x: f.x, y: f.y, z: f.z, toX: clamp(f.x + 12, 8, 1180),
          toY: clamp(f.y + (deflector.dive?.vy && deflector.dive.vy < 0 ? -10 : 10), 24, 168), detail };
        g.message = detail;
        return;
      }
      if (t >= 1) {
        const a = l.athletes[f.receiver]!, failure = resolveReception(g);
        if (failure) return { reason: 'incomplete', spot: l.snapSpot, detail: failure };
        l.carrier = a.id; l.mode = 'run'; l.passCaught = true; l.movement.player = { x: f.x, y: f.y };
        a.x = f.x; a.y = f.y; g.stats[g.possession].completions++; l.flight = undefined;
        if (a.x >= 1100) return { reason: 'touchdown', spot: 100 };
      }
    }
  }
  if (l.mode === 'run' || l.mode === 'scramble') {
    const runner = l.athletes[l.carrier]!;
    l.rusher=l.carrier;
    let direction: KickDirection = input.direction ?? 0;
    if(l.option?.phase==='read'&&g.possession==='away') direction=runner.y<150 ? l.option.edge : 0;
    else if (g.possession === 'away') {
      const closest = defenders.filter(d => d.x > runner.x - 5 && d.x < runner.x + 85).sort((a, b) => a.x - b.x)[0];
      const desired = closest ? clamp(closest.y + (closest.y > 96 ? -28 : 28), 30, 162) : 96;
      direction = Math.abs(desired - runner.y) < 8 ? 0 : desired < runner.y ? -1 : 1;
    } else if (l.option?.phase==='read'&&!direction) direction=runner.y<145 ? l.option.edge : 0;
    else if (l.time < p.develop + .28 && !l.passCaught && !direction)
      direction = l.play === 'sweep' ? 1 : l.play === 'counter' && l.time < p.develop + .14 ? -1 : 0;
    l.movement.returnTime += dt;
    // Also sanitize an older resumed scramble: no saved evasion may interrupt the QB run.
    if (l.mode === 'scramble' && l.movement.moves?.active &&
      (canForwardPass(l) || !l.movement.moves.active.evasive)) l.movement.moves = { ...l.movement.moves, active: undefined };
    // Exactly the original running/juke/spin/hesitation movement; no new receiving controls.
    l.movement.defenders = defenders.map(d => ({ ...d, homeX: d.startX, minY: 24, maxY: 168, speed: 56, lateralSpeed: 56, active: true }));
    const previousMovement = { ...l.movement };
    const obstacles = l.athletes.filter(a => a.side === runner.side && a.id !== runner.id && !a.dive);
    const movement = stepKickMoves(l.movement, direction, dt, l.mode === 'scramble' && canForwardPass(l) ? { juke: false, hesitate: false }
      : g.possession === 'home'
       ? { juke: !optionInput&&(!!input.juke || !!input.action), evasion: true, hesitate: !input.juke && !input.action && input.hesitate,
           obstacles: l.athletes.filter(a => a.side === runner.side && a.id !== runner.id && !a.dive).map(a => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy })) }
       : optionInput ? { evasion: true } : cpuCarrierAction(l.movement, direction, FOOTBALL_SIDELINES, obstacles), FOOTBALL_SIDELINES);
    // Brief assignment execution gain, not a global speed increase. Never alter
    // evasion/hesitation, scramble restrictions, or return physics.
    const runningGains = !movement.spinStep && (!movement.moves?.active || movement.evasiveStep);
    if (l.mode === 'run' && runningGains && !input.hesitate && l.time < p.develop + .65) {
      const gain = skillExecution(l, runner);
      movement.player = {
        x: previousMovement.player.x + (movement.player.x - previousMovement.player.x) * gain,
        y: clamp(previousMovement.player.y + (movement.player.y - previousMovement.player.y) * gain, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY),
      };
    }
    l.movement.player = movement.player; l.movement.moves = movement.moves;
    const openGain = openFieldGain(runner, defenders, dt, l.mode === 'run' &&
      (runner.role === 'WR' || runner.role === 'RB') && !!runningGains && !input.hesitate);
    if (runningGains && !input.hesitate && openGain > 1) {
      movement.player.x = previousMovement.player.x + (movement.player.x - previousMovement.player.x) * openGain;
      movement.player.y = clamp(previousMovement.player.y + (movement.player.y - previousMovement.player.y) * openGain, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY);
    }
    const upgrade = l.mode === 'run' ? franchiseAthleteFactor(g, runner) * carrierMoment(g, runner) : 1;
    if (upgrade !== 1) {
      movement.player.x = previousMovement.player.x + (movement.player.x - previousMovement.player.x) * upgrade;
      if (!movement.spinStep) movement.player.y = clamp(previousMovement.player.y + (movement.player.y - previousMovement.player.y) * upgrade, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY);
    }
    if (movement.evasiveStep) {
      movement.player = constrainEvasionStep(previousMovement.player, movement.player, l.movement.defenders,
        movement.spinStep ? l.athletes.filter(a => a.side === runner.side && a.id !== runner.id && !a.dive) : []);
      l.movement.player = movement.player;
    }
    runner.vx = (movement.player.x - previousMovement.player.x) / dt;
    runner.vy = (movement.player.y - previousMovement.player.y) / dt;
    runner.x = movement.player.x; runner.y = movement.player.y;
    if (l.mode === 'scramble' && runner.x >= los) {
      l.crossedLos = true; l.holdingPass = false; l.lockedReceiver = undefined;
    }
    if (movement.moves?.active?.kind === 'dive' || previousMovement.moves?.active?.kind === 'dive') {
      const reach = movement.moves?.active?.kind === 'dive' ? kickDiveBallReach(movement.moves.active.elapsed, l.movement) : 0;
      const finish = kickDiveFinish(previousMovement, movement.player, l.movement.defenders.filter(d => canTackle(l.athletes[d.id]!) && l.athletes[d.id]!.engaged <= l.time), reach);
      if ('outAt' in movement && typeof movement.outAt === 'number' && movement.outAt < finish.fraction) return { reason: 'out-of-bounds', spot: fieldSpot(runner.x) };
      if (finish.phase === 'touchdown') return { reason: 'touchdown', spot: 100 };
      if (finish.phase === 'tackled') {
        const tackler = defenders.find(d => canTackle(d) && isKickContact(runner, d));
        if (tackler && contactFumble(g, runner, tackler)) return;
        return { reason: 'tackle', spot: fieldSpot(runner.x) };
      }
    }
    if (runner.x >= 1100) return { reason: 'touchdown', spot: 100 };
    if (runner.x <= 100 && l.time > 1.5 && l.snapSpot < 5) return { reason: 'safety', spot: 0 };
    if (outsideFootballSideline(runner.y)) return { reason: 'out-of-bounds', spot: fieldSpot(runner.x) };
    for (const d of defenders) if (canTackle(d) && d.engaged <= l.time && isKickContact(runner, d) && l.contact <= 0) {
      const evade = !!l.movement.moves?.active && !l.movement.moves.active.evasive;
      if (random(g) < contactEscapeOpportunity(g, runner, d, clamp(.05 + profile.back * .08 + (profile.back - defenseProfile.rush) * .025 +
          (evade ? .15 : 0) + Math.max(0, l.advantage) * .1, .06, .31)) && l.broken < 2) {
        d.engaged = l.time + .65; l.broken++; l.contact = .22; continue;
      }
      if (contactFumble(g, runner, d)) return;
      return { reason: 'tackle', spot: fieldSpot(runner.x) };
    }
    if (l.time > 20 && l.mode !== 'scramble') return { reason: 'tackle', spot: fieldSpot(runner.x) };
  }
  return undefined;
}
