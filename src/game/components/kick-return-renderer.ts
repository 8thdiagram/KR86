import { KR, kickBallPosition, isKickContact, type KickAttempt } from '../lib/kick-return-engine';
import { kickMatchupTeams } from '../lib/kick-return-teams';
import { drawTouchdownMarquee } from './football-touchdown-art';
import { kickDivePose } from '../lib/kick-return-dive';
import { kickDiveBallReach, kickDiveRules } from '../lib/kick-return-burst';
import type { KickViewport } from '../lib/kick-return-viewport';
import { drawFootballBall, footballPixels, playerSkin, positionKit, classicSkinPosition, uniformKit, UNIFORM, type FootballKit } from './football-art';
import { FOOTBALL_ART_STAGES as ART, drawDeluxeTurf, drawEndZoneLettering, drawFieldFixtures, drawYardNumber, tone } from './football-deluxe-art';
import { drawBroadcastStadium } from './football-stadium-art';
import { withBroadcastAnchor, withBroadcastWorld, broadcastFieldContext, broadcastVisibleRange, broadcastViewportFrame } from './football-broadcast';
import { drawBroadcastGoalPosts } from './football-broadcast-posts';
import { heldBall, turnSprite, movementBodyView as motionView, type BodyView } from './football-sprites';
import { drawPixelEnlarged } from './football-pixel-scale';
import { refereeRenderY, REFEREE_WORLD_Y } from './football-referee-layout';

const G: Record<string, string> = {
  A: '010101111101101', C: '111100100100111', T: '111010010010010', H: '101101111101101',
  O: '111101101101111', U: '101101101101111', D: '110101101101110', W: '101101101111101',
  N: '110101101101101', E: '111100110100111', L: '100100100100111', K: '101101110101101',
  R: '110101110101101', I: '111010010010111', G: '111100101101111', M: '101111111101101', '!': '010010010000010',
  B: '110101110101110', F: '111100110100100', J: '001001001101111',
  P: '110101110100100', Q: '111101101111001', S: '111100111001111',
  V: '101101101101010', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001001001',
  '8': '111101111101111', '9': '111101111001111',
};
const C = {
  turfA: '#287d36', turfB: '#257331', line: '#fafcf1',
  ink: '#10213a', skin: '#e0a370', home: '#2f6fd0', homeTrim: '#d8e8ff', away: '#d9392b',
  awayTrim: '#ff9a3c', ball: '#8a4a1f', lace: '#f1e6d0',
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const ease = (t: number) => t * t * (3 - 2 * t);
const R = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  // Authored half-grid edges are mapped to the doubled backing canvas cleanly.
  ctx.fillStyle = c; ctx.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, w, h);
};
/** Crisp, broken contact pixels keep athletes grounded without soft shadows. */
function contactShadow(ctx: CanvasRenderingContext2D, cx: number, y: number, width: number) {
  const left = Math.round(cx - width / 2);
  R(ctx, 'rgba(7,31,17,.48)', left + 1, y, Math.max(2, width - 3), 1);
  R(ctx, 'rgba(5,25,14,.34)', left, y + 1, 2, 1);
  R(ctx, 'rgba(5,25,14,.34)', left + width - 2, y + 1, 2, 1);
  R(ctx, 'rgba(14,48,22,.28)', left + 3, y + 1, Math.max(1, width - 6), 1);
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, c: string, px = 1, shadow = false) {
  let cx = Math.round(x);
  for (const ch of s) {
    const g = G[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') {
      const gx = cx + (i % 3) * px, gy = Math.round(y) + Math.floor(i / 3) * px;
      if (shadow) R(ctx, C.ink, gx + px, gy + px, px, px);
      R(ctx, c, gx, gy, px, px);
    }
    cx += 4 * px;
  }
}
const textW = (s: string, px: number) => s.length * 4 * px - px;
function banner(ctx: CanvasRenderingContext2D, s: string, y: number, c: string, px = 3, center = 160) {
  // The shorter control row can expose a taller, narrower portrait viewport.
  // Keep the existing pixel banner inside that viewport without cropping it.
  px = Math.min(px, Math.max(1, (center * 2 - 20) / (s.length * 4 - 1)));
  const w = textW(s, px);
  R(ctx, C.ink, center - w / 2 - 8, y - 6, w + 16, 5 * px + 12, );
  R(ctx, c, center - w / 2 - 6, y - 4, w + 12, 5 * px + 8);
  R(ctx, C.ink, center - w / 2 - 4, y - 2, w + 8, 5 * px + 4);
  // Team trim may be nearly black; reserve it for the border, never the lettering.
  text(ctx, s, center - w / 2, y, C.lace, px);
}

function endZoneName(ctx: CanvasRenderingContext2D, name: string, color: string, centerX: number, rotation: number) {
  const label = name.toUpperCase();
  // Fit even the longest team name between the sidelines, keeping crisp whole-pixel letters.
  const px = Math.min(5, Math.floor(140 / (label.length * 4 - 1)));
  ctx.save();
  ctx.translate(centerX, 96);
  ctx.rotate(rotation);
  text(ctx, label, -textW(label, px) / 2, -5 * px / 2, color, px);
  ctx.restore();
}

