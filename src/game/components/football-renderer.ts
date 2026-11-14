import { KR } from '../lib/kick-return-engine';
import { resultVisible } from '../lib/football/play-result';
import { kickMatchupTeams } from '../lib/kick-return-teams';
import { fieldViewportFrame, type KickViewport } from '../lib/kick-return-viewport';
import type { Athlete, FootballGame, LivePlay, SpecialTeams } from '../lib/football/types';
import { fieldGoalDistance, fieldGoalAllowed, PLAYBOOK } from '../lib/football/playbook';
import { highlightedReceiver } from '../lib/football/passing';
import { primaryPlayer } from '../lib/football/execution';
import { controlledDefenderId } from '../lib/football/user-defense';
import { drawKickReturn, kickFootballArt } from './kick-return-renderer';
import { slim, carrierMark, airBall, landingMark, goalPosts, heldBall, R, type Kit } from './football-sprites';
import { uniformKit } from './football-art';
import { FOOTBALL_ART_STAGES } from './football-deluxe-art';
import { isTackleActor } from '../lib/football/tackle-scene';
import { drawTackle } from './football-tackle';
import { attackDirection, playTravelDirection, worldX } from '../lib/football/direction';
import { drawRegularSeasonMidfield } from '../../platform/midfield-logo';
import { PLAYER_TARGET_PIXELS, PLAYER_TARGET_WHITE, PLAYER_TARGET_YELLOW } from '../lib/football/player-target';

/** Presentation only. Reads the engine state; never mutates it and never samples randomness. */
const { field, moveSprite, prone, referee, football, crowd } = kickFootballArt;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const LACE = '#f1e6d0', INK = '#10213a', FIRST = '#f4d23c', LOS = '#7fc8ff', ORANGE = '#ff8a2a';
const SNAP = .18, CATCH_HOLD = .38;
export const spotX = (spot: number) => 100 + spot * 10;
/** Match Classic's ahead-of-carrier composition, not a centered new football camera. */
export function footballCameraX(focus: number, viewW: number, scale: number, landscape: boolean, direction: 1 | -1 = 1) {
  const visible = viewW / scale;
  const behind = landscape ? Math.min(64, visible * .24) : Math.min(90, viewW * .3);
  return clamp(direction === 1 ? focus - behind : focus - visible + behind, 0, Math.max(0, KR.worldWidth - visible));
}

const snapping = (live: LivePlay) => live.time <= 0 || (live.snapAge !== undefined && live.snapAge < SNAP);
const centerOf = (live: LivePlay) => {
  const los = worldX(spotX(live.snapSpot), live.fieldFrame ?? 1);
  let best: Athlete | undefined;
  for (const a of live.athletes) if (a.side === 'offense' && a.role === 'OL' && (!best || Math.abs(a.startY - 96) < Math.abs(best.startY - 96))) best = a;
  return best ?? { x: los - 2, y: 96 } as Athlete;
};
const qbOf = (live: LivePlay) => live.athletes.find(a => a.role === 'QB' && a.side === 'offense');
/** Ball position during the snap (center -> QB), derived only from live.snapAge. */
function snapBall(live: LivePlay) {
  const c = centerOf(live), q = qbOf(live) ?? c;
  const offset = 3 * (live.fieldFrame ?? 1);
  const t = live.time <= 0 && !live.snapAge ? 0 : clamp((live.snapAge ?? SNAP) / SNAP, 0, 1);
  return { x: c.x + offset + (q.x - c.x - offset) * t, y: c.y + (q.y - c.y) * t, z: Math.sin(t * Math.PI) * 4 };
}

