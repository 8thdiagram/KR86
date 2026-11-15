import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { beginTackle, stepTackleScene, TACKLE_TIMING } from './tackle-scene';
import type { TackleScene } from './types';

function scene(space: TackleScene['space'] = 'scrimmage') {
  const g = createFootball(86);
  beginTackle(g, { id: 0, x: 500, y: 96, vx: 40 },
    { id: 7, x: 503, y: 98 }, 'home', space);
  return g.tackleScene!;
}

test('every tackle presentation holds downed players for 0.7 seconds after the complete fall', () => {
  assert.deepEqual(TACKLE_TIMING, { impact: .09, fall: .27, groundHold: .7 });
  for (const space of ['scrimmage', 'special', 'legacy-return'] as const) {
    const s = scene(space);
    assert.equal(stepTackleScene(s, .09), false);
    assert.equal(s.phase, 'fall');
    assert.equal(stepTackleScene(s, .27), false);
    assert.equal(s.phase, 'ground');
    assert.equal(s.holdRemaining, .7);
    assert.equal(stepTackleScene(s, .699), false);
    assert.equal(stepTackleScene(s, .001), true);
    assert(s.holdRemaining < 1e-9);
  }
});

test('different frame rates and a single large delta preserve the same tackle duration', () => {
  for (const fps of [30, 60, 120]) {
    const s = scene();
    let elapsed = 0;
    while (!stepTackleScene(s, 1 / fps)) {
      elapsed += 1 / fps;
      assert(elapsed < 2, 'presentation must complete');
    }
    elapsed += 1 / fps;
    assert(Math.abs(elapsed - 1.06) <= 1 / fps + 1e-9);
  }
  assert.equal(stepTackleScene(scene(), 1.059), false);
  assert.equal(stepTackleScene(scene(), 1.06), true);
});

test('a suspended ground hold does not consume any of the 0.7-second pause', () => {
  const s = scene();
  stepTackleScene(s, .36);
  assert.equal(stepTackleScene(s, 5, false), false);
  assert.equal(s.holdRemaining, .7);
  assert.equal(stepTackleScene(s, .7), true);
});
