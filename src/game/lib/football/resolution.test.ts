import test from 'node:test';
import assert from 'node:assert/strict';
import { FOOTBALL_PIXEL_DENSITY, highResolutionContext, prepareFootballCanvas } from '../../components/football-resolution';
import { slim } from '../../components/football-sprites';
import { uniformKit } from '../../components/football-art';
import { KICK_TEAMS } from '../kick-return-teams';
import { broadcastFieldContext } from '../../components/football-broadcast';
import { drawKickReturn } from '../../components/kick-return-renderer';

function rawContext() {
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: typeof m[] = [], paints: { x: number; y: number; w: number; h: number }[] = [];
  const raw = {
    fillStyle: '', imageSmoothingEnabled: true,
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { m = { a, b, c, d, e, f }; },
    getTransform: () => ({ ...m }),
    save() { stack.push({ ...m }); },
    restore() { m = stack.pop()!; },
    translate(x: number, y: number) { m.e += m.a * x; m.f += m.d * y; },
    fillRect(x: number, y: number, w: number, h: number) {
      paints.push({ x: m.a * x + m.e, y: m.d * y + m.f, w: m.a * w, h: m.d * h });
    },
  } as unknown as CanvasRenderingContext2D;
  return { raw, paints };
}

test('16-bit backing resolution doubles pixels without changing logical viewport or CSS dimensions', () => {
  const { raw } = rawContext();
  const canvas = { width: 320, height: 192, style: { width: '100%', height: '100%' }, getContext: () => raw } as unknown as HTMLCanvasElement;
  const ctx = prepareFootballCanvas(canvas, 320, 192)!;
  assert.equal(FOOTBALL_PIXEL_DENSITY, 2);
  assert.equal(canvas.width, 640); assert.equal(canvas.height, 384);
  assert.equal(canvas.style.width, '100%'); assert.equal(canvas.style.height, '100%');
  assert.equal(raw.imageSmoothingEnabled, false);
  assert.equal(prepareFootballCanvas(canvas, 320, 192), ctx);
  assert.equal(highResolutionContext(ctx), ctx, 'never stack density adapters');
});

test('all renderer setTransform/resetTransform calls retain density exactly once', () => {
  const { raw } = rawContext(), ctx = highResolutionContext(raw);
  ctx.setTransform(1.5, 0, 0, 1.5, -150, 7);
  assert.deepEqual(raw.getTransform(), { a: 3, b: 0, c: 0, d: 3, e: -300, f: 14 });
  ctx.setTransform({ a: 2, d: 2, e: 10 });
  assert.deepEqual(raw.getTransform(), { a: 4, b: 0, c: 0, d: 4, e: 20, f: 0 });
  ctx.resetTransform();
  assert.deepEqual(raw.getTransform(), { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
});

test('longer-legged player proportions use finer contours without moving player foot anchors', () => {
  for (const dir of [-1, 1] as const) {
    const { raw, paints } = rawContext(), ctx = highResolutionContext(raw);
    ctx.resetTransform();
    slim(ctx, 100, 100, uniformKit(KICK_TEAMS[0]!, dir));
    assert.equal(Math.min(...paints.map(p => p.y)), 175, 'the smaller silhouette retains its fine native crown and longer legs');
    assert.equal(Math.max(...paints.map(p => p.y + p.h)), 214, 'original logical ground anchor Y107');
    assert(paints.some(p => p.w === 1 || p.h === 1), 'new half-world-pixel detail survives in the real backing buffer');
    for (const p of paints) for (const n of Object.values(p)) assert(Number.isInteger(n));
  }
});

test('the stronger field perspective stays pixel sharp through the density adapter', () => {
  const { raw, paints } = rawContext(), ctx = highResolutionContext(raw);
  ctx.setTransform(1.75, 0, 0, 1.75, -400.4, 21.1);
  broadcastFieldContext(ctx, { centerX: 600 }).fillRect(500, 18, 2, 156);
  assert(paints.length > 500);
  for (const p of paints) for (const n of Object.values(p))
    assert(Math.abs(n - Math.round(n)) < 1e-8);
});

test('Classic screen-space banners remain centered at high density in either orientation', () => {
  for (const [width, height] of [[393, 500], [700, 320]]) {
    const { raw, paints } = rawContext();
    const target = new Proxy(raw, {
      get: (t, key) => Reflect.has(t, key) ? Reflect.get(t, key) : () => {},
    });
    const before = raw.getTransform();
    drawKickReturn(highResolutionContext(target), null, 0, false, { width: width!, height: height!, landscape: width! > height! });
    const board = paints.find(p => p.w === 290 && p.h === 54);
    assert(board, 'the full-size banner uses doubled backing pixels, not half-size raw coordinates');
    assert.equal(board.x + board.w / 2, width, 'banner center matches the physical canvas center');
    assert(board.x >= 0 && board.x + board.w <= width! * 2);
    assert.deepEqual(raw.getTransform(), before, 'overlay transform does not leak to the next frame');
  }
});
