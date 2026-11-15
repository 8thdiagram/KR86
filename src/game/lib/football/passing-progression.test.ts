import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, stepFootball } from './engine';
import { startField, stepField } from './field';
import { createFootballControls } from './controls';
import { canForwardPass, highlightedReceiver, progression, releasePass } from './passing';
import { safeCompletionScore } from './passing-safety';
import { eligibleReceivers } from './coverage';
import { PLAYBOOK } from './playbook';
import type { FootballGame, PlayId } from './types';

function fixture(time = 0, safest = 6, play: PlayId = 'slant') {
  const g = createFootball(1234, { player: 'Big Blue', opponent: 'Redbirds' });
  g.phase = 'live'; g.spot = 40; g.live = startField(g, play, 'pass');
  const l = g.live;
  l.time = time; l.penetration!.roll = .999;
  Object.assign(l.athletes[5]!, { x: 452, y: 96 });
  l.movement.player = { x: 452, y: 96 };
  for (const a of eligibleReceivers(l))
    Object.assign(a, { x: 600,
      y: a.id === 3 ? 40 : a.id === 4 ? 96 : 155, vx: 0, vy: 0 });
  const defense = l.athletes.filter(a => a.side === 'defense');
  for (const d of defense) Object.assign(d, { x: 100, y: 28, engaged: 100, vx: 0, vy: 0 });
  eligibleReceivers(l).filter(a => a.id !== safest).forEach((a, i) => {
    Object.assign(defense[i * 2]!, { x: a.x, y: a.y, engaged: 0 });
    Object.assign(defense[i * 2 + 1]!, { x: a.x - 15, y: a.y, engaged: 0 });
  });
  const scores = eligibleReceivers(l).map(a => ({ id: a.id, score: safeCompletionScore(l, a, 'normal', .8) }));
  if (play === 'slant')
    assert.equal(scores.sort((a, b) => b.score - a.score)[0]!.id, safest, 'fixture has a different, safer target');
  return g;
}
function throwGesture(g: FootballGame, duration: number) {
  const c = createFootballControls();
  c.enter('throw', 'juke', 0, g); stepFootball(g, c.sample(0));
  c.release('throw', duration); stepFootball(g, c.sample(duration));
  return c;
}
function activateScramble() {
  const g = fixture(0, 6), c = createFootballControls();
  assert.equal(highlightedReceiver(g.live!), 3);
  c.enter('hold', 'juke', 0, g); stepFootball(g, c.sample(0));
  stepFootball(g, c.sample(1000));
  return { g, l: g.live!, c };
}

