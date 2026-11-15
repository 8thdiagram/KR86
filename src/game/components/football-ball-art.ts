export const BALL_ART = { leather: '#8a4a1f', highlight: '#b87538', shade: '#60351e',
  stripe: '#fffaf0', outline: '#10213a' } as const;
type BallRun = { color: string; x: number; y: number; width: number };
const frames = new Map<number, readonly BallRun[]>();
export const FOOTBALL_ROTATION_FRAMES = 32;

/** Native solid-pixel cels around a constant center. No rotated/filtered canvas
 * or alternating wide/tall bounding boxes that make the football appear to hop. */
export function footballFlightPixels(small: boolean, spin: number, tumble = true): readonly BallRun[] {
  const phase = ((Math.floor(spin * FOOTBALL_ROTATION_FRAMES) % FOOTBALL_ROTATION_FRAMES) + FOOTBALL_ROTATION_FRAMES) % FOOTBALL_ROTATION_FRAMES;
  const key = phase + (small ? 0 : FOOTBALL_ROTATION_FRAMES) + (tumble ? 0 : FOOTBALL_ROTATION_FRAMES * 2);
  const cached = frames.get(key); if (cached) return cached;
  const angle = phase / FOOTBALL_ROTATION_FRAMES * Math.PI * 2;
  const c = tumble ? Math.cos(angle) : 1, s = tumble ? Math.sin(angle) : 0;
  const a = small ? 4.8 : 5.8, b = small ? 2.5 : 3.3;
  const laceRow = tumble ? 0 : Math.round(Math.sin(angle) * .8);
  const inside = (u: number, v: number, ax: number, by: number) =>
    Math.pow(Math.abs(u) / ax, 1.5) + (v / by) ** 2 <= 1;
  const runs: BallRun[] = [];
  for (let y = -6; y <= 6; y++) {
    let last: BallRun | undefined;
    for (let x = -6; x <= 6; x++) {
      const u = x * c + y * s, v = -x * s + y * c;
      if (!inside(u, v, a, b)) { last = undefined; continue; }
      let color: string = BALL_ART.outline;
      if (inside(u, v, a - .8, b - .8)) {
        color = v < -.5 ? BALL_ART.highlight : v > .7 ? BALL_ART.shade : BALL_ART.leather;
        if (Math.abs(Math.abs(u) - a * .57) < .45 ||
            Math.abs(v - laceRow) < .45 && Math.abs(u) < a * .35) color = BALL_ART.stripe;
      }
      if (last?.color === color && last.x + last.width === x) last.width++;
      else { last = { color, x, y, width: 1 }; runs.push(last); }
    }
  }
  frames.set(key, runs); // two sizes × two motions × 32 cels; never keyed by play age
  return runs;
}
