import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, stepFootball } from './engine';
import { startField, stepField, routePoint, routeComplete } from './field';
import { createFootballControls } from './controls';
import { canForwardPass, PASS_HOLD_MS, QB_SCRAMBLE_MS, releasePass, scramblePoint } from './passing';
import { safeCompletionScore } from './passing-safety';
import { eligibleReceivers } from './coverage';
import { stepDefense } from './pursuit';
import type { Defense } from './types';

function fixture(play: 'slant' | 'verticals' = 'slant') {
  const g = createFootball(1234, { player: 'Big Blue', opponent: 'Redbirds' });
  g.phase = 'live'; g.spot = 40; g.live = startField(g, play, 'pass');
  g.live.penetration!.roll = .999;
  for (const d of g.live.athletes.filter(a => a.side === 'defense')) {
    d.x = 1100; d.y = 28; d.engaged = 100;
  }
  return g;
}
test('Action timing boundaries produce exactly one lob, bullet, or manual scramble without a throw', () => {
  assert.equal(PASS_HOLD_MS, 220); assert.equal(QB_SCRAMBLE_MS, 1000);
  for (const duration of [1, 219, 220, 999, 1000, 1001]) {
    const g = fixture(), c = createFootballControls();
    c.enter('finger', 'juke', 0, g);
    stepFootball(g, c.sample(0));
    c.release('finger', duration);
    const s = c.sample(duration);
    assert.equal(s.qbScramble, duration >= 1000);
    assert(!s.action && !s.juke && !s.hesitate);
    stepFootball(g, s);
    assert.equal(g.stats.home.attempts, duration >= 1000 ? 0 : 1);
    if (duration >= 1000) {
      assert.equal(g.live!.mode, 'scramble'); assert(!g.live!.flight);
    } else assert.equal(g.live!.flight!.type, duration < 220 ? 'normal' : 'bullet');
    stepFootball(g, c.sample(duration + 16));
    assert.equal(g.stats.home.attempts, duration >= 1000 ? 0 : 1);
  }
});
test('one-second hold starts running; release does not throw; a fresh pre-LOS press throws once', () => {
  const g = fixture(), l = g.live!, c = createFootballControls();
  c.enter('finger', 'juke', 0, g);
  for (let ms = 0; ms < 1000; ms += 20) stepFootball(g, c.sample(ms));
  assert.equal(l.mode, 'dropback');
  const x = l.athletes[5]!.x;
  stepFootball(g, c.sample(1000));
  assert.equal(l.mode, 'scramble'); assert(l.athletes[5]!.x > x);
  assert.equal(g.stats.home.attempts, 0); assert(canForwardPass(l));
  c.release('finger', 1010);
  stepFootball(g, c.sample(1010));
  assert.equal(l.mode, 'scramble'); assert.equal(g.stats.home.attempts, 0);
  c.enter('again', 'juke', 1020, g);
  stepFootball(g, c.sample(1020));
  assert.equal(l.mode, 'flight'); assert.equal(g.stats.home.attempts, 1);
  c.release('again', 1030); stepFootball(g, c.sample(1030));
  assert.equal(g.stats.home.attempts, 1);
});
test('crossing LOS commits the QB: release, new press and special-move inputs have no effect', () => {
  const g = fixture(), l = g.live!, c = createFootballControls();
  c.enter('finger', 'juke', 0, g); stepFootball(g, c.sample(0));
  stepFootball(g, c.sample(1000));
  for (let i = 0; i < 100 && !l.crossedLos; i++) stepFootball(g, c.sample(1020 + i * 20));
  assert(l.crossedLos); assert.equal(g.stats.home.attempts, 0);
  c.release('finger', 4000); stepFootball(g, c.sample(4000));
  c.enter('again', 'juke', 4100, g); c.release('again', 4500);
  stepFootball(g, c.sample(4500));
  stepFootball(g, { action: true, juke: true, hesitate: true });
  assert.equal(l.mode, 'scramble'); assert.equal(g.stats.home.attempts, 0);
  assert(!l.movement.moves?.active);
});
test('route expiry, pressure and elapsed time never initiate a human pass or scramble', () => {
  const g = fixture(), l = g.live!;
  l.time = 20; l.pressure = 2;
  for (let i = 0; i < 120; i++) stepField(g, {}, 1 / 60);
  assert.equal(l.mode, 'dropback'); assert.equal(g.stats.home.attempts, 0);
  assert.equal(l.carrier, 5); assert(!l.scrambled);
});
test('canceled holds, non-consuming samples and duplicate release events do not throw or double-start', () => {
  const g = fixture(), c = createFootballControls();
  c.enter('f', 'juke', 0, g); stepFootball(g, c.sample(0));
  assert(c.sample(1000, false).qbScramble);
  assert(c.sample(1000).qbScramble);
  assert(!c.sample(1010).qbScramble);
  c.release('f', 1100, true); c.release('f', 1100);
  assert(!c.sample(1100).passRelease);
  c.clear(); assert(!c.sample(1200).qbScramble);
});
test('receivers keep designed routes until reaching their own endpoint, then work back into space', () => {
  const g = fixture(), l = g.live!, a = l.athletes[3]!;
  l.time = 5;
  assert(!routeComplete(l, a), 'elapsed QB progression alone cannot terminate the route');
  const end = routePoint({ ...l, time: 60 }, a);
  a.x = end.x; a.y = end.y;
  assert(routeComplete(l, a));
  const p = scramblePoint(l, a);
  assert(p.x < a.x, 'with no coverage obstacle, work toward the QB');
  const again = scramblePoint(l, a);
  assert.deepEqual(again, p, 'hold a smooth destination instead of frame-by-frame zigzags');
  const before = { x: a.x, y: a.y };
  stepField(g, {}, 1 / 60);
  assert(a.x < before.x);
  assert(Math.hypot(a.x - before.x, a.y - before.y) < 2);
});
test('a deep receiver who has beaten coverage keeps running downfield', () => {
  const g = fixture('verticals'), l = g.live!, a = l.athletes[3]!;
  l.time = 7; a.x = 850; a.y = 40;
  for (const d of l.athletes.filter(d => d.side === 'defense')) { d.x = 800; d.y = 40; }
  assert(scramblePoint(l, a).x > a.x);
});
test('safe selection can choose intermediate or deep instead of nearest, widest current gap or longest route', () => {
  for (const safest of [4, 6]) {
    const g = fixture(), l = g.live!; l.mode = 'scramble'; l.scrambled = true; l.time = 5;
    const receivers = eligibleReceivers(l);
    for (const a of receivers) {
      a.x = a.id === 3 ? 540 : a.id === 4 ? 650 : 850;
      a.y = a.id === 3 ? 40 : a.id === 4 ? 96 : 155; a.vx = a.vy = 0;
    }
    const defense = l.athletes.filter(d => d.side === 'defense');
    for (const d of defense) { d.x = 100; d.y = 28; d.engaged = 0; d.vx = d.vy = 0; }
    const unsafe = receivers.filter(a => a.id !== safest);
    unsafe.forEach((a, i) => { Object.assign(defense[i]!, { x: a.x - 4, y: a.y }); });
    releasePass(g, 'normal');
    assert.equal(l.flight!.receiver, safest);
  }
});
test('moving defenders, flight time and low bullet lanes affect safety without altering flight physics', () => {
  const g = fixture(), l = g.live!, a = l.athletes[3]!;
  a.x = 800; a.y = 96; a.vx = a.vy = 0;
  const d = l.athletes[11]!;
  Object.assign(d, { x: 800, y: 25, vx: 0, vy: 60, engaged: 0 });
  const closing = safeCompletionScore(l, a, 'normal', .8);
  d.vy = -60;
  assert(safeCompletionScore(l, a, 'normal', .8) > closing);
  Object.assign(d, { x: 650, y: 96, vx: 0, vy: 0 });
  assert(safeCompletionScore(l, a, 'normal', .8) > safeCompletionScore(l, a, 'bullet', .8));
});
test('the largest visible separation loses to a safer intermediate target when its defender can close', () => {
  const g = fixture(), l = g.live!;
  l.mode = 'scramble'; l.scrambled = true; l.time = 5;
  Object.assign(l.athletes[5]!, { x: 460, y: 96 });
  for (const d of l.athletes.filter(a => a.side === 'defense'))
    Object.assign(d, { x: 100, y: 28, engaged: 0, vx: 0, vy: 0 });
  for (const [id, x, y] of [[3, 540, 40], [4, 650, 96], [6, 850, 155]])
    Object.assign(l.athletes[id!]!, { x, y, vx: 0, vy: 0 });
  Object.assign(l.athletes[7]!, { x: 540, y: 40 });
  Object.assign(l.athletes[8]!, { x: 650, y: 60, vy: -60 });
  Object.assign(l.athletes[9]!, { x: 850, y: 80, vy: 60 });
  const gap = (id: number) => Math.min(...l.athletes.filter(d => d.side === 'defense')
    .map(d => Math.hypot(d.x - l.athletes[id]!.x, d.y - l.athletes[id]!.y)));
  assert(gap(6) > gap(4));
  releasePass(g, 'normal');
  assert.equal(l.flight!.receiver, 4, 'not the nearest, deepest, or most separated at release');
});
for (const defense of ['pass', 'man', 'blitz', 'prevent'] as Defense[]) {
  test(`${defense}: coverage assignments survive a behind-line scramble and become pursuit at crossing`, () => {
    const g = fixture(); g.live = startField(g, 'verticals', defense);
    const l = g.live, qb = l.athletes[5]!, los = 500;
    l.time = 5; l.mode = 'scramble'; l.scrambled = true;
    for (const d of l.athletes.filter(a => a.side === 'defense')) d.engaged = 0;
    stepDefense(g, 1 / 60);
    const cover = l.athletes.filter(a => a.side === 'defense' &&
      (a.role === 'DB' || a.role === 'LB' && !['blitz'].includes(defense)));
    for (const d of cover) assert(['cover', 'deep'].includes(d.pursuit!.role));
    qb.x = los; stepDefense(g, 1 / 60);
    for (const d of cover) assert.equal(d.pursuit!.role, 'tackle');
  });
}
