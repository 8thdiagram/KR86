import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, stepFootball } from './engine';
import { startField, stepField } from './field';
import { createFootballControls } from './controls';
import { DEFENSIVE_HOLD_MS, defensivePanicTarget } from './defensive-panic';
import { startNearestDive } from './defensive-action';
import { kickoffSequence, stepSpecialTeams } from './special-teams';
import { stepInterception } from './interception';
import { isFootballGame } from './storage';
import { reflectPhysicalState } from './direction';
import { OPEN_FIELD } from './athleticism';
import type { FootballGame } from './types';

const dt = 1 / 60;
function fixture() {
  const g = createFootball(86);
  g.phase = 'live'; g.possession = 'away'; g.spot = 40; g.homeOddDirection = -1;
  const l = g.live = startField(g, 'power', 'prevent');
  l.mode = 'run'; l.carrier = 6; l.time = 2; l.snapAge = .18;
  l.penetration!.roll = .999;
  for (const a of l.athletes) {
    a.x = 300; a.y = 150; a.vx = 0; a.vy = 0; a.engaged = 0;
  }
  Object.assign(l.athletes[6]!, { x: 650, y: 96, vx: 73 });
  l.movement.player = { x: 650, y: 96 };
  Object.assign(l.athletes.at(-1)!, { x: 850, y: 55, vx: -40 });
  return g;
}
const defenders = (g: FootballGame) => g.live!.athletes.filter(a => a.side === 'defense');
const deepest = (g: FootballGame) => g.live!.athletes.at(-1)!;
function hold(g: FootballGame, frames = 15) {
  for (let i = 0; i < frames; i++) assert.equal(stepField(g, { defenseHold: true }, dt), undefined);
}

test('A: quick taps launch one ordinary nearest-defender dive, never reposition or evade', () => {
  const g = fixture(), l = g.live!, c = createFootballControls();
  const near = defenders(g)[2]!;
  near.x = 685; near.y = 100;
  c.enter('touch', 'juke', 0, g);
  assert(!c.sample(0).action); assert(!c.sample(100).defenseHold);
  c.release('touch', 100);
  const tap = c.sample(100);
  assert(tap.action); assert(!tap.defenseHold && !tap.juke && !tap.hesitate);
  const ordinary = structuredClone(g);
  stepField(ordinary, { action: true }, dt);
  assert.equal(stepField(g, tap, dt), undefined);
  assert.deepEqual(g, ordinary, 'tap is exactly the ordinary manual dive input, including independent CPU evasions');
  assert.equal(near.dive?.phase, 'windup');
  assert.equal(defenders(g).filter(d => d.dive).length, 1);
  assert(!c.sample(101).action);
});

test('B: hold chooses the deepest eligible athlete once and uses bounded existing movement', () => {
  const g = fixture(), d = deepest(g), initial = { ...d };
  hold(g);
  assert(d.x > initial.x); assert(d.x - initial.x < 30);
  assert(!d.dive); assert.equal(g.tackleSounds ?? 0, 0);
  const alternative = defenders(g)[0]!;
  alternative.x = 1000;
  assert.equal(defensivePanicTarget(g.live!, true, defenders(g), { y: 96 }, 1100, 3)?.id, d.id);
  const before = { vx: d.vx, vy: d.vy };
  hold(g, 1);
  assert(Math.hypot(d.vx - before.vx, d.vy - before.vy) <= 650 * dt + 1e-6);
  assert.notEqual(alternative.id, d.id);
});

test('B: downed, committed-diving and engaged defenders are ineligible; no mid-hold replacement', () => {
  const g = fixture(), ds = defenders(g), d = deepest(g);
  assert(startNearestDive([d], { x: d.x + 20, y: d.y }, 2));
  d.dive!.phase = 'grounded';
  ds[1]!.x = 820; ds[1]!.engaged = 5;
  ds[2]!.x = 790;
  const target = defensivePanicTarget(g.live!, true, ds, { y: 96 }, 1100, 2)!;
  assert.equal(target.id, ds[2]!.id);
  ds[2]!.engaged = 5;
  assert.equal(defensivePanicTarget(g.live!, true, ds, { y: 96 }, 1100, 2), undefined);
  ds[2]!.engaged = 0;
  assert.equal(defensivePanicTarget(g.live!, true, ds, { y: 96 }, 1100, 2)!.id, target.id);
  const none = {};
  assert.equal(defensivePanicTarget(none, true, [d], { y: 96 }, 1100, 2), undefined);
  d.dive = undefined;
  assert.equal(defensivePanicTarget(none, true, [d], { y: 96 }, 1100, 2), undefined);
});

