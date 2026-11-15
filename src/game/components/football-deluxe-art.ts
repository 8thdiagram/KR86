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
} as const;

const R = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = c; ctx.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, w, h);
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
type GrassPixel = { x: number; y: number; w: number; h: number; c: string };
let grass: GrassPixel[] | null = null;
const GRASS_SHADES = [
  'rgba(10,45,20,.28)', 'rgba(18,58,26,.25)', 'rgba(31,79,35,.22)',
  'rgba(120,169,75,.14)', 'rgba(164,195,91,.12)', 'rgba(38,91,39,.23)',
  'rgba(76,126,51,.17)', 'rgba(8,38,19,.19)',
];
function grassClusters(): GrassPixel[] {
  if (grass) return grass;
  const out: GrassPixel[] = [];
  // Deterministic world-anchored flecks: varied tiny stepped clumps, never a
  // repeating tile. Sparse coverage keeps the painted field and players clear.
  for (let sx = FIELD_ART.goalLeft + 2; sx < FIELD_ART.goalRight - 2; sx += 3) {
    for (let sy = FIELD_ART.turfTop + 2; sy < FIELD_ART.turfBottom - 2; sy += 3) {
      let seed = (Math.imul(sx + 31, 73856093) ^ Math.imul(sy + 17, 19349663)) >>> 0;
      seed = Math.imul(seed ^ (seed >>> 13), 1274126177) >>> 0;
      if (seed % 100 > 23) continue;
      const x = sx + ((seed >>> 7) % 5 - 2), y = sy + ((seed >>> 12) % 3 - 1);
      const c = GRASS_SHADES[(seed >>> 17) % GRASS_SHADES.length]!;
      const cluster = (seed >>> 3) & 3;
      out.push({ x, y, w: (seed & 3) === 0 ? 1.5 : 1, h: 1, c });
      if (cluster !== 0) out.push({
        x: x + (cluster === 1 ? 1 : ((seed >>> 22) % 3) - 1),
        y: y + (cluster === 2 ? 1 : ((seed >>> 25) % 3) - 1),
        w: (seed & 16) ? 1 : .5, h: 1,
        c: GRASS_SHADES[(seed >>> 19) % GRASS_SHADES.length]!,
      });
      if ((seed & 31) === 7) out.push({
        x: x + 1, y: y + 1, w: 1, h: .5,
        c: GRASS_SHADES[(seed >>> 27) % GRASS_SHADES.length]!,
      });
    }
  }
  return (grass = out.sort((a, b) => a.x - b.x));
}
export function drawDeluxeTurf(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const d = grassClusters();
  let lo = 0, hi = d.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (d[m]!.x < x0 - 4) lo = m + 1; else hi = m; }
  for (let i = lo; i < d.length && d[i]!.x <= x1; i++) {
    const p = d[i]!; R(ctx, p.c, p.x, p.y, p.w, p.h);
  }
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

type PaintPixel = { x: number; y: number; faded: boolean };
const letteringPixels = new Map<string, PaintPixel[]>();
/** Authored coordinates, not screen coordinates: scuffs never crawl with the camera. */
function wornLettering(s: string, px: number): PaintPixel[] {
  const key = `${px}:${s}`, cached = letteringPixels.get(key);
  if (cached) return cached;
  const pixels: PaintPixel[] = [];
  let cx = 0;
  for (const ch of s) {
    const g = glyph(ch);
    for (let r = 0; r < GLYPH_H; r++) for (let c = 0; c < g[r]!.length; c++) if (g[r]![c] === '#') {
      for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
        const x = cx + c * px + dx, y = r * px + dy;
        const seed = (Math.imul(x + 17, 73856093) ^ Math.imul(y + 31, 19349663)) >>> 0;
        // Sparse missing paint at larger sizes; preserve tiny one-pixel strokes.
        if (px > 1 && seed % 101 < 6) continue;
        pixels.push({ x, y, faded: seed % 19 < 3 });
      }
    }
    cx += (g[0]!.length + 1) * px;
  }
  // Bounded cache, including custom Franchise names.
  if (letteringPixels.size >= 128) letteringPixels.clear();
  letteringPixels.set(key, pixels);
  return pixels;
}
function drawLine(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string) {
  ctx.save();
  const alpha = ctx.globalAlpha;
  ctx.fillStyle = color;
  for (const pixel of wornLettering(s, px)) {
    ctx.globalAlpha = alpha * (pixel.faded ? .54 : .84);
    ctx.fillRect(Math.round(x + pixel.x), Math.round(y + pixel.y), 1, 1);
  }
  ctx.restore();
}
/** Fitted whole-pixel field paint, lightly faded and scuffed like the midfield logo. */
export function drawEndZoneLettering(ctx: CanvasRenderingContext2D, name: string, color: string, centerX: number, rotation: number, _ink: string) {
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
    -Math.round(total / 2) + i * (GLYPH_H * px + gap), px, color));
  ctx.restore();
}

