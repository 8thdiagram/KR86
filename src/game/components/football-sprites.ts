/** Slim articulated Full Game anatomy using the same uniforms/ball as Classic. */
import { drawFootballBall, playerSkin, UNIFORM, type FootballKit } from './football-art';
import { FOOTBALL_ART_STAGES as ART, tone } from './football-deluxe-art';
import { drawPixelEnlarged } from './football-pixel-scale';
import { withBroadcastAnchor } from './football-broadcast';
export type Kit = FootballKit;
const INK = '#10213a', SHADOW = 'rgba(8,40,16,.35)', GOLD = '#f4d23c';
export const R = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  // Half-world-pixel authored edges survive the high-resolution canvas pass.
  ctx.fillStyle = c; ctx.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, w, h);
};

function helmet(ctx: CanvasRenderingContext2D, kit: Kit, hx: number, hy: number, d: 1 | -1) {
  hx += 1; hy += 1;
  // The team's primary color is the shell; secondary color stays an accent.
  if (kit.edge) R(ctx, kit.edge, hx + 1, hy - 1, 5, 1);
  R(ctx, INK, hx + 2, hy, 3, .5);
  R(ctx, kit.body, hx + 1, hy, 5, 4.5);
  R(ctx, kit.body, hx + 1.5, hy + 4.5, 4, .5);
  R(ctx, kit.trim, hx + 2, hy, 3, 1);
  R(ctx, tone(kit.body, 1.28), hx + 2, hy + 1, 2.5, .5);
  R(ctx, tone(kit.body, .68), hx + 4.5, hy + 3, 1, 1);
  R(ctx, kit.trim, d > 0 ? hx + 1 : hx + 5, hy + 2, 1, 2);
  const faceX = d > 0 ? hx + 3 : hx + 2;
  R(ctx, INK, faceX - 1, hy + 1, 3, 2); // recessed mask opening
  R(ctx, playerSkin(kit), faceX, hy + 1, 1, 1); // one-pixel face slot
  R(ctx, kit.body, faceX - 1, hy + 2, 3, 1); // shell-color facemask bar
  R(ctx, tone(kit.body, .62), faceX - 1, hy + 1.5, 3, .5);
  R(ctx, INK, faceX - 1, hy + 3, .5, 1);
  R(ctx, INK, faceX + 1.5, hy + 3, .5, 1);
  R(ctx, INK, d > 0 ? hx + 5 : hx + 1, hy + 1, 1, 3);
  if (ART.players) {
    R(ctx, tone(kit.body, 1.16), hx + 1, hy + 1, 1, 1);
    R(ctx, tone(kit.body, .78), hx + 5, hy + 4, 1, 1);
  }
}
export function heldBall(ctx: CanvasRenderingContext2D, bx: number, by: number) {
  drawFootballBall(ctx, bx + 2, by + 1, { held: true });
}