test('C: lateral destination tracks current carrier position only, with smooth turns', () => {
  const g = fixture(), d = deepest(g), runner = g.live!.athletes[6]!;
  hold(g);
  for (const y of [35, 145, 60]) {
    runner.y = g.live!.movement.player.y = y;
    runner.vy = y < 96 ? 999 : -999;
    const target = defensivePanicTarget(g.live!, true, defenders(g), runner, 1100, 3)!;
    assert.deepEqual(target, { id: d.id, x: 1100, y });
    const before = { vx: d.vx, vy: d.vy };
    hold(g, 1);
    assert(Math.hypot(d.vx - before.vx, d.vy - before.vy) <= 650 * OPEN_FIELD.acceleration * dt + 1e-6);
  }
});

test('D: first release step is exactly normal freshly evaluated CPU pursuit, with momentum retained', () => {
  const g = fixture(); hold(g);
  const normal = structuredClone(g), id = deepest(g).id;
  delete normal.live!.athletes[id]!.pursuit;
  assert.deepEqual(stepField(g, {}, dt), stepField(normal, {}, dt));
  assert.deepEqual(g, normal);
  assert.notEqual(deepest(g).pursuit!.x, 1100);
  // There is no fixed retreat duration: the first release frame changes velocity toward the runner.
  const before = deepest(g).vx;
  stepField(g, {}, dt);
  assert(deepest(g).vx < before);
});

test('E: hold-release-tap has no release tackle and admits an ordinary new dive immediately', () => {
  const g = fixture(), c = createFootballControls(), d = deepest(g);
  c.enter('touch', 'juke', 0, g);
  for (let ms = 200; ms < 450; ms += 20) stepField(g, c.sample(ms), dt);
  c.release('touch', 450);
  const release = c.sample(450);
  assert(!release.action && !release.defenseHold);
  stepField(g, release, dt); assert(!d.dive);
  const runner = g.live!.athletes[6]!;
  d.x = runner.x + 35; d.y = runner.y + 8;
  c.enter('again', 'juke', 460, g); c.release('again', 520);
  const tap = c.sample(520); assert(tap.action);
  stepField(g, tap, dt); assert.equal(d.dive?.phase, 'windup');
});

test('F: mistimed releases and holding too late still allow breakaway touchdowns', () => {
  for (const framesHeld of [0, 1, 100]) {
    const g = fixture(), l = g.live!;
    l.athletes[6]!.x = l.movement.player.x = 1095;
    for (const d of defenders(g)) { d.x = 800; d.y = 145; d.vx = 0; }
    let result;
    for (let frame = 0; frame < 30 && !result; frame++)
      result = stepField(g, { defenseHold: frame < framesHeld }, dt);
    assert.equal(result?.reason, 'touchdown');
    assert.equal(g.tackleSounds ?? 0, 0);
  }
});

test('G: a hold during the handoff still leaves ordinary execution unchanged', () => {
  for (const mode of ['handoff'] as const) {
    const g = fixture(), l = g.live!;
    l.mode = mode; l.carrier = 5; l.crossedLos = false; l.carrierCrossedLos = false;
    l.athletes[5]!.x = l.movement.player.x = 470; l.target = 100;
    if (mode === 'handoff') l.time = 0;
    const normal = structuredClone(g);
    for (let i = 0; i < (mode === 'handoff' ? 1 : 10); i++) {
      assert.deepEqual(stepField(g, { defenseHold: true }, dt), stepField(normal, {}, dt));
      assert.deepEqual(g, normal);
    }
  }
});

test('completed-pass carriers and quarterbacks beyond the line can be defended with a hold', () => {
  for (const [id, mode] of [[3, 'run'], [5, 'scramble']] as const) {
    const g = fixture(), l = g.live!;
    l.carrier = id; l.mode = mode; l.passCaught = id === 3;
    l.athletes[id]!.x = l.movement.player.x = 650;
    l.athletes[id]!.y = l.movement.player.y = 96;
    hold(g);
    assert(deepest(g).x > 850);
  }
});

test('H: holding cannot affect CPU-opponent defense, offense, ratings, saves or unrelated defenders', () => {
  const g = fixture(); g.possession = 'home'; g.live!.offense = 'home';
  const normal = structuredClone(g);
  for (let i = 0; i < 50; i++) {
    assert.deepEqual(stepField(g, { direction: -1, defenseHold: true }, dt),
      stepField(normal, { direction: -1 }, dt));
    assert.deepEqual(g, normal);
  }
  const human = fixture(), unheld = structuredClone(human);
  const profiles = structuredClone(human.profiles), stats = structuredClone(human.stats);
  hold(human, 1); stepField(unheld, {}, dt);
  for (const d of defenders(human).filter(d => d.id !== deepest(human).id))
    assert.deepEqual(d, unheld.live!.athletes[d.id]);
  assert.deepEqual(human.profiles, profiles); assert.deepEqual(human.stats, stats);
  assert(isFootballGame(JSON.parse(JSON.stringify(human))));
  assert(!/defenseHold|panic|selectedDefender/.test(JSON.stringify(human)));
});