/** Large, crisp bitmap yard numerals for parent field renderers. */
export function drawYardNumber(ctx: CanvasRenderingContext2D, value: string | number,
  centerX: number, y: number, color = '#f3f1dc', pixelSize = 3) {
  const label = String(value);
  const px = Math.max(1, Math.round(pixelSize));
  const width = lineW(label) * px;
  const x = Math.round(centerX - width / 2);
  const top = Math.round(y);
  ctx.save();
  // Crisp athletic numerals use a restrained turf-dark keyline, while the
  // white strokes stay solid and legible instead of inheriting logo wear.
  const numeral = letteringPixels.get(`yard:${px}:${label}`) ?? (() => {
    const solid = wornLetteringSolid(label, px);
    letteringPixels.set(`yard:${px}:${label}`, solid);
    return solid;
  })();
  for (const pixel of numeral) {
    const gx = x + pixel.x, gy = top + pixel.y;
    R(ctx, 'rgba(14,43,26,.38)', gx - 1, gy, 1, 1);
    R(ctx, 'rgba(14,43,26,.38)', gx + 1, gy, 1, 1);
    R(ctx, 'rgba(14,43,26,.38)', gx, gy - 1, 1, 1);
    R(ctx, 'rgba(14,43,26,.38)', gx, gy + 1, 1, 1);
  }
  for (const pixel of numeral) {
    ctx.globalAlpha = 1;
    R(ctx, color, x + pixel.x, top + pixel.y, 1, 1);
  }
  ctx.restore();
}

function wornLetteringSolid(s: string, px: number): PaintPixel[] {
  const pixels: PaintPixel[] = [];
  let cx = 0;
  for (const ch of s) {
    const g = glyph(ch);
    for (let r = 0; r < GLYPH_H; r++) for (let c = 0; c < g[r]!.length; c++) if (g[r]![c] === '#')
      for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++)
        pixels.push({ x: cx + c * px + dx, y: r * px + dy, faded: false });
    cx += (g[0]!.length + 1) * px;
  }
  return pixels;
}

/* ---------- Stage 1: permanent fixtures (rear lines, posts, pylons) ---------- */
const LINE = '#ffffff';
const OR = '#ff8a2a', OR_D = '#c75a12', OR_L = '#ffc27a';

function pylon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x >= FIELD_ART.backRight ? x - 3 : x === FIELD_ART.backLeft ? x : x - 1;
  const py = y <= FIELD_ART.turfTop ? y - 3 : y - 1;
  R(ctx, OR, px, py, 3, 4);
  R(ctx, OR_D, px + 2, py, 1, 4); R(ctx, OR_D, px, py + 3, 3, 1);
  R(ctx, OR_L, px, py, 1, 1);
}
export function drawFieldFixtures(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const top = FIELD_ART.turfTop - 2, h = FIELD_ART.turfBottom - FIELD_ART.turfTop + 4, L = FIELD_ART.rearLine;
  // Only grounded fixtures use the field-plane adapter. Raised goalposts are
  // drawn separately with the broadcast camera's elevation projection.
  if (x0 <= FIELD_ART.backLeft + 30) R(ctx, LINE, FIELD_ART.backLeft, top, L, h);
  if (x1 >= FIELD_ART.backRight - 30) R(ctx, LINE, FIELD_ART.backRight - L, top, L, h);
  for (const x of FIELD_ART.pylonXs) if (x >= x0 - 6 && x <= x1 + 6) for (const y of FIELD_ART.pylonYs) pylon(ctx, x, y);
}
