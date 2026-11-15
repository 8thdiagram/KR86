export const BALL_ART = { leather: '#8a4a1f', highlight: '#b87538', shade: '#60351e',
  stripe: '#fffaf0', outline: '#10213a' } as const;
type BallRun = { color: string; x: number; y: number; width: number };
const frames = new Map<number, readonly BallRun[]>();
export const FOOTBALL_ROTATION_FRAMES = 32;
export const getCachedFootballFlightFrameCount = () => frames.size;

/** Native solid-pixel cels around a constant center. No rotated/filtered canvas
 * or alternating wide/tall bounding boxes that make the football appear to hop. */
export function footballFlightPixels(small: boolean, spin: number, tumble = true): readonly BallRun[] {
  const normalizedSpin = Number.isFinite(spin) ? spin : 0;
  const spinCycle = ((normalizedSpin % 1) + 1) % 1;
  const phase = Math.floor(spinCycle * FOOTBALL_ROTATION_FRAMES) % FOOTBALL_ROTATION_FRAMES;
  const key = phase + (small ? 0 : FOOTBALL_ROTATION_FRAMES) + (tumble ? 0 : FOOTBALL_ROTATION_FRAMES * 2);
  const cached = frames.get(key); if (cached) return cached;
  const angle = phase / FOOTBALL_ROTATION_FRAMES * Math.PI * 2;
  const c = tumble ? Math.cos(angle) : 1, s = tumble ? Math.sin(angle) : 0;
  // A shorter, tighter airborne profile keeps the pointed football identity
  // without reading as an oversized capsule.
  const a = small ? 3.8 : 4.8, b = small ? 2.2 : 2.8;
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
        const laceY = tumble ? 0 : Math.sin(angle + u * .72) * 1.35;
        // Passes hold their silhouette steady while the white laces travel
        // around the leather; kicks continue to tumble the whole pointed ball.
        if (Math.abs(Math.abs(u) - a * .57) < .45 ||
            (!tumble && Math.abs(v - laceY) < .48 && Math.abs(u) < a * .38)) color = BALL_ART.stripe;
      }
      if (last?.color === color && last.x + last.width === x) last.width++;
      else { last = { color, x, y, width: 1 }; runs.push(last); }
    }
  }
  const immutableRuns = Object.freeze(runs.map(run => Object.freeze(run)));
  frames.set(key, immutableRuns); // two sizes × two motions × 32 cels; never keyed by play age
  return immutableRuns;
}
