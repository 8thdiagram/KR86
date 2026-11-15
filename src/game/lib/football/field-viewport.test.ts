import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldViewportFrame } from '../kick-return-viewport';
import { kickRenderCamera } from '../../components/kick-return-renderer';
import { broadcastViewportFrame } from '../../components/football-broadcast';

test('field shifts below the HUD at full scale whenever the referee apron has enough room', () => {
  for (const height of [280, 320, 390, 430, 600]) for (const topClearance of [30, 34, 38]) {
    const { scale, offsetY } = fieldViewportFrame({ width: 800, height, topClearance });
    const normal = height / 192;
    if (topClearance <= height - 160 * normal) assert.equal(scale, normal);
    assert(16 * scale + offsetY >= topClearance - 1e-8, 'far stripe must clear the scoreboard');
    assert(176 * scale + offsetY <= height + 1e-8, 'near stripe must stay visible');
    assert(scale <= normal, 'never enlarge the field');
  }
});

test('short layouts shrink only the minimum needed to fit both sidelines below the HUD', () => {
  for (const height of [160, 180, 200]) {
    const topClearance = 34;
    const { scale, offsetY } = fieldViewportFrame({ width: 600, height, topClearance });
    assert(Math.abs(16 * scale + offsetY - topClearance) < 1e-8);
    assert(Math.abs(176 * scale + offsetY - height) < 1e-8);
    assert(scale >= height / 192 * .94, 'even the short fixture keeps at least 94% of the former scale');
  }
});

test('portrait and Classic without an overlay keep the original scale and vertical position', () => {
  for (const height of [192, 280, 390]) {
    const frame = fieldViewportFrame({ width: 600, height });
    assert.equal(frame.scale, height / 192); assert.equal(frame.offsetY, 0);
    const camera = kickRenderCamera(null, 600, true, { width: 600, height, landscape: true });
    assert.equal(camera.scale, frame.scale); assert.equal(camera.offY, 0);
  }
});

test('historical Full Game kickoff rendering uses the same scoreboard clearance', () => {
  const view = { width: 700, height: 300, landscape: true, topClearance: 34 };
  const frame = broadcastViewportFrame(view), camera = kickRenderCamera(null, view.width, true, view);
  assert.equal(camera.scale, frame.scale); assert.equal(camera.offY, frame.offsetY);
});