function field(ctx: CanvasRenderingContext2D, x0: number, x1: number, matchup?: KickAttempt['teams']) {
  const teams = kickMatchupTeams(matchup);
  R(ctx, C.turfB, x0, 0, x1 - x0, KR.height);
  for (let x = Math.floor(x0 / 50) * 50; x < x1; x += 50) {
    if (x >= 100 && x < 1100 && ((x - 100) / 50) % 2 === 0) R(ctx, C.turfA, x, 0, 50, KR.height);
    // Team paint stays between the sidelines; the benches and crowd remain on grass.
    if (x < 100) R(ctx, teams.player.body, x, 18, 50, 156);
    if (x >= 1100) R(ctx, teams.opponent.body, x, 18, 50, 156);
  }
  if (ART.field) drawDeluxeTurf(ctx, x0, x1);
  R(ctx, C.line, x0, 16, x1 - x0, 2); R(ctx, C.line, x0, 174, x1 - x0, 2);
  for (let x = Math.floor(x0 / 10) * 10; x < x1; x += 10) {
    if (x < 100 || x > 1100) continue;
    const big = (x - 100) % 50 === 0;
    if (big) R(ctx, C.line, x, 18, 2, 156);
    else { R(ctx, C.line, x, 40, 1, 3); R(ctx, C.line, x, 148, 1, 3); }
  }
  R(ctx, C.line, 99, 16, 3, 160); R(ctx, C.line, 1099, 16, 3, 160);
  for (let yd = 10; yd <= 50; yd += 10) {
    for (const wx of new Set([100 + yd * 10, 1100 - yd * 10])) {
      if (wx + 16 < x0 || wx - 16 > x1) continue;
      drawYardNumber(ctx, yd, wx, 25, C.line, 2);
      drawYardNumber(ctx, yd, wx, 153, C.line, 2);
    }
  }
  // The top of each name faces its back line, readable when approaching from midfield.
  if (ART.field) {
    drawEndZoneLettering(ctx, teams.player.name, teams.player.trim, 50, -Math.PI / 2, C.ink);
    drawEndZoneLettering(ctx, teams.opponent.name, teams.opponent.trim, 1150, Math.PI / 2, C.ink);
  } else {
    endZoneName(ctx, teams.player.name, teams.player.trim, 50, -Math.PI / 2);
    endZoneName(ctx, teams.opponent.name, teams.opponent.trim, 1150, Math.PI / 2);
  }
  // Permanent fixtures shared by every mode: rear lines, goalposts, eight pylons.
  if (ART.geometry) drawFieldFixtures(ctx, x0, x1);
}

