import type { Athlete, FootballGame } from '../lib/football/types';
import { legendaryAthlete } from '../lib/football/legendary';
import { isTackleActor } from '../lib/football/tackle-scene';
import { withBroadcastAnchor } from './football-broadcast';

const DIGITS = [
  '111101101101111', '010110010010111', '111001111100111', '111001111001111',
  '101101111001001', '111100111001111', '111100111101111', '111001001001001',
  '111101111101111', '111101111001111',
];
type Run = readonly [x: number, y: number, width: number, ink: string];
const glyphs = new Map<number, readonly Run[]>();
function glyph(number: number) {
  const cached = glyphs.get(number);
  if (cached) return cached;
  const value = String(number), width = value.length * 4 + 1;
  const pixels = Array.from({ length: 7 }, () => new Uint8Array(width));
  for (let digit = 0; digit < value.length; digit++) {
    const bits = DIGITS[Number(value[digit])]!;
    for (let i = 0; i < 15; i++) if (bits[i] === '1') {
      const x = digit * 4 + i % 3 + 1, y = Math.floor(i / 3) + 1;
      for (const [dx, dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]])
        pixels[y + dy!]![x + dx!] ||= 1;
    }
    for (let i = 0; i < 15; i++) if (bits[i] === '1')
      pixels[Math.floor(i / 3) + 1]![digit * 4 + i % 3 + 1] = 2;
  }
  const runs: Run[] = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < width;) {
    const ink = pixels[y]![x], start = x++;
    while (x < width && pixels[y]![x] === ink) x++;
    if (ink) runs.push([start - Math.floor(width / 2), y, x - start, ink === 2 ? '#fffdf2' : '#10213a']);
  }
  glyphs.set(number, runs);
  return runs;
}
/** Same anchor, 19px clearance and shared 4Hz/1px bob as carrierMark.
 * Cached bitmap runs, not fonts, independent timers or a second render loop. */
export function jerseyMark(ctx: CanvasRenderingContext2D, x: number, y: number, seconds: number, number: number, lift = 0) {
  withBroadcastAnchor(ctx, x, y, () => {
    const cy = Math.round(y) - 21 - Math.floor(seconds * 4) % 2 - lift;
    for (const [dx, dy, width, ink] of glyph(number)) {
      ctx.fillStyle = ink;
      ctx.fillRect(Math.round(x) + dx, cy + dy, width, 1);
    }
  });
}
/** Resolve just the frame's visible unit; static roster lookups are O(1).
 * Nearby labels lift in small steps; athletes and camera never move. */
export function drawLegendaryUnit(ctx: CanvasRenderingContext2D, g: FootballGame, players: readonly Athlete[], seconds: number) {
  const occupied: { x: number; y: number }[] = [];
  for (const a of players) {
    if (isTackleActor(g, a, g.special ? 'special' : 'scrimmage')) continue;
    const legend = legendaryAthlete(g, a);
    if (!legend) continue;
    let lift = 0;
    while (occupied.some(p => Math.abs(p.x - a.x) < 10 && Math.abs(p.y - (a.y - lift)) < 8)) lift += 8;
    occupied.push({ x: a.x, y: a.y - lift });
    jerseyMark(ctx, a.x, a.y, seconds, legend.number, lift);
  }
}
