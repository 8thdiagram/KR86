/** 1989 Deluxe art layer. ART-ONLY: never read by gameplay, never saved.
 * Each stage is independently reversible; all false = original rendering. */
import { KR } from '../lib/kick-return-engine';

export const FOOTBALL_ART_STAGES = { geometry: true, field: true, players: true, ball: true };

/** Single shared ART geometry source, derived from KR (gameplay constants untouched). */
export const FIELD_ART = {
  backLeft: 0,
  goalLeft: KR.receivingGoal,
  goalRight: KR.goal,
  backRight: KR.worldWidth,
  endZoneDepth: KR.receivingGoal,
  turfTop: 18,
  turfBottom: 174,
  centerY: (18 + 174) / 2,
  rearLine: 3,
  pylonXs: [0, KR.receivingGoal, KR.goal, KR.worldWidth] as const,
  pylonYs: [18, 174] as const,
  postCrossTop: 83,
  postCrossBottom: 109,
} as const;

const R = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

const toneCache = new Map<string, string>();
/** Cached palette step of an existing colour (no new hues). */
export function tone(hex: string, f: number): string {
  const key = hex + f;
  const hit = toneCache.get(key);
  if (hit) return hit;
  let out = hex;
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    out = '#' + [1, 3, 5].map(i => {
      const n = parseInt(hex.slice(i, i + 2), 16);
      const v = f >= 1 ? n + (255 - n) * (f - 1) : n * f;
      return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    }).join('');
  }
  toneCache.set(key, out);
  return out;
}

/* ---------- Stage 2: static world-anchored turf ---------- */
type Dot = { x: number; y: number; w: number; c: string };
let dots: Dot[] | null = null;
const TURF_DARK = 'rgba(14,60,26,.2)', TURF_LIGHT = 'rgba(200,235,160,.09)';
function turfDots(): Dot[] {
  if (dots) return dots;
  const out: Dot[] = [];
  for (let x = FIELD_ART.goalLeft + 3; x < FIELD_ART.goalRight; x++)
    for (let y = FIELD_ART.turfTop + 1; y < FIELD_ART.turfBottom - 1; y++) {
      let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
      const r = h % 997;
      if (r < 14) out.push({ x, y, w: r < 4 ? 2 : 1, c: TURF_DARK });
      else if (r < 19) out.push({ x, y, w: 1, c: TURF_LIGHT });
    }
  return (dots = out);
}
export function drawDeluxeTurf(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const d = turfDots();
  let lo = 0, hi = d.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (d[m]!.x < x0 - 2) lo = m + 1; else hi = m; }
  for (let i = lo; i < d.length && d[i]!.x <= x1; i++) { const p = d[i]!; R(ctx, p.c, p.x, p.y, p.w, 1); }
}

