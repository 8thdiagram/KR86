import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureSpin } from './spin-verification';
import { EVADE } from '../game/lib/carrier-evasion';

test('the visible spin proof records real running input, a persistent destination and both world-coordinate lane changes', () => {
  for (const side of [-1, 1] as const) {
    const result = measureSpin(side);
    const active = result.frames[1].moves!.active!;
    assert.equal(active.startY, result.original.y);
    assert.equal(active.targetY, result.original.y + side * EVADE.bodyWidth);
    assert.equal(result.selected, `spin:${side}`);
    assert(Math.abs(result.actual - result.intended) < .001);
    assert.equal(result.resumed.y, result.final.y);
    assert(result.resumed.x > result.final.x && result.final.x > result.original.x);
  }
});
