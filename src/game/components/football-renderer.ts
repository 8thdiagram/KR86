import { KR } from '../lib/kick-return-engine';
import { kickMatchupTeams } from '../lib/kick-return-teams';
import type { KickViewport } from '../lib/kick-return-viewport';
import type { Athlete, FootballGame, LivePlay, SpecialTeams } from '../lib/football/types';
import { fieldGoalAllowed, PLAYBOOK } from '../lib/football/playbook';
import { fieldGoalSequence } from '../lib/football/special-teams';
import { fieldGoalHeight } from '../lib/football/field-goal-geometry';
import { highlightedReceiver } from '../lib/football/passing';
import { primaryPlayer } from '../lib/football/execution';
import { drawKickReturn, kickFootballArt } from './kick-return-renderer';
import { stepRenderCamera, type RenderCamera } from '../lib/football/render-camera';
import { slim, carrierMark, airBall, landingMark, goalPosts, R, type Kit } from './football-sprites';
import { updateFootballAnimation } from './football-animation-clock';
import { footballAthletePose } from './football-player-state';
import { uniformKit, positionKit, specialSkinPosition, classicSkinPosition } from './football-art';
import { FOOTBALL_ART_STAGES } from './football-deluxe-art';
import { isTackleActor } from '../lib/football/tackle-scene';
import { drawTackle } from './football-tackle';
import { attackDirection, playTravelDirection, worldX } from '../lib/football/direction';
import { drawRegularSeasonMidfield } from '../../platform/midfield-logo';
import { PLAYER_TARGET_PIXELS, PLAYER_TARGET_WHITE, PLAYER_TARGET_YELLOW } from '../lib/football/player-target';
import { drawFieldGoalFlight } from './football-field-goal';
import { withBroadcastAnchor, withBroadcastWorld, broadcastFieldContext, broadcastVisibleRange, broadcastViewportFrame } from './football-broadcast';
import { drawBroadcastGoalPosts } from './football-broadcast-posts';
import { refereeRenderY, REFEREE_WORLD_Y } from './football-referee-layout';

