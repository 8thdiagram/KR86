import test from 'node:test';
import assert from 'node:assert/strict';
import { refereeRenderY, REFEREE_WORLD_Y } from '../../components/football-referee-layout';
import { broadcastViewportFrame, projectBroadcastPoint } from '../../components/football-broadcast';
import { kickFootballArt } from '../../components/kick-return-renderer';

test('landscape referees move higher and keep their feet visible without moving or shrinking the field', () => {
  for (const height of [180, 270, 320, 393, 600]) for (const topClearance of [0, 30, 38]) {
    const view = { width: 700, height, landscape: true, topClearance };
    const before = broadcastViewportFrame(view);
    const y = refereeRenderY(view, before.scale, before.offsetY);
    const projected = projectBroadcastPoint(600, y, { centerX: 600 });
    assert(y < REFEREE_WORLD_Y);
    assert((projected.y + 6) * before.scale + before.offsetY <= height - .5,
      'entire idle referee, including shoes, stays above the bottom edge');
    assert((projected.y - 20) * before.scale + before.offsetY >= topClearance,
      'raised touchdown hands stay below the HUD');
    assert.deepEqual(broadcastViewportFrame(view), before, 'no camera, field scale or sideline changes');
  }
  assert.equal(refereeRenderY(undefined, 1, 0), 185);
  assert.equal(refereeRenderY({ width: 145, height: 192, landscape: false }, 1, 0), 185);
});

test('the referee and touchdown signal move together without changing their pixel artwork', () => {
  for (const touchdown of [false, true]) {
    const record = (y: number) => {
      let offset = 0; const stack: number[] = [], fills: number[][] = [];
      const target = {
        fillStyle: '', save() { stack.push(offset); }, restore() { offset = stack.pop()!; },
        translate(_x: number, dy: number) { offset += dy; },
        fillRect(x: number, top: number, w: number, h: number) { fills.push([x, top + offset, w, h]); },
      };
      const ctx = new Proxy(target, { get: (t, k) => Reflect.has(t, k) ? Reflect.get(t, k) : () => {} }) as unknown as CanvasRenderingContext2D;
      kickFootballArt.referee(ctx, 600, 1, touchdown, y);
      assert.equal(offset, 0, 'referee translation never leaks into other artwork');
      return fills;
    };
    const original = record(185), raised = record(170);
    assert(original.length > 10);
    assert.deepEqual(raised, original.map(([x, y, w, h]) => [x, y! - 15, w, h]));
  }
});
