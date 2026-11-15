import { introPose } from "./intro-scene.ts";
import { PixelCanvas, C, ball } from "./intro-pixels.ts";
import { gamePlayer } from "./intro-game-sprites.ts";

const GLYPHS: Record<string, string[]> = {
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
};
function bigText(c: PixelCanvas, word: string, x: number, y: number, scale: number, main: string, accent: string) {
  const cells: [number, number][] = [];
  let ox = 0;
  for (const ch of word) {
    if (ch === "'") { cells.push([ox + 3, 0], [ox + 2, 1], [ox + 1, 2]); ox += 7; continue; }
    const glyph = GLYPHS[ch]!;
    glyph.forEach((row, gy) => [...row].forEach((bit, gx) => { if (bit === "1") cells.push([ox + gx, gy]); }));
    ox += 6;
  }
  const put = (color: string, dx: number, dy: number, w = scale, h = scale) =>
    c.rect(color, x + dx * scale, y + dy * scale, w, h);
  // Hard red arcade shadow, navy outline, then the two-tone chrome face.
  for (const [gx, gy] of cells) put(C.red, gx + 1, gy + 1);
  for (const [gx, gy] of cells) for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    if (!cells.some(([cx, cy]) => cx === gx + dx && cy === gy + dy)) put(C.blueDark, gx + dx, gy + dy);
  }
  for (const [gx, gy] of cells) {
    put(main === C.white && gy >= 3 ? (gy === 3 ? C.blueLite : C.ice) : main, gx, gy);
    if (gy >= 4) put(accent, gx, gy, scale, Math.max(1, Math.floor(scale / 3)));
  }
}

function fieldAndStadium(c: PixelCanvas, frame: number) {
  c.clear(C.night);
  // Deep navy rafters and blocky beams. Lamps are small bright pixels, not glows.
  c.rect(C.void, 0, 0, 192, 8); c.rect(C.steel, 0, 8, 192, 2);
  c.rect(C.deep, 0, 10, 192, 3); c.rect(C.void, 0, 13, 192, 4);
  c.rect(C.steel, 0, 16, 192, 2);
  for (const x of [14, 48, 96, 144, 178]) {
    c.rect(C.steel, x, 17, 2, 10); c.rect(C.gold, x - 5, 22, 12, 3);
    c.rect(C.cream, x - 3, 22, 8, 2); c.rect(C.amber, x - 1, 21, 3, 1);
  }
  // Crowd tiers in a close side-on stadium: densely packed faces, jerseys and cheers.
  c.rect(C.deep, 0, 28, 192, 29);
  for (let row = 0; row < 3; row++) {
    const y = 30 + row * 8;
    for (let x = (row % 2) * 3 - 3; x < 194; x += 7) {
      const id = Math.abs(x * 5 + row * 13) % 6;
      const shirt = [C.crowdA, C.crowdB, C.crowdC, C.crowdD, C.redLite, C.blueLite][id]!;
      const xx = x + 2;
      c.rect(C.skin, xx + 1, y, 3, 3);
      c.rect(C.ink, xx, y + 2, 5, 5);
      c.rect(shirt, xx, y + 3, 5, 4);
      const waving = ((Math.floor(frame / 4) + Math.floor(x / 7) + row) % 4) === 0;
      c.rect(shirt, xx - 1, y + (waving ? 0 : 3), 1, 4);
      c.rect(C.skin, xx - 1, y + (waving ? 0 : 6), 1, 2);
      c.rect(shirt, xx + 5, y + (waving ? 0 : 3), 1, 4);
      c.rect(C.skin, xx + 5, y + (waving ? 0 : 6), 1, 2);
    }
  }
  // Thin fencing and the front row make the grandstand read at a glance.
  c.rect(C.void, 0, 54, 192, 2); c.rect(C.steel, 0, 56, 192, 1);
  for (let x = 0; x < 192; x += 12) c.rect(C.cream, x, 53, 1, 4);
  c.rect(C.crowdA, 0, 58, 192, 2); c.rect(C.void, 0, 60, 192, 3);
  // A packed sideline at the back of the turf.
  for (let x = 3; x < 192; x += 10) {
    c.rect(C.ink, x, 62, 6, 12); c.rect(x % 3 ? C.red : C.blue, x + 1, 64, 4, 7);
    c.rect(C.skin, x + 2, 62, 3, 2);
  }
  // Low sideline horizon, vivid field fills the lower half of the square.
  c.rect(C.white, 0, 75, 192, 2); c.rect(C.turfDark, 0, 77, 192, 115);
  c.rect(C.turf, 0, 83, 192, 109);
  c.rect(C.turf2, 0, 85, 192, 17); c.rect(C.turf2, 0, 119, 192, 17);
  c.rect(C.turf2, 0, 153, 192, 17); c.rect(C.turf2, 0, 187, 192, 5);
  // Wide perspective-like yard stripes, with compressed horizontal hash marks.
  for (const y of [84, 118, 152, 186]) {
    c.rect(C.white, 0, y, 192, 1);
    for (let x = 4; x < 192; x += 11) c.rect(C.ice, x, y - 4, 2, 1);
  }
  for (const x of [21, 65, 109, 153, 188]) {
    c.rect(C.ice, x, 101, 3, 1); c.rect(C.ice, x, 135, 3, 1);
    c.rect(C.ice, x, 169, 3, 1);
  }
  // No extensive empty turf: a near sideline stripe frames the action.
  c.rect(C.cream, 0, 179, 192, 1);
}

function title(c: PixelCanvas, opacity: number) {
  if (opacity <= 0) return;
  // Light still matters beneath the logo; full title resolves by the menu's 4.5s poster frame.
  const scale = 6 + Math.round(4 * opacity), krWidth = (5 + 1 + 5) * scale;
  const startX = Math.round((192 - krWidth) / 2), startY = 12;
  bigText(c, "KR", startX, startY, scale, C.white, C.blueLite);
  // Apostrophe and year lock up at lower right, in game-red with a warm highlight.
  bigText(c, "'86", 126, 159, 3, C.red, C.redLite);
  // Crisp speed bars and a high-contrast underscore make the title read as an emblem.
  if (opacity > .4) {
    c.rect(C.blueLite, 22, 88, 30, 2); c.rect(C.red, 145, 185, 35, 2);
  }
}

export function renderIntroFrame(frame: number): Uint8Array {
  const pose = introPose(frame);
  const frozenFrame = Math.min(pose.frame, 108);
  const c = new PixelCanvas();
  fieldAndStadium(c, frozenFrame);
  // Runner fills the foreground, with a pursuing red defender visible through the cut.
  gamePlayer(c, pose, true);
  gamePlayer(c, pose);
  if (!pose.held) ball(c, pose.ballX, pose.ballY, true);
  else ball(c, pose.ballX, pose.ballY, false);
  title(c, pose.title);
  return c.quantize();
}
