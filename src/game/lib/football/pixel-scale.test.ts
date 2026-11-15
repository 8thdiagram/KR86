import test from 'node:test';
import assert from 'node:assert/strict';
import { drawPixelEnlarged, PLAYER_ART_SCALE, sharpPixelRect } from '../../components/football-pixel-scale';

test('smaller native-sized player pixels retain shared edges and fixed foot anchors without canvas readback', () => {
  const rects: number[][] = [];
  const drawing = {
    fillStyle: '',
    fillRect(...rect: number[]) { rects.push(rect); },
    getImageData() { throw Error('player drawing must not read the canvas on every frame'); },
  };
  const ctx = drawing as unknown as CanvasRenderingContext2D;
  drawPixelEnlarged(ctx, 100.2, 100.1, (pixels, x, y) => {
    assert.equal(x, 100); assert.equal(y, 100);
    pixels.fillStyle = '#ff0000';
    pixels.fillRect(x - 8, y - 10, 8, 16);
    pixels.fillRect(x, y - 10, 8, 16);
  }, 6);
  assert.equal(PLAYER_ART_SCALE, 1);
  assert(PLAYER_ART_SCALE / 1.125 < .9, 'players are about eleven percent smaller than the former magnification');
  assert.deepEqual(rects, [[92, 90, 8, 16], [100, 90, 8, 16]]);
  assert.equal(rects[0]![1]! + rects[0]![3]!, 106, 'feet do not slide');
  assert.equal(rects[0]![0]! + rects[0]![2]!, rects[1]![0], 'adjacent pixels do not separate');
  assert.equal(drawing.fillStyle, '#ff0000', 'styles are forwarded to the real context');
  assert.equal(ctx.fillRect, drawing.fillRect, 'native context methods are never replaced');
});

test('canvas pixel edges stay integral with zoom, subpixel camera offsets and mirrored views', () => {
  for (const a of [1, 1.4, 2.35, -2.35]) {
    const m = { a, b: 0, c: 0, d: 1.65, e: .37, f: .62 };
    const rects: number[][] = [];
    const ctx = { getTransform: () => m, fillRect: (...r: number[]) => rects.push(r) } as unknown as CanvasRenderingContext2D;
    sharpPixelRect(ctx, 4, 6, 2, 3);
    const [x, y, w, h] = rects[0]!;
    for (const edge of [m.a * x! + m.e, m.a * (x! + w!) + m.e,
      m.d * y! + m.f, m.d * (y! + h!) + m.f])
      assert(Math.abs(edge - Math.round(edge)) < 1e-9, 'no antialiased half-pixel edges');
  }
});
