import test from 'node:test';
import assert from 'node:assert/strict';
import { BROADCAST, projectBroadcastPoint, broadcastVisibleRange, broadcastFieldContext, withBroadcastAnchor, withBroadcastWorld, broadcastViewportFrame } from '../../components/football-broadcast';
import { fieldViewportFrame } from '../kick-return-viewport';
import { drawFootballBall } from '../../components/football-art';
import { drawBroadcastStadium } from '../../components/football-stadium-art';
import { drawDeluxeTurf, drawYardNumber } from '../../components/football-deluxe-art';
import { KICK_TEAMS } from '../kick-return-teams';

function canvas() {
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const saved: { matrix: typeof m; alpha: number }[] = [];
  const fills: { x: number; y: number; w: number; h: number; color: string }[] = [];
  const images: number[][] = [], translations: number[][] = [];
  const ctx = {
    fillStyle: '', globalAlpha: 1,
    getTransform: () => ({ ...m }),
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { m = { a, b, c, d, e, f }; },
    save() { saved.push({ matrix: { ...m }, alpha: this.globalAlpha }); },
    restore() { const state = saved.pop()!; m = state.matrix; this.globalAlpha = state.alpha; },
    translate(x: number, y: number) { translations.push([x, y]); m.e += m.a * x; m.f += m.d * y; },
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ x: m.a * x + m.e, y: m.d * y + m.f, w: m.a * w, h: m.d * h, color: this.fillStyle });
    },
    drawImage(_image: unknown, ...args: number[]) { images.push(args); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fills, images, translations };
}

test('broadcast camera keeps sidelines horizontal with modest twelve-percent far-side compression', () => {
  const view = { centerX: 600 };
  for (const y of [0, 16, 18, 174, 176, 192]) {
    const a = projectBroadcastPoint(100, y, view), b = projectBroadcastPoint(1100, y, view);
    assert.equal(a.y, y); assert.equal(b.y, y);
    assert(Math.abs((b.x - a.x) / 1000 - (y <= 18 ? .88 : 1)) < 1e-10);
  }
  const spacing = (y: number) => projectBroadcastPoint(600, y + 10, view).y - projectBroadcastPoint(600, y, view).y;
  assert(spacing(20) < spacing(150), 'far field has modestly compressed depth spacing');
  assert(spacing(20) > 8.5 && spacing(150) < 11.5, 'angle remains near overhead, not dramatic');
  assert.equal(BROADCAST.bottom - BROADCAST.top, 156, 'playing surface height is preserved');
});

test('yard lines remain straight, ordered and geometrically aligned for either direction', () => {
  for (const centerX of [90, 600, 1110]) for (const x of [100, 200, 600, 1000, 1100]) {
    const view = { centerX }, a = projectBroadcastPoint(x, 18, view), b = projectBroadcastPoint(x, 174, view);
    for (const y of [40, 70, 96, 148]) {
      const p = projectBroadcastPoint(x, y, view);
      const expected = a.x + (b.x - a.x) * (p.y - a.y) / (b.y - a.y);
      assert(Math.abs(p.x - expected) < 1e-9);
      assert(p.y > a.y && p.y < b.y);
    }
  }
  const range = broadcastVisibleRange(400, 320);
  assert(range.left < 400 && range.right > 720, 'far-side culling includes newly visible field');
  assert.equal(broadcastVisibleRange(0, 320).left, 0);
  assert.equal(broadcastVisibleRange(880, 320).right, 1200);
});

test('crowd visibility uses spare apron space, never a smaller field or clipped near sideline', () => {
  for (const height of [180, 280, 320, 393, 600]) for (const topClearance of [0, 30, 38]) {
    const view = { width: 700, height, topClearance };
    const before = fieldViewportFrame(view), after = broadcastViewportFrame(view);
    assert.equal(after.scale, before.scale);
    assert(16 * after.scale + after.offsetY >= topClearance - 1e-9);
    assert(176 * after.scale + after.offsetY <= height + 1e-9);
    if (!topClearance) assert.deepEqual(after, before);
  }
  const frame = broadcastViewportFrame({ width: 700, height: 393, topClearance: 38 });
  assert(7 * frame.scale + frame.offsetY >= 38, 'second crowd row clears the overlaid landscape scoreboard');
});

test('plane paint is rasterized into sharp display pixels at fractional mobile camera scales', () => {
  const { ctx, fills } = canvas();
  ctx.setTransform(2.3, 0, 0, 2.3, -701.17, 13.8);
  const ground = broadcastFieldContext(ctx, { centerX: 500 });
  ground.fillRect(450, 18, 2, 156);
  assert(fills.length > 300);
  for (const r of fills) for (const value of [r.x, r.y, r.w, r.h])
    assert(Math.abs(value - Math.round(value)) < 1e-9, 'no fractional raster edges');
  assert(fills[0]!.x !== fills.at(-1)!.x, 'yard line has a subtle perspective lean');
  assert.equal(fills[0]!.y, Math.round(18 * 2.3 + 13.8));
  assert.equal(fills.at(-1)!.y + 1, Math.round(174 * 2.3 + 13.8));
});

