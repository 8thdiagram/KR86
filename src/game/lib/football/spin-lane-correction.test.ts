import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { createFootballControls } from './controls';
import { EVADE } from '../carrier-evasion';
import { isFootballGame } from './storage';
import { isKickMoves, stepKickMoves } from '../kick-return-moves';
import { createKickAttempt } from '../kick-return-engine';
import { playerSpeed } from '../player-pace';
import { cpuCarrierAction, chooseCarrierEvasion } from '../carrier-evasion';
import { stepKickAttempt } from '../kick-return-engine';
const spinFrames = Math.ceil(EVADE.spin * 60);

test('an open-lane diagonal spin evades the actual tackle path in Full Game', () => {
  const { g, l, runner, threat } = field(-1);
  threat.x = runner.x + 28; threat.y = runner.y - 16;
  threat.startX = threat.x; threat.startY = threat.y; threat.engaged = 0;
  const baseline = JSON.parse(JSON.stringify(g)) as typeof g;
  let normalTackle = false, spunTackle = false, tackleAt = '';
  for (let frame = 0; frame < 16; frame++) {
    const normal = stepField(baseline, {}, 1 / 60);
    const spun = stepField(g, frame === 0 ? { action: true } : {}, 1 / 60);
    normalTackle ||= normal?.reason === 'tackle';
    spunTackle ||= spun?.reason === 'tackle';
    if (spun) tackleAt = `${frame} ${runner.x.toFixed(2)},${runner.y.toFixed(2)} defender ${threat.x.toFixed(2)},${threat.y.toFixed(2)} (${spun.reason})`;
    if (spun) break;
  }
  assert(normalTackle, 'a straight runner is tackled by this defender');
  assert(!spunTackle, `the diagonal cut beats this tackle without immunity: ${tackleAt}`);
  assert(runner.y > 96 + EVADE.bodyWidth, 'the runner enters a genuinely different lane');
  assert.equal(l.movement.player.y, runner.y);
});

test('CPU decision waits for a credible threat and uses the same move physics', () => {
  const a = createKickAttempt(1986, 1);
  a.phase = 'returning'; a.player = { x: 500, y: 96 }; a.returnTime = 1;
  a.moves = { version: 2, sequence: 0, readyAt: 0, backward: false, vx: 60, furthestX: 500 };
  a.defenders = [];
  const open = cpuCarrierAction(a, 0, { minY: 24, maxY: 168 });
  assert(!open.juke, 'CPU does not perform purposeless open-field actions');
  let m = stepKickMoves(a, 0, 1 / 60, open);
  assert.equal(m.moves?.active, undefined);
  a.defenders = [{ id: 0, x: 525, y: 77, vx: -30, vy: 0,
    homeX: 525, minY: 24, maxY: 168, speed: 30, lateralSpeed: 30, active: true }];
  a.moves = { ...a.moves, readyAt: 0, sequence: 0 };
  const decision = cpuCarrierAction(a, 0, { minY: 24, maxY: 168 });
  assert.equal(decision.juke, true);
  assert.equal(chooseCarrierEvasion(a, { minY: 24, maxY: 168 }).kind, 'spin');
  m = stepKickMoves(a, 0, 1 / 60, decision);
  assert.equal(m.moves?.active?.kind, 'spin');
  assert.equal(m.moves?.active?.lateralDistance, EVADE.spinDistance);
  assert(m.player.y > 96);
  a.moves = m.moves; a.player = m.player; a.returnTime += 1 / 60;
  assert.equal(cpuCarrierAction(a, 0, { minY: 24, maxY: 168 }).juke, undefined);
});

test('CPU Full Game ball carrier commits a real juke through the live running path', () => {
  const { g, l, runner, threat } = field(-1);
  g.possession = 'away'; l.movement.returnTime = 1;
  threat.x = runner.x + 30; threat.y = runner.y - 22;
  threat.startX = threat.x; threat.startY = threat.y;
  const before = { x: runner.x, y: runner.y };
  stepField(g, {}, 1 / 60);
  assert.equal(l.movement.moves?.active?.kind, 'spin',
    `CPU action ${JSON.stringify(l.movement.moves)} defender ${threat.x},${threat.y} carrier ${runner.x},${runner.y} decision ${JSON.stringify(cpuCarrierAction(l.movement, 1, { minY: 24, maxY: 168 }))} choice ${JSON.stringify(chooseCarrierEvasion(l.movement, { minY: 24, maxY: 168 }, [], 1))}`);
  assert.equal(l.movement.moves?.active?.side, 1);
  assert(runner.y > before.y);
  assert.equal(runner.x, l.movement.player.x);
  assert.equal(runner.y, l.movement.player.y);
});

