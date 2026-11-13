/** Shared lit-bulb TOUCHDOWN marquee geometry. Pure: no React, no game state, no randomness. */
export const TD_GLYPHS: Record<string, string> = {
  T: '111010010010010', O: '111101101101111', U: '101101101101111', C: '111100100100111',
  H: '101101111101101', D: '110101101101110', W: '101101101111101', N: '110101101101101', '!': '010010010000010',
};
export const TD_WORD = 'TOUCHDOWN!';
/** Grid units: each glyph 3x5 cells, 1 cell gap; sign padded for perimeter bulbs. */
export const TD_CELL = 6;
export const TD_PAD_X = 30, TD_PAD_Y = 22;
export const TD_TEXT_W = (TD_WORD.length * 4 - 1) * TD_CELL;
export const TD_TEXT_H = 5 * TD_CELL; // 30
export const TD_W = TD_TEXT_W + TD_PAD_X * 2;
export const TD_H = TD_TEXT_H + TD_PAD_Y * 2; // 74
export const TD_COLORS = {
  frame: '#10213a', panel: '#1b0f24', rim: '#ffd25a',
  bulb: '#ffd25a', bulbHot: '#fff4c8', glow: 'rgba(255,170,60,.38)', socket: '#0b0812',
};

/** Glyph bulb centres in sign-local coordinates (origin top-left of sign). */
export function touchdownGlyphDots(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  [...TD_WORD].forEach((ch, k) => {
    const g = TD_GLYPHS[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1')
      out.push({ x: TD_PAD_X + (k * 4 + (i % 3)) * TD_CELL + TD_CELL / 2, y: TD_PAD_Y + Math.floor(i / 3) * TD_CELL + TD_CELL / 2 });
  });
  return out;
}

export function drawTouchdownMarquee(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, maxWidth: number, _seconds: number): void {
  const k = Math.max(.3, Math.min(maxWidth, TD_W * 2) / TD_W);
  const c = TD_COLORS;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(centerX - TD_W * k / 2), Math.round(centerY - TD_H * k / 2));
  const rect = (col: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = col; ctx.fillRect(x * k, y * k, w * k, h * k);
  };
  rect(c.frame, 0, 0, TD_W, TD_H);
  rect(c.rim, 3, 3, TD_W - 6, TD_H - 6);
  rect(c.panel, 6, 6, TD_W - 12, TD_H - 12);
  rect(c.frame, 14, 14, TD_W - 28, TD_H - 28);
  const glyphs = touchdownGlyphDots();
  for (const d of glyphs) rect(c.glow, d.x - 3.5, d.y - 3.5, 7, 7);
  for (const d of glyphs) {
    rect(c.socket, d.x - 2.5, d.y - 2.5, 5, 5);
    rect(c.bulb, d.x - 2, d.y - 2, 4, 4);
    rect(c.bulbHot, d.x - 1.5, d.y - 1.5, 2, 2);
  }
  ctx.restore();
}
