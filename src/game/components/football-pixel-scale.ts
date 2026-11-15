import { withBroadcastAnchor } from './football-broadcast';
/** Native-sized player art; never changes world positions or hitboxes. */
export const PLAYER_ART_SCALE = 1;
type PixelDraw = (ctx: CanvasRenderingContext2D, x: number, y: number) => void;

/** Snap projected axis-aligned edges to real canvas pixels, including camera
 * offsets. This avoids soft half-pixels at non-integer landscape zoom levels. */
export function sharpPixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const m = ctx.getTransform?.();
  if (m && m.b === 0 && m.c === 0 && m.a !== 0 && m.d !== 0) {
    const left = Math.round(m.a * x + m.e), right = Math.round(m.a * (x + w) + m.e);
    const top = Math.round(m.d * y + m.f), bottom = Math.round(m.d * (y + h) + m.f);
    ctx.fillRect((left - m.e) / m.a, (top - m.f) / m.d, (right - left) / m.a, (bottom - top) / m.d);
  } else ctx.fillRect(x, y, w, h);
}

/** Remap authored rectangle edges, not an image readback on every animation
 * frame. Shared boundaries stay shared and carried balls use the same mapping.
 * Canvas state/methods forward to the real context, preserving pose animation. */
export function drawPixelEnlarged(
  ctx: CanvasRenderingContext2D, x: number, y: number, draw: PixelDraw, footOffset = 0,
) {
  return withBroadcastAnchor(ctx, x, y, () => drawEnlargedPixels(ctx, x, y, draw, footOffset));
}
function drawEnlargedPixels(
  ctx: CanvasRenderingContext2D, x: number, y: number, draw: PixelDraw, footOffset: number,
) {
  const ax = Math.round(x), ay = Math.round(y), foot = ay + footOffset;
  // Keep original whole-pixel silhouette edges exactly where they were.
  // Newly authored half-grid details use the extra backing-buffer resolution.
  const edge = (v: number, anchor: number) => {
    const delta = v - anchor, grid = Number.isInteger(delta) ? 1 : 2;
    return anchor + Math.sign(delta) * Math.round(Math.abs(delta) * PLAYER_ART_SCALE * grid) / grid;
  };
  const mapX = (v: number) => edge(v, ax);
  const mapY = (v: number) => edge(v, foot);
  const fillRect = (u: number, v: number, w: number, h: number) => {
    const left = mapX(u), top = mapY(v);
    sharpPixelRect(ctx, left, top, mapX(u + w) - left, mapY(v + h) - top);
  };
  const methods = new Map<PropertyKey, unknown>();
  const pixels = new Proxy(ctx, {
    get(target, key) {
      if (key === 'fillRect') return fillRect;
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(key)) methods.set(key, value.bind(target));
      return methods.get(key);
    },
    set(target, key, value) { return Reflect.set(target, key, value, target); },
  });
  draw(pixels, ax, ay);
}
