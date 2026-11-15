/** Native-resolution RGB software canvas. Every operation writes hard-edged palette pixels. */
export const W = 192, H = 192;
export const C = {
  void: "#101a34", night: "#17294b", deep: "#24385c", steel: "#536d91",
  gold: "#ffd34e", amber: "#f39a3e", cream: "#fff0bc", red: "#d6383d",
  redLite: "#ff6658", blue: "#1564c9", blueLite: "#54a6ff", blueDark: "#123b86",
  white: "#f5f4e8", ice: "#bfd5dd", ink: "#10182b", turf: "#19854f",
  turf2: "#22a45d", turfDark: "#12613e", turfLite: "#5dc56a", skin: "#f3b36d",
  leather: "#bd5c28", leatherHi: "#f29442", leatherDark: "#71331f",
  crowdA: "#ffcf67", crowdB: "#fa7454", crowdC: "#82baff", crowdD: "#f5eee0",
} as const;

const hex = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const palette = [...new Set(Object.values(C))].map(hex);
export class PixelCanvas {
  readonly data = new Uint8Array(W * H * 3);
  fill(color: string, x: number, y: number, w: number, h: number) {
    const rgb = hex(color), x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      let p = (yy * W + x0) * 3;
      for (let xx = x0; xx < x1; xx++, p += 3) {
        this.data[p] = rgb[0]; this.data[p + 1] = rgb[1]; this.data[p + 2] = rgb[2];
      }
    }
  }
  rect(color: string, x: number, y: number, w: number, h: number) {
    this.fill(color, Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }
  clear(color: string) { this.fill(color, 0, 0, W, H); }
  /** Defensive palette projection; drawing palette colors stays an exact identity operation. */
  quantize() {
    for (let i = 0; i < this.data.length; i += 3) {
      let best = palette[0]!, score = Infinity;
      for (const p of palette) {
        const d = (this.data[i]! - p[0]!) ** 2 + (this.data[i + 1]! - p[1]!) ** 2 + (this.data[i + 2]! - p[2]!) ** 2;
        if (d < score) { score = d; best = p; }
      }
      this.data[i] = best[0]!; this.data[i + 1] = best[1]!; this.data[i + 2] = best[2]!;
    }
    return this.data;
  }
}

// Compact 3x5 arcade font, intentionally hand-set for the title and stadium marks.
const FONT: Record<string, string> = {
  K:"101101110101101", R:"110101110101101", "8":"111101111101111",
  "6":"111100111101111", "'":"010010000000000", I:"111010010010111",
  C:"111100100100111", T:"111010010010010", U:"101101101101111",
  N:"110101101101101", E:"111100110100111", D:"110101101101110",
  A:"010101111101101", Y:"101101010010010", " ":"000000000000000",
};
export function text3(c: PixelCanvas, text: string, x: number, y: number, color: string, scale = 1) {
  let cx = x;
  for (const ch of text) {
    const bits = FONT[ch] ?? FONT[" "];
    for (let i = 0; i < 15; i++) if (bits![i] === "1") c.rect(color, cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale);
    cx += 4 * scale;
  }
}
export const textWidth = (s: string, scale = 1) => s.length * 4 * scale - scale;

export function ball(c: PixelCanvas, cx: number, cy: number, airborne = false) {
  const w = airborne ? 11 : 9, h = airborne ? 7 : 5, x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  c.rect(C.ink, x + 2, y, w - 4, 1); c.rect(C.ink, x, y + 2, w, h - 4);
  c.rect(C.ink, x + 2, y + h - 1, w - 4, 1); c.rect(C.leather, x + 1, y + 1, w - 2, h - 2);
  c.rect(C.leatherHi, x + 3, y + 1, w - 6, 1); c.rect(C.leatherDark, x + 3, y + h - 2, w - 6, 1);
  c.rect(C.cream, x + 2, y + 1, 1, h - 2); c.rect(C.cream, x + w - 3, y + 1, 1, h - 2);
  c.rect(C.white, x + Math.floor(w / 2), y + Math.floor(h / 2), 1, 1);
}
