import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { createFootballControls } from './controls';
import { kickoffSequence, stepSpecialTeams } from './special-teams';
import { DEFENSE_IDS, type Defense, type PlayId } from './types';
import { eligiblePassDefenders } from './pass-defense';
import { isFootballGame } from './storage';

function fixture(call: Defense = 'pass', play: PlayId = 'post') {
  const g = createFootball(86); g.phase = 'live'; g.possession = 'away'; g.spot = 40;
  g.live = startField(g, play, call); g.live.time = 1; g.live.target = 100;
  g.live.penetration!.roll = .999;
  return g;
}
function isolate(g: ReturnType<typeof fixture>) {
  for (const a of g.live!.athletes) if (a.role !== 'QB') { a.x = 1000; a.y = 160; a.engaged = 0; }
}
test('every defensive call ignores directional input, including stale experimental input fields', () => {
  for (const call of DEFENSE_IDS) for (const play of ['post', 'power', 'speed-option'] as const) {
    const a = fixture(call, play), b = structuredClone(a);
    for (let frame = 0; frame < 150; frame++) {
      const direction = (frame % 3 - 1) as -1 | 0 | 1;
      const legacy = { direction, defenseDirection: direction };
      const expected = stepField(a, {}, 1 / 60), actual = stepField(b, legacy, 1 / 60);
      assert.deepEqual(actual, expected); assert.deepEqual(b, a);
      if (actual) break;
    }
  }
});
test('defensive ACTION fires once on press and never pursues, waits for hold, repeats or fires on release', () => {
  for (const duration of [1, 199, 200, 1000, 5000]) {
    const c = createFootballControls(), g = fixture();
    c.enter('action', 'juke', 0, g);
    assert(c.sample(0, false).action); assert(c.sample(0).action);
    c.enter('action', 'juke', duration, g);
    const held = c.sample(duration);
    assert.equal(held.action, false);
    assert(!('defenseDirection' in held)); assert(!('defenseHold' in held));
    c.release('action', duration); assert.equal(c.sample(duration).action, false);
  }
});
test('arrows, accessible taps and cancellation never create a defensive movement channel', () => {
  const g = fixture(), c = createFootballControls();
  c.enter('up', 'up', 0, g); c.enter('down', 'down', 10, g);
  c.enter('action', 'juke', 20, g); assert(c.sample(20).action);
  c.release('down', 30); c.release('up', 40, true); c.release('action', 50);
  c.tapDirection(1, 60);
  assert(!('defenseDirection' in c.sample(60)));
  c.clear(); assert.equal(c.sample(70).direction, 0);
});
test('nearest eligible DL takes ACTION instead of a distant linebacker, independently of arrows', () => {
  for (const direction of [-1, 0, 1] as const) {
    const g = fixture(), l = g.live!; isolate(g);
    Object.assign(l.athletes[5]!, { x: 460, y: 96 });
    const dl = l.athletes[7]!; Object.assign(dl, { x: 495, y: 96 });
    stepField(g, { action: true, direction }, 1 / 60);
    assert(dl.dive); assert.equal(l.athletes.find(a => a.role === 'LB')!.dive, undefined);
  }
});
test('ACTION on a pass chooses the nearest eligible defender, not a particular role', () => {
  const g = fixture(), l = g.live!; isolate(g); l.mode = 'flight';
  l.flight = { x: 580, y: 96, z: 1, fromX: 400, fromY: 96, toX: 600, toY: 96, duration: 1, age: .9, receiver: 3, accuracy: 1, type: 'normal' };
  Object.assign(l.athletes[12]!, { x: 600, y: 96 });
  const nearest = eligiblePassDefenders(g)[0]!.d;
  stepField(g, { action: true, direction: 1 }, 1 / 60);
  assert(nearest.dive); assert.equal(nearest.defensiveAttempt!.kind, 'intercept');
});
test('ACTION never forces a dive when no defender is eligible', () => {
  const g = fixture(); isolate(g);
  stepField(g, { action: true }, 1 / 60);
  assert(g.live!.athletes.filter(a => a.side === 'defense').every(d => !d.dive));
});
test('automatic contact sacks and tackles remain functional without ACTION', () => {
  for (const mode of ['dropback', 'scramble', 'run'] as const) {
    const g = fixture(), l = g.live!; isolate(g); l.mode = mode; l.carrier = mode === 'run' ? 6 : 5;
    const runner = l.athletes[l.carrier]!, d = l.athletes.find(a => a.role === 'LB')!;
    runner.x = l.movement.player.x = 450; runner.y = l.movement.player.y = 96;
    d.x = 450; d.y = 96;
    assert.equal(stepField(g, {}, 1 / 60)?.reason, mode === 'run' ? 'tackle' : 'sack');
  }
});
test('all kickoff coverage including kicker ignores arrows during flight and returns', () => {
  for (const kind of ['full', 'squib', 'onside'] as const) for (const returning of [false, true]) {
    const a = createFootball(86); a.phase = 'kickoff'; a.kickReceiver = 'away';
    const s = a.special = kickoffSequence(a, kind);
    if (returning) {
      s.stage = 'recovery'; s.stageAge = .32; s.recovery = s.returner;
      s.recoveryFrom = { x: s.toX, y: s.toY }; s.ball = { x: s.toX, y: s.toY, z: 0 };
      stepSpecialTeams(a, {}, 1 / 60);
    } else { s.stage = 'flight'; s.stageAge = .4; }
    const b = structuredClone(a);
    for (let frame = 0; frame < 60; frame++) {
      const direction = (frame % 3 - 1) as -1 | 0 | 1;
      const legacy = { direction, defenseDirection: direction };
      const expected = stepSpecialTeams(a, {}, 1 / 60), actual = stepSpecialTeams(b, legacy, 1 / 60);
      assert.deepEqual(actual, expected); assert.deepEqual(b, a);
      if (actual) break;
    }
  }
});
test('kickoff ACTION retains original nearest eligible coverage defender, including a non-kicker', () => {
  const g = createFootball(86); g.phase = 'kickoff'; g.kickReceiver = 'away';
  const s = g.special = kickoffSequence(g, 'full');
  s.stage = 'recovery'; s.stageAge = .32; s.recovery = s.returner;
  s.recoveryFrom = { x: s.toX, y: s.toY }; s.ball = { x: s.toX, y: s.toY, z: 0 };
  stepSpecialTeams(g, {}, 1 / 60);
  const a = g.returnAttempt!; for (const d of a.defenders) { d.x = 1000; d.y = 160; }
  const nearest = a.defenders.find(d => d.id !== s.kicker)!; nearest.x = a.player.x + 35; nearest.y = a.player.y;
  stepSpecialTeams(g, { action: true }, 1 / 60);
  assert(g.returnAttempt!.defenders.find(d => d.id === nearest.id)!.dive);
  assert.equal(g.returnAttempt!.defenders.find(d => d.id === s.kicker)!.dive, undefined);
});
test('defensive controls never add experimental state to a valid game save', () => {
  const g = fixture(), before = JSON.stringify(g), c = createFootballControls();
  c.enter('up', 'up', 0, g); c.sample(0); c.clear();
  assert.equal(JSON.stringify(g), before); assert(isFootballGame(JSON.parse(before)));
});
