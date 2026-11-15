/** Render-only shallow broadcast projection. Physics continue using world X/Y.
 * A homography keeps yard lines straight and both sidelines horizontal. */
import { fieldViewportFrame, type KickViewport } from '../lib/kick-return-viewport';
import { KR } from '../lib/kick-return-engine';
export const BROADCAST = { farScale: .88, top: 18, bottom: 174 } as const;
export type BroadcastView = { centerX: number };
const active = new WeakMap<CanvasRenderingContext2D, BroadcastView>();

/** Use spare referee-apron room to reveal a crowd row below an overlaid HUD.
 * Never shrink the playing field to make room for stadium decoration. */
export function broadcastViewportFrame(view?: KickViewport) {
  const frame = fieldViewportFrame(view);
  if (!view?.topClearance) return frame;
  const room = Math.max(frame.offsetY, (view.height ?? KR.height) - 176 * frame.scale);
  const revealCrowd = view.topClearance - 7 * frame.scale;
  return { ...frame, offsetY: Math.max(frame.offsetY, Math.min(room, revealCrowd)) };
}

export function projectBroadcastPoint(x: number, y: number, view: BroadcastView) {
  const t = Math.max(0, Math.min(1, (y - BROADCAST.top) / (BROADCAST.bottom - BROADCAST.top)));
  const scale = BROADCAST.farScale / (1 - (1 - BROADCAST.farScale) * t);
  return {
    x: view.centerX + (x - view.centerX) * scale,
    // Keep the existing crowd/referee aprons and sideline fitting unchanged.
    y: y < BROADCAST.top || y > BROADCAST.bottom ? y
      : BROADCAST.top + (BROADCAST.bottom - BROADCAST.top) * t * scale,
  };
}

/** Extra far-side visibility is presentation culling only, never a camera target. */
export function broadcastVisibleRange(camX: number, visible: number) {
  const pad = visible * (1 / BROADCAST.farScale - 1) / 2 + 4;
  return { left: Math.max(0, camX - pad), right: Math.min(KR.worldWidth, camX + visible + pad) };
}

export function withBroadcastWorld<T>(ctx: CanvasRenderingContext2D, view: BroadcastView, draw: () => T): T {
  const previous = active.get(ctx);
  active.set(ctx, view);
  try { return draw(); } finally {
    if (previous) active.set(ctx, previous); else active.delete(ctx);
  }
}

/** Upright pixel billboards: project the anchor, never squash/rotate anatomy.
 * Disable nested projection so hands, carried footballs and shadows stay attached. */
export function withBroadcastAnchor<T>(ctx: CanvasRenderingContext2D, x: number, y: number, draw: () => T): T {
  const view = active.get(ctx);
  if (!view) return draw();
  const point = projectBroadcastPoint(x, y, view);
  active.delete(ctx);
  ctx.save();
  ctx.translate(point.x - x, point.y - y);
  try { return draw(); } finally { ctx.restore(); active.set(ctx, view); }
}

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
const identity = (): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

/** Field-plane adapter. Authored square paint pixels become crisp stair-stepped
 * trapezoids, not smoothed vector polygons. Transforms are local to field paint;
 * the real canvas retains its original tracking/viewport transform. */
