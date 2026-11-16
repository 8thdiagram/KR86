import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { constrainEvasionStep, cpuCarrierAction, EVADE } from '../carrier-evasion';
import { stepKickMoves } from '../kick-return-moves';
import { createKickAttempt } from '../kick-return-engine';
import { FOOTBALL_SIDELINES } from './sidelines';
import type { PlayId } from './types';
import { kickoffSequence, stepSpecialTeams } from './special-teams';
import { stepInterception } from './interception';
const teams = { player: 'Big Blue', opponent: 'Redbirds' };

test('an existing blocking overlap does not pin an outward escape at sweep time zero', () => {
  const a = createKickAttempt(1986, 1);
  const d = { ...a.defenders[0]!, x: 500, y: 96 };
  const from = { x: 505, y: 101 }, to = { x: 506, y: 102 };
  assert.deepEqual(constrainEvasionStep(from, to, [d]), to);
  const inward = constrainEvasionStep(from, { x: 504, y: 100 }, [d]);
  assert(Math.abs(inward.x - from.x) < .001, 'inward contact is still solid');
});

test('normal CPU offensive plays regularly produce deliberate evasive movement', t => {
  let plays = 0, completed = 0, runningPlays = 0, opportunities = 0, attempts = 0, spins = 0, jukes = 0, boosts = 0, catches = 0, receiverSpins = 0;
  for (let seed = 1; seed <= 12; seed++) for (const play of ['power', 'sweep', 'counter', 'draw', 'slant', 'screen'] as PlayId[]) {
    const g = createFootball(seed * 1986, teams);
    g.possession = 'away'; g.phase = 'live'; g.spot = 35;
    const l = g.live = startField(g, play, seed % 2 ? 'pass' : 'run');
    plays++;
    let sequence = 0, ran = false, caught = false, window = false, attempted = false;
    for (let frame = 0; frame < 1500; frame++) {
      const result = stepField(g, {}, 1 / 60);
      ran ||= l.mode === 'run'; caught ||= l.passCaught;
      // Independent geometric opportunity count, not the CPU decision's output.
      // Count each encounter once, with room for a full exit and no body there.
      const runner = l.athletes[l.carrier]!;
      const began = (l.movement.moves?.sequence ?? 0) > sequence;
      const spin = began && l.movement.moves?.active?.kind === 'spin';
      const juke = began && l.movement.moves?.active?.kind === 'juke';
      const bodies = l.athletes.filter(a => a.id !== runner.id);
      const favorable = l.mode === 'run' && bodies.some(d => d.side !== runner.side &&
        d.engaged <= l.time && !d.dive && d.x - runner.x > 0 && d.x - runner.x < 42 && Math.abs(d.y - runner.y) < 24) &&
        [-1, 1].some(side => {
          const y = runner.y + side * EVADE.spinDistance;
          return y > 12 && y < 168 && bodies.every(d =>
            Math.abs(d.x - runner.x - 16) >= 10 || Math.abs(d.y - y) >= 11);
        });
      if (favorable && !window) { opportunities++; attempted = false; }
      if (spin) { spins++; if (l.passCaught) receiverSpins++; }
      if (juke) jukes++;
      if (favorable && !attempted && (spin || juke || ['spin', 'juke'].includes(l.movement.moves?.active?.kind ?? ''))) {
        attempts++; attempted = true;
      }
      if (began && l.movement.moves?.active?.kind === 'boost') boosts++;
      window = favorable;
      sequence = l.movement.moves?.sequence ?? 0;
      if (result || l.mode === 'return' || l.mode === 'fumble') { completed++; break; }
    }
    if (ran) runningPlays++;
    if (caught) catches++;
  }
  t.diagnostic(JSON.stringify({ plays, completed, runningPlays, catches, receiverSpins, opportunities, attempts, spins, jukes, boosts }));
  assert.equal(completed, plays, 'simulate complete plays, not isolated coordinate steps');
  assert(spins >= 12, 'moves should be recognizable across normal plays, not a rare fixture');
  assert(attempts > 0, 'geometric encounters include crowded and cooldown-blocked lanes, not just safe opportunities');
  assert(boosts > 0);
  assert(jukes > 0, 'genuine head-on jukes occur in complete normal CPU plays');
  assert(catches > 0);
  assert(receiverSpins > 0, 'real CPU completions flow into the same automatic evasion system');
});

test('a rear-pursuit burst yields immediately to a new credible side threat', () => {
  const a = createKickAttempt(1986, 1);
  a.phase = 'returning'; a.player = { x: 500, y: 96 }; a.returnTime = 1;
  a.defenders = [{ id: 0, x: 482, y: 96, vx: 140, vy: 0,
    homeX: 482, minY: 24, maxY: 168, speed: 140, lateralSpeed: 30, active: true }];
  let m = stepKickMoves(a, 0, 1 / 60, cpuCarrierAction(a, 0, FOOTBALL_SIDELINES));
  assert.equal(m.moves?.active?.kind, 'boost');
  a.player = m.player; a.moves = m.moves; a.returnTime += 1 / 60;
  a.defenders = [{ id: 0, x: a.player.x + 25, y: 77, vx: -30, vy: 0,
    homeX: 525, minY: 24, maxY: 168, speed: 30, lateralSpeed: 30, active: true }];
  m = stepKickMoves(a, 1, 1 / 60, cpuCarrierAction(a, 1, FOOTBALL_SIDELINES));
  assert.equal(m.moves?.active?.kind, 'spin');
  assert.equal(m.moves.active.spinDirection, 1, 'escape is relative to the actual diagonal heading');
  assert(m.player.x !== a.player.x && m.player.y !== a.player.y);
  assert.equal(m.moves.active.lateralDistance, EVADE.spinDistance);
});