test('painted end-zone rotations and midfield images share the field projection without leaking transforms', () => {
  const { ctx, fills, images } = canvas(), ground = broadcastFieldContext(ctx, { centerX: 600 });
  ground.save(); ground.translate(50, 96); ground.rotate(-Math.PI / 2); ground.fillRect(-3, -3, 6, 6); ground.restore();
  assert(fills.every(r => r.x > 40 && r.x < 90 && r.y > 85 && r.y < 100));
  assert.deepEqual(ctx.getTransform(), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ground.drawImage({ naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement, 570, 66, 60, 60);
  assert.equal(images.length, 60, 'existing artwork is sampled in sharp projected strips, not replaced');
  assert(images.every(row => row.length === 8 && row.slice(4).every(Number.isFinite)));
});

test('athletes and carried balls are projected once as upright billboards, preserving artwork height', () => {
  const { ctx, fills, translations } = canvas(), view = { centerX: 600 };
  const point = projectBroadcastPoint(450, 40, view);
  withBroadcastWorld(ctx, view, () => withBroadcastAnchor(ctx, 450, 40, () => {
    ctx.fillRect(450, 40, 8, 18);
    drawFootballBall(ctx, 453, 40, { held: true });
  }));
  assert.equal(translations.length, 1, 'nested hand/ball artwork never receives a second projection');
  assert.equal(fills[0]!.x, point.x); assert.equal(fills[0]!.y, point.y);
  assert.equal(fills[0]!.h, 18); assert.equal(fills[0]!.w, 8);
  withBroadcastAnchor(ctx, 450, 40, () => ctx.fillRect(450, 40, 8, 18));
  assert.equal(fills.at(-1)!.x, 450, 'projection scope never leaks into Kick View, menus or HUD');
});

test('airborne footballs keep projected ground anchors, physical height and unchanged dimensions', () => {
  const { ctx, fills } = canvas(), view = { centerX: 600 };
  const render = (z: number) => {
    fills.length = 0;
    withBroadcastWorld(ctx, view, () => drawFootballBall(ctx, 450, 50, { z, shadow: true }));
    return structuredClone(fills);
  };
  const low = render(0), high = render(12);
  assert(Math.abs(low[0]!.x + low[0]!.w / 2 - high[0]!.x - high[0]!.w / 2) <= .5,
    'odd/even pixel shadow widths remain centered to the nearest half pixel');
  assert.equal(low[0]!.y, high[0]!.y, 'ground contact does not rise with the ball');
  for (let i = 1; i < low.length; i++) {
    assert.equal(low[i]!.y - high[i]!.y, 12);
    assert.equal(low[i]!.w, high[i]!.w);
  }
});

test('crowd uses both actual team palettes and varied people without consuming playable turf', () => {
  const teams = { player: KICK_TEAMS[0]!.name, opponent: KICK_TEAMS[1]!.name };
  const a = canvas(), b = canvas();
  drawBroadcastStadium(a.ctx, 300, 700, teams, false, 0);
  drawBroadcastStadium(b.ctx, 300, 700, teams, false, 40);
  assert.deepEqual(a.fills, b.fills, 'idle crowd does not shimmer or use game randomness');
  assert(a.fills.some(p => p.color === KICK_TEAMS[0]!.body));
  assert(a.fills.some(p => p.color === KICK_TEAMS[1]!.body));
  assert(a.fills.every(p => p.y >= 0 && p.y + p.h <= 16));
});

test('grass is world-anchored, restrained, irregular and consistent across camera windows', () => {
  const a = canvas(), b = canvas();
  drawDeluxeTurf(a.ctx, 200, 600); drawDeluxeTurf(b.ctx, 300, 500);
  const shared = a.fills.filter(p => p.x >= 300 && p.x <= 500);
  assert.deepEqual(shared, b.fills.filter(p => p.x >= 300 && p.x <= 500));
  assert(new Set(a.fills.map(p => p.color)).size >= 3);
  assert(a.fills.reduce((area, p) => area + p.w * p.h, 0) < 400 * 156 * .05, 'grass never obscures players');
  const numbers = canvas();
  drawYardNumber(numbers.ctx, 40, 500, 25);
  assert(numbers.fills.length > 20);
  assert(numbers.fills.every(p => p.x === Math.round(p.x) && p.y === Math.round(p.y)));
});