/** Presentation only. Reads the engine state; never mutates it and never samples randomness. */
const { field, moveSprite, prone, referee, football, crowd } = kickFootballArt;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const LACE = '#f1e6d0', INK = '#10213a', FIRST = '#f4d23c', LOS = '#7fc8ff', ORANGE = '#ff8a2a';
const SNAP = .18, CATCH_HOLD = .38;
export const spotX = (spot: number) => 100 + spot * 10;
/** Match Classic's ahead-of-carrier composition, not a centered new football camera. */
export function footballCameraX(focus: number, viewW: number, scale: number, landscape: boolean, direction: 1 | -1 = 1) {
  const visible = viewW / scale;
  const behind = landscape ? Math.min(64, visible * .24) : Math.min(90, visible * .42);
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

/** Visual-only camera smoothing, owned by the stable canvas rather than a
 * temporary formation snapshot. Reset on new matches and non-animated cuts. */
type Cam = RenderCamera & { seed: number };
const cams = new WeakMap<CanvasRenderingContext2D, Cam>();
function smoothCam(ctx: CanvasRenderingContext2D, g: FootballGame, target: number, ball: number | undefined, visible: number) {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const prev = cams.get(ctx);
  const animated = ['live', 'kickoff', 'play-dead', 'final'].includes(g.phase);
  const s = stepRenderCamera(animated && prev?.seed === g.seed ? prev : undefined,
    target, now, visible, KR.worldWidth, ball);
  cams.set(ctx, { ...s, seed: g.seed });
  return s.x;
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

export function drawFootball(ctx: CanvasRenderingContext2D, g: FootballGame, view: KickViewport | undefined, seconds: number) {
  // A block still belongs to the existing overhead loose-ball/return sequence.
  const overheadKickStages = ['loose', 'return', 'recovery', 'bounce'];
  if (g.special?.kind === 'field-goal' && !overheadKickStages.includes(g.special.stage)) {
    drawFieldGoalFlight(ctx, g, view);
    return;
  }
  // Keep older/pre-special live field-goal states in the same camera. Sequence
  // construction is deterministic and presentation-only; it never consumes RNG.
  if (!g.special && g.live?.play === 'field-goal' && (g.phase === 'pre-snap' || g.phase === 'live')) {
    const preview = fieldGoalSequence(g);
    if (g.phase === 'pre-snap') {
      preview.stage = 'snap';
    } else if (g.live.kickAccuracy === undefined) {
      preview.stage = 'hold';
      preview.ball = { x: preview.fromX, y: preview.fromY, z: 0 };
    } else {
      const t = clamp(g.live.kickAge / .9, 0, 1);
      preview.stage = 'flight';
      preview.duration = .9;
      preview.stageAge = g.live.kickAge;
      preview.ball = {
        x: preview.fromX + (preview.toX - preview.fromX) * t,
        y: preview.fromY + (preview.toY - preview.fromY) * t,
        z: fieldGoalHeight(g, t),
      };
    }
    drawFieldGoalFlight(ctx, { ...g, special: preview }, view);
    return;
  }
  if (g.phase === 'kickoff' && g.returnAttempt && !g.special) {
    drawKickReturn(ctx, g.returnAttempt, 0, false, view, g.returnAttempt.teams,
      fieldContext => drawRegularSeasonMidfield(fieldContext, g));
    return;
  }
  const viewW = view?.width ?? KR.width, viewH = view?.height ?? KR.height;
  const { scale, offsetY } = broadcastViewportFrame(view);
  const refereeY = refereeRenderY(view, scale, offsetY);
  const visibleW = viewW / scale;
  const live = g.live, sp = g.special;
  const focus = footballFocusX(g);
  const cameraTarget = footballCameraX(focus, viewW, scale, !!view?.landscape, playTravelDirection(g));
  const camX = smoothCam(ctx, g, cameraTarget, ballX(g), visibleW);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  R(ctx, '#277a37', 0, 0, viewW, viewH);
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, offsetY);
  ctx.beginPath(); ctx.rect(0, 0, KR.worldWidth, KR.height); ctx.clip();
  const { home, away } = kits(g);
  // Stadium ends belong to teams throughout a quarter, not current possession.
  const leftSide = attackDirection(g, 'home') === 1 ? 'home' : 'away';
  const projection = { centerX: camX + visibleW / 2 }, range = broadcastVisibleRange(camX, visibleW);
  withBroadcastWorld(ctx, projection, () => {
  const ground = broadcastFieldContext(ctx, projection);
  field(ground, range.left, range.right, leftSide === 'home' ? g.teams : { player: g.teams.opponent, opponent: g.teams.player });
  drawRegularSeasonMidfield(ground, g);
  if (FOOTBALL_ART_STAGES.geometry) drawBroadcastGoalPosts(ctx, range.left, range.right, projection);
  if (g.franchise?.playoff) {
    // Painted midfield emblem, behind players and ball; it never affects play.
    ground.save(); ground.globalAlpha = .68;
    R(ground, '#173e34', 571, 70, 58, 54);
    R(ground, '#eac453', 586, 76, 28, 17);
    R(ground, '#ffe8a0', 590, 76, 5, 13);
    R(ground, '#eac453', 582, 78, 4, 13); R(ground, '#eac453', 614, 78, 4, 13);
    R(ground, '#eac453', 586, 91, 28, 4); R(ground, '#eac453', 593, 95, 14, 4);
    R(ground, '#eac453', 598, 99, 4, 10); R(ground, '#eac453', 590, 109, 20, 4);
    ground.globalAlpha = .9;
    kickFootballArt.text(ground, 'PLAYOFFS', 584, 116, '#fff0b8'); ground.restore();
  }
  crowd(ground, range.left, range.right, g.phase === 'final' && g.winner === 'home', seconds, g.teams);

  if (g.tackleScene?.space === 'legacy-return' && g.returnAttempt) {
    for (const d of g.returnAttempt.defenders) if (!isTackleActor(g, d, 'legacy-return'))
      slim(ctx, d.x, d.y, positionKit({ ...(g.kickReceiver === 'home' ? away : home), dir: -1 }, classicSkinPosition(d)));
  } else if (sp) drawSpecial(ctx, g, sp, home, away, seconds, ground);
  else drawScrimmage(ctx, g, home, away, seconds, ground);
  drawTackle(ctx, g, home, away);
  referee(ctx, clamp(focus + 34, 18, KR.worldWidth - 18), seconds, g.lastResult.startsWith('TOUCHDOWN') && ['play-dead', 'final'].includes(g.phase), refereeY);
  if ((g.turnoverNotice ?? 0) > 0) {
    // Referee's directional possession signal; never invent a kick on downs.
    const rx = clamp(focus + 34, 18, KR.worldWidth - 18);
    withBroadcastAnchor(ctx, rx, refereeY, () => {
    ctx.save(); ctx.translate(rx, refereeY - REFEREE_WORLD_Y); ctx.scale(attackDirection(g), 1); ctx.translate(-rx, 0);
    R(ctx, '#f1e6d0', rx + 3, 178, 12, 2); R(ctx, '#e0a370', rx + 14, 178, 3, 2);
    R(ctx, FIRST, rx + 18, 177, 5, 1); R(ctx, FIRST, rx + 21, 175, 2, 5);
    ctx.restore();
    });
  }
  });
  ctx.restore();

}

/** The exact shared eight-rectangle targeting symbol. */
function playerTarget(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  withBroadcastAnchor(ctx, x, y, () => {
  for (const [dx, dy, width, height] of PLAYER_TARGET_PIXELS)
    R(ctx, color, x + dx, y + dy, width, height);
  });
}

function drawScrimmage(ctx: CanvasRenderingContext2D, g: FootballGame, home: Omit<Kit, 'dir'>, away: Omit<Kit, 'dir'>, seconds: number, ground: CanvasRenderingContext2D) {
  const live = g.live;
  const dir = g.fieldFrame ?? 1;
  const los = worldX(spotX(live?.snapSpot ?? g.spot), dir);
  const rangeX = worldX(100 + (117 - g.profiles[g.possession].kickMax) * 10, dir);
  if (fieldGoalAllowed(g) && rangeX > 100 && rangeX < 1100) for (let y = 20; y < 172; y += 8) R(ground, LACE, rangeX, y, 1, 3);
  R(ground, LOS, los, 18, 2, 156);
  if (g.target < 100 && !(live?.mode === 'kick') && !(g.turnoverNotice! > 0)) {
    const fx = worldX(spotX(g.target), dir);
    R(ground, FIRST, fx, 18, 2, 156);
    R(ground, ORANGE, fx - 2, 8, 6, 8); R(ground, INK, fx, 4, 2, 12);
  }
  // Deluxe: posts are permanent shared field fixtures; original conditional post kept for rollback.
  if (!FOOTBALL_ART_STAGES.geometry && (live?.play === 'field-goal' || live?.mode === 'kick')) goalPosts(ctx, worldX(1194, dir));
  const originalOffense = live?.offense ?? g.possession;
  const offenseKit: Kit = { ...(originalOffense === 'home' ? home : away), dir };
  const defenseKit: Kit = { ...(originalOffense === 'home' ? away : home), dir: dir === 1 ? -1 : 1 };
  if (!live) { if (g.phase !== 'final') football(ctx, los + 1, 96, true); return; }
  const snap = snapping(live);
  const ic = live.interception, holding = !!ic && ic.age < CATCH_HOLD;
  const read = highlightedReceiver(live);
  const primary = primaryPlayer(live);
  const sorted = [...live.athletes].sort((a, b) => a.y - b.y);
  let carrierAt: { x: number; y: number } | undefined;
  for (const a of sorted) {
    if (isTackleActor(g, a, 'scrimmage')) continue;
    const kit = positionKit(a.side === 'offense' ? offenseKit : defenseKit, a.role);
    const backpedaling = a.side === 'defense' && a.role === 'DB' &&
      (live.mode === 'dropback' || live.mode === 'flight') && a.vx * dir > 3;
    const facing: 1 | -1 = backpedaling ? kit.dir : a.vx < -6 ? -1 : a.vx > 6 ? 1 : kit.dir;
    const cadence = updateFootballAnimation(live, a.id, {
      now: live.time, x: a.x, y: a.y, vx: a.vx, vy: a.vy, facing,
    });
    const stableFacing = cadence.facing;
    const hasBall = !snap && a.id === live.carrier && !live.flight && !live.loose && !live.option?.ball && !(live.mode === 'kick' && live.kickAccuracy !== undefined);
    const activeMove = live.movement.moves?.active as { kind: string; evasive?: boolean } | undefined;
    const renderableCarrierMove = activeMove?.evasive === true ||
      ['spin', 'stutter', 'dive'].includes(activeMove?.kind ?? '');
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
      if (d.phase === 'windup') slim(ctx, a.x, a.y, kit,
        { crouch: true, hold: true, view: d.elapsed >= .04 ? 6 : undefined });
      else prone(ctx, a.x, a.y, kit, d.angle, d.phase === 'airborne' ? Math.sin(Math.PI * d.elapsed / .28) * 4 : 0);
    } else if (hasBall && holding && ic && a.id === ic.catcher) {
      withBroadcastAnchor(ctx, ic.catchX, ic.catchY, () => {
      slim(ctx, ic.catchX, ic.catchY, { ...kit, dir: dir === 1 ? -1 : 1 },
        { action: 'catch', progress: clamp(ic.age / CATCH_HOLD, 0, 1), ball: true });
      });
    } else if (hasBall && !live.holdingPass && renderableCarrierMove && (live.mode === 'run' || live.mode === 'scramble' ||
        live.mode === 'return' && live.movement.moves?.active?.evasive) &&
        moveSprite(ctx, a.x, a.y, { ...kit, dir: stableFacing }, cadence.step,
          { ...live.movement, player: { x: a.x, y: a.y } })) { /* action frame keeps the carrier's integrated cadence */ }
    else if (snap && a.role === 'OL' && a === centerOf(live))
      slim(ctx, a.x, a.y, kit, { action: 'snap', progress: clamp((live.snapAge ?? 0) / SNAP, 0, 1) });
    else if (snap && a.role === 'QB') slim(ctx, a.x, a.y, kit, { action: 'hold' });
    else slim(ctx, a.x, a.y, { ...kit, dir: stableFacing },
      footballAthletePose(live, a, { snapping: snap, ball: hasBall, engaged, facing, direction: dir }));
    if (g.phase === 'live' && a.id === read && g.possession === 'home' && !ic) {
      playerTarget(ctx, a.x, a.y, live.holdingPass ? PLAYER_TARGET_YELLOW : PLAYER_TARGET_WHITE);
    }
    // Small ground tick links the primary diagram to the opening assignment,
    // then disappears. No live labels, arrows, halos or permanent HUD additions.
    if (g.phase === 'live' && !ic && !snap && a.id === primary && a.id !== read &&
        live.time < PLAYBOOK[live.play].develop + .55)
      withBroadcastAnchor(ctx, a.x, a.y, () => R(ctx, LACE, a.x - 3, a.y + 7, 6, 1));
    ctx.restore();
    if (hasBall) carrierAt = holding && ic ? { x: ic.catchX, y: ic.catchY } : a;
  }
  if (carrierAt && g.phase === 'live') carrierMark(ctx, carrierAt.x, carrierAt.y, seconds);
  if (snap && g.phase !== 'final') { const b = snapBall(live); airBall(ctx, b.x, b.y + 2, b.z + 2, 0); }
  if (live.flight) { const f = live.flight; landingMark(ctx, f.toX, f.toY, seconds); airBall(ctx, f.x, f.y, f.z, f.age, false); }
  if(live.option?.ball) {const b=live.option.ball;airBall(ctx,b.x,b.y,b.z,b.age,false);}
  if (live.loose) airBall(ctx, live.loose.x, live.loose.y, live.loose.z ?? 0, live.loose.time * 4);
  if (live.mode === 'kick' && live.kickAccuracy !== undefined && g.phase === 'live') {
    const kicker = live.athletes[5]!, k = clamp(live.kickAge / .9, 0, 1);
    const destination = worldX(live.play === 'punt' ? Math.min(1150, worldX(kicker.x, dir) + 420) : 1194, dir);
    airBall(ctx, kicker.x + (destination - kicker.x) * k, kicker.y + (live.kickAccuracy - .5) * k * 60, Math.sin(k * Math.PI) * 44, k * 6);
  }
}