test('normal CPU kickoff returns automatically evade and accelerate', t => {
  let returns = 0, spins = 0, jukes = 0, boosts = 0, finished = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const g = createFootball(seed * 1986, teams);
    g.phase = 'kickoff'; g.kickReceiver = 'away'; g.possession = 'away';
    g.special = kickoffSequence(g, 'full');
    let sequence = 0, returning = false;
    for (let i = 0; i < 2400; i++) {
      const result = stepSpecialTeams(g, {}, 1 / 60);
      const a = g.returnAttempt;
      if (a) {
        returning = true;
        if ((a.moves?.sequence ?? 0) > sequence) {
          if (a.moves?.active?.kind === 'spin') spins++;
          else if (a.moves?.active?.kind === 'juke') jukes++;
          else if (a.moves?.active?.kind === 'boost') boosts++;
        }
        sequence = a.moves?.sequence ?? 0;
      }
      if (result) { finished++; break; }
    }
    if (returning) returns++;
  }
  t.diagnostic(JSON.stringify({ kickoffs: 16, returns, finished, spins, jukes, boosts }));
  assert.equal(finished, 16);
  assert(returns >= 12); assert(spins >= 4);
  // Bursts are no longer automatic open-field accelerations. A rear threat
  // is verified separately; a normal return need not create one.
});

for (const kind of ['interception', 'fumble'] as const) {
  test(`CPU ${kind} return uses an automatic physical escape in the reverse field direction`, () => {
    const g = createFootball(1986, teams);
    g.phase = 'live'; g.possession = 'away';
    const l = g.live = startField(g, 'power', 'pass');
    l.offense = 'home'; l.mode = 'return'; l.returnKind = kind; l.time = 3;
    const runner = l.athletes.find(a => a.role === 'DB')!;
    l.carrier = runner.id; l.interception = { catcher: runner.id, age: 1, catchX: 550, catchY: 96 };
    for (const a of l.athletes) Object.assign(a, { x: 900, y: 155, vx: 0, vy: 0, engaged: 100 });
    Object.assign(runner, { x: 550, y: 96, engaged: 0 });
    const d = l.athletes[3]!;
    Object.assign(d, { x: 522, y: 80, startX: 522, startY: 80, engaged: 0 });
    l.movement.player = { x: 650, y: 96 }; l.movement.returnTime = 1;
    l.movement.moves = { version: 2, sequence: 0, readyAt: 0, backward: false, vx: 60, furthestX: 650 };
    let spun = false;
    for (let i = 0; i < Math.ceil(EVADE.spin * 60); i++) {
      assert.equal(stepInterception(g, {}, 1 / 60), undefined);
      spun ||= l.movement.moves?.active?.kind === 'spin';
    }
    assert(spun);
    assert(runner.x < 550); assert(Math.abs(runner.y - 96) > 1, 'the diagonal return uses real lateral coordinates');
    assert.equal(runner.x, 1200 - l.movement.player.x);
    assert.equal(runner.y, l.movement.player.y);
  });
}

test('CPU usually attempts a useful one-on-one escape and beats real immediate tackles', t => {
  let encounters = 0, attempts = 0, straightTackles = 0, escaped = 0;
  for (const dx of [26, 32, 38]) for (const dy of [-18, -12, 0, 12, 18]) {
    const g = createFootball(1986, teams);
    g.phase = 'live'; g.possession = 'away'; g.spot = 40;
    // Equal personnel and no extra defensive ACTION on either side of this
    // comparison: only deliberate carrier movement differs.
    g.profiles.home = structuredClone(g.profiles.away);
    g.secondary.home = structuredClone(g.secondary.away);
    const l = g.live = startField(g, 'power', 'pass');
    l.mode = 'run'; l.carrier = 6; l.time = 3; l.carrierCrossedLos = true; l.cpuActionAt = 100;
    l.movement.returnTime = 1; l.movement.player = { x: 650, y: 96 };
    l.movement.moves = { version: 2, sequence: 0, readyAt: 0, backward: false, vx: 60, furthestX: 650 };
    for (const a of l.athletes) Object.assign(a, { x: 1000, y: 155, vx: 0, vy: 0, engaged: 100 });
    const runner = l.athletes[6]!, d = l.athletes.find(a => a.role === 'DB')!;
    Object.assign(runner, { x: 650, y: 96, engaged: 0 });
    Object.assign(d, { x: 650 + dx, y: 96 + dy, startX: 650 + dx, startY: 96 + dy, engaged: 0 });
    const straight = structuredClone(g); straight.possession = 'home'; straight.live!.offense = 'home';
    let normalHit = false, cpuHit = false, attempted = false;
    for (let i = 0; i < 16; i++) {
      if (!normalHit) normalHit = !!stepField(straight, {}, 1 / 60);
      if (!cpuHit) cpuHit = !!stepField(g, {}, 1 / 60);
      attempted ||= l.movement.moves?.active?.kind === 'spin';
    }
    encounters++; if (attempted) attempts++;
    if (normalHit) { straightTackles++; if (!cpuHit && attempted) escaped++; }
  }
  t.diagnostic(JSON.stringify({ encounters, attempts, straightTackles, escaped }));
  assert(attempts / encounters >= .7);
  assert(straightTackles > 0);
  assert(escaped >= 3, 'same live defensive pursuit and contact rules, not displacement-only proof');
});