type Kit = FootballKit;
// Shared anatomy (all poses): stepped shell, matching-color cage, tapered jersey,
// articulated white trousers and compact cleats.
type Put = (c: string, u: number, v: number, w: number, h: number) => void;
function helmet(put: Put, kit: Kit, hx: number, hy: number, d: 1 | -1) {
  // Slightly fuller 16-bit crown, grown upward from the original neck anchor.
  hx += 1; hy += 1;
  if (kit.edge) put(kit.edge, hx + .5, hy - 1, 7, 1);
  put(kit.body, hx + 1.5, hy - .5, 5.5, .5);
  put(kit.body, hx + 1, hy, 6.5, 4);
  put(kit.body, hx + 1.5, hy + 4, 5.5, 1);
  put(kit.body, hx + 2, hy - .5, 4, .5);
  put(kit.trim, hx + 2, hy - .5, 3.5, .5);
  put(tone(kit.body, 1.28), hx + 2, hy + .5, 3.5, .5);
  put(tone(kit.body, 1.16), hx + 1.5, hy + 1, 1, .5);
  put(tone(kit.body, .68), hx + 5.5, hy + 3, 1, 1);
  put(tone(kit.body, .58), hx + 6, hy + 2.5, .5, 1);
  put(tone(kit.body, .78), hx + 1, hy + 2.5, .5, 1);
  put(kit.trim, d > 0 ? hx + 1 : hx + 6.5, hy + 1.5, 1, 2);
  const faceX = d > 0 ? hx + 3.5 : hx + 2.5;
  put(playerSkin(kit), faceX, hy + 1, 1.5, 1);
  // The fine cage stays primary-color and never paints across the skin opening.
  put(kit.body, faceX - .5, hy + 1, .5, 2.5);
  put(kit.body, faceX + 1.5, hy + 1, .5, 2.5);
  put(kit.body, faceX - .5, hy + 2, 3, .5);
  put(kit.body, faceX - .5, hy + 3.5, 3, .5);
  if (ART.players) { // shell highlight + darker lower back edge, inside the helmet
    put(tone(kit.body, 1.16), hx + 1.5, hy + .5, 1, 1);
    put(tone(kit.body, .78), hx + 5.5, hy + 3.5, 1, 1);
  }
}
function ballShape(put: Put, bx: number, by: number, d: 1 | -1, kit: Kit) {
  footballPixels(put, bx - 1, by - 1, true);
  put(playerSkin(kit), d > 0 ? bx : bx + 6, by + 3, 1, 1);
}
// Standing sprite: 8 wide x ~16 tall. Anchor: (x, y) = torso centre.
function spriteNative(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, step: number, ball = false, shuffle = 0, lean = 0, view?: BodyView) {
  if (view !== undefined) {
    turnSprite(ctx, x, y, kit, view, { step, ball, hold: !ball && shuffle > 0, crouch: shuffle > 0 });
    return;
  }
  const px = Math.round(x) - 4, py = Math.round(y) - 8, d = kit.dir;
  const put: Put = (c, u, v, w, h) => R(ctx, c, u, v, w, h);
  const f = Math.abs(Math.floor(step)) % 4;
  ctx.save();
  // Continuous body weight shift; crisp pixel anatomy stays local to the body.
  ctx.translate(0, -Math.round(.45 * (1 - Math.cos(step * Math.PI))));
  contactShadow(ctx, px + 4, py + 13, 10);
  const reach = shuffle ? 0 : Math.sin(step * Math.PI / 2) * 1.5;
  const lh = shuffle && f % 2 ? 2 : reach < 0 ? 2 : 3, rh = reach > 0 ? 2 : 3;
  const lx = px + 2 - reach, rx = px + 4 + reach;
  // Thigh, raised knee and offset calf form a crisp bent-leg silhouette.
  const bend = d > 0 ? .5 : 0;
  R(ctx, UNIFORM.pants, lx, py + 10, 2, 1);
  R(ctx, UNIFORM.pants, lx + bend, py + 11, 1.5, 1);
  if (lh > 2) R(ctx, UNIFORM.pants, lx + bend, py + 12, 1.5, lh - 2);
  R(ctx, UNIFORM.pants, rx, py + 10, 2, 1);
  R(ctx, UNIFORM.pants, rx + (1 - bend), py + 11, 1.5, 1);
  if (rh > 2) R(ctx, UNIFORM.pants, rx + (1 - bend), py + 12, 1.5, rh - 2);
  R(ctx, C.ink, lx + (d > 0 ? 0 : -1), py + 9 + lh, 3, 1); R(ctx, C.ink, rx + (d > 0 ? 0 : -1), py + 9 + rh, 3, 1);
  if (ART.players) {
    R(ctx, kit.body, lx + .5, py + 8.5 + lh, 1, .5);
    R(ctx, kit.body, rx + .5, py + 8.5 + rh, 1, .5);
    R(ctx, UNIFORM.pantsShade, lx + 1, py + 11, 1, 1); R(ctx, UNIFORM.pantsShade, rx, py + 11, 1, 1);
    R(ctx, tone(UNIFORM.pants, 1.08), lx + .5, py + 10, .5, Math.max(1, lh - 1));
    R(ctx, tone(UNIFORM.pants, 1.08), rx + .5, py + 10, .5, Math.max(1, rh - 1));
    R(ctx, UNIFORM.pantsShade, lx, py + 11, 1, 1);
  }
    // Narrow waist beneath a sculpted, stepped shoulder silhouette.
    R(ctx, kit.body, px + 1, py + 6, 5, 5);
  R(ctx, C.ink, px + 1.5, py + 5.5, 4, .5);
  R(ctx, tone(kit.body, 1.28), px + 2, py + 6, 3, .5);
  R(ctx, tone(kit.body, .64), px + 1, py + 9, .5, 1.5);
  R(ctx, tone(kit.body, .8), px + 5.5, py + 8, .5, 2);
  if (ART.players) {
    R(ctx, tone(kit.body, 1.16), px + 3, py + 6, 1, 1);
    R(ctx, tone(kit.body, .88), px + 5, py + 7, 1, 3);
  }
  R(ctx, kit.trim, px + 2, py + 8, 1, 1);
  R(ctx, tone(kit.trim, .72), px + 2.5, py + 8.5, .5, .5);
  R(ctx, kit.trim, px + 1.5, py + 6, .5, 1.5);
  R(ctx, kit.trim, px + 5.5, py + 6, .5, 1.5);
  R(ctx, tone(kit.trim, 1.18), px + 3, py + 7, 1, .5);
  R(ctx, tone(kit.body, 1.16), px + 2.5, py + 7.5, .5, .5);
  R(ctx, tone(kit.body, .72), px + 5, py + 8.5, .5, 1);
  if (ART.players) R(ctx, tone(kit.body, .88), px + 5, py + 10, 1, 1);
  // Knee highlight stays bright after jersey overlap; still inside the existing trouser silhouette.
  R(ctx, UNIFORM.pants, lx + 1, py + 11, 1, 1);
  const la = -Math.sin(step * Math.PI / 2), ra = -la;
  // Sleeves angle out of the pads, with a clear inward elbow and forearm.
  R(ctx, C.ink, px + 1 + lean, py + 7 + la, 2, 2);
  R(ctx, tone(kit.body, .76), px + 1 + lean, py + 7 + la, 1, 2);
  R(ctx, kit.body, px + 2 + lean, py + 7 + la, 1, 1);
  R(ctx, C.ink, px + lean, py + 9 + la, 2, 1);
  R(ctx, kit.body, px + .5 + lean, py + 9 + la, 1, 1);
  R(ctx, playerSkin(kit), px + lean, py + 10 + la, 1, 1);
  R(ctx, tone(playerSkin(kit), .78), px + .5 + lean, py + 10 + la, .5, .5);
  R(ctx, C.ink, px + 6 + lean, py + 7 + ra, 2, 2);
  R(ctx, kit.body, px + 6 + lean, py + 7 + ra, 1, 2);
  R(ctx, tone(kit.body, .76), px + 7 + lean, py + 7 + ra, 1, 1);
  R(ctx, C.ink, px + 7 + lean, py + 9 + ra, 2, 1);
  R(ctx, kit.body, px + 7 + lean, py + 9 + ra, 1, 1);
  R(ctx, playerSkin(kit), px + 8 + lean, py + 10 + ra, 1, 1);
  R(ctx, tone(kit.body, .58), px + 7.5 + lean, py + 8 + ra, .5, 1);
  R(ctx, tone(playerSkin(kit), .78), px + 7 + lean, py + 10 + ra, .5, .5);
  R(ctx, kit.body, px + 2 + lean, py + 4.5, 4, .5);
  R(ctx, kit.body, px + 1 + lean, py + 5, 6, 1.5);
  R(ctx, tone(kit.body, .72), px + 1.5 + lean, py + 6, 5, .5);
  R(ctx, kit.trim, px + 1 + lean, py + 5, 1, 2); R(ctx, kit.trim, px + 6 + lean, py + 5, 1, 2);
  if (ART.players) R(ctx, tone(kit.body, 1.18), px + 2 + lean, py + 5, 4, 1);
  if (kit.edge) { R(ctx, kit.edge, px + lean, py + 6, 1, 2); R(ctx, kit.edge, px + 7 + lean, py + 6, 1, 2); }
  R(ctx, UNIFORM.pants, px + 2 + lean, py + 9.5, 4, 1.5);
  R(ctx, C.ink, px + 1 + lean, py + 6.5, .5, 1);
  R(ctx, C.ink, px + 6.5 + lean, py + 6.5, .5, 1);
  helmet(put, kit, px + lean, py - 1, d);
  if (ball) {
    R(ctx, kit.body, px + lean + (d > 0 ? 6 : 1), py + 7, 1, 2);
    ballShape(put, d > 0 ? px + 5 + lean : px - 3 + lean, py + 7, d, kit);
  }
  ctx.restore();
}
function sprite(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, step: number, ball = false, shuffle = 0, lean = 0, view?: BodyView) {
  drawPixelEnlarged(ctx, x, y, (target, px, py) => spriteNative(target, px, py, kit, step, ball, shuffle, lean, view), 6);
}
// Hand-authored turf silhouette; no upright sprite is rotated into a cutout.
function proneNative(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, angle: number, lift: number, crouch = 0, ball = false) {
  const cx = Math.round(x), cy = Math.round(y - lift), horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
  const forward: 1 | -1 = Math.cos(angle) >= 0 ? 1 : -1;
  const far = tone(kit.body, .86), light = tone(kit.body, 1.16);
  const shadowW = (horizontal ? 18 : 10) - Math.min(4, Math.max(0, Math.round(lift)));
  if (lift > 0) contactShadow(ctx, cx, Math.round(y) + (horizontal ? 2 : 7), shadowW);
  if (horizontal) {
    const by = cy - 2 + Math.round(crouch * .4);
    const hr = (c: string, u: number, v: number, w: number, h: number) =>
      R(ctx, c, cx + (forward > 0 ? u : -u - w), by + v, w, h);
    // A single connected turf-contact cluster, not an outline or impact rays.
    if (lift <= 0) hr('#173923', -3, 3, 8, 1);
    hr(UNIFORM.pants, -8, 1, 5, 3);
    hr(UNIFORM.pantsShade, -7, 3, 3, 1);
    hr(tone(UNIFORM.pants, 1.08), -7, 1, 3, .5);
    hr(C.ink, -8, 3.5, 4, .5);
    hr(kit.body, -3, -1, 6, 4);
    hr(light, -3, -1, 3, 1); hr(kit.trim, 0, -1, 1, 2);
    hr(C.ink, -2.5, -1.5, 5, .5);
    hr(tone(kit.body, .64), -3, 1, .5, 2);
    hr(tone(kit.body, .78), 2, 1, .5, 2);
    hr(tone(kit.trim, .74), 0, 0, .5, 1);
    // Separated trouser/jersey masses preserve the athlete's long prone profile.
    hr(far, -1, -3, ball ? 5 : 9, 2);
    hr(kit.body, 0, 2, ball ? 5 : 9, 2);
    hr(tone(kit.body, 1.2), 1, 2, ball ? 2 : 4, .5);
    hr(playerSkin(kit), ball ? 4 : 10, 2, 2, 1);
    // Crown overlaps the shoulder, avoiding a detached helmet at either facing.
    // Shell expands a half-unit toward the crown; its lower edge remains at
    // the same neck/shoulder overlap so the prone silhouette stays grounded.
    hr(kit.body, 2.5, -4.5, 5.5, 4.5);
    hr(kit.trim, 3.5, -4.5, 3.5, .5);
    hr(tone(kit.body, 1.16), 3.5, -3.5, 2.5, .5); hr(far, 6.5, -1, 1, 1);
    hr(C.ink, 3, -5, 4.5, .5); // restrained exterior crown contour only
    hr(tone(kit.body, 1.28), 4, -3.5, 2.5, .5);
    hr(playerSkin(kit), 7.5, -2, 1, 1);
    hr(tone(kit.body, .68), 7, -1, 1, .5);
    // Same-color cage around the tiny visible face slot; never a dark recess.
    hr(kit.body, 6.5, -1, .5, 2);
    hr(kit.body, 9, -1, .5, 2);
    hr(kit.body, 6.5, 0, 3, .5);
    hr(kit.body, 6.5, 1, 3, .5);
    hr(tone(kit.body, 1.16), -1, 2, .5, .5);
    hr(tone(kit.body, .72), 2, 3, .5, .5);
    if (ball) {
      heldBall(ctx, forward > 0 ? cx - 1 : cx - 7, by + 1);
      hr(kit.body, 3, 1, 2, 1); hr(C.ink, 3, 2, 2, 1);
    }
  } else {
    const down: 1 | -1 = Math.sin(angle) >= 0 ? 1 : -1;
    const vr = (c: string, u: number, v: number, w: number, h: number) =>
      R(ctx, c, cx + u, cy + (down > 0 ? v : -v - h), w, h);
    if (lift <= 0) vr('#173923', -2, 7, 5, 1);
    vr(UNIFORM.pants, -2, -7, 3, 5);
    vr(UNIFORM.pants, 1, -7, 3, 5);
    vr(tone(UNIFORM.pants, 1.08), -1.5, -7, .5, 3);
    vr(UNIFORM.pantsShade, 1.5, -4, 1, 2);
    vr(kit.body, -3, -3, 7, 7);
    vr(light, -2, -2, 3, 1); vr(kit.trim, -2, 0, 2, 1);
    vr(C.ink, -2.5, -3.5, 6, .5);
    vr(tone(kit.body, 1.16), -1, -1, .5, .5);
    vr(tone(kit.body, .72), 2, 1, .5, 1);
    vr(tone(kit.body, .64), -3, 1, .5, 2);
    vr(tone(kit.body, 1.18), 1, -2, 2, .5);
    vr(far, -6, -2, 2, 5); vr(kit.body, 4, -2, 2, 4); vr(playerSkin(kit), 5, 2, 1, 1);
    vr(kit.body, -3.5, 3, 9, 5.5); vr(kit.trim, -2, 3, 2, 1);
    vr(tone(kit.body, 1.28), -2, 4, 3.5, .5);
    vr(tone(kit.body, 1.16), -2, 4, 3, 1); vr(far, 3, 5, 2, 1);
    vr(C.ink, -2, 2.5, 6, .5);
    vr(tone(kit.body, .72), 3, 6, 1, 1);
    if (ball) {
      heldBall(ctx, kit.dir > 0 ? cx + 1 : cx - 7, cy + down);
      vr(kit.body, kit.dir > 0 ? 4 : -6, 0, 2, 2);
      vr(playerSkin(kit), kit.dir > 0 ? 5 : -6, 2, 1, 1);
    }
  }
}
function prone(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, angle: number, lift: number, crouch = 0, ball = false) {
  drawPixelEnlarged(ctx, x, y, (target, px, py) => proneNative(target, px, py, kit, angle, lift, crouch, ball));
}
function lying(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit) {
  prone(ctx, Math.round(x) - (kit.dir > 0 ? 1 : -1), Math.round(y), kit, kit.dir > 0 ? 0 : Math.PI, 0);
}
function diving(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit,
  pose: NonNullable<ReturnType<typeof kickDivePose>>) {
  const dir: 1 | -1 = Math.cos(pose.angle) >= 0 ? 1 : -1;
  const ang = (a: number) => dir > 0 ? a : Math.PI - a;
  const windup = !pose.landed && (pose.phase === 'windup' || !pose.phase && pose.amount < .35);
  const ix = Math.round(x), iy = Math.round(y);
  if (windup) {
    sprite(ctx, x, y + 1, { ...kit, dir }, 1, false, 1, dir * 2,
      pose.amount >= .25 ? (dir > 0 ? 5 : 6) : undefined);
    return;
  }
  const lift = pose.landed ? 0 : Math.min(1, pose.lift);
  if (pose.phase === 'recovering') {
    if (pose.amount < .15) sprite(ctx, x, y + 1, { ...kit, dir }, 0, false, 1, dir);
    else prone(ctx, ix, iy + 2, kit, ang(-1.2 * (1 - pose.amount)), 0, 1);
  }
  else if (pose.landed) prone(ctx, ix, iy + 2, kit, ang(0), 0);
  else if (pose.amount < .5) prone(ctx, ix, iy + 1, kit, ang(-1.0), lift, 1);
  else prone(ctx, ix, iy + 1, kit, ang(-.7), lift);
}
function football(ctx: CanvasRenderingContext2D, x: number, y: number, ground: boolean, spin = 0, z = 0) {
  drawFootballBall(ctx, x, y, { shadow: ground, spin, z });
}