test('CPU Full Game runner runs normally in open field without purposeless ACTION', () => {
  const { g, l, runner } = field(-1);
  g.possession = 'away'; l.movement.returnTime = 1;
  l.athletes.filter(a => a.side === 'defense').forEach(a => {
    a.x = a.startX = 1000; a.y = a.startY = 150; a.engaged = 100;
  });
  stepField(g, {}, 1 / 60);
  assert.equal(l.movement.moves?.active, undefined);
  const first = l.movement.moves!.sequence;
  for (let i = 0; i < 35; i++) stepField(g, {}, 1 / 60);
  assert.equal(l.movement.moves!.sequence, first, 'CPU does not press ACTION every frame');
  assert.equal(runner.x, l.movement.player.x);
});

test('Classic return collision and bounds still use the constrained spin position', () => {
  const a = createKickAttempt(1986, 1);
  a.phase = 'returning'; a.player = { x: 500, y: 96 }; a.returnTime = a.time = 1;
  a.moves = { version: 2, sequence: 0, readyAt: 0, backward: false, vx: 60, furthestX: 500 };
  a.defenders = [{ id: 0, x: 520, y: 80, vx: 0, vy: 0, homeX: 520,
    minY: 24, maxY: 168, speed: 0, lateralSpeed: 0, active: true }];
  let state = a;
  for (let i = 0; i < 16 && state.phase === 'returning'; i++)
    state = stepKickAttempt(state, 0, 1 / 60, { evasion: true, juke: i === 0 });
  assert(state.player.y > 96);
  assert(state.player.y <= 168);
  assert(isKickMoves(state.moves, state));
});