export function footballFocusX(g: FootballGame) {
  if (g.tackleScene) return g.tackleScene.carrier.x;
  const sp = g.special;
  if (sp) {
    if (sp.stage === 'lineup' || sp.stage === 'snap' || sp.stage === 'approach') {
      const k = sp.athletes.find(a => a.id === sp.kicker);
      return k ? (k.x + sp.ball.x) / 2 : sp.ball.x;
    }
    return sp.ball.x;
  }
  const live = g.live;
  if (!live) return worldX(spotX(g.spot), g.fieldFrame ?? 1);
  if (live.flight) return live.flight.x;
  if (live.loose) return live.loose.x;
  if (live.interception && live.interception.age < CATCH_HOLD) return live.interception.catchX;
  if (snapping(live)) return worldX(spotX(live.snapSpot), g.fieldFrame ?? 1);
  const c = live.athletes.find(a => a.id === live.carrier);
  return c ? c.x : worldX(spotX(live.snapSpot), g.fieldFrame ?? 1);
}

/** Visual-only camera smoothing. Keyed by game object; reset on new match / non-animated jumps. */
type Cam = { x: number; at: number; seed: number; plays: number; phase: string };
const cams = new WeakMap<FootballGame, Cam>();
let lastCam: Cam | undefined;
function smoothCam(g: FootballGame, target: number, ball: number | undefined, visible: number) {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const prev = cams.get(g) ?? (lastCam && lastCam.seed === g.seed ? lastCam : undefined);
  const animated = g.phase === 'live' || g.phase === 'kickoff' || !!g.special && g.special.stage !== 'resolved';
  let x = target;
  if (prev && animated && prev.seed === g.seed && Math.abs(prev.x - target) < visible * 1.5 && now - prev.at < 500) {
    const dt = clamp((now - prev.at) / 1000, 0, .1);
    x = prev.x + (target - prev.x) * (1 - Math.exp(-dt * 7));
  }
  if (ball !== undefined) x = clamp(x, ball - visible + 16, ball - 16); // ball never leaves the frame
  x = clamp(x, 0, Math.max(0, KR.worldWidth - visible));
  const s: Cam = { x, at: now, seed: g.seed, plays: g.plays, phase: g.phase };
  cams.set(g, s); lastCam = s;
  return x;
}

function ballX(g: FootballGame): number | undefined {
  const sp = g.special, live = g.live;
  if (sp) return sp.ball.x;
  if (!live) return undefined;
  if (live.flight) return live.flight.x;
  if (live.loose) return live.loose.x;
  if (snapping(live)) return snapBall(live).x;
  return live.athletes.find(a => a.id === live.carrier)?.x;
}

function kits(g: FootballGame) {
  const teams = kickMatchupTeams(g.teams);
  const home = uniformKit(teams.player, 1, teams.opponent);
  const away = uniformKit(teams.opponent, -1, teams.player);
  return { home, away };
}