/* ---------- Stage 2: condensed athletic end-zone pixel lettering ---------- */
const F: Record<string, string[]> = {
  A: ['.##.', '#..#', '#..#', '####', '#..#', '#..#', '#..#'],
  B: ['###.', '#..#', '#..#', '###.', '#..#', '#..#', '###.'],
  C: ['.###', '#...', '#...', '#...', '#...', '#...', '.###'],
  D: ['###.', '#..#', '#..#', '#..#', '#..#', '#..#', '###.'],
  E: ['####', '#...', '#...', '###.', '#...', '#...', '####'],
  F: ['####', '#...', '#...', '###.', '#...', '#...', '#...'],
  G: ['.###', '#...', '#...', '#.##', '#..#', '#..#', '.###'],
  H: ['#..#', '#..#', '#..#', '####', '#..#', '#..#', '#..#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['...#', '...#', '...#', '...#', '...#', '#..#', '.##.'],
  K: ['#..#', '#.#.', '##..', '##..', '#.#.', '#..#', '#..#'],
  L: ['#...', '#...', '#...', '#...', '#...', '#...', '####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#..#', '##.#', '##.#', '#.##', '#.##', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  P: ['###.', '#..#', '#..#', '###.', '#...', '#...', '#...'],
  Q: ['.##.', '#..#', '#..#', '#..#', '#..#', '#.#.', '.#.#'],
  R: ['###.', '#..#', '#..#', '###.', '#.#.', '#..#', '#..#'],
  S: ['.###', '#...', '#...', '.##.', '...#', '...#', '###.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '.#.'],
  U: ['#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#..#', '#..#', '.##.', '.##.', '.##.', '#..#', '#..#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['####', '...#', '..#.', '.#..', '#...', '#...', '####'],
  '0': ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  '1': ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  '2': ['.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'],
  '3': ['###.', '...#', '...#', '.##.', '...#', '...#', '###.'],
  '4': ['#..#', '#..#', '#..#', '####', '...#', '...#', '...#'],
  '5': ['####', '#...', '###.', '...#', '...#', '#..#', '.##.'],
  '6': ['.##.', '#...', '#...', '###.', '#..#', '#..#', '.##.'],
  '7': ['####', '...#', '..#.', '.#..', '.#..', '.#..', '.#..'],
  '8': ['.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '.##.'],
  '9': ['.##.', '#..#', '#..#', '.###', '...#', '...#', '.##.'],
  ' ': ['..', '..', '..', '..', '..', '..', '..'],
  '-': ['...', '...', '...', '###', '...', '...', '...'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
};
const glyph = (ch: string) => F[ch] ?? F[' ']!;
const lineW = (s: string) => [...s].reduce((w, ch) => w + glyph(ch)[0]!.length + 1, 0) - 1;
const GLYPH_H = 7, AVAIL = 140, CAP = 3;

function drawLine(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, ink: string) {
  for (const pass of [0, 1]) {
    let cx = x;
    for (const ch of s) {
      const g = glyph(ch);
      for (let r = 0; r < GLYPH_H; r++) for (let c = 0; c < g[r]!.length; c++) if (g[r]![c] === '#') {
        const gx = cx + c * px, gy = y + r * px;
        if (pass === 0) { R(ctx, ink, gx - 1, gy, px + 2, px); R(ctx, ink, gx, gy - 1, px, px + 2); }
        else R(ctx, color, gx, gy, px, px);
      }
      cx += (g[0]!.length + 1) * px;
    }
  }
}
/** Fitted, crisp whole-pixel lettering centred in the end zone. */
export function drawEndZoneLettering(ctx: CanvasRenderingContext2D, name: string, color: string, centerX: number, rotation: number, ink: string) {
  const label = name.toUpperCase();
  let lines = [label];
  let px = Math.max(1, Math.min(CAP, Math.floor(AVAIL / lineW(label))));
  if (lineW(label) * px > AVAIL || (px < 2 && label.includes(' '))) {
    const words = label.split(' ');
    let best = lines, bestW = lineW(label);
    for (let i = 1; i < words.length; i++) {
      const pair = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
      const w = Math.max(...pair.map(lineW));
      if (w < bestW) { best = pair; bestW = w; }
    }
    lines = best; px = Math.max(1, Math.min(CAP, Math.floor(AVAIL / bestW)));
  }
  const gap = px * 3, total = lines.length * GLYPH_H * px + (lines.length - 1) * gap;
  ctx.save();
  ctx.translate(centerX, FIELD_ART.centerY);
  ctx.rotate(rotation);
  lines.forEach((l, i) => drawLine(ctx, l, -Math.round(lineW(l) * px / 2),
    -Math.round(total / 2) + i * (GLYPH_H * px + gap), px, color, ink));
  ctx.restore();
}

/* ---------- Stage 1: permanent fixtures (rear lines, posts, pylons) ---------- */
const LINE = '#ffffff', GOLD = '#f4d23c', GOLD_D = '#9c7d12', GOLD_L = '#fff0a0';
const OR = '#ff8a2a', OR_D = '#c75a12', OR_L = '#ffc27a';

/** Flat top-down posts: the original gold crossbar, with small hollow tube ends.
 * No projected uprights, perspective arms, or new camera geometry. */
function goalPost(ctx: CanvasRenderingContext2D, side: 1 | -1) {
  const back = side === 1 ? FIELD_ART.backLeft : FIELD_ART.backRight;
  const X = (u: number, w: number) => side === 1 ? back + u : back - u - w;
  const top = FIELD_ART.postCrossTop, bot = FIELD_ART.postCrossBottom;
  const stem = FIELD_ART.rearLine + 1;
  R(ctx, GOLD, X(stem, 2), top, 2, bot - top + 1);
  for (const y of [top, bot]) {
    R(ctx, GOLD, X(stem, 2), y - 2, 2, 4);
    R(ctx, GOLD, X(stem - 1, 4), y - 1, 4, 2);
    R(ctx, GOLD_D, X(stem, 2), y - 1, 2, 2);
    R(ctx, GOLD_L, X(stem, 2), y - 2, 2, 1);
  }
}
function pylon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x >= FIELD_ART.backRight ? x - 3 : x === FIELD_ART.backLeft ? x : x - 1;
  const py = y <= FIELD_ART.turfTop ? y - 3 : y - 1;
  R(ctx, OR, px, py, 3, 4);
  R(ctx, OR_D, px + 2, py, 1, 4); R(ctx, OR_D, px, py + 3, 3, 1);
  R(ctx, OR_L, px, py, 1, 1);
}
export function drawFieldFixtures(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const top = FIELD_ART.turfTop - 2, h = FIELD_ART.turfBottom - FIELD_ART.turfTop + 4, L = FIELD_ART.rearLine;
  // Paint the boundary over the rear support so it stays continuous, not notched.
  if (x0 <= FIELD_ART.backLeft + 30) { goalPost(ctx, 1); R(ctx, LINE, FIELD_ART.backLeft, top, L, h); }
  if (x1 >= FIELD_ART.backRight - 30) { goalPost(ctx, -1); R(ctx, LINE, FIELD_ART.backRight - L, top, L, h); }
  for (const x of FIELD_ART.pylonXs) if (x >= x0 - 6 && x <= x1 + 6) for (const y of FIELD_ART.pylonYs) pylon(ctx, x, y);
}