test('hold threshold, canceled touches, drags, keyboard repeats and clear never launch an accidental dive', () => {
  for (const duration of [DEFENSIVE_HOLD_MS, 250, 3000]) {
    const g = fixture(), c = createFootballControls();
    c.enter('key', 'juke', 0, g); c.enter('key', 'juke', 100, g);
    assert(c.sample(duration).defenseHold);
    c.release('key', duration); assert(!c.sample(duration).action);
  }
  for (const cancel of ['cancel', 'drag', 'clear', 'long-unsampled', 'turnover'] as const) {
    const g = fixture(), c = createFootballControls();
    c.enter('touch', 'juke', 0, g);
    if (cancel === 'drag') c.enter('touch', null, 30, g);
    if (cancel === 'clear') c.clear();
    if (cancel === 'turnover') g.possession = 'home';
    c.release('touch', cancel === 'long-unsampled' ? 500 : 60, cancel === 'cancel');
    const s = c.sample(600); assert(!s.action && !s.defenseHold);
  }
});

test('field orientation changes do not change defender selection or goal-line geometry', () => {
  const right = fixture(), left = structuredClone(right);
  left.homeOddDirection = 1;
  for (let i = 0; i < 20; i++) {
    stepFootball(right, { defenseHold: true }); stepFootball(left, { defenseHold: true });
  }
  assert.equal(right.fieldFrame, 1); assert.equal(left.fieldFrame, -1);
  reflectPhysicalState(left.live);
  for (const a of right.live!.athletes) {
    const b = left.live!.athletes[a.id]!;
    for (const key of ['x', 'y', 'vx', 'vy'] as const) assert(Math.abs(a[key] - b[key]) < 1e-6, `${a.id}:${key}`);
  }
});

test('interception and fumble returns retreat toward the opposite goal, then resume ordinary pursuit', () => {
  for (const kind of ['interception', 'fumble'] as const) {
    const g = fixture(), l = g.live!;
    l.offense = 'home'; l.mode = 'return'; l.carrier = 11; l.returnKind = kind;
    l.interception = { catcher: 11, age: 1, catchX: 650, catchY: 96 };
    Object.assign(l.athletes[11]!, { x: 650, y: 96, vx: -73 });
    for (const a of l.athletes.filter(a => a.side === 'offense')) {
      a.x = 900; a.y = 150; a.engaged = 0;
    }
    const d = l.athletes[0]!; d.x = 400; d.y = 60; d.vx = 0;
    stepInterception(g, { defenseHold: true }, dt);
    assert(d.vx < 0);
    assert.deepEqual(defensivePanicTarget(l, true, l.athletes.filter(a => a.side === 'offense'),
      l.athletes[11]!, 100, l.time), { id: d.id, x: 100, y: l.athletes[11]!.y });
    const normal = structuredClone(g); delete normal.live!.athletes[d.id]!.pursuit;
    assert.deepEqual(stepInterception(g, {}, dt), stepInterception(normal, {}, dt));
    assert.deepEqual(g, normal);
  }
});

test('kickoff coverage holds use existing movement and release immediately without a stale goal target', () => {
  const g = createFootball(86); g.phase = 'kickoff'; g.kickReceiver = 'away';
  const s = g.special = kickoffSequence(g, 'full');
  s.stage = 'recovery'; s.stageAge = .32; s.recovery = s.returner;
  s.recoveryFrom = { x: 200, y: 96 }; s.ball = { x: 200, y: 96, z: 0 };
  stepSpecialTeams(g, {}, dt);
  assert.equal(s.stage, 'return');
  for (const d of g.returnAttempt!.defenders) {
    d.x = 500; d.y = 145; d.motion = undefined; d.dive = undefined;
  }
  const id = g.returnAttempt!.defenders.at(-1)!.id;
  g.returnAttempt!.defenders.at(-1)!.x = 850;
  for (const a of s.athletes.filter(a => a.side === 'defense' && a.id !== s.returner)) a.x = 30;
  stepSpecialTeams(g, { defenseHold: true }, dt);
  const d = g.returnAttempt!.defenders.find(d => d.id === id)!;
  assert(d.motion!.vx > 0); assert(!d.dive);
  assert.notEqual(d.motion!.targetX, 1100, 'panic destination never contaminates persisted pursuit cache');
  const normal = structuredClone(g);
  normal.returnAttempt!.defenders.find(d => d.id === id)!.motion!.reactionLeft = 0;
  assert.deepEqual(stepSpecialTeams(g, {}, dt), stepSpecialTeams(normal, {}, dt));
  assert.deepEqual(g, normal);
});