// Visual-only evasion poses. Reads a.moves, never mutates. Returns false for normal running.
function moveSprite(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, t: number, a: KickAttempt): boolean {
  return withBroadcastAnchor(ctx, x, y, () => moveSpriteAtAnchor(ctx, x, y, kit, t, a));
}
function moveSpriteAtAnchor(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, t: number, a: KickAttempt): boolean {
  if (a.phase !== 'returning') return false;
  const m = a.moves;
  if (!m) return false;
  const put: Put = (c, u, v, w, h) => R(ctx, c, u, v, w, h);
  const v2 = m.version === 2;
  const act = m.active;
  const px = Math.round(x) - 4, py = Math.round(y) - 8;
  if (act && act.kind === 'dive') {
    const e = act.elapsed * .34 / kickDiveRules(a).duration, reach = kickDiveBallReach(act.elapsed, a), tilt = act.side * 1;
    if (e < .08) {
      sprite(ctx, x, y + 1, kit, 1, false, 1, 1);
      ballShape(put, Math.round(x + reach - 6), Math.round(y) - 1, 1, kit);
      R(ctx, C.ink, px + 6, py + 13, 3, 1);
    }
    else if (e < .14) {
      // A compact three-quarter brace bridges the upright wind-up and turf pose.
      sprite(ctx, x, y + 1, kit, 1, false, 1, tilt, act.side > 0 ? 5 : 6);
      ballShape(put, Math.round(x + reach - 6), Math.round(y) - 1 + tilt, 1, kit);
      R(ctx, C.ink, px + 6, py + 13, 3, 1);
    }
    else if (e < .26) {
      const lift = e < .2 ? 1 : 3;
      prone(ctx, Math.round(x), Math.round(y) + 1, kit, -.35 + tilt * .08, lift, 1);
      if (a.returnUpgrade === 1) R(ctx, playerSkin(kit), Math.round(x) + 6, Math.round(y) - 1 + tilt, Math.max(1, reach - 7), 2);
      ballShape(put, Math.round(x + reach - 6), Math.round(y) - 1 + tilt, 1, kit);
    } else {
      prone(ctx, Math.round(x), Math.round(y) + 2, kit, tilt * .06, 0);
      ballShape(put, Math.round(x + reach - 6), Math.round(y) + 1, 1, kit);
    }
    return true;
  }
  if (v2 && !act && m.hesitating) {
    const st = a.returnTime * 5, sh = Math.round(Math.sin(a.returnTime * 9));
    sprite(ctx, x, y + (Math.floor(st) % 2), kit, st, true, 1, sh);
    R(ctx, C.ink, px + 6, py + 13, 3, 1);
    return true;
  }
  if (act && act.kind === 'spin') {
    const dur = v2 ? .3 : .34, rot = act.side || 1;
    const p = clamp(act.elapsed / dur, 0, 1);
    // Hand-authored in-betweens soften turns without resizing or rotating pixels.
    const frames: BodyView[] = rot > 0
      ? [0, 5, 1, 6, 2, 7, 3, 8, 4, 8, 3, 7, 2, 6, 1, 5, 0]
      : [0, 6, 3, 7, 2, 5, 1, 8, 4, 8, 1, 5, 2, 7, 3, 6, 0];
    const frame = Math.min(frames.length - 1, Math.floor(p * frames.length));
    const view = frames[frame]!;
    const d: 1 | -1 = frame >= 8 && frame < frames.length - 1 ? (kit.dir === 1 ? -1 : 1) : kit.dir;
    const step = Math.floor(p * 14);
    sprite(ctx, x, y, { ...kit, dir: d }, step, true, 0, 0, view);
    return true;
  }
  if (act && act.kind === 'stutter') {
    const hold = act.elapsed < .1 ? 1 : 0, fake = hold ? -act.side : act.side;
    if (v2 && !hold) R(ctx, C.lace, px + 3 - fake * 5, py + 14, 2, 1);
    const f = hold ? 1 : Math.floor((act.elapsed - .1) * 28);
    const cutView: BodyView = hold ? (fake > 0 ? 5 : 6) : (fake > 0 ? 6 : 5);
    sprite(ctx, x, y + hold, kit, f, true, hold, fake * 3, cutView);
    R(ctx, C.ink, px + (fake < 0 ? -2 : 7), py + 11, 3, 2); // planted outside boot
    R(ctx, C.lace, px + (fake < 0 ? 9 : -3), py + 14, 2, 1);
    return true;
  }
  if (m.backward) {
    const f = Math.floor(t) % 4, bx = Math.round(x) - 1;
    sprite(ctx, bx, y, kit, (4 - f) % 4, true);
    R(ctx, C.ink, bx - 4, Math.round(y) - 3, 2, 1); // heels digging in
    return true;
  }
  return false;
}

