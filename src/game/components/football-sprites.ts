/** Slim articulated Full Game anatomy using the same uniforms/ball as Classic. */
import { drawFootballBall, type FootballKit } from './football-art';
import { drawPixelEnlarged } from './football-pixel-scale';
import { withBroadcastAnchor } from './football-broadcast';
import { drawFootballPlayer, type FootballPlayerOptions } from './football-player-art';
import {
  movementBodyView,
  movementStep,
  type FootballBodyView,
} from './football-animation-clock';
export type Kit = FootballKit;
export type BodyView = FootballBodyView;
export { movementBodyView, movementStep };
const INK = '#10213a', GOLD = '#f4d23c';
export const R = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  // Half-world-pixel authored edges survive the high-resolution canvas pass.
  ctx.fillStyle = c; ctx.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, w, h);
};
/** Broken, crisp turf-contact pixels; deliberately not a soft oval or outline. */
function contactShadow(ctx: CanvasRenderingContext2D, cx: number, y: number, width = 9) {
  const left = Math.round(cx - width / 2);
  R(ctx, 'rgba(8,34,18,.48)', left + 1, y, Math.max(2, width - 3), 1);
  R(ctx, 'rgba(6,27,15,.34)', left, y + 1, 2, 1);
  R(ctx, 'rgba(6,27,15,.34)', left + width - 2, y + 1, 2, 1);
  R(ctx, 'rgba(15,50,23,.3)', left + 3, y + 1, Math.max(1, width - 6), 1);
}

export function heldBall(ctx: CanvasRenderingContext2D, bx: number, by: number) {
  drawFootballBall(ctx, bx + 2, by + 1, { held: true });
}

export type Pose = FootballPlayerOptions;
/** Nine hand-authored 16-bit silhouettes; view changes anatomy, never a flat rotation. */
function turnSpriteNative(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit,
  view: BodyView, options: Pose = {}) {
  const cx = Math.round(x), ground = Math.round(y);
  contactShadow(ctx, cx, ground + 5, view === 2 ? 8 : 10);
  drawFootballPlayer(ctx, cx, ground, kit, { ...options, view });
}
export function turnSprite(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit,
  view: BodyView, options: Pose = {}) {
  turnSpriteNative(ctx, x, y, kit, view, options);
}
/** Slim standing sprite, anchor = torso centre. Tapered shoulder caps, 3px torso, split legs, compact helmet shell. */
function slimNative(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, p: Pose = {}) {
  if (p.view !== undefined) { turnSprite(ctx, x, y, kit, p.view, p); return; }
  const cx = Math.round(x), ground = Math.round(y);
  contactShadow(ctx, cx, ground + 5, 9);
  drawFootballPlayer(ctx, cx, ground, kit, p);
}
export function slim(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, p: Pose = {}) {
  drawPixelEnlarged(ctx, x, y, (target, px, py) => slimNative(target, px, py, kit, p), 6);
}
/** Gold chevron + under-foot bar that marks the ball carrier. */
export function carrierMark(ctx: CanvasRenderingContext2D, x: number, y: number, seconds: number) {
  withBroadcastAnchor(ctx, x, y, () => {
  const bob = Math.floor(seconds * 4) % 2, cx = Math.round(x), cy = Math.round(y) - 19 - bob;
  R(ctx, INK, cx - 3, cy - 1, 7, 4);
  R(ctx, GOLD, cx - 2, cy, 5, 1); R(ctx, GOLD, cx - 1, cy + 1, 3, 1); R(ctx, GOLD, cx, cy + 2, 1, 1);
  R(ctx, GOLD, cx - 4, Math.round(y) + 7, 9, 1);
  });
}
/** Ball in the air: shadow on the turf, ball raised by z. */
export function airBall(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, spin: number, tumble = true) {
  drawFootballBall(ctx, x, y, { z, spin, small: true, shadow: true, tumble });
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
