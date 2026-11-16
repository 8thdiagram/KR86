import { KR, kickBallPosition, isKickContact, type KickAttempt } from '../lib/kick-return-engine';
import { kickMatchupTeams } from '../lib/kick-return-teams';
import { drawTouchdownMarquee } from './football-touchdown-art';
import { kickDivePose } from '../lib/kick-return-dive';
import { kickDiveRules } from '../lib/kick-return-burst';
import type { KickViewport } from '../lib/kick-return-viewport';
import { drawFootballBall, positionKit, classicSkinPosition, uniformKit, type FootballKit } from './football-art';
import { drawCachedFootballPitch } from './football-pitch-cache';
import { FOOTBALL_ART_STAGES as ART, drawDeluxeTurf, drawEndZoneLettering, drawFieldFixtures, drawYardNumber, tone } from './football-deluxe-art';
import { drawBroadcastStadium } from './football-stadium-art';
import { withBroadcastAnchor, withBroadcastWorld, broadcastFieldContext, broadcastVisibleRange, broadcastViewportFrame } from './football-broadcast';
import { drawBroadcastGoalPosts } from './football-broadcast-posts';
import { turnSprite, type BodyView, type Pose } from './football-sprites';
import { updateFootballAnimation } from './football-animation-clock';
import { drawPixelEnlarged } from './football-pixel-scale';
import { refereeRenderY, REFEREE_WORLD_Y } from './football-referee-layout';
import { drawFootballPlayer, drawFootballProne } from './football-player-art';
import { EVADE } from '../lib/carrier-evasion';

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

function fieldBase(ctx: CanvasRenderingContext2D, x0: number, x1: number, matchup?: KickAttempt['teams']) {
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
}