export function drawFootball(ctx: CanvasRenderingContext2D, g: FootballGame, view: KickViewport | undefined, seconds: number, manualDefense = false) {
  if (g.phase === 'kickoff' && g.returnAttempt && !g.special) {
    drawKickReturn(ctx, g.returnAttempt, 0, false, view, g.returnAttempt.teams,
      fieldContext => drawRegularSeasonMidfield(fieldContext, g));
    return;
  }
  const viewW = view?.width ?? KR.width, viewH = view?.height ?? KR.height;
  const { scale, offsetY } = fieldViewportFrame(view);
  const visibleW = viewW / scale;
  const live = g.live, sp = g.special;
  const focus = footballFocusX(g);
  const cameraTarget = footballCameraX(focus, viewW, scale, !!view?.landscape, playTravelDirection(g));
  const camX = smoothCam(g, cameraTarget, ballX(g), visibleW);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  R(ctx, '#277a37', 0, 0, viewW, viewH);
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, offsetY);
  ctx.beginPath(); ctx.rect(0, 0, KR.worldWidth, KR.height); ctx.clip();
  const { home, away } = kits(g);
  // Stadium ends belong to teams throughout a quarter, not current possession.
  const leftSide = attackDirection(g, 'home') === 1 ? 'home' : 'away';
  field(ctx, camX, camX + visibleW + 1, leftSide === 'home' ? g.teams : { player: g.teams.opponent, opponent: g.teams.player });
  drawRegularSeasonMidfield(ctx, g);
  if (g.franchise?.playoff) {
    // Painted midfield emblem, behind players and ball; it never affects play.
    ctx.save(); ctx.globalAlpha = .68;
    R(ctx, '#173e34', 571, 70, 58, 54);
    R(ctx, '#eac453', 586, 76, 28, 17);
    R(ctx, '#ffe8a0', 590, 76, 5, 13);
    R(ctx, '#eac453', 582, 78, 4, 13); R(ctx, '#eac453', 614, 78, 4, 13);
    R(ctx, '#eac453', 586, 91, 28, 4); R(ctx, '#eac453', 593, 95, 14, 4);
    R(ctx, '#eac453', 598, 99, 4, 10); R(ctx, '#eac453', 590, 109, 20, 4);
    ctx.globalAlpha = .9; ctx.fillStyle = '#fff0b8'; ctx.font = '6px monospace'; ctx.textAlign = 'center';
    ctx.fillText('PLAYOFFS', 600, 121); ctx.restore();
  }
  crowd(ctx, camX, camX + visibleW + 1, g.phase === 'final' && g.winner === 'home', seconds);

  if (g.tackleScene?.space === 'legacy-return' && g.returnAttempt) {
    for (const d of g.returnAttempt.defenders) if (!isTackleActor(g, d, 'legacy-return'))
      slim(ctx, d.x, d.y, { ...(g.kickReceiver === 'home' ? away : home), dir: -1 });
  } else if (sp) drawSpecial(ctx, g, sp, home, away, seconds);
  else drawScrimmage(ctx, g, home, away, seconds, manualDefense);
  drawTackle(ctx, g, home, away);
  referee(ctx, clamp(focus + 34, 18, KR.worldWidth - 18), seconds, g.lastResult.startsWith('TOUCHDOWN') && ['play-dead', 'final'].includes(g.phase));
  if ((g.turnoverNotice ?? 0) > 0) {
    // Referee's directional possession signal; never invent a kick on downs.
    const rx = clamp(focus + 34, 18, KR.worldWidth - 18);
    ctx.save(); ctx.translate(rx, 0); ctx.scale(attackDirection(g), 1); ctx.translate(-rx, 0);
    R(ctx, '#f1e6d0', rx + 3, 178, 12, 2); R(ctx, '#e0a370', rx + 14, 178, 3, 2);
    R(ctx, FIRST, rx + 18, 177, 5, 1); R(ctx, FIRST, rx + 21, 175, 2, 5);
    ctx.restore();
  }
  ctx.restore();

  // Kick verdicts belong to the visible screen, never the end-zone world frame.
  // The existing timed result overlay takes over once the play is complete.
  if (sp?.kind === 'field-goal' && sp.good !== undefined && !resultVisible(g) &&
      (sp.stage === 'resolved' || sp.stage === 'flight' && worldX(sp.ball.x, g.fieldFrame ?? 1) > 1170)) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const label = sp.good ? 'GOOD' : 'NO GOOD';
    const size = Math.round(clamp(12 * scale, 16, 28));
    const w = Math.min(viewW - 16, size * 8), h = size * 2;
    R(ctx, INK, (viewW - w) / 2, (viewH - h) / 2, w, h);
    ctx.font = `bold ${size}px ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = sp.good ? '#58c46a' : ORANGE;
    ctx.fillText(label, viewW / 2, viewH / 2);
    ctx.restore();
  }

  // Keep the entire meter below the overlaid landscape scoreboard, not in its top stripe.
  if (g.phase === 'live' && live?.mode === 'kick' && live.play === 'field-goal' && live.kickAccuracy === undefined &&
      (!sp || sp.stage === 'hold')) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const w = Math.min(viewW - 24, 180 * scale), h = 8 * scale, x = (viewW - w) / 2, y = Math.round(viewH * .3);
    R(ctx, INK, x - 2, y - 2, w + 4, h + 4);
    R(ctx, '#b33a2a', x, y, w, h);
    const distance = fieldGoalDistance(g), max = g.profiles[g.possession].kickMax;
    const window = clamp(.26 - Math.max(0, distance - 20) / Math.max(1, max - 20) * .235, .025, .26);
    R(ctx, '#e3a83a', x + w * (.5 - window * 1.7), y, w * window * 3.4, h);
    R(ctx, '#58c46a', x + w * (.5 - window), y, w * window * 2, h);
    const m = clamp(live.kickMeter, 0, 1);
    R(ctx, LACE, x + w * m - scale, y - 3 * scale, 2 * scale, h + 6 * scale);
    ctx.fillStyle = LACE; ctx.font = `bold ${Math.round(7 * scale)}px ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.fillText(`${fieldGoalDistance(g)} YD ATTEMPT`, viewW / 2, y + h + 10 * scale);
    ctx.restore();
  }
}

