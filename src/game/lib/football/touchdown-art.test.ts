import test from 'node:test';
import assert from 'node:assert/strict';
import { drawTouchdownMarquee, touchdownGlyphDots, touchdownArt, TD_ART_RECTS, TD_W, TD_H, TD_PAD_X, TD_PAD_Y } from '../../components/football-touchdown-art';
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
  assert.equal(TD_W, 180);
  assert.equal(TD_H, 42);
  for (const r of TD_ART_RECTS) {
    for (const coordinate of [r.x, r.y, r.w, r.h]) assert(Number.isInteger(coordinate));
    assert(r.x >= 0 && r.y >= 0 && r.x + r.w <= TD_W && r.y + r.h <= TD_H);
    assert.match(r.color, /^#[0-9a-f]{6}$/i, 'only opaque palette colors, no glow');
  }
});
test('expanded board leaves dark breathing room on every side without enlarging lamps or letters', () => {
  const dots = touchdownGlyphDots();
  const left = Math.min(...dots.map(p => p.x)) - 1;
  const right = Math.max(...dots.map(p => p.x)) + 1;
  const top = Math.min(...dots.map(p => p.y)) - 1;
  const bottom = Math.max(...dots.map(p => p.y)) + 1;
  assert.equal(left, TD_PAD_X);
  assert.equal(top, TD_PAD_Y);
  for (const gap of [left - 4, TD_W - 4 - right, top - 4, TD_H - 4 - bottom])
    assert(gap >= 7, 'at least seven native dark pixels between letters and border lamps');
  for (const maxWidth of [124, 300, 360, 560]) {
    const { ctx, paints } = recordingCanvas();
    const centerY = Math.max(52, Math.ceil(maxWidth * TD_H / TD_W / 2) + 8);
    drawTouchdownMarquee(ctx, maxWidth / 2 + 10, centerY, maxWidth, .4);
    assert(paints.every(p => p.x >= 10 && p.x + p.width <= maxWidth + 10));
    assert(paints.every(p => p.y >= 0 && p.y + p.height <= 192));
  }
});
test('separate bulb clusters switch once from dim to bright with deterministic texture', () => {
  assert.equal(touchdownArt(0), touchdownArt(.399));
  assert.notDeepEqual(touchdownArt(.399), touchdownArt(.4));
  assert.equal(touchdownArt(.4), TD_ART_RECTS);
  assert.equal(touchdownArt(.4), touchdownArt(20), 'never flash or loop');
  const bulbs = touchdownGlyphDots();
  for (let i = 0; i < bulbs.length; i++) for (let j = i + 1; j < bulbs.length; j++) {
    assert(Math.abs(bulbs[i]!.x - bulbs[j]!.x) >= 3 || Math.abs(bulbs[i]!.y - bulbs[j]!.y) >= 3, 'one-pixel dark gap between two-pixel bulbs');
  }
  for (const seconds of [0, .17, .34, .4, 1, 2.4]) {
    const { ctx, paints, balanced } = recordingCanvas();
    drawTouchdownMarquee(ctx, 160, 48, 300, seconds);
    assert.equal(paints.length, touchdownArt(seconds).length);
    assert(new Set(paints.slice(2).map(p => p.color)).size >= 3, 'small authored bulb brightness variations');
    for (const p of paints) for (const v of [p.x, p.y, p.width, p.height]) assert(Number.isInteger(v));
    assert(balanced());
  }
});
test('all four marquee edges use separate matching bulbs and switch with the letters', () => {
  const lamps = (seconds: number) => touchdownArt(seconds).filter(r => r.w === 2 && r.h === 2);
  const dim = lamps(0), bright = lamps(.4);
  assert.deepEqual(dim.map(({ x, y }) => ({ x, y })), bright.map(({ x, y }) => ({ x, y })));
  for (const side of [
    bright.filter(r => r.y === 2),
    bright.filter(r => r.y === TD_H - 4),
    bright.filter(r => r.x === 2),
    bright.filter(r => r.x === TD_W - 4),
  ]) assert(side.length >= 9, 'each edge has individually separated lamps');
  assert.equal(new Set(bright.map(r => `${r.x},${r.y}`)).size, bright.length, 'no duplicate corner lamps');
  for (let i = 0; i < bright.length; i++) for (let j = i + 1; j < bright.length; j++)
    assert(Math.abs(bright[i]!.x - bright[j]!.x) >= 3 || Math.abs(bright[i]!.y - bright[j]!.y) >= 3);
});
test('the actual Classic touchdown renderer draws the marquee without changing game state', () => {
  for (const width of [144, 320, 375, 852]) {
    const attempt = createKickAttempt(1986, 1); attempt.phase = 'touchdown';
    const before = structuredClone(attempt), { ctx, paints, balanced } = recordingCanvas();
    drawKickReturn(ctx, attempt, 0, false, { width, height: 192 });
    assert(paints.filter(p => p.color === '#9f6238' || p.color === '#b47742' || p.color === '#8e5738' || p.color === '#c18448').length > 70);
    assert.deepEqual(attempt, before); assert(balanced());
  }
});
