import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKickAttempt, isKickContact, stepKickAttempt, type KickAttempt } from '../kick-return-engine';
import { chooseCarrierEvasion, EVADE, sweptCarrierContact } from '../carrier-evasion';
import { stepKickMoves, isKickMoves } from '../kick-return-moves';
import { createKickControls } from '../kick-return-controls';
import { createFootballControls, canRunningAction } from './controls';
import { createFootball, stepFootball } from './engine';
import { startField, stepField } from './field';
import { canForwardPass } from './passing';
import { playerSpeed } from '../player-pace';
import { isFootballGame } from './storage';
import { constrainEvasionStep } from '../carrier-evasion';

const bounds = { minY: 24, maxY: 168 };
function attempt() {
  const a = createKickAttempt(777, 1);
  a.phase = 'returning'; a.player = { x: 500, y: 96 }; a.returnTime = a.time = 1;
  a.moves = { version: 2, sequence: 0, readyAt: 0, backward: false, vx: 57, furthestX: 500 };
  a.defenders = []; return a;
}
function defender(a: KickAttempt, dx: number, dy: number, vx = 0, vy = 0) {
  const d = { id: a.defenders.length, x: a.player.x + dx, y: a.player.y + dy,
    homeX: a.player.x + dx, minY: 24, maxY: 168, speed: 0, lateralSpeed: 0, active: true, vx, vy };
  a.defenders.push(d); return d;
}
function game() {
  const g = createFootball(333, { player: 'Big Blue', opponent: 'Redbirds' });
  g.possession = 'home'; g.phase = 'live'; g.spot = 40;
  g.live = startField(g, 'slant', 'pass'); g.live.time = 1;
  g.live.penetration!.roll = .999;
  g.live.athletes.filter(a => a.side === 'defense').forEach(a => { a.x = a.startX = 1000; a.y = a.startY = 150; });
  return g;
}
for (const [side, expected] of [[1, -1], [-1, 1]] as const) {
  test(`near defender on lateral ${side}: spin away, with one body-width progressive displacement`, () => {
    const a = attempt(); defender(a, 8, side * 26);
    const selected = chooseCarrierEvasion(a, bounds);
    assert.deepEqual(selected, { kind: 'spin', side: expected });
    let elapsed = 0, previousY = a.player.y, maxStep = 0;
    for (let frame = 0; frame < 27; frame++) {
      const m = stepKickMoves(a, 0, 1 / 60, { evasion: true, juke: frame === 0 });
      maxStep = Math.max(maxStep, Math.abs(m.player.y - previousY)); previousY = m.player.y;
      a.player = m.player; a.moves = m.moves; a.returnTime += 1 / 60; elapsed += 1 / 60;
      assert(isKickMoves(a.moves, a), 'active and completed moves can be saved/restored');
    }
    assert(Math.abs(a.player.y - 96 - expected * EVADE.bodyWidth) < 1e-7);
    assert(maxStep <= EVADE.bodyWidth * 1.5 / (EVADE.spin * 60) + 1e-6,
      'each step stays within the smooth movement curve, never a one-frame lane teleport');
    assert(!a.moves?.active); assert(elapsed > EVADE.spin);
    const x = a.player.x; const m = stepKickMoves(a, 0, 1 / 60, { evasion: true });
    assert(m.player.x > x, 'running resumes immediately');
  });
}
test('open field, distant coverage and non-closing trailing defenders select boost', () => {
  for (const pos of [undefined, [100, 0], [-20, 0]] as const) {
    const a = attempt(); if (pos) defender(a, ...pos);
    assert.equal(chooseCarrierEvasion(a, bounds).kind, 'boost');
  }
  const closing = attempt(); defender(closing, -12, 17, 120, -20);
  assert.equal(chooseCarrierEvasion(closing, bounds).kind, 'spin', 'dangerous trailing diagonal is a genuine threat');
});
test('head-on pressure chooses the open corridor, including other players and sidelines', () => {
  const a = attempt(); defender(a, 35, 0);
  assert.equal(chooseCarrierEvasion(a, bounds, [{ x: 517, y: 80 }]).side, 1);
  assert.equal(chooseCarrierEvasion(a, bounds, [{ x: 517, y: 112 }]).side, -1);
  a.player.y = 26; a.defenders = []; defender(a, 25, 15);
  assert.equal(chooseCarrierEvasion(a, bounds).side, 1, 'never escape through upper sideline');
  a.player.y = 166; a.defenders = []; defender(a, 25, -15);
  assert.equal(chooseCarrierEvasion(a, bounds).side, -1);
});
test('defender trajectory influences corridor choice without mutating coverage', () => {
  const a = attempt(); defender(a, 28, 18, -20, -100);
  const before = JSON.stringify(a);
  const first = chooseCarrierEvasion(a, bounds);
  assert.equal(JSON.stringify(a), before);
  (a.defenders[0] as typeof a.defenders[0] & { vy: number }).vy = 100;
  const second = chooseCarrierEvasion(a, bounds);
  assert.notDeepEqual(first, second, 'crossing trajectory changes the safest exit');
});
test('boost is an 18-percent capped, time-bounded acceleration, never a permanent rating change', () => {
  const a = attempt(); const initial = JSON.stringify(a);
  const base = playerSpeed((a.difficulty === 'hard' ? 73 : 57) * (a.kickoffBoost ?? 1));
  let peak = 0, activeFrames = 0, last = a.player.x;
  for (let i = 0; i < 60; i++) {
    const m = stepKickMoves(a, 0, 1 / 60, { evasion: true, juke: i === 0 });
    const speed = (m.player.x - last) * 60; peak = Math.max(peak, speed);
    if (m.moves?.active) activeFrames++;
    assert(speed >= base - 1e-7 && speed <= base * 1.18 + 1e-7);
    last = m.player.x; a.player = m.player; a.moves = m.moves; a.returnTime += 1 / 60;
    assert(isKickMoves(a.moves, a));
    if (i > 30) assert(Math.abs(speed - base) < 1e-7);
  }
  assert(Math.abs(peak / base - 1.18) < 1e-7);
  assert(activeFrames >= 24 && activeFrames <= 26);
  assert.equal(a.kickoffBoost, JSON.parse(initial).kickoffBoost);
});
test('swept spin cannot jump through a body; contact is not an invincibility shield', () => {
  const to = sweptCarrierContact({ x: 0, y: 0 }, { x: 60, y: 0 }, [{ x: 30, y: 0 }], .1);
  assert(to.x < 30); assert(isKickContact(to, { x: 30, y: 0 }), 'ordinary tackle resolver sees the real contact');
  const a = attempt(); defender(a, 1, 1);
  const m = stepKickMoves(a, 0, 1 / 60, { evasion: true, juke: true });
  assert(isKickContact(m.player, a.defenders[0]!));
});
test('immediate touch down fires once; sustained hold hesitates without repeating the action', () => {
  const c = createKickControls({ immediateAction: true });
  c.enter('steer', 'up', 0); c.enter('action', 'juke', 1);
  assert(c.sample(1, false).juke); assert(c.sample(1).juke);
  assert(!c.sample(2).juke); assert(!c.sample(200).hesitate);
  assert(c.sample(201).hesitate); assert(c.sample(900).hesitate);
  assert.equal(c.sample(900).direction, -1);
  c.release('action', 1000); c.release('action', 1000, true);
  assert(!c.sample(1001).juke); assert(!c.sample(1001).hesitate); assert.equal(c.sample(1001).direction, -1);
  c.release('steer', 1002); c.enter('new', 'juke', 1003);
  assert(c.sample(1003).juke);
});
test('holding ACTION cancels a boost, halts forward progress and retains both steering directions', () => {
  for (const kind of ['boost'] as const) for (const direction of [-1, 0, 1] as const) {
    const a = attempt();
    a.moves!.active = { kind, side: kind === 'spin' ? 1 : 0, elapsed: .21, evasive: true };
    const held = stepKickMoves(a, direction, 1 / 60, { evasion: true, hesitate: true });
    assert.equal(held.player.x, a.player.x);
    assert.equal(Math.sign(held.player.y - a.player.y), direction);
    assert(held.moves?.hesitating); assert.equal(held.moves.active, undefined);
    a.player = held.player; a.moves = held.moves;
    const released = stepKickMoves(a, direction, 1 / 60, { evasion: true });
    assert(released.player.x > a.player.x);
    assert(!released.moves?.hesitating); assert(!released.started);
  }
});
test('cooldown rejects extra action presses without stopping steering or queuing late moves', () => {
  const a = attempt();
  for (let i = 0; i < 40; i++) {
    const oldY = a.player.y, m = stepKickMoves(a, -1, 1 / 60, { evasion: true, juke: i === 0 || i === 10 || i === 30 });
    assert(m.player.y < oldY); a.player = m.player; a.moves = m.moves; a.returnTime += 1 / 60;
  }
  assert.equal(a.moves!.sequence, 1);
  assert(!a.moves!.active);
});
test('QB activation gesture stays owned by passing; a fresh post-LOS press becomes a running move', () => {
  const g = game(), l = g.live!, c = createFootballControls();
  c.enter('pass', 'juke', 0, g); const press = c.sample(0);
  assert(press.passPress && !press.juke);
  stepFootball(g, press); stepFootball(g, c.sample(1000));
  assert.equal(l.mode, 'scramble'); assert(canForwardPass(l));
  l.crossedLos = true; l.athletes[5]!.x = 510; l.movement.player.x = 510;
  c.release('pass', 1010); assert(!c.sample(1010).juke);
  assert(canRunningAction(g));
  c.enter('run', 'juke', 1020, g); const run = c.sample(1020);
  assert(run.juke && !run.passPress && !run.passRelease);
  stepField(g, run, 1 / 60);
  assert(l.movement.moves?.active?.evasive);
  assert.equal(g.stats.home.attempts, 0); assert(!canForwardPass(l));
});
test('dead balls, handoffs, catches, kick meters and selections never queue a delayed running action', () => {
  for (const phase of ['play-call', 'final'] as const) {
    const g = game(); g.phase = phase; const c = createFootballControls();
    c.enter('f', 'juke', 0, g); c.release('f', 100);
    assert(!c.sample(100).juke); assert(!canRunningAction(g));
  }
  const g = game(); g.live!.mode = 'handoff';
  const c = createFootballControls(); c.enter('f', 'juke', 0, g); c.release('f', 10);
  g.live!.mode = 'run'; assert(!c.sample(20).juke);
});
test('return eligibility follows the actual receiving team, including kickoff phase and onside recoveries', () => {
  const g = game();
  g.phase = 'kickoff';
  g.special = { stage: 'return', receiver: 'home' } as NonNullable<typeof g.special>;
  assert(canRunningAction(g));
  g.special.returnSide = 'away'; assert(!canRunningAction(g));
  g.special.receiver = 'away'; g.special.returnSide = 'home'; assert(canRunningAction(g));
  g.special.stage = 'flight'; assert(!canRunningAction(g));
});
test('a loose ball or active tackle cannot queue a running move', () => {
  for (const blockedState of ['loose', 'tackle'] as const) {
    const g = game(); g.live!.mode = 'run';
    if (blockedState === 'loose') g.live!.loose = { x: 530, y: 96 } as NonNullable<typeof g.live.loose>;
    else g.tackleScene = {} as NonNullable<typeof g.tackleScene>;
    const c = createFootballControls();
    c.enter('blocked', 'juke', 0, g);
    assert(!canRunningAction(g)); assert(!c.sample(10).juke);
    g.tackleScene = undefined; g.live!.loose = undefined;
    c.release('blocked', 20); assert(!c.sample(21).juke);
  }
});
test('the separate field-goal meter still locks immediately without creating a running move', () => {
  for (const phase of ['live', 'kickoff'] as const) {
    const g = game(); g.phase = phase;
    g.special = { kind: 'field-goal', stage: 'hold', kicking: 'home' } as NonNullable<typeof g.special>;
    const c = createFootballControls(); c.enter('meter', 'juke', 0, g);
    const press = c.sample(10); assert(press.action); assert(!press.juke);
    c.release('meter', 30); assert(!c.sample(31).action);
    g.special.stage = 'flight';
    c.enter('airborne', 'juke', 40, g);
    assert(!c.sample(41).action);
  }
});
test('an existing teammate overlap can separate, but a new occupied corridor remains solid', () => {
  const from = { x: 500, y: 96 }, to = { x: 505, y: 88 };
  assert.deepEqual(constrainEvasionStep(from, to, [], [from]), to);
  const blocked = constrainEvasionStep(from, { x: 520, y: 85 }, [], [{ x: 517, y: 80 }]);
  assert(blocked.x < 520);
});
test('active running actions round-trip through Full Game save validation and continue identically', () => {
  const g = game(), l = g.live!;
  l.mode = 'run'; l.carrier = 6; l.time = 3;
  l.athletes[6]!.x = l.movement.player.x = 530;
  stepFootball(g, { action: true });
  assert(l.movement.moves?.active?.evasive);
  const restored = JSON.parse(JSON.stringify(g));
  assert(isFootballGame(restored), 'new optional action metadata does not invalidate saves');
  for (let i = 0; i < 40; i++) { stepFootball(g); stepFootball(restored); }
  assert.deepEqual(restored, g);
});
test('actual Classic ACTION still permits tackles; coverage is neither frozen nor made intangible', () => {
  let tackled = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const a = attempt(); a.seed = seed; defender(a, 1, 1);
    const next = stepKickAttempt(a, 0, 1 / 60, { evasion: true, juke: true });
    if (next.phase === 'tackled') tackled++;
  }
  assert(tackled >= 20, 'spin does not suppress genuine contact tackles');
});