const BLOCKERS = [[22, 46], [14, 78], [22, 134], [14, 160], [34, 30]];

function referee(ctx: CanvasRenderingContext2D, x: number, celebration: number, touchdown: boolean, y = REFEREE_WORLD_Y) {
  return withBroadcastAnchor(ctx, x, y, () => {
    ctx.save();
    ctx.translate(0, y - REFEREE_WORLD_Y);
    try { refereeAtAnchor(ctx, x, celebration, touchdown); } finally { ctx.restore(); }
  });
}
function refereeAtAnchor(ctx: CanvasRenderingContext2D, x: number, celebration: number, touchdown: boolean) {
  const y = REFEREE_WORLD_Y;
  R(ctx, '#f7f7f2', x - 4, y - 5, 8, 7);
  for (const stripe of [-3, 0, 3]) R(ctx, '#15191d', x + stripe, y - 5, 1, 7);
  R(ctx, C.skin, x - 2, y - 10, 4, 4);
  R(ctx, '#f7f7f2', x - 3, y - 12, 6, 2);
  R(ctx, '#15191d', x - 4, y - 10, 8, 1);
  R(ctx, '#15191d', x - 3, y + 2, 2, 4);
  R(ctx, '#15191d', x + 1, y + 2, 2, 4);
  const rise = touchdown ? Math.round(clamp((celebration - .1) / .4, 0, 1) * 10) : 0;
  for (const side of [-1, 1]) {
    R(ctx, '#f7f7f2', x + side * 5 - 1, y - 4 - rise, 2, 7);
    R(ctx, '#15191d', x + side * 5 - 1, y - 2 - rise, 2, 1);
    R(ctx, C.skin, x + side * 5 - 1, y + 2 - rise * 1.8, 2, 2);
  }
}

