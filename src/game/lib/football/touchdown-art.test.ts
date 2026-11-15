import test from 'node:test';
import assert from 'node:assert/strict';
import { drawTouchdownMarquee, touchdownGlyphDots, TD_ART_RECTS, TD_COLORS, TD_W, TD_H } from '../../components/football-touchdown-art';
import { drawKickReturn } from '../../components/kick-return-renderer';
import { createKickAttempt } from '../kick-return-engine';

function recordingCanvas() {
  const paints: { color: string; x: number; y: number; width: number; height: number }[] = [];
  let saves = 0, restores = 0;
  const target = { fillStyle: '', save() { saves++; }, restore() { restores++; },
    fillRect(x: number, y: number, width: number, height: number) {
      paints.push({ color: this.fillStyle, x, y, width, height });
    } };
  const ctx = new Proxy(target, { get: (t, key) => Reflect.has(t, key) ? Reflect.get(t, key) : () => {} }) as unknown as CanvasRenderingContext2D;
  return { ctx, paints, balanced: () => saves === restores };
}
test('all TOUCHDOWN pixels fit a genuinely low-resolution shared SVG/canvas board', () => {
  const letters = touchdownGlyphDots();
  assert(letters.length > 70);
  for (const p of letters)
    assert(p.x >= 3 && p.x <= TD_W - 3 && p.y >= 3 && p.y <= TD_H - 3);
  assert(TD_W < 80 && TD_H < 20);
  for (const r of TD_ART_RECTS) {
    for (const coordinate of [r.x, r.y, r.w, r.h]) assert(Number.isInteger(coordinate));
    assert(r.x >= 0 && r.y >= 0 && r.x + r.w <= TD_W && r.y + r.h <= TD_H);
    assert.match(r.color, /^#[0-9a-f]{6}$/i, 'only opaque palette colors, no glow');
  }
});
test('touchdown lettering uses hard integer pixel edges and remains stable throughout its hold', () => {
  let first: ReturnType<typeof recordingCanvas>['paints'] | undefined;
  for (const seconds of [0, .17, .34, 1]) {
    const { ctx, paints, balanced } = recordingCanvas();
    drawTouchdownMarquee(ctx, 160, 48, 300, seconds);
    assert.equal(paints.length, TD_ART_RECTS.length);
    assert(paints.some(p => p.color === TD_COLORS.ink && p.width >= 4));
    for (const p of paints) for (const v of [p.x, p.y, p.width, p.height]) assert(Number.isInteger(v));
    if (first) assert.deepEqual(paints, first, 'no smooth brightness fade');
    first = paints;
    assert(balanced());
  }
});
test('the actual Classic touchdown renderer draws the marquee without changing game state', () => {
  for (const width of [144, 320, 375, 852]) {
    const attempt = createKickAttempt(1986, 1); attempt.phase = 'touchdown';
    const before = structuredClone(attempt), { ctx, paints, balanced } = recordingCanvas();
    drawKickReturn(ctx, attempt, 0, false, { width, height: 192 });
    assert(paints.filter(p => p.color === TD_COLORS.ink).length > 70);
    assert.deepEqual(attempt, before); assert(balanced());
  }
});
