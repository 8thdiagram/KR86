import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { eligibleReceivers, manAssignment, zoneTarget } from './coverage';
import { attemptPassDefense, eligiblePassDefenders, PASS_DEFENSE } from './pass-defense';
import { stepAthleteDive } from './defensive-action';
import { ELITE } from './secondary';
import { EXECUTION } from './execution';
import { PENETRATION } from './penetration';
import { stepDefense } from './pursuit';
import { progression } from './passing';
import { isFootballGame } from './storage';
import type { Defense } from './types';

const setup = (defense: Defense = 'man') => {
  const g = createFootball(617, { player: 'Big Blue', opponent: 'Redbirds' });
  g.spot = 40; g.target = 50; g.phase = 'live'; g.possession = 'away';
  g.live = startField(g, 'screen', defense);
  return g;
};
test('man assigns releasing RB and each eligible receiver once; blitz covers the RB too', () => {
  for (const defense of ['man', 'blitz'] as const) {
    const l = setup(defense).live!;
    const targets = l.athletes.filter(d => d.side === 'defense')
      .map(d => manAssignment(l, d)?.id).filter(id => id !== undefined);
    assert(targets.includes(6));
    assert.equal(new Set(targets).size, targets.length);
    assert.equal(targets.length, eligibleReceivers(l).length);
    l.athletes[6]!.x += 80; l.athletes[6]!.y -= 40;
    assert.deepEqual(l.athletes.filter(d => d.side === 'defense')
      .map(d => manAssignment(l, d)?.id).filter(id => id !== undefined), targets,
    'movement must not make man defenders exchange their assignments');
  }
});
test('prevent reacts to observed deep flight, holds depth and concedes underneath', () => {
  const g = setup('prevent'), l = g.live!, d = l.athletes[12]!;
  const before = zoneTarget(l, d);
  l.flight = { type: 'normal', fromX: 450, fromY: 96, toX: 720, toY: 115,
    x: 460, y: 97, z: 15, duration: 1, age: .1, receiver: 3, accuracy: .7 };
  const deep = zoneTarget(l, d);
  assert(deep.x >= 635);
  assert(Math.abs(deep.y - 115) < Math.abs(before.y - 115));
  l.flight.toX = 520;
  assert(zoneTarget(l, d).x >= 675, 'a short throw does not draw the safety into the box');
});
test('man-blitz secondary retains cutback insurance before a handoff instead of chasing every back', () => {
  const g = setup('blitz');
  g.live = startField(g, 'counter', 'blitz');
  g.live.time = .2;
  stepDefense(g, 1 / 60);
  const safeties = g.live.athletes.filter(a => a.role === 'DB' && a.startY > 60);
  assert(safeties.every(d => d.pursuit!.x >= 585));
});
test('a lane defender can anticipate a bullet without changing the interception lottery', () => {
  const g = setup(), l = g.live!;
  l.mode = 'flight'; l.time = 1;
  for (const d of l.athletes.filter(a => a.side === 'defense')) { d.x = 900; d.y = 25; }
  const d = l.athletes[11]!; d.x = 520; d.y = 103; d.vx = 0; d.vy = 0;
  l.flight = { type: 'bullet', fromX: 450, fromY: 96, toX: 650, toY: 96,
    x: 463.2, y: 96, z: 2, duration: 200 / 440, age: .03, receiver: 3, accuracy: .7 };
  assert(eligiblePassDefenders(g).some(c => c.d.id === d.id));
  assert(!d.dive, 'eligibility alone must not trigger a human interception');
  assert.equal(attemptPassDefense(g)?.id, d.id);
  const from = { x: d.x, y: d.y };
  for (let i = 0; i < 4; i++) stepAthleteDive(d, 1 / 60);
  assert.equal(d.dive?.phase, 'airborne');
  assert(Math.hypot(d.x - from.x, d.y - from.y) < 10, 'no teleport');
  assert.equal(PASS_DEFENSE.interceptionChance, .075);
  assert.equal(PASS_DEFENSE.maxInterceptionChance, .14);
});
test('elite acceleration exceeds ordinary close and open pursuit without changing all defenders', () => {
  assert(ELITE.closeAcceleration > 650 * EXECUTION.defenseAcceleration);
  assert(ELITE.acceleration > (180 + 130) * EXECUTION.defenseAcceleration);
  assert.deepEqual(PENETRATION.line, [[0, .10], [1, .20], [3, .33], [5, .50]]);
  assert.deepEqual(PENETRATION.slowBlitz, [[0, .12], [1, .38], [2, .56]]);
  assert.deepEqual(PENETRATION.ordinaryBlitz, [[0, .14], [.8, .20]]);
});
test('screen escorts release after the pass look; draw QB shows a real dropback', () => {
  const g = setup('blitz'), l = g.live!;
  for (let i = 0; i < 45; i++) stepField(g, {}, 1 / 60);
  assert(l.athletes.slice(0, 3).some(a => a.y < a.startY - 2));
  const draw = setup('blitz'); draw.live = startField(draw, 'draw', 'blitz');
  const initial = draw.live.athletes[5]!.x;
  for (let i = 0; i < 30; i++) stepField(draw, {}, 1 / 60);
  assert(draw.live.athletes[5]!.x < initial);
  assert.equal(draw.live.mode, 'handoff');
});
test('declared fourth vertical survives a save and can be selected late; undeclared old saves keep three reads', () => {
  const g = setup('pass'); g.possession = 'home';
  g.live = startField(g, 'verticals', 'pass');
  assert.equal(g.live.athletes.filter(a => a.side === 'offense' && a.role === 'OL').length, 3);
  assert.equal(eligibleReceivers(g.live).length, 4);
  assert(isFootballGame(JSON.parse(JSON.stringify(g))));
  const old = structuredClone(g.live);
  old.athletes[2]!.route = 0; old.athletes[6]!.route = 0;
  assert.equal(eligibleReceivers(old).length, 3);
  assert.equal(progression({ ...old, time: 4.1 }).receiver, 6);
  assert.equal(progression({ ...g.live, time: 4.1 }).receiver, 2);
  // Isolate the actual late route/throw from sack luck, not from the play engine.
  for (const d of g.live.athletes.filter(a => a.side === 'defense')) { d.engaged = 10; d.x = 900; }
  g.live.penetration!.roll = .99;
  for (let i = 0; i < 246; i++) stepField(g, {}, 1 / 60);
  assert(g.live.athletes[2]!.x > 580);
  stepField(g, { passPress: true, passTarget: 2 }, 1 / 60);
  stepField(g, { passRelease: 'normal' }, 1 / 60);
  assert.equal(g.live.flight?.receiver, 2);
});
