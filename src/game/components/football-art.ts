import { FOOTBALL_ART_STAGES } from './football-deluxe-art';
import { withBroadcastAnchor } from './football-broadcast';
import { sharpPixelRect } from './football-pixel-scale';
/** Shared kit policy: body is the solid primary jersey; trim is the secondary helmet. */
export type FootballKit = { body: string; trim: string; dir: 1 | -1; edge?: string; skin?: string; position?: SkinPosition };
/** Rendering-only helmet identity; never swap the team palette used by field art. */
export const helmetColor = (kit: Pick<FootballKit, 'trim'>): string => kit.trim;
export const UNIFORM = { pants: '#ffffff', pantsShade: '#f1f3f5', facemask: '#ffffff', ink: '#10213a' } as const;
/** Cosmetic position palette only: never stored on athletes or used by gameplay. */
export const SKIN_TONES = ['#f0bd93', '#d99b6c', '#af734c', '#825038', '#563726'] as const;
const POSITION_TONE = { QB: 1, OL: 3, RB: 4, WR: 0, TE: 2, DL: 0, LB: 2, DB: 3,
  K: 4, H: 1, KR: 4 } as const;
export type SkinPosition = keyof typeof POSITION_TONE;
export const positionSkin = (position: SkinPosition): string => SKIN_TONES[POSITION_TONE[position]];
export const playerSkin = (kit: Pick<FootballKit, 'skin'>): string => kit.skin ?? positionSkin('RB');
export function positionKit<T extends Pick<FootballKit, 'body' | 'trim'>>(kit: T, position: SkinPosition): T & { skin: string; position: SkinPosition } {
  return { ...kit, skin: positionSkin(position), position };
}
/** Special-team duty remains fixed while that player runs, turns or is tackled. */
export function specialSkinPosition(
  special: { kind: string; kicker: number; returner: number },
  athlete: { id: number; role: SkinPosition },
): SkinPosition {
  return athlete.id === special.kicker ? 'K'
    : athlete.id === special.returner ? special.kind === 'field-goal' ? 'H' : 'KR'
    : athlete.role;
}
export const classicSkinPosition = (defender: { id: number; roamer?: unknown; motion?: unknown }): SkinPosition =>
  defender.id === 10 ? 'K' : defender.roamer || defender.motion ? 'LB' : 'DB';
type TeamPalette = { body: string; trim?: string };
function luminance(hex: string) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
}
export function uniformKit(team: TeamPalette, dir: 1 | -1, opponent?: TeamPalette): FootballKit {
  const a = luminance(team.body), b = opponent ? luminance(opponent.body) : a;
  const similar = !!opponent && (Math.max(a, b) + .05) / (Math.min(a, b) + .05) < 1.8;
  return { body: team.body, trim: team.trim || team.body, dir,
    edge: similar ? dir === -1 ? UNIFORM.pants : UNIFORM.ink : undefined };
}

export type PixelPut = (color: string, x: number, y: number, w: number, h: number) => void;
export const BALL_ART = { leather: '#8a4a1f', highlight: '#b87538', shade: '#60351e',
  stripe: '#fffaf0', outline: '#10213a' } as const;
/** Crisp pointed football with TWO end stripes; held and flight art share the same anatomy. */
export function footballPixels(put: PixelPut, x: number, y: number, held = false, tall = false) {
  const w = held ? 9 : 11, h = held ? 5 : 7;
  const draw: PixelPut = tall
    ? (c, u, v, rw, rh) => put(c, x + h - (v - y) - rh, y + (u - x), rh, rw)
    : put;
  draw(BALL_ART.outline, x + 3, y, w - 6, 1);
  draw(BALL_ART.outline, x + 1, y + 1, w - 2, h - 2);
  draw(BALL_ART.outline, x, y + 2, w, h - 4);
  draw(BALL_ART.outline, x + 3, y + h - 1, w - 6, 1);
  draw(BALL_ART.leather, x + 2, y + 1, w - 4, h - 2);
  draw(BALL_ART.leather, x + 1, y + 2, w - 2, h - 4);
  draw(BALL_ART.highlight, x + 3, y + 1, w - 6, 1);
  draw(BALL_ART.shade, x + 3, y + h - 2, w - 6, 1);
  draw(BALL_ART.stripe, x + 2, y + 1, 1, h - 2);
  draw(BALL_ART.stripe, x + w - 3, y + 1, 1, h - 2);
  // Small central lace; brown remains visible between the two white end bands.
  draw(BALL_ART.stripe, x + Math.floor(w / 2), y + Math.floor(h / 2), 1, 1);
  if (FOOTBALL_ART_STAGES.ball) { // inside the original mask: specular + darker lower tips
    draw('#d29150', x + 3, y + 1, 1, 1);
    draw(BALL_ART.shade, x + 1, y + h - 3, 1, 1);
    draw(BALL_ART.shade, x + w - 2, y + h - 3, 1, 1);
    // Fine leather ridge and inset seams use the extra 16-bit pixel grid.
    draw('#dca06a', x + 3.5, y + 1.5, Math.max(1, w - 7), .5);
    draw('#4b291b', x + 3, y + h - 1.5, Math.max(1, w - 6), .5);
    draw(BALL_ART.stripe, x + Math.floor(w / 2) - .5, y + Math.floor(h / 2), .5, 1);
  }
}
export function drawFootballBall(ctx: CanvasRenderingContext2D, x: number, y: number,
  options: { held?: boolean; small?: boolean; z?: number; spin?: number; shadow?: boolean } = {}) {
  return withBroadcastAnchor(ctx, x, y, () => ballAtAnchor(ctx, x, y, options));
}
function ballAtAnchor(ctx: CanvasRenderingContext2D, x: number, y: number,
  options: { held?: boolean; small?: boolean; z?: number; spin?: number; shadow?: boolean }) {
  const held = !!options.held, small = held || !!options.small;
  const z = options.z ?? 0, tall = !held && Math.floor((options.spin ?? 0) * 8) % 2 !== 0;
  const width = tall ? small ? 5 : 7 : small ? 9 : 11, height = tall ? small ? 9 : 11 : small ? 5 : 7;
  const put: PixelPut = (c, u, v, w, h) => { ctx.fillStyle = c; sharpPixelRect(ctx, Math.round(u * 2) / 2, Math.round(v * 2) / 2, w, h); };
  if (options.shadow) {
    const w = Math.max(3, 8 - Math.round(z / 14));
    put('rgba(8,40,16,.35)', x - w / 2, y + 2, w, 2);
  }
  footballPixels(put, Math.round(x) - Math.floor(width / 2), Math.round(y - z) - Math.floor(height / 2), small, tall);
}