/** The exact shared eight-rectangle targeting symbol. */
function playerTarget(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  for (const [dx, dy, width, height] of PLAYER_TARGET_PIXELS)
    R(ctx, color, x + dx, y + dy, width, height);
}

function drawScrimmage(ctx: CanvasRenderingContext2D, g: FootballGame, home: Omit<Kit, 'dir'>, away: Omit<Kit, 'dir'>, seconds: number, manualDefense: boolean) {
  const live = g.live;
  const dir = g.fieldFrame ?? 1;
  const los = worldX(spotX(live?.snapSpot ?? g.spot), dir);
  const rangeX = worldX(100 + (117 - g.profiles[g.possession].kickMax) * 10, dir);
  if (fieldGoalAllowed(g) && rangeX > 100 && rangeX < 1100) for (let y = 20; y < 172; y += 8) R(ctx, LACE, rangeX, y, 1, 3);
  R(ctx, LOS, los, 18, 2, 156);
  if (g.target < 100 && !(live?.mode === 'kick') && !(g.turnoverNotice! > 0)) {
    const fx = worldX(spotX(g.target), dir);
    R(ctx, FIRST, fx, 18, 2, 156);
    R(ctx, ORANGE, fx - 2, 8, 6, 8); R(ctx, INK, fx, 4, 2, 12);
  }
  // Deluxe: posts are permanent shared field fixtures; original conditional post kept for rollback.
  if (!FOOTBALL_ART_STAGES.geometry && (live?.play === 'field-goal' || live?.mode === 'kick')) goalPosts(ctx, worldX(1194, dir));
  const originalOffense = live?.offense ?? g.possession;
  const offenseKit: Kit = { ...(originalOffense === 'home' ? home : away), dir };
  const defenseKit: Kit = { ...(originalOffense === 'home' ? away : home), dir: dir === 1 ? -1 : 1 };
  if (!live) { if (g.phase !== 'final') football(ctx, los + 1, 96, true); return; }
  const t = live.time * 9;
  const snap = snapping(live);
  const ic = live.interception, holding = !!ic && ic.age < CATCH_HOLD;
  const read = highlightedReceiver(live);
  const primary = primaryPlayer(live);
  const controlled = g.phase === 'live' && (live.offense ?? g.possession) === 'away' &&
    !['return', 'kick', 'loose'].includes(live.mode) ? controlledDefenderId(live) : undefined;
  const sorted = [...live.athletes].sort((a, b) => a.y - b.y);
  let carrierAt: { x: number; y: number } | undefined;
  for (const a of sorted) {
    if (isTackleActor(g, a, 'scrimmage')) continue;
    const kit = a.side === 'offense' ? offenseKit : defenseKit;
    const moving = !snap && Math.hypot(a.vx, a.vy) > 3;
    const facing: 1 | -1 = a.vx < -6 ? -1 : a.vx > 6 ? 1 : kit.dir;
    const hasBall = !snap && a.id === live.carrier && !live.flight && !live.loose && !live.option?.ball && !(live.mode === 'kick' && live.kickAccuracy !== undefined);
    const engaged = a.engaged > live.time;
    ctx.save();
    ctx.translate(a.x - Math.round(a.x), a.y - Math.round(a.y));
    if (live.loose?.kind === 'fumble' && live.loose.lostBy === a.id && live.loose.time < .36) {
      if (live.loose.time < .09) slim(ctx, a.x, a.y, kit, { crouch: true, lean: kit.dir });
      else prone(ctx, a.x, a.y, kit, kit.dir > 0 ? 0 : Math.PI, Math.max(0, 1 - (live.loose.time - .09) / .27) * 4);
    } else if (live.loose?.recoverer === a.id && live.loose.time > .4) {
      const b = live.loose, angle = Math.atan2(b.y - (b.fromY ?? a.y), b.x - (b.fromX ?? a.x));
      prone(ctx, a.x, a.y, kit, angle, Math.sin(Math.min(1, b.time / .42) * Math.PI) * 4);
    } else if (a.dive) {
      const d = a.dive;
      prone(ctx, a.x, a.y, kit, d.angle, d.phase === 'airborne' ? Math.sin(Math.PI * d.elapsed / .28) * 4 : 0);
    } else if (hasBall && holding && ic && a.id === ic.catcher) {
      slim(ctx, ic.catchX, ic.catchY, { ...kit, dir: dir === 1 ? -1 : 1 }, { hold: true, crouch: ic.age < .24 });
      heldBall(ctx, Math.round(ic.catchX) - 4 * dir, Math.round(ic.catchY) - 2);
    } else if (hasBall && (live.mode === 'run' || live.mode === 'scramble') && moveSprite(ctx, a.x, a.y, kit, t, { ...live.movement, player: { x: a.x, y: a.y } })) { /* original move pose */ }
    else if (snap && a.role === 'OL' && a === centerOf(live)) slim(ctx, a.x, a.y, kit, { crouch: true, hold: live.time <= 0 });
    else if (snap && a.role === 'QB') slim(ctx, a.x, a.y, kit, { hold: true });
    else slim(ctx, a.x, a.y, { ...kit, dir: facing }, { step: moving ? t + a.id : 0, ball: hasBall, engaged, lean: engaged ? facing : 0, crouch: snap });
    if (g.phase === 'live' && a.id === read && g.possession === 'home' && !ic) {
      playerTarget(ctx, a.x, a.y, live.holdingPass ? PLAYER_TARGET_YELLOW : PLAYER_TARGET_WHITE);
    }
    // Small ground tick links the primary diagram to the opening assignment,
    // then disappears. No live labels, arrows, halos or permanent HUD additions.
    if (g.phase === 'live' && !ic && !snap && a.id === primary && a.id !== read &&
        live.time < PLAYBOOK[live.play].develop + .55) R(ctx, LACE, a.x - 3, a.y + 7, 6, 1);
    if (a.id === controlled) {
      playerTarget(ctx, a.x, a.y, manualDefense ? PLAYER_TARGET_YELLOW : PLAYER_TARGET_WHITE);
    }
    ctx.restore();
    if (hasBall) carrierAt = holding && ic ? { x: ic.catchX, y: ic.catchY } : a;
  }
  if (carrierAt && g.phase === 'live') carrierMark(ctx, carrierAt.x, carrierAt.y, seconds);
  if (snap && g.phase !== 'final') { const b = snapBall(live); airBall(ctx, b.x, b.y + 2, b.z + 2, 0); }
  if (live.flight) { const f = live.flight; landingMark(ctx, f.toX, f.toY, seconds); airBall(ctx, f.x, f.y, f.z, 0); }
  if(live.option?.ball) {const b=live.option.ball;airBall(ctx,b.x,b.y,b.z,0);}
  if (live.loose) airBall(ctx, live.loose.x, live.loose.y, live.loose.z ?? 0, live.loose.time * 4);
  if (live.mode === 'kick' && live.kickAccuracy !== undefined && g.phase === 'live') {
    const kicker = live.athletes[5]!, k = clamp(live.kickAge / .9, 0, 1);
    const destination = worldX(live.play === 'punt' ? Math.min(1150, worldX(kicker.x, dir) + 420) : 1194, dir);
    airBall(ctx, kicker.x + (destination - kicker.x) * k, kicker.y + (live.kickAccuracy - .5) * k * 60, Math.sin(k * Math.PI) * 44, k * 6);
  }
}

