import test from 'node:test';
import assert from 'node:assert/strict';
import { drawTouchdownMarquee, touchdownGlyphDots, TD_COLORS, TD_W, TD_H } from '../../components/football-touchdown-art';
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
test('all TOUCHDOWN glyph bulbs fit the shared SVG/canvas board', () => {
  const letters = touchdownGlyphDots();
  assert(letters.length > 70);
  for (const p of letters)
    assert(p.x >= 4 && p.x <= TD_W - 4 && p.y >= 4 && p.y <= TD_H - 4);
});
test('touchdown letters stay lit inside the plain gold box without any perimeter bulbs', () => {
  assert.equal(TD_COLORS.rim, TD_COLORS.bulb);
  for (const seconds of [0, .17, .34, 1]) {
    const { ctx, paints, balanced } = recordingCanvas();
    drawTouchdownMarquee(ctx, 160, 48, 300, seconds);
    assert.equal(paints.filter(p => p.color === TD_COLORS.bulb && Math.abs(p.width - 4 * 300 / TD_W) < 1e-8).length, touchdownGlyphDots().length);
    assert.equal(paints.length, 4 + 4 * touchdownGlyphDots().length, 'only the box layers and lettering are drawn');
    assert(balanced());
  }
});
test('the actual Classic touchdown renderer draws the marquee without changing game state', () => {
  for (const width of [144, 320, 375, 852]) {
    const attempt = createKickAttempt(1986, 1); attempt.phase = 'touchdown';
    const before = structuredClone(attempt), { ctx, paints, balanced } = recordingCanvas();
    drawKickReturn(ctx, attempt, 0, false, { width, height: 192 });
    assert(paints.filter(p => p.color === TD_COLORS.bulbHot).length > 70);
    assert.deepEqual(attempt, before); assert(balanced());
  }
});
