/** Slim articulated Full Game anatomy using the same uniforms/ball as Classic. */
import { drawFootballBall, UNIFORM, type FootballKit } from './football-art';
import { FOOTBALL_ART_STAGES as ART, tone } from './football-deluxe-art';
import { drawPixelEnlarged } from './football-pixel-scale';
export type Kit = FootballKit;
const SKIN = '#e0a370', INK = '#10213a', SHADOW = 'rgba(8,40,16,.35)', GOLD = '#f4d23c';
export const R = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

function helmet(ctx: CanvasRenderingContext2D, kit: Kit, hx: number, hy: number, d: 1 | -1) {
  hx += 1; hy += 1;
  if (kit.edge) R(ctx, kit.edge, hx, hy - 1, 6, 1);
  R(ctx, INK, hx, hy, 6, 1);
  R(ctx, INK, hx - 1, hy + 1, 8, 3);
  R(ctx, INK, hx, hy + 4, 6, 1);
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

export type Pose = { step?: number; ball?: boolean; engaged?: boolean; lean?: number; kick?: number; hold?: boolean; crouch?: boolean; view?: BodyView };
export type BodyView = 0 | 1 | 2 | 3 | 4;
/** Five hand-authored late-NES silhouettes; view changes anatomy, never a flat rotation. */
function turnSpriteNative(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit,
  view: BodyView, options: { step?: number; ball?: boolean; crouch?: boolean; hold?: boolean } = {}) {
  const cx = Math.round(x), top = Math.round(y) - (options.crouch ? 7 : 8);
  const d = kit.dir, f = Math.floor(options.step ?? 0) & 1, ball = !!options.ball;
  const shade = tone(kit.body, .72), light = tone(kit.body, 1.16);
  R(ctx, SHADOW, cx - (view === 2 ? 4 : 5), Math.round(y) + 5, view === 2 ? 8 : 10, 2);
  const ballSide: 1 | -1 = view >= 3 ? (d > 0 ? -1 : 1) : d;
  // On the rear turn the ball is carried behind the back and only its outside
  // pixels remain visible; front/profile views keep it in front of the chest.
  if (ball && view >= 3) heldBall(ctx, ballSide > 0 ? cx + 1 : cx - 5, top + 7);
  // Legs are re-staged per view: the far leg is darker and tucked behind the near one.
  if (view === 2) {
    R(ctx, UNIFORM.pantsShade, cx - 1, top + 10, 2, 3);
    R(ctx, UNIFORM.pants, cx, top + 10, 2, 3);
    R(ctx, INK, cx + (d > 0 ? 1 : -2), top + 12, 3, 1);
  } else {
    const back = view >= 3;
    const spread = f ? 1 : 0;
    R(ctx, UNIFORM.pantsShade, cx - 2 + spread, top + 10, 2, 2);
    R(ctx, UNIFORM.pants, cx - 2 + spread, top + 11, 2, 2);
    R(ctx, UNIFORM.pants, cx + (back ? 0 : 1) - spread, top + 10, 2, 3);
    R(ctx, INK, cx - 3 + spread, top + 13, 3, 1);
    R(ctx, INK, cx + (back ? 0 : 1) - spread, top + 13, 3, 1);
  }
  // Chest/hips: front, two foreshortened three-quarter frames, profile, and back.
  if (view === 2) {
    R(ctx, INK, cx - 2, top + 6, 5, 5);
    R(ctx, shade, cx - 1, top + 6, 1, 4);
    R(ctx, kit.body, cx, top + 6, 2, 4);
    R(ctx, light, cx, top + 6, 1, 1);
  } else {
    const narrow = view === 1 || view === 3;
    const w = narrow ? 4 : 6, left = cx - Math.floor(w / 2);
    R(ctx, INK, left - 1, top + 6, w + 2, 5);
    R(ctx, shade, left, top + 6, 1, 4);
    R(ctx, kit.body, left + 1, top + 6, w - 2, 4);
    R(ctx, light, left + 1, top + 6, Math.max(1, w - 3), 1);
    if (view >= 3) {
      R(ctx, kit.trim, cx - 1, top + 8, 2, 1); // back yoke / number block
      R(ctx, shade, view === 3 ? cx + 1 : cx + 2, top + 9, view === 3 ? 1 : 2, 1);
      if (view === 3) R(ctx, kit.trim, cx + 1, top + 7, 1, 1);
    } else {
      R(ctx, kit.trim, left + 1, top + 8, w - 2, 1); // front stripe / chest seam
    }
  }
  // Bulky shoulder pads retain their silhouette as the chest turns away.
  if (view === 2) {
    R(ctx, INK, cx - 2, top + 5, 5, 2);
    R(ctx, kit.body, cx - 1, top + 5, 3, 1);
    R(ctx, kit.trim, cx - 2, top + 5, 1, 2);
    R(ctx, light, cx, top + 5, 1, 1);
  } else {
    const w = view === 1 || view === 3 ? 6 : 8, left = cx - Math.floor(w / 2);
    R(ctx, INK, left, top + 5, w, 2);
    R(ctx, kit.body, left + 1, top + 5, w - 2, 1);
    R(ctx, kit.trim, left, top + 5, 1, 2);
    R(ctx, kit.trim, left + w - 1, top + 5, 1, 2);
    R(ctx, light, left + 2, top + 5, Math.max(1, w - 4), 1);
  }
  // The far arm stays behind the chest; the near forearm wraps the ball.
  if (ball && view < 3) heldBall(ctx, ballSide > 0 ? cx + 1 : cx - 5, top + 7);
  if (view === 2) {
    const nearX = d > 0 ? cx + 1 : cx - 2, farX = d > 0 ? cx - 2 : cx + 1;
    R(ctx, shade, farX, top + 7, 2, 2); R(ctx, kit.body, farX, top + 7, 1, 2);
    R(ctx, SKIN, farX, top + 9, 1, 1);
    R(ctx, INK, nearX, top + 7, 2, 3); R(ctx, kit.body, nearX, top + 7, 1, 2);
    if (!ball) R(ctx, SKIN, nearX, top + 9, 1, 1);
  } else {
    const leftY = top + 7 + f, rightY = top + 7 - f;
    R(ctx, INK, cx - 4, leftY, 2, 3); R(ctx, shade, cx - 4, leftY, 1, 2);
    R(ctx, kit.body, cx - 3, leftY, 1, 2);
    R(ctx, INK, cx + 2, rightY, 2, 3); R(ctx, kit.body, cx + 2, rightY, 1, 2);
    R(ctx, shade, cx + 3, rightY, 1, 2);
    if (!ball || ballSide > 0) R(ctx, SKIN, cx - 4, leftY + 2, 1, 1);
    if (!ball || ballSide < 0) R(ctx, SKIN, cx + 3, rightY + 2, 1, 1);
    if (ball) {
      const nearX = ballSide > 0 ? cx + 2 : cx - 4;
      R(ctx, kit.body, nearX, top + 7, 2, 2);
      R(ctx, INK, nearX, top + 8, 2, 1);
    }
  }
  // Five helmet profiles: shell highlight, rear shade, face opening and mask vary by view.
  if (view === 2) {
    R(ctx, INK, cx - 1, top + 1, 4, 1);
    R(ctx, INK, cx - 2, top + 2, 6, 3);
    R(ctx, INK, cx - 1, top + 5, 4, 1);
    R(ctx, kit.trim, cx - 1, top + 1, 4, 4);
    R(ctx, tone(kit.trim, 1.28), cx, top + 1, 2, 1);
    R(ctx, kit.body, cx, top + 1, 1, 1);
    R(ctx, shade, cx + 2, top + 4, 1, 1);
    R(ctx, SKIN, cx + (d > 0 ? 2 : -1), top + 2, 2, 2);
    R(ctx, INK, cx + (d > 0 ? 3 : -1), top + 3, 2, 2);
  } else {
    const hw = view === 1 || view === 3 ? 6 : 8, hx = cx - Math.floor(hw / 2);
    R(ctx, INK, hx, top + 1, hw, 1);
    R(ctx, INK, hx - 1, top + 2, hw + 2, 3);
    R(ctx, INK, hx, top + 5, hw, 1);
    R(ctx, kit.trim, hx, top + 1, hw, 4);
    R(ctx, tone(kit.trim, 1.28), hx + 1, top + 1, Math.max(1, hw - 3), 1);
    if (view !== 4) R(ctx, kit.body, d > 0 ? hx + 1 : hx + hw - 2, top + 1, 1, 1);
    R(ctx, shade, hx + hw - 2, top + 4, 1, 1);
    if (view === 4) {
      R(ctx, kit.body, cx - 1, top + 1, 2, 1); // rear stripe; no face on the back
      R(ctx, INK, hx, top + 4, hw, 1);
    } else {
      const faceX = d > 0 ? hx + Math.floor(hw / 2) : hx + 1;
      R(ctx, SKIN, faceX, top + 2, view === 1 || view === 3 ? 1 : 2, 2);
      R(ctx, INK, faceX, top + 4, view === 1 || view === 3 ? 2 : 3, 1);
      R(ctx, INK, d > 0 ? hx + hw - 1 : hx, top + 2, 1, 3);
    }
  }
  if (kit.edge) R(ctx, kit.edge, cx - 2, top, 4, 1);
  if (options.hold && !ball) R(ctx, SKIN, cx + d * 4, top + 8, 1, 1);
}
export function turnSprite(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit,
  view: BodyView, options: { step?: number; ball?: boolean; crouch?: boolean; hold?: boolean } = {}) {
  turnSpriteNative(ctx, x, y, kit, view, options);
}
/** Slim standing sprite, anchor = torso centre. 6px shoulders with pad caps, 3px torso, split legs, 6px helmet. */
function slimNative(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, p: Pose = {}) {
  if (p.view !== undefined) { turnSprite(ctx, x, y, kit, p.view, p); return; }
  const step = p.step ?? 0, d = kit.dir, lean = p.lean ?? 0;
  const px = Math.round(x) - 4, py = Math.round(y) - 8 + (p.crouch ? 1 : 0);
  ctx.save();
  ctx.translate(0, -Math.round(.4 * (1 - Math.cos(step * Math.PI))));
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
  R(ctx, INK, px + 2 + lean, py + 6, 5, 5);
  R(ctx, kit.body, px + 3 + lean, py + 6, 3, 4);
  R(ctx, kit.trim, px + 3 + lean, py + 8, 3, 1);
  if (ART.players) { R(ctx, tone(kit.body, .78), px + 3 + lean, py + 9, 1, 1); R(ctx, tone(kit.body, .78), px + 5 + lean, py + 9, 1, 1); }
  const la = -Math.sin(step * Math.PI / 2), ra = -la;
  if (p.hold) {
    R(ctx, kit.body, px + (d > 0 ? 6 : 1) + lean, py + 7, 2, 1); R(ctx, SKIN, px + (d > 0 ? 8 : 0) + lean, py + 7, 1, 1);
  } else {
    R(ctx, tone(kit.body, .76), px + 1 + lean, py + 7 + la, 2, 3);
    R(ctx, kit.body, px + 2 + lean, py + 7 + la, 1, 2);
    R(ctx, SKIN, px + 2 + lean, py + 9 + la, 1, 1);
    R(ctx, tone(kit.body, .76), px + 6 + lean, py + 7 + ra, 2, 3);
    R(ctx, kit.body, px + 6 + lean, py + 7 + ra, 1, 2);
    R(ctx, SKIN, px + 7 + lean, py + 9 + ra, 1, 1);
  }
  R(ctx, kit.body, px + 2 + lean, py + 5, 5, 1); // shoulder line
  R(ctx, kit.trim, px + 1 + lean, py + 5, 2, 1); R(ctx, kit.trim, px + 6 + lean, py + 5, 2, 1); // pad caps
  if (ART.players) R(ctx, tone(kit.body, 1.18), px + 3 + lean, py + 5, 3, 1);
  if (kit.edge) { R(ctx, kit.edge, px + lean, py + 6, 1, 2); R(ctx, kit.edge, px + 8 + lean, py + 6, 1, 2); }
  R(ctx, kit.body, px + 3 + lean, py + 6, 3, 1);
  if (ART.players) {
    R(ctx, tone(kit.body, 1.16), px + 4 + lean, py + 6, 1, 1);
    R(ctx, tone(kit.body, .68), px + 5 + lean, py + 7, 1, 2);
    R(ctx, UNIFORM.pantsShade, px + 2 + lean, py + 11, 1, 1);
    R(ctx, UNIFORM.pantsShade, px + 6 + lean, py + 11, 1, 1);
  }
  helmet(ctx, kit, px + 1 + lean + (d > 0 ? 0 : 0), py - 1, d);
  if (p.ball) heldBall(ctx, d > 0 ? px + 5 + lean : px - 1 + lean, py + 7);
  if (p.engaged) { // contact box ~9x10, corner ticks only
    const bx = Math.round(x) - 5, by = Math.round(y) - 5, c = 'rgba(241,230,208,.85)';
    R(ctx, c, bx, by, 2, 1); R(ctx, c, bx, by, 1, 2); R(ctx, c, bx + 8, by, 2, 1); R(ctx, c, bx + 9, by, 1, 2);
    R(ctx, c, bx, by + 10, 2, 1); R(ctx, c, bx, by + 9, 1, 2); R(ctx, c, bx + 8, by + 10, 2, 1); R(ctx, c, bx + 9, by + 9, 1, 2);
  }
  ctx.restore();
}
export function slim(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, p: Pose = {}) {
  drawPixelEnlarged(ctx, x, y, (target, px, py) => slimNative(target, px, py, kit, p), 6);
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