function crowd(ctx: CanvasRenderingContext2D, left: number, right: number, cheering: boolean, seconds: number, matchup?: KickAttempt['teams']) {
  drawBroadcastStadium(ctx, left, right, matchup, cheering, seconds);
}

function world(ctx: CanvasRenderingContext2D, a: KickAttempt, cel: number, refereeY = REFEREE_WORLD_Y) {
  const p = a.player, kick = a.phase === 'kickoff';
  const imp = a.phase === 'tackled' ? (cel > 0 ? clamp(cel / .25, 0, 1) : 1) : 1;
  const lunge = (dx: number) => a.phase === 'tackled' ? Math.sign(p.x - dx) * Math.round(ease(clamp(imp / .4, 0, 1)) * 2) : 0;
  const teams = kickMatchupTeams(a.teams);
  const homeBase = uniformKit(teams.player, 1, teams.opponent);
  const home = positionKit(homeBase, 'KR');
  const homeLine = positionKit(homeBase, 'OL');
  const away = uniformKit(teams.opponent, -1, teams.player);
  const lowCam = a.time < 1;
  // field is drawn by caller; actors sorted by y
  const actors: { x: number; y: number; draw: () => void }[] = [];
  if (kick && a.time < 1.45) for (const [bx, by] of BLOCKERS) {
    if (Math.abs(by - p.y) < 22 && Math.abs(bx - p.x) < 30) continue;
    actors.push({ x: bx, y: by, draw: () => sprite(ctx, bx, by, homeLine, 0) });
  }
  const t = a.phase === 'returning' ? a.returnTime * 9 : a.time * 9;
  for (const d of a.defenders) {
    if (d.x < -20) continue;
    const defenderKit = positionKit(away, classicSkinPosition(d));
    const tackling = a.phase === 'tackled' && !['grounded', 'recovering'].includes(d.dive?.phase ?? '') && isKickContact(p, d);
    const coverage = kick ? ease(clamp((a.time - .35) / 1.15, 0, 1)) : 1;
    const stagedX = d.id === 10 ? 1080 - Math.min(a.time / .35, 1) * 18 : 1000 + d.id % 5 * 18;
    const stagedY = d.id === 10 ? 96 : 32 + d.id % 6 * 25;
    const x = stagedX + (d.x - stagedX) * coverage;
    const y = stagedY + (d.y - stagedY) * coverage;
    actors.push({ x, y, draw: () => {
      if (kick) {
        sprite(ctx, x, y, defenderKit, a.time > .1 ? t + d.id : 0);
      }
      else if (kickDivePose(a, d, cel)) {
        diving(ctx, d.x, d.y, defenderKit, kickDivePose(a, d, cel)!);
      } else if (d.id === 10 && d.motion) {
        const m = d.motion;
        const speed = Math.hypot(m.vx, m.vy);
        const shuffling = Math.abs(m.vy) > Math.abs(m.vx);
        const lean = speed > 15 && !shuffling ? Math.sign(m.vx) : 0;
        sprite(ctx, d.x + lean + (tackling ? lunge(d.x) : 0), d.y + (tackling ? 2 : 0), { ...defenderKit, dir: m.facing },
          speed > 3 && a.phase === 'returning' ? m.stride : 0, false, shuffling ? 1 : 0, 0,
          a.phase === 'returning' ? motionView(m.vx, m.vy, m.facing) : undefined);
      } else if (d.roamer) {
        const facing = tackling ? (p.x >= d.x ? 1 : -1) : d.roamer.vx > 2 ? 1 : -1;
        sprite(ctx, d.x + (tackling ? lunge(d.x) : 0), d.y + (tackling ? 1 : 0), { ...defenderKit, dir: facing },
          d.active && a.phase === 'returning' ? d.roamer.stride : 0);
      } else
      if (tackling) {
         sprite(ctx, d.x + lunge(d.x), d.y + 1, defenderKit, 0);
      }
       else sprite(ctx, d.x, d.y, defenderKit, d.active ? t + d.id : 0);
    } });
  }
  const hasBall = !kick || a.time >= 1.4;
  actors.push({ x: p.x, y: p.y, draw: () => {
    if (a.phase === 'tackled') {
      if (imp < .25) sprite(ctx, p.x - Math.round(imp / .35), p.y, home, 0, true);
      else if (imp < .35) {
        // Short crouched quarter-turn bridge before the existing grounded pose.
        sprite(ctx, p.x, p.y + 1, home, 0, true, 1, home.dir, 5);
      }
      else { lying(ctx, p.x, p.y + 2, home); football(ctx, p.x + 9 + Math.round((1 - imp) * 3), p.y + 5 - Math.round(Math.sin(imp * Math.PI) * 3), imp > .8); }
    }
    else if (a.phase === 'touchdown') {
      const active = a.moves?.active;
      // A ball-first score must not snap an airborne returner instantly upright.
      if (a.returnUpgrade === 1 && active?.kind === 'dive' && active.elapsed + cel < kickDiveRules(a).duration + .1) {
        moveSprite(ctx, p.x, p.y, home, t, { ...a, phase: 'returning',
          moves: { ...a.moves!, active: { ...active, elapsed: Math.min(kickDiveRules(a).duration - 1e-6, active.elapsed + cel) } } });
        return;
      }
      const hop = Math.floor(cel * 5) % 2 ? 2 : 0;
      sprite(ctx, p.x, p.y - hop, home, 0, true);
      R(ctx, home.trim, Math.round(p.x) - 6, Math.round(p.y) - 13 - hop, 2, 4);
      R(ctx, home.trim, Math.round(p.x) + 4, Math.round(p.y) - 13 - hop, 2, 4);
    } else if (!kick && hasBall && moveSprite(ctx, p.x, p.y, home, t, a)) { /* retro move pose drawn */ }
    else sprite(ctx, p.x, p.y, home, kick ? (a.time > .25 && a.time < 1.4 ? t : 0) : p.x / 8, hasBall);
  } });
  actors.sort((u, v) => u.y - v.y).forEach(o => {
    ctx.save();
    // Keep the pixel artwork, but don't quantize its world-space anchor.
    ctx.translate(o.x - Math.round(o.x), o.y - Math.round(o.y));
    o.draw();
    ctx.restore();
  });
  // kick arc
  if (kick && !hasBall) {
    const b = kickBallPosition(a);
    if (a.time >= .35) {
      for (let i = 1; i <= 5; i++) {
        const f = clamp((a.time - .35) / 1.05, 0, 1) * (1 - i * .06);
        if (f <= 0) continue;
        const ax = 1060 + (a.landing.x - 1060) * f, gy = 96 + (a.landing.y - 96) * f;
        withBroadcastAnchor(ctx, ax, gy, () => R(ctx, C.lace, ax, gy - Math.sin(f * Math.PI) * 42, 1, 1));
      }
    }
    football(ctx, b.x, b.y, b.height < 1, a.time, b.height);
  }
  // No selection/catch ring, halo, or overhead player marker in any state.
  if (a.phase === 'touchdown') {
    for (let i = 0; i < 24; i++) {
      const sx = p.x + ((i * 37) % 90) - 45 + Math.sin(cel * 2 + i) * 6;
      const sy = ((i * 53 + cel * 40) % 150) + 20;
      withBroadcastAnchor(ctx, sx, sy, () => R(ctx, i % 3 === 0 ? home.trim : i % 3 === 1 ? away.trim : C.lace, sx, sy, 2, 2));
    }
  }
  referee(ctx, Math.min(a.player.x + 34, KR.worldWidth - 18), cel, a.phase === 'touchdown', refereeY);
  void lowCam;
}

