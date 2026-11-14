import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_TARGET_CENTER, PLAYER_TARGET_PIXELS, PLAYER_TARGET_WHITE, PLAYER_TARGET_YELLOW } from './player-target';

test('shared target is exactly the existing offense eight-rectangle symbol, not a new circle or dashed outline', () => {
  assert.deepEqual(PLAYER_TARGET_PIXELS, [
    [-8, -16, 1, 5], [-8, 2, 1, 5], [-8, -16, 4, 1], [-8, 6, 4, 1],
    [8, -16, 1, 5], [8, 2, 1, 5], [5, -16, 4, 1], [5, 6, 4, 1],
  ]);
  const left = Math.min(...PLAYER_TARGET_PIXELS.map(r => r[0]));
  const right = Math.max(...PLAYER_TARGET_PIXELS.map(r => r[0] + r[2]));
  const top = Math.min(...PLAYER_TARGET_PIXELS.map(r => r[1]));
  const bottom = Math.max(...PLAYER_TARGET_PIXELS.map(r => r[1] + r[3]));
  assert.equal((left + right) / 2 - PLAYER_TARGET_CENTER.x, 0);
  assert.equal((top + bottom) / 2 - PLAYER_TARGET_CENTER.y, 0);
  assert.equal(PLAYER_TARGET_WHITE, '#f1e6d0');
  assert.equal(PLAYER_TARGET_YELLOW, '#f4d23c');
});