function drawSpecial(ctx: CanvasRenderingContext2D, g: FootballGame, sp: SpecialTeams, home: Omit<Kit, 'dir'>, away: Omit<Kit, 'dir'>, seconds: number) {
  const fg = sp.kind === 'field-goal';
  const dir = g.fieldFrame ?? 1;
  // athletes: offense = kicking team, defense = receiving team.
  const kickKit: Kit = { ...(sp.kicking === 'home' ? home : away), dir: (fg ? dir : -dir) as 1 | -1 };
  const recvKit: Kit = { ...(sp.receiver === 'home' ? home : away), dir: (fg ? -dir : dir) as 1 | -1 };
  if (!FOOTBALL_ART_STAGES.geometry && fg) goalPosts(ctx, worldX(1194, dir));
  R(ctx, LOS, Math.round(sp.fromX), 18, 2, 156);
  const ret = sp.stage === 'return';
  const sorted = [...sp.athletes].sort((a, b) => a.y - b.y);
  const st = sp.stage, age = sp.stageAge, t = sp.age * 9;
  const ballHeld = st === 'lineup' || st === 'approach' && sp.kind !== 'punt' && !fg;
  for (const a of sorted) {
    if (isTackleActor(g, a, 'special')) continue;
    const kit = a.side === 'offense' ? kickKit : recvKit;
    if (ret && a.id === sp.returner) {
      ctx.save(); ctx.translate(a.x - Math.round(a.x), a.y - Math.round(a.y));
      const ra = g.returnAttempt;
      if (!(ra && ra.phase === 'returning' && moveSprite(ctx, a.x, a.y, { ...kit, dir: (sp.mirrored ? -dir : dir) as 1 | -1 }, t, { ...ra, player: { x: a.x, y: a.y } })))
        slim(ctx, a.x, a.y, { ...kit, dir: a.vx < -6 ? -1 : 1 }, { step: Math.hypot(a.vx, a.vy) > 3 ? t : 0, ball: true });
      ctx.restore(); carrierMark(ctx, a.x, a.y, seconds); continue;
    }
    const moving = Math.hypot(a.vx, a.vy) > 3;
    const facing: 1 | -1 = a.vx < -6 ? -1 : a.vx > 6 ? 1 : kit.dir;
    ctx.save();
    ctx.translate(a.x - Math.round(a.x), a.y - Math.round(a.y));
    if (st === 'loose' && a.id === sp.loose?.recoverer && age > .4) {
      const b = sp.loose, angle = Math.atan2(b.y - (b.fromY ?? a.y), b.x - (b.fromX ?? a.x));
      prone(ctx, a.x, a.y, kit, angle, Math.sin(clamp((b.secure ?? 0) / .24, 0, 1) * Math.PI) * 4);
    } else if (st === 'loose' && a.id === sp.blockAttempt?.defender && age < .24) {
      prone(ctx, a.x, a.y, kit, Math.atan2(sp.ball.y - a.y, sp.ball.x - a.x), Math.sin(age / .24 * Math.PI) * 5);
    } else if (st === 'loose' && a.id === sp.loose?.lostBy && age < .36 && sp.loose.kind === 'fumble') {
      if (age < .09) slim(ctx, a.x, a.y, kit, { crouch: true, lean: kit.dir });
      else prone(ctx, a.x, a.y, kit, 0, Math.max(0, 1 - (age - .09) / .27) * 4);
    } else if (st === 'loose' && a.id === sp.loose?.lostBy && age < .3 && sp.loose.kind === 'muff') {
      slim(ctx, a.x, a.y, kit, { hold: true, crouch: age > .15 });
    } else if (a.id === sp.kicker && (st === 'approach' || st === 'flight' && age < .22 ||
        st === 'loose' && sp.blockAttempt?.contacted && age < .22)) {
      const contact = st === 'flight' || st === 'loose' ? clamp(.5 + age / .44, 0, 1) : st === 'approach' && age > .24 ? .35 : -1;
      if (contact >= 0) slim(ctx, a.x, a.y, { ...kit, dir: kit.dir }, { kick: contact, hold: sp.kind === 'punt' && contact < .5 });
      else slim(ctx, a.x, a.y, { ...kit, dir: kit.dir }, { step: t, lean: kit.dir, hold: sp.kind === 'punt' });
    } else if (fg && a.id === sp.returner && (st === 'hold' || st === 'approach')) {
      slim(ctx, a.x, a.y, kickKit, { hold: true, crouch: true });
    } else if (a.id === sp.kicker && (st === 'snap' || st === 'hold' || st === 'lineup') && (sp.kind === 'punt' || fg)) {
      slim(ctx, a.x, a.y, kit, { hold: true, crouch: st === 'snap' && fg });
    } else if (a.id === sp.recovery && sp.kind !== 'onside' && (st === 'recovery' || st === 'resolved')) {
      const secured = st === 'resolved' || age >= .32;
      slim(ctx, a.x, a.y, { ...kit, dir: sp.ball.x < a.x ? -1 : 1 }, { step: secured ? 0 : t, ball: secured, hold: !secured });
    } else if (a.id === sp.recovery && (st === 'recovery' || st === 'resolved')) {
      const from = sp.recoveryFrom ?? a, ang = Math.atan2(sp.ball.y - from.y, sp.ball.x - from.x);
      prone(ctx, a.x, a.y, kit, ang, st === 'recovery' ? Math.sin(clamp(age / .42, 0, 1) * Math.PI) * 4 : 0);
      if (st !== 'recovery' || age >= .32) heldBall(ctx, Math.round(a.x + Math.cos(ang) * 6) - 2, Math.round(a.y + Math.sin(ang) * 6) - 2);
    } else {
      const fielding = a.id === sp.returner && (st === 'flight' || st === 'bounce') && Math.hypot(a.x - sp.ball.x, a.y - sp.ball.y) < 26;
      slim(ctx, a.x, a.y, { ...kit, dir: fielding ? (sp.ball.x < a.x ? -1 : 1) : facing }, { step: moving ? t + a.id : 0, hold: fielding, engaged: a.engaged > sp.age, lean: a.engaged > sp.age ? facing : 0 });
    }
    ctx.restore();
  }
  if (ret) return;
  const b = sp.ball;
  const recovered = sp.recovery !== undefined && (st === 'recovery' && age >= .32 || st === 'resolved');
  if (st === 'flight') landingMark(ctx, sp.toX, sp.toY, seconds);
  if (recovered) return;
  if (ballHeld && sp.kind !== 'punt' && !fg) { // tee
    R(ctx, ORANGE, b.x - 1, b.y + 1, 3, 2);
    airBall(ctx, b.x, b.y, 3, 1);
  } else airBall(ctx, b.x, b.y, b.z, st === 'flight' || st === 'bounce' ? sp.age : 0);
}
