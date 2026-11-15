import { TD_DIM_SECONDS } from '../lib/football/celebration-timing';

/** Shared, authored-at-1x NES bulb marquee. Pure geometry; no game state or randomness. */
export const TD_GLYPHS: Record<string, string> = {
  T: '11111' + '00100' + '00100' + '00100' + '00100' + '00100' + '00100',
  O: '01110' + '10001' + '10001' + '10001' + '10001' + '10001' + '01110',
  U: '10001' + '10001' + '10001' + '10001' + '10001' + '10001' + '01110',
  C: '01111' + '10000' + '10000' + '10000' + '10000' + '10000' + '01111',
  H: '10001' + '10001' + '10001' + '11111' + '10001' + '10001' + '10001',
  D: '11110' + '10001' + '10001' + '10001' + '10001' + '10001' + '11110',
  W: '10001' + '10001' + '10001' + '10101' + '10101' + '10101' + '01010',
  N: '10001' + '11001' + '11001' + '10101' + '10011' + '10011' + '10001',
};

export const TD_WORD = 'TOUCHDOWN';
/** One authored bulb occupies two square pixels, with a one-pixel dark gap. */
export const TD_CELL = 1;
export const TD_PAD_X = 3;
export const TD_PAD_Y = 3;
const BULB = 2;
const PITCH = 3;
const LETTER_ADVANCE = 18;
export const TD_TEXT_W = TD_WORD.length * LETTER_ADVANCE - 4;
export const TD_TEXT_H = 7 * PITCH - 1;
export const TD_W = TD_TEXT_W + TD_PAD_X * 2;
export const TD_H = TD_TEXT_H + TD_PAD_Y * 2;

export const TD_COLORS = {
  shadow: '#111827',
  frame: '#26384b',
  rim: '#f2a23a',
  panel: '#182638',
  pixelShadow: '#9b3f32',
  ink: '#fff0bd',
};

export type TouchdownRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
};

const BRIGHT_BULBS = ['#fff0bd', '#ffe6a1', '#f8d987', '#fff4d1'];
const DIM_BULBS = ['#9f6238', '#b47742', '#8e5738', '#c18448'];

function bulbRects(bright: boolean): TouchdownRect[] {
  const rects: TouchdownRect[] = [
    { x: 0, y: 0, w: TD_W, h: TD_H, color: TD_COLORS.shadow },
    { x: 1, y: 1, w: TD_W - 2, h: TD_H - 2, color: TD_COLORS.panel },
  ];
  [...TD_WORD].forEach((character, letter) => {
    const glyph = TD_GLYPHS[character];
    if (!glyph) return;
    for (let i = 0; i < glyph.length; i++) {
      if (glyph[i] !== '1') continue;
      const row = Math.floor(i / 5);
      const column = i % 5;
      const x = TD_PAD_X + letter * LETTER_ADVANCE + column * PITCH;
      const y = TD_PAD_Y + row * PITCH;
      // Stable authored variation: individual warm bulbs, never random flicker.
      const seed = (letter * 37 + row * 17 + column * 11) % 13;
      const palette = bright ? BRIGHT_BULBS : DIM_BULBS;
      rects.push({ x, y, w: BULB, h: BULB, color: palette[seed % palette.length]! });
      if (bright && seed % 4 === 0) {
        rects.push({ x, y, w: 1, h: 1, color: '#fff8dc' });
      }
    }
  });
  return rects;
}

/** Bright authored marquee retained for existing canvas/SVG consumers. */
export const TD_ART_RECTS: TouchdownRect[] = bulbRects(true);
const TD_DIM_RECTS: TouchdownRect[] = bulbRects(false);

/** The only illumination change is a single palette step at the authored threshold. */
export function touchdownArt(seconds: number): TouchdownRect[] {
  return seconds < TD_DIM_SECONDS ? TD_DIM_RECTS : TD_ART_RECTS;
}

/** Kept for callers that consume bulb centres; these are true lamp centres. */
export function touchdownGlyphDots(): { x: number; y: number }[] {
  const dots: { x: number; y: number }[] = [];
  [...TD_WORD].forEach((character, letter) => {
    const glyph = TD_GLYPHS[character];
    if (!glyph) return;
    for (let i = 0; i < glyph.length; i++) {
      if (glyph[i] === '1') dots.push({
        x: TD_PAD_X + letter * LETTER_ADVANCE + (i % 5) * PITCH + 1,
        y: TD_PAD_Y + Math.floor(i / 5) * PITCH + 1,
      });
    }
  });
  return dots;
}

export function drawTouchdownMarquee(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  maxWidth: number,
  seconds: number,
): void {
  const scale = Math.max(0.3, Math.min(maxWidth / TD_W, 8));
  const width = Math.max(1, Math.floor(TD_W * scale));
  const height = Math.max(1, Math.floor(TD_H * scale));
  const left = Math.round(centerX - width / 2);
  const top = Math.round(centerY - height / 2);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Integer edge mapping is nearest-neighbor and allocates no offscreen canvas.
  for (const rect of touchdownArt(seconds)) {
    const x = Math.round(rect.x * width / TD_W);
    const y = Math.round(rect.y * height / TD_H);
    const right = Math.round((rect.x + rect.w) * width / TD_W);
    const bottom = Math.round((rect.y + rect.h) * height / TD_H);
    ctx.fillStyle = rect.color;
    ctx.fillRect(left + x, top + y, right - x, bottom - y);
  }
  ctx.restore();
}
