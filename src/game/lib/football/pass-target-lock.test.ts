import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, stepFootball, FULL_GAME_SPEED } from './engine';
import { startField, stepField } from './field';
import { createFootballControls } from './controls';
import { canForwardPass, highlightedReceiver, progression } from './passing';
import { passProjection } from './passing-safety';
import { finishAuditPass } from '../../../scripts/football-receiving-audit';
import type { FootballGame } from './types';

function fixture(time = .95) {
  const g = createFootball(1234, { player: 'Big Blue', opponent: 'Redbirds' });
  g.phase = 'live'; g.spot = 40; g.clutchActive = false; g.live = startField(g, 'slant', 'pass');
  g.live.time = time; g.live.penetration!.roll = .999;
  for (const d of g.live.athletes.filter(a => a.side === 'defense'))
    Object.assign(d, { x: 1100, y: 28, vx: 0, vy: 0, engaged: 100 });
  return g;
}
type Controls = ReturnType<typeof createFootballControls>;
function hold(g: FootballGame, c: Controls, until: number) {
  for (let ms = 10; ms <= until; ms += 10)
    stepFootball(g, c.sample(ms), .01, FULL_GAME_SPEED);
}
function gesture(time: number, duration: number, id = 'pointer:7') {
  const g = fixture(time), l = g.live!, c = createFootballControls();
  const selected = highlightedReceiver(l);
  c.enter(id, 'juke', 0, g);
  assert.equal(c.sample(0, false).passTarget, selected);
  stepFootball(g, c.sample(0), .001, FULL_GAME_SPEED);
  hold(g, c, duration);
  c.release(id, duration);
  stepFootball(g, c.sample(duration), .001, FULL_GAME_SPEED);
  return { g, l, c, selected };
}
test('TEST 1 — receiver 1 lob uses the button-down receiver', () => {
  const { l } = gesture(.95, 80);
  assert.equal(l.flight!.receiver, 3); assert.equal(l.flight!.type, 'normal');
});
test('TEST 2 — receiver 1 bullet stays locked after its normal window expires', () => {
  const { l } = gesture(.95, 600);
  assert.equal(progression(l).receiver, 4);
  assert.equal(l.flight!.receiver, 3); assert.equal(l.flight!.type, 'bullet');
});
test('TEST 3 — receiver 2 lob never substitutes another read', () => {
  const { l } = gesture(1.6, 80);
  assert.equal(l.flight!.receiver, 4); assert.equal(l.flight!.type, 'normal');
});
test('TEST 4 — receiver 2 bullet stays locked as progression advances to receiver 3', () => {
  const { l } = gesture(1.6, 600);
  assert.equal(progression(l).receiver, 6);
  assert.equal(l.flight!.receiver, 4); assert.equal(l.flight!.type, 'bullet');
});
test('TEST 5 — receiver 3 remains selected after the entire sequence expires', () => {
  const { l } = gesture(2.3, 600);
  assert(l.time > progression(l).expires);
  assert.equal(l.flight!.receiver, 6);
});
test('TEST 6 — a wide-open alternative cannot override the highlighted identity', () => {
  const g = fixture(), l = g.live!, c = createFootballControls();
  Object.assign(l.athletes[11]!, { x: l.athletes[3]!.x, y: l.athletes[3]!.y, engaged: 0 });
  assert.equal(highlightedReceiver(l), 3);
  c.enter('pointer:1', 'juke', 0, g); stepFootball(g, c.sample(0));
  c.release('pointer:1', 80); stepFootball(g, c.sample(80));
  assert.equal(l.flight!.receiver, 3);
});
test('TEST 7 — expired progression has no highlight and uses unchanged intelligent selection', () => {
  const g = fixture(3), expected = structuredClone(g), c = createFootballControls();
  assert.equal(highlightedReceiver(g.live!), undefined);
  c.enter('pointer:1', 'juke', 0, g); stepFootball(g, c.sample(0));
  assert.equal(g.live!.lockedReceiver, undefined);
  Object.assign(expected, structuredClone(g));
  stepFootball(expected, { passRelease: 'normal' });
  c.release('pointer:1', 80); stepFootball(g, c.sample(80));
  assert.equal(g.live!.flight!.receiver, expected.live!.flight!.receiver);
});
test('TEST 8 — one second starts scrambling, cancels the target and never throws', () => {
  const g = fixture(), c = createFootballControls();
  c.enter('pointer:1', 'juke', 0, g); stepFootball(g, c.sample(0));
  assert.equal(g.live!.lockedReceiver, 3);
  stepFootball(g, c.sample(1000));
  assert.equal(g.live!.mode, 'scramble');
  assert.equal(g.live!.holdingPass, false);
  assert.equal(g.live!.lockedReceiver, undefined);
  assert.equal(highlightedReceiver(g.live!), undefined);
  assert.equal(g.stats.home.attempts, 0);
});
test('TEST 9 — releasing the scramble hold does not throw; a fresh press uses safety selection', () => {
  const g = fixture(), c = createFootballControls();
  c.enter('pointer:1', 'juke', 0, g); stepFootball(g, c.sample(0));
  stepFootball(g, c.sample(1000));
  c.release('pointer:1', 1001); stepFootball(g, c.sample(1001));
  assert.equal(g.stats.home.attempts, 0);
  assert.equal(highlightedReceiver(g.live!), undefined);
  const expected = structuredClone(g); stepFootball(expected, { action: true });
  c.enter('pointer:2', 'juke', 1010, g); stepFootball(g, c.sample(1010));
  assert.equal(g.stats.home.attempts, 1);
  assert.equal(g.live!.flight!.receiver, expected.live!.flight!.receiver);
});
test('TEST 10 — crossing during an unresolved hold cancels eligibility and cannot throw', () => {
  const g = fixture(), l = g.live!, c = createFootballControls();
  c.enter('pointer:1', 'juke', 0, g); stepFootball(g, c.sample(0));
  stepFootball(g, c.sample(1000));
  l.athletes[5]!.x = 501; l.movement.player.x = 501;
  stepFootball(g, c.sample(1010));
  assert(l.crossedLos); assert(!canForwardPass(l));
  c.release('pointer:1', 1020); stepFootball(g, c.sample(1020));
  c.enter('pointer:2', 'juke', 1030, g); stepFootball(g, c.sample(1030));
  assert.equal(l.lockedReceiver, undefined); assert.equal(g.stats.home.attempts, 0);
  assert(!l.movement.moves?.active);
});
test('TEST 11 — every held frame shows the locked receiver despite advancing progression', () => {
  const g = fixture(), c = createFootballControls(), l = g.live!;
  c.enter('pointer:1', 'juke', 0, g); stepFootball(g, c.sample(0));
  for (let ms = 10; ms < 900; ms += 10) {
    stepFootball(g, c.sample(ms), .01, FULL_GAME_SPEED);
    assert.equal(highlightedReceiver(l), 3);
  }
  assert.notEqual(progression(l).receiver, 3);
  c.release('pointer:1', 900); stepFootball(g, c.sample(900));
  assert.equal(l.flight!.receiver, 3);
  assert.equal(l.lockedReceiver, undefined); assert(!l.holdingPass);
});
test('TEST 12 — the receiver moves during the hold and is led from current, not button-down coordinates', () => {
  const g = fixture(), l = g.live!, c = createFootballControls(), a = l.athletes[3]!;
  const initial = { x: a.x, y: a.y };
  c.enter('pointer:1', 'juke', 0, g); stepFootball(g, c.sample(0));
  hold(g, c, 600);
  assert(Math.hypot(a.x - initial.x, a.y - initial.y) > 10);
  c.release('pointer:1', 600); stepFootball(g, c.sample(600), .001, FULL_GAME_SPEED);
  const f = l.flight!, projection = passProjection(l, a, 'bullet');
  assert.equal(f.receiver, 3);
  assert(Math.abs(f.aimX! - projection.x) < 1e-6);
  assert(Math.abs(f.aimY! - projection.y) < 1e-6);
  assert(Math.abs(f.duration - projection.duration) < 1e-8);
});
test('TEST 13 — touch-pointer and keyboard control paths both capture button-down identity', () => {
  for (const id of ['pointer:1', 'pointer:47', 'key:Space', 'key:KeyJ', 'accessible-action']) {
    const { l } = gesture(.95, 600, id);
    assert.equal(l.flight!.receiver, 3, id);
  }
});
test('TEST 14 — target identity and classification survive all timing boundaries', () => {
  for (const duration of [0, 219, 220, 221, 998, 999, 1000, 1001]) {
    const { g, l } = gesture(.95, duration);
    if (duration < 1000) {
      assert.equal(l.flight!.receiver, 3);
      assert.equal(l.flight!.type, duration < 220 ? 'normal' : 'bullet');
      assert.equal(g.stats.home.attempts, 1);
    } else {
      assert.equal(l.mode, 'scramble'); assert(!l.flight);
      assert.equal(l.lockedReceiver, undefined); assert.equal(g.stats.home.attempts, 0);
    }
  }
});
test('TEST 15 — progression and ACTION changes in flight never redirect the intended receiver', () => {
  let catches = 0, failures = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const { g, l } = gesture(2.3, 600), f = l.flight!;
    g.rng = seed * 617;
    assert.equal(f.receiver, 6); assert(l.time > progression(l).expires);
    for (let frame = 0; frame < 3; frame++) {
      stepField(g, { passPress: true, passTarget: 4, passRelease: 'bullet', action: true, qbScramble: true }, 1 / 120);
      assert.equal(f.receiver, 6); assert.equal(g.stats.home.attempts, 1);
    }
    const result = finishAuditPass(g);
    assert.equal(f.receiver, 6); assert.equal(result.receiver, 6);
    catches += Number(result.outcome === 'catch'); failures += Number(result.outcome !== 'catch');
  }
  assert(catches > 0); assert(failures > 0, 'identity lock does not guarantee a catch');
});
test('button-down capture beats a progression boundary before the first simulation sample', () => {
  const g = fixture(1.049), c = createFootballControls();
  assert.equal(highlightedReceiver(g.live!), 3);
  c.enter('pointer:1', 'juke', 0, g);
  g.live!.time = 1.1; // Next fixed simulation step sees the newer read.
  c.enter('pointer:1', 'juke', 20, g); // Duplicate/move must not recapture.
  stepFootball(g, c.sample(20));
  assert.equal(highlightedReceiver(g.live!), 3);
  c.release('pointer:1', 80); stepFootball(g, c.sample(80));
  assert.equal(g.live!.flight!.receiver, 3);
});
test('press and release between frames retain the captured target', () => {
  const g = fixture(1.049), c = createFootballControls();
  c.enter('pointer:1', 'juke', 0, g);
  c.release('pointer:1', 80); g.live!.time = 1.1;
  stepFootball(g, c.sample(80));
  assert.equal(g.live!.flight!.receiver, 3);
});
test('canceling a hold clears selection and the next gesture captures the current highlight', () => {
  const g = fixture(), c = createFootballControls();
  c.enter('pointer:1', 'juke', 0, g); stepFootball(g, c.sample(0));
  hold(g, c, 500);
  c.release('pointer:1', 500, true); stepFootball(g, c.sample(500));
  assert.equal(g.stats.home.attempts, 0); assert.equal(g.live!.lockedReceiver, undefined);
  const selected = highlightedReceiver(g.live!);
  assert.notEqual(selected, 3);
  c.enter('pointer:2', 'juke', 510, g); stepFootball(g, c.sample(510));
  c.release('pointer:2', 590); stepFootball(g, c.sample(590));
  assert.equal(g.live!.flight!.receiver, selected);
});
test('an ACTION press during the snap retains its target before the snap early return', () => {
  const g = fixture(), c = createFootballControls();
  g.live!.snapAge = 0;
  c.enter('pointer:1', 'juke', 0, g); stepFootball(g, c.sample(0));
  assert.equal(g.live!.lockedReceiver, 3);
  assert.equal(highlightedReceiver(g.live!), 3);
});
