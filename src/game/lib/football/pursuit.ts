import { clamp, isBlitz, isPassCoverage, other, type Athlete, type FootballGame } from './types';
import { stepAthleteDive } from './defensive-action';
import { EXECUTION } from './execution';
import { franchiseAthleteFactor } from './franchise-upgrades';
import { ELITE, eliteSlots } from './secondary';
import { penetrationTarget } from './penetration';
import { openFieldGain, OPEN_FIELD } from './athleticism';
import { manAssignment, zoneTarget } from './coverage';
import { MOMENTS, coverageMoment, runFitMoment, recognizeRouteBreak } from './execution-moments';
import { FOOTBALL_SIDELINES } from './sidelines';
import { pursuitPoint } from '../open-field-pursuit';
import { coachingAssignment } from './coaching-execution';
import { containmentTarget } from './containment';
import { consumeDefenseRelease, userDefenseTarget, userDefenseVelocity } from './user-defense';

type Role = NonNullable<Athlete['pursuit']>['role'];
/** Bounded interception horizon from observed motion, never from the next control input. */
export function interceptionTime(dx: number, dy: number, vx: number, vy: number, speed: number) {
  const a = vx * vx + vy * vy - speed * speed, b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy;
  let t = .65;
  if (Math.abs(a) < .001) { if (b < -.001) t = -c / b; }
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].filter(n => n >= 0);
      if (roots.length) t = Math.min(...roots);
    }
  }
  return clamp(t, .08, 1.1);
}
/** Full-game defense only. Classic return movement and collisions are never routed here. */
export function stepDefense(g: FootballGame, dt: number) {
  const l = g.live!, profile = g.profiles[other(g.possession)];
  const defense = l.athletes.filter(a => a.side === 'defense');
  const positions = defense.map(d => ({ id: d.id, x: d.x, y: d.y }));
  const offense = l.athletes.filter(a => a.side === 'offense');
  const qb = l.athletes[5]!, carrier = l.athletes[l.carrier]!, los = 100 + l.snapSpot * 10;
  const carrying = l.mode === 'run' || l.mode === 'scramble';
  // A carried ball crossing the line is public, immediate run evidence. Do not
  // wait for cached zone/man/rush reads to expire, even for a blocked defender
  // who will become free later. Airborne passes and handoff fakes do not qualify.
  const openField = carrying && (l.carrierCrossedLos === true || l.crossedLos === true || carrier.x >= los);
  // Scrambling does not end the passing threat. DBs retain their man/zone
  // assignments until the quarterback actually crosses the line.
  const qbBehindLine = carrying && carrier.role === 'QB' && !openField;
  if (openField && !l.carrierCrossedLos) {
    l.carrierCrossedLos = true;
    for (const d of defense) delete d.pursuit;
  }
  const secondary = defense.filter(d => d.role === 'DB');
  const elites = eliteSlots(g, other(g.possession));
  // An explicitly called run-stop keeps its established in-box gap pressure.
  // Zone/support calls spread out; they must not silently turn run-stop into prevent.
  const goal = l.defense === 'goal-line';
  const coordinated = l.defense !== 'run' && !goal;
  const ranked = [...defense].filter(d => d.engaged <= l.time)
    .sort((a, b) => Math.hypot(a.x - carrier.x, a.y - carrier.y) - Math.hypot(b.x - carrier.x, b.y - carrier.y) || a.id - b.id);
  for (const d of defense) {
    if (stepAthleteDive(d, dt)) continue;
    if (d.engaged > l.time) { d.vx *= .6; d.vy *= .6; continue; }
    const coverage = d.role === 'DB' || d.role === 'LB' && !isBlitz(l.defense) && l.defense !== 'run' && !goal;
    const holdCoverage = coverage && qbBehindLine && !(d.role === 'LB' && l.defense === 'contain');
    const pursueCarrier = carrying && !holdCoverage;
    const runPursuit = openField;
    const pressureGap = (isBlitz(l.defense) || l.defense === 'run' || goal) && d.role === 'LB' &&
      d.x >= los + 4 && l.penetration?.event?.defender !== d.id && (l.mode === 'dropback' || l.mode === 'handoff');
    const elite = d.role === 'DB' && elites.includes(secondary.indexOf(d));
    const passCoverage = coverage && isPassCoverage(l.defense) &&
      (l.mode === 'dropback' || l.mode === 'flight' || holdCoverage);
    const wonBlitz = isBlitz(l.defense) && l.penetration?.event?.defender === d.id &&
      l.penetration.event.entered !== undefined && l.mode === 'dropback';
    const exceptionalCoverage = coverage && !openField ? coverageMoment(g, d, elite) : 0;
    if (coverage && !openField) recognizeRouteBreak(g, d, elite);
    const exceptionalFit = runFitMoment(g, d);
    let speed = ((l.mode === 'dropback' || l.mode === 'flight') && !coverage ? 26 : 44) + (coverage ? profile.coverage : profile.rush) * 18 +
      (isBlitz(l.defense) && !coverage ? (l.defense === 'blitz' ? 17 : 15) : 0);
    if (carrying && carrier.role === 'QB' && carrier.x < los + 25 && d.role !== 'DB') speed += l.defense === 'run' || goal ? 5 : -3;
    speed *= EXECUTION.defenseSpeed;
    if (elite) speed = ELITE.forward;
    if (passCoverage) speed *= (elite ? 1.025 : 1.045) * (l.defense === 'man' ? 1.04 : 1);
    if (wonBlitz) speed *= 1.08;
    speed *= (1 + MOMENTS.coverSpeed * exceptionalCoverage) * (1 + .05 * exceptionalFit);
    const openGain = d.role === 'DB' ? openFieldGain(d, offense, dt, !d.dive && d.engaged <= l.time) : 1;
    speed *= openGain * franchiseAthleteFactor(g, d);
    if (!openField && l.time < .28 && l.defense !== 'run' && !goal) speed *= .35;
    // Repair a resumed pre-crossing scramble's cached run target as well.
    if (holdCoverage && d.pursuit && !['cover', 'deep'].includes(d.pursuit.role)) delete d.pursuit;
    const released = consumeDefenseRelease(g, d);
    if (!d.pursuit || d.pursuit.until <= l.time || released) {
      let x: number, y: number, role: Role;
      let observed = carrying ? carrier : qb;
      const contain=containmentTarget(g,d);
      if(contain) {({x,y,role,observed}=contain);}
      else if (pursueCarrier) {
        const rank = ranked.findIndex(a => a.id === d.id);
        const distance = Math.hypot(d.x - carrier.x, d.y - carrier.y);
        // Once downfield, every LB/DB closes its own intercept angle. Do not
        // keep a secondary "contain" point 19-22px outside tackle range.
        role = runPursuit || rank === 0 || (coordinated ? rank === 1 && distance < 18 : distance < 32) ? 'tackle' : !openField && d.role === 'DB' && d.x > carrier.x + 45 ? 'deep'
          : rank === 1 ? 'contain' : rank === 2 ? 'cutback' : 'trail';
        const horizon = Math.min(runPursuit ? .65 : 1.1,
          interceptionTime(carrier.x - d.x, carrier.y - d.y, carrier.vx, carrier.vy, speed));
        x = carrier.x + clamp(carrier.vx, -90, 100) * horizon;
        y = carrier.y + clamp(carrier.vy, -100, 100) * horizon;
        if (runPursuit) {
          const intercept = pursuitPoint(d, carrier, clamp(carrier.vx, -90, 100),
            clamp(carrier.vy, -100, 100), speed, speed * ELITE.lateral / ELITE.forward,
            FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY);
          x = intercept.x; y = intercept.y;
        }
        const outside = Math.abs(carrier.vy) > 8 ? Math.sign(carrier.vy) : carrier.y < 96 ? -1 : 1;
        if (role === 'contain') { x += 12; y += outside * 19; }
        if (role === 'cutback') { x -= 9; y -= outside * 22; }
        if (role === 'deep') { x = Math.max(x + 15, carrier.x + 48); y += (d.startY < 96 ? -1 : 1) * 12; }
        if (role === 'trail') {
          // Support defenders hold separate lanes/depths instead of all swarming the same spot.
          if (coordinated && !openField) {
            x = carrier.x + clamp(carrier.vx, -90, 100) * Math.min(horizon, .65) + 5 + Math.floor(Math.max(0, rank - 3) / 3) * 18;
            y = d.startY * .75 + carrier.y * .25;
          } else { x -= 7; y += (d.id % 2 ? 1 : -1) * (10 + d.id % 3 * 4); }
        }
        if (d.role !== 'DB' && l.time < .95 && isBlitz(l.defense) &&
            carrier.x < los - 15 && Math.abs(carrier.vy) > 8) {
          x = los - 34; y = 96; role = 'rush';
        }
      } else if (l.mode === 'handoff' && d.id === l.executionRead &&
          (Math.abs(l.athletes[6]!.y - 96) > 18 ||
           Math.hypot(l.athletes[6]!.x - qb.x, l.athletes[6]!.y - qb.y) < 14)) {
        const back = l.athletes[6]!;
        observed = back; role = 'contain';
        x = back.x + clamp(back.vx * .24, -16, 20); y = clamp(back.y + back.vy * .24, 25, 167);
      } else if (coverage && (l.defense === 'man' || l.defense === 'blitz')) {
        const receiver = manAssignment(l, d);
        role = receiver ? 'cover' : 'deep';
        observed = receiver ?? qb;
        x = receiver ? receiver.x + receiver.vx * .13 + 4 : los + 110;
        y = receiver ? receiver.y + receiver.vy * .13 : d.startY;
        // Match a releasing receiver, not a back still taking a handoff or a
        // receiver stalk-blocking at the line. Keep cutback insurance until
        // the ball is actually carried; aggressive front pressure can still
        // overrun the lane without dragging the entire secondary behind it.
        if (l.mode === 'handoff' && d.role === 'DB') {
          x = Math.max(x, los + (d.startY > 60 ? 85 : 45));
          y = clamp(y, d.startY - 28, d.startY + 28);
        }
      } else if (coverage && (l.defense === 'pass' || l.defense === 'prevent' || l.defense==='contain')) {
        const zone = zoneTarget(l, d);
        role = zone.deep ? 'deep' : 'cover'; observed = zone.threat ?? qb;
        x = zone.x; y = zone.y;
      } else if (coverage) {
        role = 'cover';
        const receivers = offense.filter(a => a.role === 'WR' || a.role === 'TE');
        const wr = receivers[((d.id - 15) % receivers.length + receivers.length) % receivers.length]!;
        observed = wr;
        x = wr.x + wr.vx * (passCoverage ? .13 : .09) +
          (l.defense === 'prevent' ? wr.x > los + 160 ? 20 : 35 : l.defense === 'pass' ? -2 : l.defense === 'man' ? 3 : 6);
        y = wr.y + wr.vy * (passCoverage ? .12 : .08) + (l.defense === 'pass' ? 0 : l.defense === 'man' ? 1 : 4);
        if (l.defense === 'pass' || l.defense === 'prevent')
          y = clamp(y, Math.max(25, d.startY - 32), Math.min(167, d.startY + 32));
        if ((l.defense === 'run' || goal) && l.time < (goal ? 1 : .8)) { x = los + (goal ? 8 : 20); y = 96 + (d.startY - 96) * .5; }
        // Safeties keep depth instead of following a blocker into the box.
        // Their subsequent pursuit is still based on the actual carrier, not the called offensive play.
        const safeties = defense.filter(a => a.role === 'DB').slice(-2);
        if (!goal && safeties.some(a => a.id === d.id)) {
          role = 'deep'; x = Math.max(x, los + (l.defense === 'prevent' ? 135 : 105));
          const zoneY = d.id === safeties[0]!.id ? 68 : 132;
          y = passCoverage && wr.x > los + 65 ? zoneY * .35 + y * .65 : zoneY;
        }
      } else if (pressureGap) {
        // Threaten a separate gap, rather than an always-free fourth rusher
        // defeating the three-player line on EVERY blitz. Release on an actual
        // block win, handoff or scramble, never on the hidden offensive input.
        role = 'contain'; x = los + (goal ? 5 : 7);
        y = d.startY + (isBlitz(l.defense) ? d.id % 2 ? 25 : -25 : 0);
      } else if (goal && l.mode === 'handoff' && l.time < .5) {
        role = 'contain'; x = los + 1; y = d.startY;
      } else {
        role = 'rush'; x = qb.x + qb.vx * .12; y = qb.y + qb.vy * .12;
      }
      const coached=coachingAssignment(g,d,x,y,role); x=coached.x; y=coached.y;
      d.pursuit = { x: clamp(x, 8, 1180), y: clamp(y, openField ? FOOTBALL_SIDELINES.minY : 25, openField ? FOOTBALL_SIDELINES.maxY : 167),
        until: l.time + (runPursuit ? .08 : elite ? ELITE.reaction : .12 + (1 - (coverage ? profile.coverage : profile.rush)) * .15 + d.id % 3 * .018) *
          (passCoverage ? .72 : wonBlitz ? .65 : 1) *
          (exceptionalCoverage ? MOMENTS.coverReaction : exceptionalFit ? .88 : 1) * coached.variation,
        role, seenX: observed.x, seenY: observed.y, seenVx: observed.vx, seenVy: observed.vy };
    }
    let tx = d.pursuit.x, ty = d.pursuit.y;
    const escape = openField ? undefined : penetrationTarget(l, d);
    if (escape) { tx = escape.x; ty = escape.y; }
    const userTarget = userDefenseTarget(g, d);
    // Work around actual blockers, rather than ghosting through them or choosing a random gap.
    const pathX = tx - d.x, pathY = ty - d.y, pathLen = Math.max(1, Math.hypot(pathX, pathY));
    for (const block of offense) {
      if (pursueCarrier && Math.hypot(d.x - carrier.x, d.y - carrier.y) < 48) break;
      if (!pursueCarrier && block.role !== 'OL') continue;
      if (block.id === l.carrier || block.role === 'QB' || Math.hypot(block.x - d.x, block.y - d.y) > 30) continue;
      const along = ((block.x - d.x) * pathX + (block.y - d.y) * pathY) / pathLen;
      const across = Math.abs((block.x - d.x) * pathY - (block.y - d.y) * pathX) / pathLen;
      const beatenBlocker = escape && l.penetration?.event?.blocker === block.id;
      if (!beatenBlocker && along > 1 && along < 27 && across < 10) {
        const side = Math.abs(d.y - block.y) > 2 ? Math.sign(d.y - block.y) : d.startY < 96 ? -1 : 1;
        tx = block.x + Math.sign(pathX || -1) * 5; ty = clamp(block.y + side * 19, 25, 167); break;
      }
    }
    // Nearby teammates preserve lanes; the tackler can still close to the original contact box.
    let sx = 0, sy = 0;
    // Linemen must still close their run gaps; broad zone spacing belongs to the supporting backs.
    const line = d.role === 'DL' || !coordinated && !runPursuit, radius = runPursuit ? 12 : line ? 17 : 23;
    for (const mate of coordinated ? positions : defense) {
      if (mate.id === d.id) continue;
      let dx = d.x - mate.x, dy = d.y - mate.y, distance = Math.hypot(dx, dy);
      if (distance < .1 && coordinated) { dx = d.id < mate.id ? -1 : 1; dy = 0; distance = 1; }
      if (distance > .1 && distance < radius) { sx += dx / distance * (radius - distance); sy += dy / distance * (radius - distance); }
    }
    const space = d.pursuit.role !== 'tackle' || Math.hypot(carrier.x - d.x, carrier.y - d.y) > 24;
    if (line && space) { tx += sx * .75; ty = clamp(ty + sy * .9, 25, 167); }
    const dx = tx - d.x, dy = ty - d.y, distance = Math.max(.001, Math.hypot(dx, dy));
    const spacing = runPursuit ? .75 : 3;
    const intentX = dx / distance * Math.min(speed, distance / dt) + (space && !line ? sx * spacing : 0);
    const intentY = dy / distance * Math.min(speed, distance / dt) + (space && !line ? sy * spacing : 0);
    // Classic carriers use independent axes. A scalar Euclidean cap would
    // quietly make even an "80 speed" safety lose every diagonal footrace.
    const cap = Math.min(1, speed / Math.max(.001, Math.hypot(intentX, intentY)));
    const lateral = speed * ELITE.lateral / ELITE.forward;
    const arrival = Math.max(dt, Math.abs(dx) / speed, Math.abs(dy) / lateral);
    const independentAxes = elite || runPursuit;
    // Manual movement replaces the entire assignment/avoidance/spacing vector,
    // not just its initial destination. Physical blocking and dives still apply.
    const manual = userTarget ? userDefenseVelocity(d, userTarget, speed, lateral, independentAxes, dt) : undefined;
    const wantedX = manual ? manual.x : independentAxes ? clamp(dx / arrival + (space ? sx * spacing : 0), -speed, speed) : intentX * cap;
    const wantedY = manual ? manual.y : independentAxes ? clamp(dy / arrival + (space ? sy * spacing : 0), -lateral, lateral) : intentY * cap;
    const close = carrying && Math.hypot(d.x - carrier.x, d.y - carrier.y) < 48;
    const acceleration = elite ? close ? ELITE.closeAcceleration : ELITE.acceleration
       : (close ? 650 : 180 + (coverage ? profile.coverage : profile.rush) * 130) * EXECUTION.defenseAcceleration;
    // Coverage retreat momentum must not delay recognition of a downfield run.
    // Bounded acceleration remains physical; top-speed ratings are unchanged.
    const maxTurn = (runPursuit ? Math.max(650, acceleration) : acceleration) * dt *
        (openGain > 1 ? OPEN_FIELD.acceleration : 1) * (passCoverage || wonBlitz ? 1.12 : 1) *
        (exceptionalCoverage ? MOMENTS.coverAcceleration : exceptionalFit ? 1.06 : 1);
    const changeX = wantedX - d.vx, changeY = wantedY - d.vy, change = Math.hypot(changeX, changeY);
    const fraction = change > maxTurn ? maxTurn / change : 1;
    d.vx += changeX * fraction; d.vy += changeY * fraction;
    d.x = clamp(d.x + d.vx * dt, 8, 1180); d.y = clamp(d.y + d.vy * dt, openField ? FOOTBALL_SIDELINES.minY : 24, 168);
    if (pressureGap && !userTarget && d.x < los + 4) { d.x = los + 4; d.vx = Math.max(0, d.vx); }
  }
}
