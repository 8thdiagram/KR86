/** Shared, authored-at-1x NES bitmap marquee. Pure geometry; no game state or randomness. */
export const TD_GLYPHS: Record<string, string> = {
  T: '11111' + '00100' + '00100' + '00100' + '00100' + '00100' + '00100',
  O: '01110' + '10001' + '10001' + '10001' + '10001' + '10001' + '01110',
  U: '10001' + '10001' + '10001' + '10001' + '10001' + '10001' + '01110',
  C: '01111' + '10000' + '10000' + '10000' + '10000' + '10000' + '01111',
  H: '10001' + '10001' + '10001' + '11111' + '10001' + '10001' + '10001',
  D: '11110' + '10001' + '10001' + '10001' + '10001' + '10001' + '11110',
  W: '10001' + '10001' + '10001' + '10101' + '10101' + '10101' + '01010',
  N: '10001' + '11001' + '11001' + '10101' + '10011' + '10011' + '10001',
  '!': '00100' + '00100' + '00100' + '00100' + '00100' + '00000' + '00100',
};

export const TD_WORD = 'TOUCHDOWN!';
/** One authored pixel is one coordinate unit. All art rectangles stay integer aligned. */
export const TD_CELL = 1;
export const TD_PAD_X = 3;
export const TD_PAD_Y = 3;
export const TD_TEXT_W = TD_WORD.length * 6 - 1;
export const TD_TEXT_H = 7;
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

function glyphRects(color: string, offsetX = 0, offsetY = 0): TouchdownRect[] {
  const rects: TouchdownRect[] = [];
  [...TD_WORD].forEach((character, index) => {
    const glyph = TD_GLYPHS[character];
    if (!glyph) return;
    for (let row = 0; row < 7; row++) {
      let column = 0;
      while (column < 5) {
        if (glyph[row * 5 + column] !== '1') {
          column++;
          continue;
        }
        const start = column;
        while (column < 5 && glyph[row * 5 + column] === '1') column++;
        rects.push({
          x: TD_PAD_X + index * 6 + start + offsetX,
          y: TD_PAD_Y + row + offsetY,
          w: column - start,
          h: 1,
          color,
        });
      }
    }
  });
  return rects;
}

/** Pixel runs shared verbatim by the canvas and SVG renderers. */
export const TD_ART_RECTS: TouchdownRect[] = [
  { x: 0, y: 0, w: TD_W, h: TD_H, color: TD_COLORS.shadow },
  { x: 1, y: 1, w: TD_W - 2, h: TD_H - 2, color: TD_COLORS.frame },
  { x: 2, y: 2, w: TD_W - 4, h: TD_H - 4, color: TD_COLORS.rim },
  { x: 3, y: 3, w: TD_W - 6, h: TD_H - 6, color: TD_COLORS.panel },
  ...glyphRects(TD_COLORS.pixelShadow, 1, 1),
  ...glyphRects(TD_COLORS.ink),
];

/** Kept for callers that previously consumed glyph centres. These are now true pixel centres. */
export function touchdownGlyphDots(): { x: number; y: number }[] {
  const dots: { x: number; y: number }[] = [];
  [...TD_WORD].forEach((character, index) => {
    const glyph = TD_GLYPHS[character];
    if (!glyph) return;
    for (let i = 0; i < glyph.length; i++) {
      if (glyph[i] === '1') dots.push({
        x: TD_PAD_X + index * 6 + (i % 5),
        y: TD_PAD_Y + Math.floor(i / 5),
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
  _seconds: number,
): void {
  const scale = Math.max(0.3, Math.min(maxWidth / TD_W, 8));
  const width = Math.max(1, Math.floor(TD_W * scale));
  const height = Math.max(1, Math.floor(TD_H * scale));
  const left = Math.round(centerX - width / 2);
  const top = Math.round(centerY - height / 2);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Map source pixel edges to whole destination pixels. This is the same
  // nearest-neighbor grid without allocating a canvas on every game frame.
  for (const rect of TD_ART_RECTS) {
    const x = Math.round(rect.x * width / TD_W);
    const y = Math.round(rect.y * height / TD_H);
    const right = Math.round((rect.x + rect.w) * width / TD_W);
    const bottom = Math.round((rect.y + rect.h) * height / TD_H);
    ctx.fillStyle = rect.color;
    ctx.fillRect(left + x, top + y, right - x, bottom - y);
  }
  ctx.restore();
}
