/** Two authored pixels per world unit: richer 16-bit art, unchanged game space. */
export const FOOTBALL_PIXEL_DENSITY = 2;
const contexts = new WeakMap<CanvasRenderingContext2D, CanvasRenderingContext2D>();

export function highResolutionContext(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  const cached = contexts.get(ctx);
  if (cached) return cached;
  const methods = new Map<PropertyKey, unknown>();
  const setTransform = (...args: unknown[]) => {
    const matrix = args.length === 1 ? args[0] as DOMMatrix2DInit : undefined;
    const [a, b, c, d, e, f] = matrix
      ? [matrix.a ?? 1, matrix.b ?? 0, matrix.c ?? 0, matrix.d ?? 1, matrix.e ?? 0, matrix.f ?? 0]
      : args as number[];
    const p = FOOTBALL_PIXEL_DENSITY;
    ctx.setTransform(a! * p, b! * p, c! * p, d! * p, e! * p, f! * p);
  };
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key === 'setTransform') return setTransform;
      if (key === 'resetTransform') return () => setTransform(1, 0, 0, 1, 0, 0);
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(key)) methods.set(key, value.bind(target));
      return methods.get(key);
    },
    set: (target, key, value) => Reflect.set(target, key, value, target),
  });
  contexts.set(ctx, proxy);
  contexts.set(proxy, proxy);
  return proxy;
}

export function prepareFootballCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const w = Math.max(1, Math.round(width)) * FOOTBALL_PIXEL_DENSITY;
  const h = Math.max(1, Math.round(height)) * FOOTBALL_PIXEL_DENSITY;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const raw = canvas.getContext('2d');
  if (!raw) return null;
  raw.imageSmoothingEnabled = false;
  return highResolutionContext(raw);
}