/** Camera-only adaptation: full sideline-to-sideline height, uniform sprite scale.
 * A narrow phone sees a closer section of the same world, never different physics. */
export function kickRenderCamera(attempt: KickAttempt | null, viewWidth: number = KR.width, immersive = false,
  viewport?: KickViewport) {
  if (viewport?.landscape) {
    const { scale, offsetY } = broadcastViewportFrame(viewport);
    const visibleWidth = viewWidth / scale;
    const player = attempt?.player ?? { x: 118, y: 96 };
    // Follow progress downfield only. Both sidelines stay fixed while the returner
    // cuts up or down; world positions and hitboxes never move with the camera.
    const behind = Math.min(64, visibleWidth * .24);
    const camX = clamp(player.x - behind, 0, Math.max(0, KR.worldWidth - visibleWidth));
    return { scale, camX, camY: 0, offY: offsetY };
  }
  let scale = 1, camX = 0, offY = 0;
  if (!attempt && !immersive) { scale = viewWidth / KR.worldWidth; offY = (KR.height - KR.height * scale) / 2; }
  else if (attempt?.phase === 'kickoff') {
    const t = ease(clamp((attempt.time - .55) / .85, 0, 1));
    scale = viewWidth / KR.worldWidth + (1 - viewWidth / KR.worldWidth) * t;
    offY = (KR.height - KR.height * scale) / 2 * (1 - t);
    camX = clamp(attempt.player.x - Math.min(90, viewWidth * .3), 0, Math.max(0, KR.worldWidth - viewWidth)) * t;
  } else if (attempt) camX = clamp(attempt.player.x - Math.min(90, viewWidth * .3), 0, Math.max(0, KR.worldWidth - viewWidth));
  return { scale, camX, camY: 0, offY };
}