test('scenario 1: first highlighted receiver gets the lob even with receiver three safer', () => {
  const g = fixture();
  assert.equal(highlightedReceiver(g.live!), 3);
  throwGesture(g, 80);
  assert.equal(g.live!.flight!.receiver, 3); assert.equal(g.live!.flight!.type, 'normal');
});
test('scenario 2: first highlighted receiver gets the sub-second bullet', () => {
  const g = fixture(); throwGesture(g, 400);
  assert.equal(g.live!.flight!.receiver, 3); assert.equal(g.live!.flight!.type, 'bullet');
});
test('scenario 3: second highlighted receiver wins over a safer first receiver', () => {
  const g = fixture(1.2, 3);
  assert.equal(highlightedReceiver(g.live!), 4); throwGesture(g, 80);
  assert.equal(g.live!.flight!.receiver, 4);
});
test('scenario 4: third highlighted receiver wins over a safer second receiver', () => {
  const g = fixture(1.85, 4);
  assert.equal(highlightedReceiver(g.live!), 6); throwGesture(g, 80);
  assert.equal(g.live!.flight!.receiver, 6);
});
test('scenario 5: after all windows expire, both throw types choose safest receiver one, ignoring old locks', () => {
  for (const duration of [80, 400]) {
    const g = fixture(3, 3);
    assert(g.live!.time >= progression(g.live!).expires);
    g.live!.lockedReceiver = 6;
    // Hold the current coverage snapshot fixed to test selection at the exact throw.
    const c = createFootballControls();
    c.enter('throw', 'juke', 0, g); c.sample(0);
    c.release('throw', duration);
    releasePass(g, c.sample(duration).passRelease);
    assert.equal(g.live!.flight!.receiver, 3);
  }
});
test('scenario 6: holding for one full second starts forward scrambling without a pass', () => {
  const { g, l } = activateScramble();
  assert.equal(l.mode, 'scramble'); assert(l.scrambled);
  assert(l.athletes[5]!.x > 452); assert.equal(g.stats.home.attempts, 0); assert(!l.flight);
});
test('scenario 7: release then fresh press throws immediately to safest receiver three during first window', () => {
  const { g, l, c } = activateScramble();
  assert.equal(progression(l).index, 0); assert(canForwardPass(l));
  // Another finger cannot bypass releasing the activating hold.
  c.enter('other', 'juke', 1001, g); stepFootball(g, c.sample(1001));
  assert.equal(g.stats.home.attempts, 0); c.release('other', 1002);
  c.release('hold', 1010); stepFootball(g, c.sample(1010));
  c.enter('new', 'juke', 1020, g); stepFootball(g, c.sample(1020));
  assert.equal(l.flight!.receiver, 6); assert.equal(g.stats.home.attempts, 1);
  c.release('new', 1030); stepFootball(g, c.sample(1030));
  stepFootball(g, c.sample(1040)); assert.equal(g.stats.home.attempts, 1);
});
test('scenario 8: releasing the activating hold keeps running and does not throw', () => {
  const { g, l, c } = activateScramble(), x = l.athletes[5]!.x;
  c.release('hold', 1010); stepFootball(g, c.sample(1010));
  assert.equal(l.mode, 'scramble'); assert(l.athletes[5]!.x > x);
  assert.equal(g.stats.home.attempts, 0); assert(!l.flight);
});
test('scenario 9: holding across LOS then releasing has no passing or special-move effect', () => {
  const { g, l, c } = activateScramble();
  for (let i = 0; i < 100 && !l.crossedLos; i++) stepFootball(g, c.sample(1020 + i * 20));
  assert(l.crossedLos); c.release('hold', 4000); stepFootball(g, c.sample(4000));
  assert.equal(g.stats.home.attempts, 0); assert.equal(l.mode, 'scramble'); assert(!l.movement.moves?.active);
});
test('scenario 10: fresh ACTION presses after crossing evade without permitting another pass', () => {
  const { g, l, c } = activateScramble();
  l.athletes[5]!.x = 501; l.movement.player.x = 501;
  stepFootball(g, c.sample(1020)); c.release('hold', 1030); stepFootball(g, c.sample(1030));
  const x = l.athletes[5]!.x;
  for (let i = 0; i < 5; i++) {
    c.enter('again', 'juke', 1040 + i * 20, g); stepFootball(g, c.sample(1040 + i * 20));
    c.release('again', 1050 + i * 20); stepFootball(g, c.sample(1050 + i * 20));
  }
  assert(l.crossedLos); assert.equal(g.stats.home.attempts, 0); assert(l.movement.moves?.active?.evasive);
  assert(l.athletes[5]!.x > x);
  l.athletes[5]!.x = 480; assert(!canForwardPass(l), 'crossing remains latched');
});
test('scenario 11: expired progressions with no player input never throw or scramble automatically', () => {
  const g = fixture(10, 3);
  for (let i = 0; i < 60; i++) stepFootball(g, {});
  assert.equal(g.live!.mode, 'dropback'); assert(!g.live!.scrambled); assert.equal(g.stats.home.attempts, 0);
});
test('scenario 12: safety-selected passes remain contestable by actual defenders', () => {
  let stopped = 0, contested = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const g = fixture(3, 3); g.rng = seed * 617; releasePass(g, 'bullet');
    const l = g.live!, f = l.flight!;
    assert.equal(f.receiver, 3); assert(f.accuracy < 1);
    // A defender reacts to the actual flight after target selection.
    const d = l.athletes.find(a => a.side === 'defense' && a.role === 'DB')!;
    Object.assign(d, { x: f.fromX + (f.toX - f.fromX) * .55,
      y: f.fromY + (f.toY - f.fromY) * .55, vx: 0, vy: 0, engaged: 0 });
    for (let i = 0; i < 180; i++) {
      const result = stepField(g, {}, 1 / 120);
      if (result?.reason === 'incomplete' || l.flight?.deflected || l.mode === 'return') {
        stopped++; break;
      }
      if (l.passCaught) break;
    }
    if (f.contested?.length) contested++;
  }
  assert(contested > 0, 'actual defenders physically reached intelligently selected passes');
  assert(stopped > 0, 'unchanged defensive contest can stop an intelligently selected pass');
});
test('all existing passing play windows retain timing but lock the selected highlight at button-down', () => {
  for (const p of Object.values(PLAYBOOK).filter(p => p.kind === 'pass')) {
    const base = fixture(0, 6, p.id), first = Math.max(.35, p.develop - .25);
    const expires = progression(base.live!).expires;
    for (let time = 0; time < expires; time += .1) {
      const g = fixture(time, 6, p.id), receiver = highlightedReceiver(g.live!);
      releasePass(g, 'bullet', 999);
      assert.equal(g.live!.flight!.receiver, receiver, `${p.id} at ${time}`);
    }
    const g = fixture(first + .64, 6, p.id), l = g.live!, c = createFootballControls();
    const selected = highlightedReceiver(l);
    c.enter('hold', 'juke', 0, g); stepFootball(g, c.sample(0));
    stepFootball(g, c.sample(100));
    const receiver = highlightedReceiver(l);
    assert.equal(progression(l).index, 1);
    assert.equal(receiver, selected, 'the highlight stays with the button-down receiver');
    c.release('hold', 240); stepFootball(g, c.sample(240));
    assert.equal(l.flight!.receiver, selected, `${p.id} preserves the selected identity after progression changes`);
  }
});