function drawSpecial(ctx: CanvasRenderingContext2D, g: FootballGame, sp: SpecialTeams, home: Omit<Kit, 'dir'>, away: Omit<Kit, 'dir'>, seconds: number, ground: CanvasRenderingContext2D) {
  const fg = sp.kind === 'field-goal';
  const dir = g.fieldFrame ?? 1;
  // athletes: offense = kicking team, defense = receiving team.
  const kickKit: Kit = { ...(sp.kicking === 'home' ? home : away), dir: (fg ? dir : -dir) as 1 | -1 };
  const recvKit: Kit = { ...(sp.receiver === 'home' ? home : away), dir: (fg ? -dir : dir) as 1 | -1 };
  if (!FOOTBALL_ART_STAGES.geometry && fg) goalPosts(ctx, worldX(1194, dir));
  R(ground, LOS, Math.round(sp.fromX), 18, 2, 156);
  const ret = sp.stage === 'return';
  const sorted = [...sp.athletes].sort((a, b) => a.y - b.y);
  const st = sp.stage, age = sp.stageAge;
  const ballHeld = st === 'lineup' || st === 'approach' && sp.kind !== 'punt' && !fg;
  for (const a of sorted) {
    if (isTackleActor(g, a, 'special')) continue;
    const kit = positionKit(a.side === 'offense' ? kickKit : recvKit, specialSkinPosition(sp, a));
    const facing: 1 | -1 = a.vx < -6 ? -1 : a.vx > 6 ? 1 : kit.dir;
    const cadence = updateFootballAnimation(sp, a.id, {
      now: sp.age, x: a.x, y: a.y, vx: a.vx, vy: a.vy, facing,
    });
    const stableFacing = cadence.facing;
    if (ret && a.id === sp.returner) {
      ctx.save(); ctx.translate(a.x - Math.round(a.x), a.y - Math.round(a.y));
      const ra = g.returnAttempt;
      if (!(ra && ra.phase === 'returning' && moveSprite(ctx, a.x, a.y,
        { ...kit, dir: (sp.mirrored ? -dir : dir) as 1 | -1 }, cadence.step, { ...ra, player: { x: a.x, y: a.y } })))
        slim(ctx, a.x, a.y, { ...kit, dir: stableFacing }, {
          action: cadence.moving ? 'run' : 'idle',
          progress: cadence.phase,
          view: cadence.view,
          ball: true,
        });
      ctx.restore(); carrierMark(ctx, a.x, a.y, seconds); continue;
    }
    const moving = cadence.moving;
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
      slim(ctx, a.x, a.y, kit, { action: 'catch', progress: clamp(age / .3, 0, 1) });
    } else if (a.id === sp.kicker && (st === 'approach' || st === 'flight' && age < .22 ||
        st === 'loose' && sp.blockAttempt?.contacted && age < .22)) {
      const contact = st === 'flight' || st === 'loose' ? clamp(.5 + age / .44, 0, 1) : st === 'approach' && age > .24 ? .35 : -1;
      if (contact >= 0) slim(ctx, a.x, a.y, { ...kit, dir: kit.dir }, { kick: contact, hold: sp.kind === 'punt' && contact < .5 });
      else slim(ctx, a.x, a.y, { ...kit, dir: kit.dir },
        { action: 'run', progress: cadence.phase, view: cadence.view, lean: stableFacing });
    } else if (fg && a.id === sp.returner && (st === 'hold' || st === 'approach')) {
      slim(ctx, a.x, a.y, kit, { action: 'kneel' });
    } else if (a.id === sp.kicker && (st === 'snap' || st === 'hold' || st === 'lineup') && (sp.kind === 'punt' || fg)) {
      slim(ctx, a.x, a.y, kit, { action: st === 'snap' ? 'snap' : 'hold', progress: clamp(age / .2, 0, 1) });
    } else if (a.id === sp.recovery && sp.kind !== 'onside' && (st === 'recovery' || st === 'resolved')) {
      const secured = st === 'resolved' || age >= .32;
      slim(ctx, a.x, a.y, { ...kit, dir: sp.ball.x < a.x ? -1 : 1 },
        { action: 'catch', progress: secured ? 1 : clamp(age / .32, 0, 1), ball: secured });
    } else if (a.id === sp.recovery && (st === 'recovery' || st === 'resolved')) {
      const from = sp.recoveryFrom ?? a, ang = Math.atan2(sp.ball.y - from.y, sp.ball.x - from.x);
      withBroadcastAnchor(ctx, a.x, a.y, () => {
      prone(ctx, a.x, a.y, kit, ang, st === 'recovery' ? Math.sin(clamp(age / .42, 0, 1) * Math.PI) * 4 : 0,
        0, st !== 'recovery' || age >= .32);
      });
    } else {
      const fielding = a.id === sp.returner && (st === 'flight' || st === 'bounce') && Math.hypot(a.x - sp.ball.x, a.y - sp.ball.y) < 26;
      const actualFacing = fielding ? (sp.ball.x < a.x ? -1 : 1) : stableFacing;
      const action = fielding ? 'catch' : a.engaged > sp.age ? 'block' : moving ? 'run' : 'stance';
      slim(ctx, a.x, a.y, { ...kit, dir: actualFacing }, {
        step: cadence.step, hold: fielding, action,
        progress: fielding ? clamp(1 - Math.hypot(a.x - sp.ball.x, a.y - sp.ball.y) / 26, 0, .55)
          : action === 'run' ? cadence.phase : action === 'block' ? .5 : undefined,
        engaged: a.engaged > sp.age, lean: a.engaged > sp.age ? stableFacing : 0,
        view: cadence.view,
      });
    }
    ctx.restore();
  }
  if (ret) return;
  const b = sp.ball;
  const recovered = sp.recovery !== undefined && (st === 'recovery' && age >= .32 || st === 'resolved');
  if (st === 'flight') landingMark(ctx, sp.toX, sp.toY, seconds);
  if (recovered) return;
  if (ballHeld && sp.kind !== 'punt' && !fg) { // tee
    R(ground, ORANGE, b.x - 1, b.y + 1, 3, 2);
    airBall(ctx, b.x, b.y, 3, 1);
  } else airBall(ctx, b.x, b.y, b.z, st === 'flight' || st === 'bounce' ? sp.age : 0);
}