export function drawKickReturn(ctx: CanvasRenderingContext2D, attempt: KickAttempt | null, celebrationSeconds = 0, exhausted = false,
  viewport?: KickViewport, matchup?: KickAttempt['teams'], fieldOverlay?: (ctx: CanvasRenderingContext2D) => void): void {
  const viewWidth = viewport?.width ?? KR.width;
  const viewHeight = viewport?.height ?? KR.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  R(ctx, viewport?.landscape ? C.turfB : C.ink, 0, 0, viewWidth, viewHeight);
  const { scale, camX, camY, offY } = kickRenderCamera(attempt, viewWidth, !!viewport, viewport);
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, offY - camY * scale);
  ctx.beginPath(); ctx.rect(0, 0, KR.worldWidth, KR.height); ctx.clip();
  const visible = viewWidth / scale, range = broadcastVisibleRange(camX, visible);
  const projection = { centerX: camX + visible / 2 };
  withBroadcastWorld(ctx, projection, () => {
    const ground = broadcastFieldContext(ctx, projection);
    field(ground, range.left, range.right, attempt?.teams ?? matchup);
    fieldOverlay?.(ground);
    crowd(ground, range.left, range.right, attempt?.phase === 'touchdown', celebrationSeconds, attempt?.teams ?? matchup);
    if (ART.geometry) drawBroadcastGoalPosts(ctx, range.left, range.right, projection);
    if (attempt) world(ctx, attempt, celebrationSeconds, refereeRenderY(viewport, scale, offY - camY * scale));
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.restore();
  ctx.save();
  // The world restore may return a newly resized canvas to its raw identity.
  // Re-establish logical screen space so high-density banners stay centered.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (!attempt) banner(ctx, 'KICK RETURN', Math.min(84, viewHeight * .44), C.lace, 3, viewWidth / 2);
  else if (exhausted) banner(ctx, 'GOOD GAME!', 40, C.lace, 3, viewWidth / 2);
  else if (attempt.phase === 'tackled') banner(ctx, 'TACKLED', 40, kickMatchupTeams(attempt.teams).opponent.trim, 3, viewWidth / 2);
  else if (attempt.phase === 'touchdown') {
    drawTouchdownMarquee(ctx, viewWidth / 2, Math.min(52, viewHeight * .32),
      Math.min(viewWidth - 12, 384), celebrationSeconds);
  } else if (attempt.phase === 'kickoff' && attempt.time < .9) banner(ctx, 'KICK', 12, C.lace, 2, viewWidth / 2);
  ctx.restore();
}

/** Read-only anatomy shared by both modes; uniform and ball refinements apply everywhere. */
export const kickFootballArt = { field, sprite, moveSprite, prone, referee, football, crowd, text };