export type Pose = { step?: number; ball?: boolean; engaged?: boolean; lean?: number; kick?: number; hold?: boolean; crouch?: boolean; view?: BodyView };
export type BodyView = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** Shared visual facing bands; velocity is read, never changed or delayed. */
export function movementBodyView(vx: number, vy: number, facing: 1 | -1): BodyView | undefined {
  if (Math.hypot(vx, vy) < 3 || Math.abs(vy) < Math.abs(vx) * .55) return undefined;
  if (Math.abs(vx) < 3) return vy > 0 ? 0 : 4;
  const lateral = Math.sign(vx) === facing, diagonal = Math.abs(vx / vy);
  if (diagonal >= .75 && diagonal <= 1.45)
    return vy > 0 ? (lateral ? 5 : 7) : (lateral ? 6 : 8);
  return vy > 0 ? (lateral ? 1 : 3) : (lateral ? 3 : 1);
}
/** Nine hand-authored 16-bit silhouettes; view changes anatomy, never a flat rotation. */
function turnSpriteNative(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit,
  view: BodyView, options: { step?: number; ball?: boolean; crouch?: boolean; hold?: boolean } = {}) {
  const cx = Math.round(x), top = Math.round(y) - (options.crouch ? 7 : 8);
  // Continuous phase feeds the same two-beat cycle, giving knees and arms a
  // small intermediate silhouette without changing the cycle duration.
  const phase = options.step ?? 0;
  const d = kit.dir, f = (1 - Math.cos(phase * Math.PI)) / 2, ball = !!options.ball;
  const shade = tone(kit.body, .86), light = tone(kit.body, 1.16);
  R(ctx, SHADOW, cx - (view === 2 ? 4 : 5), Math.round(y) + 5, view === 2 ? 8 : 10, 2);
  const rearView = view === 3 || view === 4 || view === 7 || view === 8;
  const intermediate = view >= 5;
  const ballSide: 1 | -1 = rearView ? (d > 0 ? -1 : 1) : d;
  // On the rear turn the ball is carried behind the back and only its outside
  // pixels remain visible; front/profile views keep it in front of the chest.
  if (ball && rearView) heldBall(ctx, ballSide > 0 ? cx + 1 : cx - 5, top + 7);
  // Legs are re-staged per view: the far leg is darker and tucked behind the near one.
  if (view === 2) {
    R(ctx, UNIFORM.pantsShade, cx - 1, top + 10, 1, 3);
    R(ctx, UNIFORM.pants, cx, top + 10, 1, 3);
    R(ctx, INK, cx + (d > 0 ? 1 : -2), top + 12, 2, 1);
  } else {
    const back = rearView;
    const spread = f;
    R(ctx, UNIFORM.pantsShade, cx - 2 + spread, top + 10, 2, 2);
    R(ctx, UNIFORM.pants, cx - 2 + spread, top + 11, 2, 2);
    R(ctx, UNIFORM.pants, cx + (back ? 0 : 1) - spread, top + 10, 2, 3);
    R(ctx, INK, cx - 3 + spread, top + 13, 3, 1);
    R(ctx, INK, cx + (back ? 0 : 1) - spread, top + 13, 3, 1);
  }
  // Chest/hips: front, two foreshortened three-quarter frames, profile, and back.
  if (view === 2) {
    R(ctx, INK, cx - 2, top + 6, 4, 5);
    R(ctx, shade, cx - 1, top + 6, 1, 4);
    R(ctx, kit.body, cx, top + 6, 2, 4);
    R(ctx, light, cx, top + 6, 1, 1);
  } else {
    const narrow = view === 1 || view === 3;
    const w = narrow ? 3 : intermediate ? 4 : 5, left = cx - Math.floor(w / 2);
    R(ctx, INK, left, top + 6, w, 5);
    R(ctx, kit.body, left, top + 6, w, 4);
    R(ctx, light, left + 1, top + 6, Math.max(1, w - 2), 1);
    R(ctx, tone(kit.body, .68), left, top + 8, .5, 2);
    R(ctx, tone(kit.body, .78), left + w - .5, top + 8, .5, 2);
    R(ctx, kit.trim, left + .5, top + 7, .5, 2);
    R(ctx, tone(kit.body, 1.3), left + 1, top + 6.5, Math.max(1, w - 2), .5);
    if (rearView) {
      R(ctx, kit.trim, cx - 1, top + 8, 2, 1); // back yoke / number block
      R(ctx, kit.trim, cx + 1, top + 7, 1, 1);
      R(ctx, tone(kit.trim, .72), cx - .5, top + 8.5, 1.5, .5);
      R(ctx, shade, view === 3 || view === 7 ? cx + 1 : cx + 2, top + 9, 1, 1);
    } else {
      R(ctx, kit.trim, left + 1, top + 8, 1, 1); // compact secondary chest mark
    }
  }
  // Bulky shoulder pads retain their silhouette as the chest turns away.
  if (view === 2) {
    R(ctx, INK, cx - 2, top + 5, 4, 2);
    R(ctx, kit.body, cx - 1, top + 5, 2, 1);
    R(ctx, kit.trim, cx - 2, top + 5, 1, 2);
    R(ctx, light, cx, top + 5, 1, 1);
  } else {
    const narrow = view === 1 || view === 3;
    const w = narrow ? 5 : intermediate ? 6 : 7, left = cx - Math.floor(w / 2);
    R(ctx, INK, left, top + 5, w, 2);
    R(ctx, kit.body, left + 1, top + 5, w - 2, 1);
    R(ctx, tone(kit.body, .72), left + 1, top + 6, w - 2, .5);
    R(ctx, kit.trim, left, top + 5, 1, 2);
    R(ctx, kit.trim, left + w - 1, top + 5, 1, 2);
    R(ctx, light, left + 2, top + 5, Math.max(1, w - 4), 1);
    R(ctx, tone(kit.trim, .78), left + .5, top + 6, .5, 1);
    R(ctx, tone(kit.trim, .78), left + w - 1, top + 6, .5, 1);
  }
  // The far arm stays behind the chest; the near forearm wraps the ball.
  if (ball && !rearView) heldBall(ctx, ballSide > 0 ? cx + 1 : cx - 5, top + 7);
  if (view === 2) {
    const nearX = d > 0 ? cx + 1 : cx - 2, farX = d > 0 ? cx - 2 : cx + 1;
    R(ctx, shade, farX, top + 7, 2, 2); R(ctx, kit.body, farX, top + 7, 1, 2);
    R(ctx, tone(kit.body, 1.2), farX + .5, top + 7, .5, 1);
    R(ctx, playerSkin(kit), farX, top + 9, 1, 1);
    R(ctx, INK, nearX, top + 7, 2, 3); R(ctx, kit.body, nearX, top + 7, 1, 2);
    R(ctx, tone(kit.body, .72), nearX + 1, top + 8, 1, 1);
    if (!ball) R(ctx, playerSkin(kit), nearX, top + 9, 1, 1);
  } else {
    const leftY = top + 7 + f, rightY = top + 7 - f;
    R(ctx, INK, cx - 4, leftY, 2, 3); R(ctx, shade, cx - 4, leftY, 1, 2);
    R(ctx, kit.body, cx - 3, leftY, 1, 2);
    R(ctx, INK, cx + 2, rightY, 2, 3); R(ctx, kit.body, cx + 2, rightY, 1, 2);
    R(ctx, shade, cx + 3, rightY, 1, 2);
    if (!ball || ballSide > 0) R(ctx, playerSkin(kit), cx - 4, leftY + 2, 1, 1);
    if (!ball || ballSide < 0) R(ctx, playerSkin(kit), cx + 3, rightY + 2, 1, 1);
    if (ball) {
      const nearX = ballSide > 0 ? cx + 2 : cx - 4;
      R(ctx, kit.body, nearX, top + 7, 2, 2);
      R(ctx, INK, nearX, top + 8, 2, 1);
    }
  }
  // Five helmet profiles: shell highlight, rear shade, face opening and mask vary by view.
  if (view === 2) {
    R(ctx, kit.body, cx - 1, top + 1, 4, 4);
    R(ctx, kit.trim, cx, top + 1, 2, 1);
    R(ctx, tone(kit.body, 1.16), cx, top + 2, 2, 1);
    R(ctx, shade, cx + 2, top + 4, 1, 1);
    const faceX = cx + (d > 0 ? 1 : -1), maskX = cx + (d > 0 ? 0 : -1);
    R(ctx, INK, maskX, top + 2, 3, 2);
    R(ctx, playerSkin(kit), faceX, top + 2, 1, 1);
    R(ctx, kit.body, maskX, top + 3, 3, 1);
  } else {
    const narrow = view === 1 || view === 3;
    const hw = narrow ? 5 : intermediate ? 6 : 7, hx = cx - Math.floor(hw / 2);
    R(ctx, kit.body, hx, top + 1, hw, 4);
    R(ctx, INK, hx + .5, top + 1, hw - 1, .5);
    R(ctx, kit.body, hx + .5, top + 4, hw - 1, .5);
    R(ctx, kit.trim, hx + 1, top + 1, Math.max(1, hw - 2), 1);
    R(ctx, tone(kit.body, 1.16), hx + 1, top + 2, Math.max(1, hw - 3), 1);
    R(ctx, tone(kit.body, 1.3), hx + 1.5, top + 2, Math.max(1, hw - 3), .5);
    if (view !== 4 && view !== 8) R(ctx, kit.body, d > 0 ? hx + 1 : hx + hw - 2, top + 1, 1, 1);
    R(ctx, shade, hx + hw - 2, top + 4, 1, 1);
    if (view === 4 || view === 8) {
      R(ctx, kit.trim, cx - 1, top + 2, 2, 1); // rear stripe; no face on the back
    } else {
      const faceX = d > 0 ? hx + Math.floor(hw / 2) : hx + 1;
      const slit = narrow || view >= 6;
      R(ctx, INK, faceX - 1, top + 2, slit ? 3 : 4, 2);
      R(ctx, playerSkin(kit), faceX, top + 2, 1, 1);
      R(ctx, kit.body, faceX - 1, top + 3, slit ? 3 : 4, 1);
      R(ctx, INK, d > 0 ? hx + hw - 1 : hx, top + 2, 1, 3);
      R(ctx, INK, faceX - 1, top + 1.5, slit ? 3 : 4, .5);
      R(ctx, tone(kit.body, .62), faceX - 1, top + 3.5, slit ? 3 : 4, .5);
      R(ctx, tone(kit.body, 1.25), d > 0 ? hx + hw - 1.5 : hx, top + 2, .5, 2);
    }
  }
  if (kit.edge) R(ctx, kit.edge, cx - 2, top, 4, 1);
  if (options.hold && !ball) R(ctx, playerSkin(kit), cx + d * 4, top + 8, 1, 1);
}
export function turnSprite(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit,
  view: BodyView, options: { step?: number; ball?: boolean; crouch?: boolean; hold?: boolean } = {}) {
  turnSpriteNative(ctx, x, y, kit, view, options);
}
/** Slim standing sprite, anchor = torso centre. Tapered shoulder caps, 3px torso, split legs, compact helmet shell. */
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
    R(ctx, UNIFORM.pants, lx, py + 10 + (lh < 3 ? 0 : 1), 2, lh - (lh < 3 ? 0 : 1) + 1);
    R(ctx, UNIFORM.pants, rx, py + 10 + (rh < 3 ? 0 : 1), 2, rh - (rh < 3 ? 0 : 1) + 1);
    R(ctx, UNIFORM.pantsShade, lx + 1.5, py + 10.5, .5, Math.max(1, lh - .5));
    R(ctx, tone(UNIFORM.pants, 1.06), rx + .5, py + 10, .5, Math.max(1, rh));
    const leftToe = lx + (d > 0 ? 0 : -1), rightToe = rx + (d > 0 ? 0 : -1);
    R(ctx, INK, leftToe, py + 10 + lh, 2, 1); R(ctx, INK, rightToe, py + 10 + rh, 2, 1);
    if (ART.players) {
      // Tiny cleat catches sit inside the original boot footprint.
      R(ctx, tone(INK, 1.28), leftToe + (d > 0 ? 0 : 1), py + 10 + lh, 1, 1);
      R(ctx, tone(INK, 1.28), rightToe + (d > 0 ? 0 : 1), py + 10 + rh, 1, 1);
      R(ctx, INK, leftToe + 1.5, py + 10.5 + lh, .5, .5);
      R(ctx, INK, rightToe + 1.5, py + 10.5 + rh, .5, .5);
    }
  }
  R(ctx, kit.body, px + 2 + lean, py + 6, 4, 5);
  R(ctx, INK, px + 2.5 + lean, py + 5.5, 3, .5);
  R(ctx, tone(kit.body, 1.28), px + 3 + lean, py + 6, 2, .5);
  R(ctx, kit.trim, px + 3 + lean, py + 8, 1, 1);
  R(ctx, tone(kit.trim, .74), px + 3.5 + lean, py + 8.5, .5, .5);
  R(ctx, kit.trim, px + 2 + lean, py + 6, .5, 1.5);
  R(ctx, kit.trim, px + 5.5 + lean, py + 6, .5, 1.5);
  R(ctx, tone(kit.trim, 1.18), px + 3.5 + lean, py + 7, .5, 1);
  if (ART.players) R(ctx, tone(kit.body, .88), px + 5 + lean, py + 9, 1, 1);
  const la = -Math.sin(step * Math.PI / 2), ra = -la;
  if (p.hold) {
    R(ctx, kit.body, px + (d > 0 ? 6 : 1) + lean, py + 7, 2, 1); R(ctx, playerSkin(kit), px + (d > 0 ? 8 : 0) + lean, py + 7, 1, 1);
  } else {
    R(ctx, tone(kit.body, .76), px + 1 + lean, py + 7 + la, 1, 3);
    R(ctx, tone(kit.body, .58), px + 1 + lean, py + 8 + la, .5, 1);
    R(ctx, kit.body, px + 2 + lean, py + 7 + la, 1, 2);
    R(ctx, playerSkin(kit), px + 2 + lean, py + 9 + la, 1, 1);
    R(ctx, tone(playerSkin(kit), .78), px + 2.5 + lean, py + 9 + la, .5, .5);
    R(ctx, tone(kit.body, .76), px + 6 + lean, py + 7 + ra, 1, 3);
    R(ctx, tone(kit.body, .58), px + 6.5 + lean, py + 8 + ra, .5, 1);
    R(ctx, kit.body, px + 6 + lean, py + 7 + ra, 1, 2);
    R(ctx, playerSkin(kit), px + 7 + lean, py + 9 + ra, 1, 1);
    R(ctx, tone(playerSkin(kit), .78), px + 7 + lean, py + 9 + ra, .5, .5);
  }
  R(ctx, kit.body, px + 2 + lean, py + 5, 4, 1); // narrower shoulder line, same pad height
  R(ctx, INK, px + 1.5 + lean, py + 5, 1, .5);
  R(ctx, INK, px + 5.5 + lean, py + 5, 1, .5);
  R(ctx, kit.trim, px + 1 + lean, py + 5, 1, 1); R(ctx, kit.trim, px + 6 + lean, py + 5, 1, 1); // pad caps
  if (ART.players) R(ctx, tone(kit.body, 1.18), px + 3 + lean, py + 5, 2, 1);
  if (kit.edge) { R(ctx, kit.edge, px + lean, py + 6, 1, 2); R(ctx, kit.edge, px + 8 + lean, py + 6, 1, 2); }
  R(ctx, kit.body, px + 3 + lean, py + 6, 2, 1);
  if (ART.players) {
    R(ctx, tone(kit.body, 1.16), px + 3 + lean, py + 6, 1, 1);
    // Shoulder-pad undersides and two short jersey folds add volume without
    // widening the slim chest or shifting its established foot anchor.
    R(ctx, tone(kit.body, .68), px + 2 + lean, py + 6, 1, 1);
    R(ctx, tone(kit.body, .68), px + 5 + lean, py + 6, 1, 1);
    R(ctx, tone(kit.body, .58), px + 2 + lean, py + 9, .5, 1);
    R(ctx, tone(kit.body, 1.22), px + 5 + lean, py + 8, .5, 1);
    R(ctx, tone(kit.body, .68), px + 4 + lean, py + 7, 1, 2);
    R(ctx, tone(kit.body, .78), px + 3 + lean, py + 9, 1, 1);
    R(ctx, tone(kit.body, .72), px + 4 + lean, py + 10, 1, 1);
    R(ctx, UNIFORM.pantsShade, px + 2 + lean, py + 11, 1, 1);
    R(ctx, UNIFORM.pantsShade, px + 6 + lean, py + 11, 1, 1);
  }
  helmet(ctx, kit, px + 1 + lean + (d > 0 ? 0 : 0), py - 1, d);
  if (p.ball) heldBall(ctx, d > 0 ? px + 5 + lean : px - 1 + lean, py + 7);
  ctx.restore();
}
export function slim(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, p: Pose = {}) {
  drawPixelEnlarged(ctx, x, y, (target, px, py) => slimNative(target, px, py, kit, p), 6);
}
/** Gold chevron + under-foot bar that marks the ball carrier. */
export function carrierMark(ctx: CanvasRenderingContext2D, x: number, y: number, seconds: number) {
  withBroadcastAnchor(ctx, x, y, () => {
  const bob = Math.floor(seconds * 4) % 2, cx = Math.round(x), cy = Math.round(y) - 15 - bob;
  R(ctx, INK, cx - 3, cy - 1, 7, 4);
  R(ctx, GOLD, cx - 2, cy, 5, 1); R(ctx, GOLD, cx - 1, cy + 1, 3, 1); R(ctx, GOLD, cx, cy + 2, 1, 1);
  R(ctx, GOLD, cx - 4, Math.round(y) + 7, 9, 1);
  });
}
/** Ball in the air: shadow on the turf, ball raised by z. */
export function airBall(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, spin: number) {
  drawFootballBall(ctx, x, y, { z, spin, small: true, shadow: true });
}
export function landingMark(ctx: CanvasRenderingContext2D, x: number, y: number, seconds: number) {
  withBroadcastAnchor(ctx, x, y, () => landingMarkAtAnchor(ctx, x, y, seconds));
}
function landingMarkAtAnchor(ctx: CanvasRenderingContext2D, x: number, y: number, seconds: number) {
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