export function broadcastFieldContext(ctx: CanvasRenderingContext2D, view: BroadcastView): CanvasRenderingContext2D {
  let local = identity();
  const stack: Matrix[] = [], methods = new Map<PropertyKey, unknown>();
  const bounds = (x: number, y: number, w: number, h: number) => {
    const x0 = local.a * x + local.c * y + local.e, y0 = local.b * x + local.d * y + local.f;
    const x1 = local.a * (x + w) + local.c * (y + h) + local.e, y1 = local.b * (x + w) + local.d * (y + h) + local.f;
    return {
      x: Math.min(x0, x1), y: Math.min(y0, y1),
      right: Math.max(x0, x1), bottom: Math.max(y0, y1),
    };
  };
  const transform = () => ctx.getTransform?.() ?? identity();
  const fillRect = (x: number, y: number, w: number, h: number) => {
    const b = bounds(x, y, w, h), m = transform();
    const stops = [b.y];
    for (const boundary of [BROADCAST.top, BROADCAST.bottom])
      if (boundary > b.y && boundary < b.bottom) stops.push(boundary);
    stops.push(b.bottom);
    for (let segment = 0; segment < stops.length - 1; segment++) {
      const top = stops[segment]!, bottom = stops[segment + 1]!;
      const tl = projectBroadcastPoint(b.x, top, view), tr = projectBroadcastPoint(b.right, top, view);
      const bl = projectBroadcastPoint(b.x, bottom, view), br = projectBroadcastPoint(b.right, bottom, view);
      const y0 = Math.round(m.d * tl.y + m.f), y1 = Math.round(m.d * bl.y + m.f);
      // All authored plane transforms are axis-aligned or exact quarter turns.
      // Rasterize in actual display pixels; no anti-aliasing or image readbacks.
      for (let row = y0; row < y1; row++) {
        const t = (row + .5 - y0) / (y1 - y0);
        const left = Math.round(m.a * (tl.x + (bl.x - tl.x) * t) + m.e);
        const right = Math.round(m.a * (tr.x + (br.x - tr.x) * t) + m.e);
        if (right > left) ctx.fillRect((left - m.e) / m.a, (row - m.f) / m.d, (right - left) / m.a, 1 / m.d);
      }
    }
  };
  const drawImage = (image: CanvasImageSource, ...args: number[]) => {
    const source = image as HTMLImageElement;
    const iw = source.naturalWidth || source.width, ih = source.naturalHeight || source.height;
    const [sx, sy, sw, sh, dx, dy, dw, dh] = args.length === 8 ? args
      : [0, 0, iw, ih, args[0], args[1], args[2] ?? iw, args[3] ?? ih];
    if (!dw || !dh || !sw || !sh) return;
    const b = bounds(dx!, dy!, dw, dh), m = transform();
    const rows = Math.max(1, Math.round(b.bottom - b.y));
    for (let row = 0; row < rows; row++) {
      const y = b.y + (b.bottom - b.y) * row / rows, next = b.y + (b.bottom - b.y) * (row + 1) / rows;
      const a = projectBroadcastPoint(b.x, y, view), z = projectBroadcastPoint(b.right, next, view);
      const top = Math.round(m.d * a.y + m.f), bottom = Math.round(m.d * z.y + m.f);
      const left = Math.round(m.a * a.x + m.e), right = Math.round(m.a * z.x + m.e);
      if (bottom > top && right > left)
        ctx.drawImage(image, sx!, sy! + sh * row / rows, sw, sh / rows,
          (left - m.e) / m.a, (top - m.f) / m.d, (right - left) / m.a, (bottom - top) / m.d);
    }
  };
  const own: Record<string, unknown> = {
    fillRect, drawImage,
    save: () => { stack.push({ ...local }); ctx.save(); },
    restore: () => { local = stack.pop() ?? identity(); ctx.restore(); },
    translate: (x: number, y: number) => { local.e += local.a * x + local.c * y; local.f += local.b * x + local.d * y; },
    scale: (x: number, y: number) => { local.a *= x; local.b *= x; local.c *= y; local.d *= y; },
    rotate: (angle: number) => {
      // Snap sin/cos at exact quarter turns to avoid 0.999999 paint bounds.
      const c = Math.round(Math.cos(angle) * 1e10) / 1e10, s = Math.round(Math.sin(angle) * 1e10) / 1e10;
      const old = { ...local };
      local.a = old.a * c + old.c * s; local.b = old.b * c + old.d * s;
      local.c = old.c * c - old.a * s; local.d = old.d * c - old.b * s;
    },
  };
  return new Proxy(ctx, {
    get(target, key) {
      if (typeof key === 'string' && key in own) return own[key];
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(key)) methods.set(key, value.bind(target));
      return methods.get(key);
    },
    set: (target, key, value) => Reflect.set(target, key, value, target),
  });
}
