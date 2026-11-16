import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { createFootballControls } from './controls';
import { EVADE } from '../carrier-evasion';
import { isFootballGame } from './storage';
import { isKickMoves, stepKickMoves } from '../kick-return-moves';
import { createKickAttempt } from '../kick-return-engine';

function field(threatSide: -1 | 1) {
  const g = createFootball(1986);
  g.possession = 'home'; g.phase = 'live'; g.spot = 40;
  const l = g.live = startField(g, 'power', 'pass');
  l.mode = 'run'; l.time = 3; l.carrier = 6; l.carrierCrossedLos = true;
  for (const a of l.athletes) {
    a.x = 1000; a.y = 155; a.engaged = 100; a.vx = a.vy = 0;
  }
  const runner = l.athletes[l.carrier]!;
  runner.x = l.movement.player.x = 650; runner.y = l.movement.player.y = 96;
  runner.engaged = 0;
  const threat = l.athletes.find(a => a.role === 'DB')!;
  threat.x = 660; threat.y = 96 + threatSide * 30;
  l.movement.moves = { version: 2, sequence: 0, readyAt: 0,
    backward: false, vx: 60, furthestX: 650 };
  return { g, l, runner, threat };
}

for (const threatSide of [-1, 1] as const) for (const hold of [false, true]) {
  test(`actual Full Game ${threatSide < 0 ? 'right' : 'left'} spin changes world lane${hold ? ' even with ACTION held' : ''}`, t => {
    const { g, l, runner } = field(threatSide);
    const controls = createFootballControls(), start = { x: runner.x, y: runner.y };
    controls.enter('touch', 'juke', 0, g);
    let quarter = 0, half = 0;
    for (let frame = 0; frame < 16; frame++) {
      const now = frame * 1000 / 60;
      if (!hold && frame === 4) controls.release('touch', now);
      assert.equal(stepField(g, controls.sample(now), 1 / 60), undefined);
      assert.deepEqual(l.movement.player, { x: runner.x, y: runner.y },
        'rendering, collisions and pursuit share the real carrier coordinates');
      assert((runner.y - start.y) * -threatSide > 0, 'lateral motion starts on the first frame');
      if (frame === 3) quarter = Math.abs(runner.y - start.y);
      if (frame === 7) half = Math.abs(runner.y - start.y);
    }
    const end = { x: runner.x, y: runner.y };
    assert(Math.abs(end.y - start.y + threatSide * EVADE.bodyWidth) < 1e-7);
    assert(end.x > start.x + 10, 'forward momentum persists through the diagonal escape');
    assert(quarter > EVADE.bodyWidth * .15);
    assert(half > EVADE.bodyWidth * .45 && half < EVADE.bodyWidth * .6);
    assert.equal(l.movement.moves!.active, undefined);
    for (let frame = 16; frame < 25; frame++)
      stepField(g, controls.sample(frame * 1000 / 60), 1 / 60);
    assert.equal(runner.y, end.y, 'ordinary movement never resets the new lane');
    if (hold) {
      assert.equal(runner.x, end.x, 'hold-to-halt takes over after the juke');
      assert(l.movement.moves!.hesitating);
      controls.enter('steer', 'down', 420, g);
      stepField(g, controls.sample(420), 1 / 60);
      assert(runner.y > end.y, 'holding still permits lateral repositioning');
      controls.release('steer', 430, true); controls.release('touch', 430);
      stepField(g, controls.sample(450), 1 / 60);
      assert(runner.x > end.x, 'release resumes forward running without another spin');
    } else assert(runner.x > end.x);
    assert.equal(l.movement.moves!.sequence, 1);
    t.diagnostic(`world (${start.x}, ${start.y}) -> (${end.x.toFixed(3)}, ${end.y.toFixed(3)}), lateral ${Math.abs(end.y - start.y).toFixed(3)}, spin ${EVADE.spin}s`);
  });
}

test('live secondary pursuit observes the new authoritative lane after a spin', () => {
  const { g, l, runner, threat } = field(1);
  const controls = createFootballControls();
  controls.enter('touch', 'juke', 0, g);
  for (let frame = 0; frame < 16; frame++) {
    if (frame === 3) controls.release('touch', 50);
    stepField(g, controls.sample(frame * 1000 / 60), 1 / 60);
  }
  const lane = runner.y;
  threat.engaged = 0; threat.x = runner.x + 38; threat.y = lane + 32;
  threat.pursuit = undefined;
  const x = threat.x, y = threat.y;
  stepField(g, {}, 1 / 60);
  assert.equal(threat.pursuit!.seenY, lane);
  assert(threat.pursuit!.seenY < 96);
  assert(threat.x !== x || threat.y !== y, 'defenders remain active rather than frozen');
});

test('short and pre-correction spins both survive save validation without snapping', () => {
  for (const legacy of [false, true]) {
    const { g, l, runner } = field(1);
    stepField(g, { action: true }, 1 / 60);
    if (legacy) {
      delete l.movement.moves!.active!.duration;
      l.movement.moves!.active!.elapsed = .32;
      l.movement.moves!.readyAt = l.movement.returnTime + .6;
    }
    const restored = JSON.parse(JSON.stringify(g));
    assert(isFootballGame(restored));
    const before = { x: runner.x, y: runner.y };
    for (let frame = 0; frame < 36; frame++) {
      stepField(g, {}, 1 / 60); stepField(restored, {}, 1 / 60);
    }
    assert.deepEqual(restored, g);
    assert(runner.x > before.x); assert(runner.y < before.y);
  }
  const a = createKickAttempt(86, 1);
  a.phase = 'returning'; a.returnTime = 1; a.player = { x: 500, y: 96 };
  a.moves = { version: 2, sequence: 1, readyAt: 1.6, backward: false, vx: 57, furthestX: 500,
    active: { kind: 'spin', side: 1, elapsed: .32, evasive: true } };
  assert(isKickMoves(a.moves, a), 'existing 440ms spins are still accepted');
  const next = stepKickMoves(a, 0, 1 / 60, {});
  assert(next.player.y > a.player.y);
  a.moves.active!.duration = -1;
  assert(!isKickMoves(a.moves, a), 'malformed new timing metadata is rejected');
});
