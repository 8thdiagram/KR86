/** Slim articulated Full Game anatomy using the same uniforms/ball as Classic. */
import { drawFootballBall, UNIFORM, type FootballKit } from './football-art';
import { FOOTBALL_ART_STAGES as ART, tone } from './football-deluxe-art';
export type Kit = FootballKit;
const SKIN = '#e0a370', INK = '#10213a', SHADOW = 'rgba(8,40,16,.35)', GOLD = '#f4d23c';
export const R = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

function helmet(ctx: CanvasRenderingContext2D, kit: Kit, hx: number, hy: number, d: 1 | -1) {
  hx += 1; hy += 1;
  if (kit.edge) R(ctx, kit.edge, hx, hy - 1, 6, 1);
  R(ctx, INK, hx - 1, hy, 8, 5);
  R(ctx, kit.trim, hx, hy, 6, 5); R(ctx, kit.body, hx + 2, hy, 1, 1);
  R(ctx, kit.body, d > 0 ? hx : hx + 5, hy + 2, 1, 2);
  R(ctx, SKIN, d > 0 ? hx + 3 : hx + 1, hy + 1, 2, 2);
  R(ctx, INK, d > 0 ? hx + 3 : hx + 1, hy + 3, 2, 1);
  R(ctx, INK, d > 0 ? hx + 5 : hx, hy + 1, 1, 3);
  if (ART.players) {
    R(ctx, tone(kit.trim, 1.3), d > 0 ? hx + 1 : hx + 4, hy, 1, 1);
    R(ctx, tone(kit.trim, .7), d > 0 ? hx : hx + 5, hy + 4, 1, 1);
  }
}
export function heldBall(ctx: CanvasRenderingContext2D, bx: number, by: number) {
  drawFootballBall(ctx, bx + 2, by + 1, { held: true });
}