function field(threatSide: -1 | 1) {
  const g = createFootball(1986, {player:'Crows',opponent:'Bulls'});
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
    for (let frame = 0; frame < spinFrames; frame++) {
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
    assert(Math.abs(end.y - start.y + threatSide * EVADE.spinDistance) < 1e-7);
    assert(end.x > start.x + 10, 'forward momentum persists through the diagonal escape');
    assert(quarter > EVADE.spinDistance * .15);
    assert(Math.abs(half - EVADE.spinDistance * (8 / 60) / EVADE.outward) < 1e-7);
    assert.equal(l.movement.moves!.active, undefined);
    for (let frame = spinFrames; frame < 25; frame++)
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
  for (let frame = 0; frame < spinFrames; frame++) {
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
      delete l.movement.moves!.active!.travelDuration;
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
  a.moves.active = { kind: 'spin', side: 1, elapsed: .1, evasive: true, duration: EVADE.spin, spinDirection: 1 };
  assert(isKickMoves(a.moves, a));
  a.moves.active.spinDirection = 2 as never;
  assert(!isKickMoves(a.moves, a), 'a non-unit steering direction is rejected');
  a.moves.active = { kind: 'boost', side: 0, elapsed: .1, evasive: true, spinDirection: 0 };
  assert(!isKickMoves(a.moves, a), 'heading metadata belongs only to a committed spin');
});

for (const direction of [-1, 1] as const) for (const threatSide of [-1, 1] as const) {
  test(`diagonal ${direction < 0 ? 'up' : 'down'} running physically jukes perpendicular ${threatSide < 0 ? 'right' : 'left'}`, t => {
    const { g, l, runner, threat } = field(threatSide);
    const forward = playerSpeed(l.movement.difficulty === 'hard' ? 73 : 57);
    const lateral = direction * playerSpeed(l.movement.difficulty === 'hard' ? 86 : 78);
    const speed = Math.hypot(forward, lateral), nx = -lateral / speed, ny = forward / speed;
    threat.x = runner.x + forward / speed * 8 + nx * threatSide * 30;
    threat.y = runner.y + lateral / speed * 8 + ny * threatSide * 30;
    const start = { x: runner.x, y: runner.y };
    const controls = createFootballControls();
    controls.enter('steer', direction < 0 ? 'up' : 'down', 0, g);
    controls.enter('action', 'juke', 0, g);
    for (let frame = 0; frame < spinFrames; frame++) {
      if (frame === 3) controls.release('action', 50);
      assert.equal(stepField(g, controls.sample(frame * 1000 / 60), 1 / 60), undefined);
      assert.deepEqual(l.movement.player, { x: runner.x, y: runner.y });
      if (!frame) {
        assert.equal(l.movement.moves!.active!.kind, 'spin');
        assert.equal(l.movement.moves!.active!.side, -threatSide);
        assert.equal(l.movement.moves!.active!.spinDirection, direction);
        const sx = runner.x - start.x - forward / 60, sy = runner.y - start.y - lateral / 60;
        assert(Math.hypot(sx, sy) >= EVADE.spinDistance / (EVADE.spin * 60) - 1e-7,
          'a real lateral juke starts immediately at the first simulation step');
        const restored = JSON.parse(JSON.stringify(g));
        assert(isFootballGame(restored), 'active heading survives normal game save validation');
        const original = JSON.parse(JSON.stringify(g));
        stepField(original, { direction }, 1 / 60);
        stepField(restored, { direction }, 1 / 60);
        assert.deepEqual(original, restored);
      }
    }
    const elapsed = spinFrames / 60;
    const shift = { x: runner.x - start.x - forward * elapsed, y: runner.y - start.y - lateral * elapsed };
    assert(Math.abs(shift.x * forward / speed + shift.y * lateral / speed) < 1e-7,
      'the additional movement is perpendicular, not a forward boost or field-Y-only shift');
    assert(Math.abs(shift.x * nx + shift.y * ny + threatSide * EVADE.spinDistance) < 1e-7);
    assert(Math.abs(Math.hypot(shift.x, shift.y) - EVADE.spinDistance) < 1e-7);
    assert.equal(l.movement.moves!.active, undefined);
    const end = { x: runner.x, y: runner.y };
    controls.release('steer', spinFrames * 1000 / 60, true);
    for (let frame = spinFrames; frame < spinFrames + 6; frame++) stepField(g, controls.sample(frame * 1000 / 60), 1 / 60);
    assert.equal(runner.y, end.y, 'new coordinates persist when ordinary forward running resumes');
    assert(runner.x > end.x);
    t.diagnostic(`world (${start.x}, ${start.y}) -> (${end.x.toFixed(3)}, ${end.y.toFixed(3)}), perpendicular displacement ${Math.hypot(shift.x, shift.y).toFixed(3)}`);
  });
}

for (const direction of [-1, 0, 1] as const) for (const threatSide of [-1, 1] as const) {
  test(`opposite-field return direction ${direction} escapes threat side ${threatSide} by one perpendicular body width`, t => {
    // Isolate authored evasion geometry from individual roster speed bonuses.
    const g = createFootball(1986,{player:'Bulls',opponent:'Crows'}); g.phase = 'live'; g.possession = 'away'; g.spot = 40;
    const l = g.live = startField(g, 'power', 'pass');
    l.offense = 'away'; g.possession = 'home';
    l.mode = 'return'; l.returnKind = 'interception'; l.time = 3; l.flight = undefined;
    for (const a of l.athletes) Object.assign(a, { x: 1000, y: 155, vx: 0, vy: 0, engaged: 100 });
    const runner = l.athletes.find(a => a.role === 'DB')!;
    Object.assign(runner, { x: 650, y: 96, engaged: 0 });
    l.carrier = runner.id;
    l.interception = { catcher: runner.id, age: 1, catchX: 650, catchY: 96 };
    l.movement.player = { x: 550, y: 96 }; l.movement.returnTime = 1;
    l.movement.moves = { version: 2, sequence: 0, readyAt: 0, backward: false, vx: 60, furthestX: 550 };
    const forward = playerSpeed(l.movement.difficulty === 'hard' ? 73 : 57);
    const lateral = direction * playerSpeed(l.movement.difficulty === 'hard' ? 86 : 78);
    const speed = Math.hypot(forward, lateral), nx = lateral / speed, ny = forward / speed;
    const threat = l.athletes.find(a => a.side === 'offense')!;
    threat.x = runner.x - forward / speed * 8 + nx * threatSide * 30;
    threat.y = runner.y + lateral / speed * 8 + ny * threatSide * 30;
    const start = { x: runner.x, y: runner.y };
    for (let frame = 0; frame < spinFrames; frame++) {
      assert.equal(stepField(g, { direction, action: frame === 0 }, 1 / 60), undefined);
      assert.equal(l.movement.player.x, 1200 - runner.x);
      assert.equal(l.movement.player.y, runner.y);
      if (!frame) assert.equal(l.movement.moves!.active!.kind, 'spin');
    }
    const shift = { x: runner.x - start.x + forward * spinFrames / 60, y: runner.y - start.y - lateral * spinFrames / 60 };
    assert(Math.abs(shift.x * -forward / speed + shift.y * lateral / speed) < 1e-7);
    assert(Math.abs(shift.x * nx + shift.y * ny + threatSide * EVADE.spinDistance) < 1e-7);
    assert(runner.x < start.x, 'return preserves momentum toward the opposite goal');
    const end = { x: runner.x, y: runner.y };
    for (let frame = 0; frame < 6; frame++) stepField(g, {}, 1 / 60);
    assert.equal(runner.y, end.y); assert(runner.x < end.x);
    t.diagnostic(`world (${start.x}, ${start.y}) -> (${end.x.toFixed(3)}, ${end.y.toFixed(3)}), perpendicular displacement ${Math.hypot(shift.x, shift.y).toFixed(3)}`);
  });
}