function field(ctx: CanvasRenderingContext2D, x0: number, x1: number, matchup?: KickAttempt['teams']) {
  const teams = kickMatchupTeams(matchup);
  const key = `${teams.player.body}:${teams.opponent.body}:${ART.field}`;
  if (!drawCachedFootballPitch(ctx, key, native => fieldBase(native, 0, KR.worldWidth, matchup)))
    fieldBase(ctx, x0, x1, matchup);
  // Keep lettering/fixtures in their original projection, not baked into a
  // reduced-resolution image. Midfield marks and animated crowd are separate.
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
// Standing sprite: 8 wide x ~16 tall. Anchor: (x, y) = torso centre.
function spriteNative(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, step: number, ball = false, shuffle = 0, lean = 0, view?: BodyView, pose: Pose = {}) {
  if (view !== undefined) {
    turnSprite(ctx, x, y, kit, view, { step, ball, hold: !ball && shuffle > 0, crouch: shuffle > 0, ...pose });
    return;
  }
  const cx = Math.round(x), ground = Math.round(y);
  contactShadow(ctx, cx, ground + 5, 10);
  drawFootballPlayer(ctx, cx, ground, kit, {
    step, lean, ball, crouch: shuffle > 0, engaged: shuffle > 0, hold: shuffle > 0, ...pose,
  });
}
function sprite(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, step: number, ball = false, shuffle = 0, lean = 0, view?: BodyView, pose: Pose = {}) {
  drawPixelEnlarged(ctx, x, y, (target, px, py) => spriteNative(target, px, py, kit, step, ball, shuffle, lean, view, pose), 6);
}
// Hand-authored turf silhouette; no upright sprite is rotated into a cutout.
function proneNative(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, angle: number, lift: number, crouch = 0, ball = false) {
  const horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
  contactShadow(ctx, Math.round(x), Math.round(y) + (horizontal ? 3 : 7),
    (horizontal ? 16 : 10) - Math.min(4, Math.max(0, Math.round(lift))));
  drawFootballProne(ctx, x, y, kit, { angle, lift, crouch, ball });
}
function prone(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, angle: number, lift: number, crouch = 0, ball = false) {
  drawPixelEnlarged(ctx, x, y, (target, px, py) => proneNative(target, px, py, kit, angle, lift, crouch, ball));
}
function lying(ctx: CanvasRenderingContext2D, x: number, y: number, kit: Kit, ball = false) {
  prone(ctx, Math.round(x) - (kit.dir > 0 ? 1 : -1), Math.round(y), kit, kit.dir > 0 ? 0 : Math.PI, 0, 0, ball);
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
  const m = a.moves;
  if (!m) return false;
  const v2 = m.version === 2;
  const act = m.active as { kind: 'spin' | 'stutter' | 'dive' | 'boost'; elapsed: number; side: number; evasive?: boolean; duration?: number } | undefined;
  // Full Game reuses the carrier move record during eligible runs/scrambles;
  // only the explicitly tagged new moves may render outside Classic returns.
  if (a.phase !== 'returning' && !act?.evasive && !m.hesitating) return false;
  const runProgress = (((t % 4) + 4) % 4) / 4;
  const px = Math.round(x) - 4, py = Math.round(y) - 8;
  if (act && act.kind === 'dive') {
    const e = act.elapsed * .34 / kickDiveRules(a).duration, tilt = act.side * 1;
    if (e < .08) {
      sprite(ctx, x, y + 1, kit, 0, true, 0, 0, undefined, { action: 'dive', progress: e / .34 });
    }
    else if (e < .14) {
      // A compact three-quarter brace bridges the upright wind-up and turf pose.
      sprite(ctx, x, y + 1, kit, 0, true, 0, 0, act.side > 0 ? 5 : 6,
        { action: 'dive', progress: e / .34 });
    }
    else if (e < .26) {
      const lift = e < .2 ? 1 : 3;
      prone(ctx, Math.round(x), Math.round(y) + 1, kit, -.35 + tilt * .08, lift, 1, true);
    } else {
      prone(ctx, Math.round(x), Math.round(y) + 2, kit, tilt * .06, 0, 0, true);
    }
    return true;
  }
  if (v2 && !act && m.hesitating) {
    sprite(ctx, x, y, kit, t, true, 0, 0, undefined, { action: 'run', progress: (a.returnTime * 2) % 1 });
    return true;
  }
  if (act && act.kind === 'spin') {
    const dur = act.evasive ? act.duration ?? .44 : v2 ? .3 : .34, rot = act.side || 1;
    const p = clamp(act.elapsed / dur, 0, 1);
    // A full directional orbit through authored silhouettes, then back to the
    // exact starting view. No canvas rotation or pixel scaling is involved.
    const orbit: BodyView[] = rot > 0
      ? [0, 1, 2, 3, 4, 7, 6, 5, 0]
      : [0, 5, 6, 7, 4, 3, 2, 1, 0];
    // Older saves retain their original quick-turn presentation and duration.
    const legacy: BodyView[] = rot > 0
      ? [0, 5, 1, 6, 2, 7, 3, 8, 4, 8, 3, 7, 2, 6, 1, 5, 0]
      : [0, 6, 3, 7, 2, 5, 1, 8, 4, 8, 1, 5, 2, 7, 3, 6, 0];
    const frames = act.evasive ? orbit : legacy;
    const frame = Math.min(frames.length - 1, Math.floor(p * (act.evasive ? frames.length - 1 : frames.length)));
    const view = frames[frame]!;
    const halfTurn = act.evasive ? frame > 3 && frame < frames.length - 1
      : frame >= 8 && frame < frames.length - 1;
    const d: 1 | -1 = halfTurn ? (kit.dir === 1 ? -1 : 1) : kit.dir;
    const planting = act.evasive ? p < .16 || p > .84 : false;
    sprite(ctx, x, y, { ...kit, dir: d }, t, true, 0, 0, view,
      { action: planting ? 'stance' : 'run', progress: planting ? undefined : runProgress });
    return true;
  }
  if (act && act.kind === 'boost' && act.evasive) {
    const p = clamp(act.elapsed / EVADE.boost, 0, 1);
    // A restrained forward lean and slightly quicker, coordinated running
    // cycle; the approved ball-carry silhouette and anchor remain unchanged.
    sprite(ctx, x, y, kit, t * EVADE.boostRatio, true, 0, kit.dir * 1.6, undefined,
      { action: 'run', progress: (runProgress * EVADE.boostRatio + p * .12) % 1 });
    return true;
  }
  if (act && act.kind === 'stutter') {
    const hold = act.elapsed < .1 ? 1 : 0, fake = hold ? -act.side : act.side;
    if (v2 && !hold) R(ctx, C.lace, px + 3 - fake * 5, py + 14, 2, 1);
    const cutView: BodyView = hold ? (fake > 0 ? 5 : 6) : (fake > 0 ? 6 : 5);
    sprite(ctx, x, y + hold, kit, t, true, hold, fake * 3, cutView,
      hold ? {} : { action: 'run', progress: runProgress });
    R(ctx, C.lace, px + (fake < 0 ? 9 : -3), py + 14, 2, 1);
    return true;
  }
  if (m.backward) {
    const bx = Math.round(x) - 1;
    sprite(ctx, bx, y, kit, t, true, 0, 0, undefined,
      { action: 'run', progress: (1 - runProgress) % 1 });
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
  // Classic simulation and interpolation return new attempt objects each
  // frame. The canvas, unlike that temporary snapshot, is a stable clock owner.
  const animationOwner = ctx.canvas ?? a;
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
  // One monotonic render clock spans kickoff flight and the return, even when
  // the engine's phase-local returnTime begins at zero.
  const animationNow = kick ? a.time : Math.max(a.time, 1.4 + a.returnTime);
  const carrierFacing: 1 | -1 = home.dir;
  const carrierCadence = updateFootballAnimation(animationOwner, 'carrier', {
    now: animationNow, x: p.x, y: p.y, vx: 0, vy: 0, facing: carrierFacing,
  });
  const t = carrierCadence.step;
  for (const d of a.defenders) {
    if (d.x < -20) continue;
    const defenderKit = positionKit(away, classicSkinPosition(d));
    const tackling = a.phase === 'tackled' && !['grounded', 'recovering'].includes(d.dive?.phase ?? '') && isKickContact(p, d);
    const coverage = kick ? ease(clamp((a.time - .35) / 1.15, 0, 1)) : 1;
    const stagedX = d.id === 10 ? 1080 - Math.min(a.time / .35, 1) * 18 : 1000 + d.id % 5 * 18;
    const stagedY = d.id === 10 ? 96 : 32 + d.id % 6 * 25;
    const x = stagedX + (d.x - stagedX) * coverage;
    const y = stagedY + (d.y - stagedY) * coverage;
    const fallbackFacing: 1 | -1 = d.motion?.facing ?? (d.roamer?.vx && d.roamer.vx < -2 ? -1 : 1);
    const cadence = updateFootballAnimation(animationOwner, d.id, {
      now: animationNow,
      x: d.motion ? d.x : x,
      y: d.motion ? d.y : y,
      vx: d.motion?.vx ?? d.speed,
      vy: d.motion?.vy ?? 0,
      facing: fallbackFacing,
    });
    actors.push({ x, y, draw: () => {
      if (kick) {
        sprite(ctx, x, y, defenderKit, cadence.step, false, 0, 0, cadence.view,
          cadence.moving ? { action: 'run', progress: cadence.phase } : { action: 'stance' });
      }
      else if (kickDivePose(a, d, cel)) {
        diving(ctx, d.x, d.y, defenderKit, kickDivePose(a, d, cel)!);
      } else if (d.id === 10 && d.motion) {
        const m = d.motion;
        const speed = Math.hypot(m.vx, m.vy);
        const shuffling = cadence.shuffling;
        const lean = speed > 15 && !shuffling ? cadence.facing : 0;
        sprite(ctx, d.x + lean + (tackling ? lunge(d.x) : 0), d.y + (tackling ? 2 : 0),
          { ...defenderKit, dir: cadence.facing }, cadence.step, false, shuffling ? 1 : 0, 0, cadence.view,
          cadence.moving && a.phase === 'returning'
            ? { action: 'run', progress: cadence.phase }
            : { action: 'stance' });
      } else if (d.roamer) {
        const facing: 1 | -1 = tackling ? (p.x >= d.x ? 1 : -1) : cadence.facing;
        sprite(ctx, d.x + (tackling ? lunge(d.x) : 0), d.y + (tackling ? 1 : 0), { ...defenderKit, dir: facing },
          cadence.step, false, 0, 0, cadence.view,
          d.active && cadence.moving && a.phase === 'returning'
            ? { action: 'run', progress: cadence.phase }
            : { action: 'stance' });
      } else
      if (tackling) {
         sprite(ctx, d.x + lunge(d.x), d.y + 1, defenderKit, 0);
      }
       else sprite(ctx, d.x, d.y, defenderKit, cadence.step, false, 0, 0, cadence.view,
         d.active && cadence.moving ? { action: 'run', progress: cadence.phase } : { action: 'stance' });
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
      else lying(ctx, p.x, p.y + 2, home, true);
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
      sprite(ctx, p.x, p.y - hop, home, 0, true, 0, 0, undefined,
        { action: 'jump', progress: (cel % .5) / .5 });
     } else if (!kick && hasBall && moveSprite(ctx, p.x, p.y, { ...home, dir: carrierCadence.facing }, t, a)) {
       /* integrated move pose drawn */
     } else {
       const running = !kick || a.time > .25 && a.time < 1.4;
       sprite(ctx, p.x, p.y, { ...home, dir: carrierCadence.facing }, t, hasBall, 0, 0,
         carrierCadence.view, running && carrierCadence.moving
           ? { action: 'run', progress: carrierCadence.phase }
           : { action: 'idle' });
     }
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