export type Pose = { step?: number; ball?: boolean; engaged?: boolean; lean?: number; kick?: number; hold?: boolean; crouch?: boolean };
/** Slim standing sprite, anchor = torso centre. 6px shoulders with pad caps, 3px torso, split legs, 6px helmet. */
export function slim(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, p: Pose = {}) {
  const step = p.step ?? 0, d = kit.dir, lean = p.lean ?? 0;
  const px = Math.round(x) - 4, py = Math.round(y) - 8 + (p.crouch ? 1 : 0);
  ctx.save();
  ctx.translate(0, -.4 * (1 - Math.cos(step * Math.PI)));
  R(ctx, SHADOW, px, py + 13, 9, 2);
  const reach = Math.sin(step * Math.PI / 2) * 1.6;
  if (p.kick !== undefined) {
    // plant leg + swinging leg (kick 0 = cocked back, 1 = follow-through)
    R(ctx, UNIFORM.pants, px + 3, py + 10, 1, 3); R(ctx, INK, px + 3 + (d > 0 ? 0 : -1), py + 12, 2, 1);
    const swing = (p.kick * 2 - 1) * 4 * d;
    R(ctx, UNIFORM.pantsShade, px + 4, py + 10, 1, 1);
    R(ctx, UNIFORM.pants, px + 4 + Math.round(swing * .5), py + 11 - Math.round(p.kick * 2), 1, 2);
    R(ctx, INK, px + 4 + Math.round(swing), py + 12 - Math.round(p.kick * 4), 2, 1);
  } else {
    const lx = px + 2 - reach, rx = px + 5 + reach;
    const lh = reach < 0 ? 2 : 3, rh = reach > 0 ? 2 : 3;
    R(ctx, UNIFORM.pantsShade, lx, py + 10, 1, 1); R(ctx, UNIFORM.pantsShade, rx, py + 10, 1, 1);
    R(ctx, UNIFORM.pants, lx, py + 10 + (lh < 3 ? 0 : 1), 1, lh - (lh < 3 ? 0 : 1) + 1); R(ctx, UNIFORM.pants, rx, py + 10 + (rh < 3 ? 0 : 1), 1, rh - (rh < 3 ? 0 : 1) + 1);
    R(ctx, INK, lx + (d > 0 ? 0 : -1), py + 10 + lh, 2, 1); R(ctx, INK, rx + (d > 0 ? 0 : -1), py + 10 + rh, 2, 1);
  }
  R(ctx, kit.body, px + 3 + lean, py + 6, 3, 4);
  R(ctx, kit.trim, px + 3 + lean, py + 8, 3, 1);
  if (ART.players) { R(ctx, tone(kit.body, .78), px + 3 + lean, py + 9, 1, 1); R(ctx, tone(kit.body, .78), px + 5 + lean, py + 9, 1, 1); }
  const la = -Math.sin(step * Math.PI / 2), ra = -la;
  if (p.hold) {
    R(ctx, kit.body, px + (d > 0 ? 6 : 1) + lean, py + 7, 2, 1); R(ctx, SKIN, px + (d > 0 ? 8 : 0) + lean, py + 7, 1, 1);
  } else {
    if (!p.ball || d < 0) { R(ctx, kit.body, px + 2 + lean, py + 7 + la, 1, 2); R(ctx, SKIN, px + 2 + lean, py + 9 + la, 1, 1); }
    if (!p.ball || d > 0) { R(ctx, kit.body, px + 6 + lean, py + 7 + ra, 1, 2); R(ctx, SKIN, px + 6 + lean, py + 9 + ra, 1, 1); }
  }
  R(ctx, kit.body, px + 2 + lean, py + 5, 5, 1); // shoulder line
  R(ctx, kit.trim, px + 1 + lean, py + 5, 2, 1); R(ctx, kit.trim, px + 6 + lean, py + 5, 2, 1); // pad caps
  if (ART.players) R(ctx, tone(kit.body, 1.18), px + 3 + lean, py + 5, 3, 1);
  if (kit.edge) { R(ctx, kit.edge, px + lean, py + 6, 1, 2); R(ctx, kit.edge, px + 8 + lean, py + 6, 1, 2); }
  R(ctx, kit.body, px + 3 + lean, py + 6, 3, 1);
  helmet(ctx, kit, px + 1 + lean + (d > 0 ? 0 : 0), py - 1, d);
  if (p.ball) heldBall(ctx, d > 0 ? px + 5 + lean : px - 1 + lean, py + 7);
  if (p.engaged) { // contact box ~9x10, corner ticks only
    const bx = Math.round(x) - 5, by = Math.round(y) - 5, c = 'rgba(241,230,208,.85)';
    R(ctx, c, bx, by, 2, 1); R(ctx, c, bx, by, 1, 2); R(ctx, c, bx + 8, by, 2, 1); R(ctx, c, bx + 9, by, 1, 2);
    R(ctx, c, bx, by + 10, 2, 1); R(ctx, c, bx, by + 9, 1, 2); R(ctx, c, bx + 8, by + 10, 2, 1); R(ctx, c, bx + 9, by + 9, 1, 2);
  }
  ctx.restore();
}
/** Gold chevron + under-foot bar that marks the ball carrier. */
export function carrierMark(ctx: CanvasRenderingContext2D, x: number, y: number, seconds: number) {
  const bob = Math.floor(seconds * 4) % 2, cx = Math.round(x), cy = Math.round(y) - 15 - bob;
  R(ctx, INK, cx - 3, cy - 1, 7, 4);
  R(ctx, GOLD, cx - 2, cy, 5, 1); R(ctx, GOLD, cx - 1, cy + 1, 3, 1); R(ctx, GOLD, cx, cy + 2, 1, 1);
  R(ctx, GOLD, cx - 4, Math.round(y) + 7, 9, 1);
}
/** Ball in the air: shadow on the turf, ball raised by z. */
export function airBall(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, spin: number) {
  drawFootballBall(ctx, x, y, { z, spin, small: true, shadow: true });
}
export function landingMark(ctx: CanvasRenderingContext2D, x: number, y: number, seconds: number) {
  const r = 4 + (Math.floor(seconds * 6) % 2), c = 'rgba(244,210,60,.8)';
  const cx = Math.round(x), cy = Math.round(y);
  for (let i = 1; i <= 2; i++) { R(ctx, c, cx - r + i, cy - 2 + i, 1, 1); R(ctx, c, cx + r - i, cy - 2 + i, 1, 1); R(ctx, c, cx - r + i, cy + 2 - i, 1, 1); R(ctx, c, cx + r - i, cy + 2 - i, 1, 1); }
}
/** Top-down goalposts at the back line: base, crossbar along y, uprights rising toward screen top. */
export function goalPosts(ctx: CanvasRenderingContext2D, x: number) {
  const Y = '#f4d23c', D = '#9c7d12';
  R(ctx, D, x, 96, 2, 6);            // base at y96
  R(ctx, Y, x, 83, 2, 27);           // crossbar spans the good window y83-109 (96 +/- 13)
  R(ctx, Y, x, 62, 2, 21); R(ctx, Y, x, 88, 2, 21); // uprights rise from each end
  R(ctx, D, x, 83, 2, 1); R(ctx, D, x, 109, 2, 1);
}
