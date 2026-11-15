import type { FootballGame, SpecialTeams } from '../lib/football/types';
import type { KickViewport } from '../lib/kick-return-viewport';
import { resultVisible } from '../lib/football/play-result';
import { FIELD_GOAL, kickGeometry } from '../lib/football/field-goal-geometry';
import { fieldGoalDistance } from '../lib/football/playbook';
import { kickMatchupTeams } from '../lib/kick-return-teams';
import { uniformKit } from './football-art';
import { slim, R, type Kit } from './football-sprites';

/** Camera and timing constants are presentation-only; scoring remains engine-owned. */
export const GOAL_VIEW = { halfWidth: 20, crossbar: 10, top: 46, followThrough: .22, continuation: .26 } as const;

export function fieldGoalFrame(width: number, height: number, s?: SpecialTeams) {
  const scale = height / 192;
  const w = width / scale;
  const geometry = s ? kickGeometry(s.fromX, s.fromY, s.toX) : undefined;
  const fromX = s?.fromX ?? FIELD_GOAL.x - 200;
  const fromY = s?.fromY ?? FIELD_GOAL.center;
  return {
    scale,
    width: w,
    center: w / 2,
    focal: Math.min(300, w * .95),
    ground: 168,
    horizon: Math.min(105, Math.max(70, 50 / scale + 12)),
    near: FIELD_GOAL.near,
    range: geometry?.range ?? FIELD_GOAL.x - fromX,
    fromX,
    fromY,
    toX: s?.toX ?? FIELD_GOAL.x,
  };
}

export function fieldGoalSample(s: SpecialTeams) {
  const tail = s.stage === 'resolved' ? Math.min(s.stageAge, GOAL_VIEW.continuation) : 0;
  const duration = Math.max(.001, s.duration);
  // Continue the committed flight; weak kicks use their actual terminal height,
  // rather than borrowing the in-range kick's visual trajectory.
  const terminalHeight = s.ball.z;
  const x = s.ball.x + (s.toX - s.fromX) * tail / duration;
  const y = s.ball.y + (s.toY - s.fromY) * tail / duration;
  const z = Math.max(0, s.ball.z + (terminalHeight - 42 * Math.PI) * tail / duration);
  const travel = s.toX - s.fromX;
  return { x, y, z, depth: Math.abs(travel) < .001 ? 1 : (x - s.fromX) / travel };
}

export function projectFieldGoal(
  point: { y: number; z: number; depth: number },
  frame: ReturnType<typeof fieldGoalFrame>,
) {
  const denominator = Math.max(8, frame.near + frame.range * point.depth);
  const perspective = frame.focal / denominator;
  const ground = point.depth < 0
    ? frame.ground + Math.min(12, -point.depth * 36)
    : frame.horizon + (frame.ground - frame.horizon) * frame.near / denominator;
  return {
    x: frame.center + (point.y - frame.fromY) * perspective,
    y: ground - point.z * perspective,
    ground,
    perspective,
  };
}

export function fieldGoalVerdictVisible(s: SpecialTeams) {
  return s.stage === 'resolved' && s.stageAge >= GOAL_VIEW.continuation;
}

function hash(n: number) {
  let v = Math.imul(n ^ 0x45d9f3b, 0x45d9f3b);
  v = Math.imul(v ^ (v >>> 16), 0x45d9f3b);
  return (v ^ (v >>> 16)) >>> 0;
}

function drawCrowd(ctx: CanvasRenderingContext2D, frame: ReturnType<typeof fieldGoalFrame>, home: Kit, away: Kit) {
  const { width } = frame;
  R(ctx, '#081323', 0, 0, width, frame.horizon + 3);
  R(ctx, '#172437', 0, 32, width, 5);
  R(ctx, '#0c1828', 0, 38, width, 3);
  R(ctx, '#26384a', 0, frame.horizon - 3, width, 3);
  const shirts = [home.body, home.trim, away.body, away.trim, '#d8d2bd', '#65727c', '#292f39'];
  let index = 0;
  for (let row = 0; row < Math.floor((frame.horizon - 37) / 6); row++) {
    const y = 37 + row * 6;
    let x = row % 2 ? -3 : 1;
    while (x < width + 8) {
      const seed = hash(index * 83 + row * 101 + Math.floor(x * 3));
      const gap = 2 + (seed % 4);
      const headX = x + (seed % 2);
      const headY = y + (seed % 3);
      const shirt = shirts[(seed >>> 5) % shirts.length]!;
      // Dark, irregular silhouettes with separate heads and jersey blocks.
      R(ctx, '#10131b', headX - 1, headY, 4, 3);
      R(ctx, (seed & 32) ? '#c99670' : '#e0b28a', headX, headY, 2, 2);
      R(ctx, '#111923', headX - 2, headY + 3, 6, 4);
      R(ctx, shirt, headX - 1, headY + 3, 4, 3);
      if (seed & 128) R(ctx, shirts[(seed >>> 11) % shirts.length]!, headX + 1, headY + 4, 1, 1);
      x += 6 + gap;
      index++;
    }
  }
}

function groundAtDepth(frame: ReturnType<typeof fieldGoalFrame>, depth: number) {
  return projectFieldGoal({ y: frame.fromY, z: 0, depth }, frame).ground;
}

function drawField(ctx: CanvasRenderingContext2D, frame: ReturnType<typeof fieldGoalFrame>) {
  R(ctx, '#205d32', 0, frame.horizon, frame.width, 192 - frame.horizon);
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const d0 = i / steps, d1 = (i + 1) / steps;
    const y0 = groundAtDepth(frame, d0), y1 = groundAtDepth(frame, d1);
    if (i % 2 === 0) R(ctx, '#27723a', 0, Math.round(y1), frame.width, Math.max(1, Math.ceil(y0 - y1)));
  }
  const sidelines = [0, 192];
  for (const side of sidelines) {
    const near = projectFieldGoal({ y: side, z: 0, depth: 0 }, frame);
    const far = projectFieldGoal({ y: side, z: 0, depth: 1 }, frame);
    // Stair-step raster lines rather than anti-aliased vector polygons.
    for (let y = Math.ceil(far.ground); y <= Math.floor(near.ground); y++) {
      const t = (y - far.ground) / (near.ground - far.ground);
      R(ctx, '#c3d0b8', far.x + (near.x - far.x) * t, y, 1, 1);
    }
  }
  // Existing world scale: ten units per yard, 100 units per major stripe.
  for (let x = Math.ceil(frame.fromX / 100) * 100; x < FIELD_GOAL.x; x += 100) {
    const d = (x - frame.fromX) / frame.range, y = groundAtDepth(frame, d);
    R(ctx, '#a9c4a0', 0, y, frame.width, 1);
    for (const side of [-1, 1]) {
      const p = projectFieldGoal({ y: frame.fromY + side * 33, z: 0, depth: d }, frame);
      R(ctx, '#c3d0b8', p.x, y - 2, 1, 4);
    }
  }
  // Short turf flecks recede with the playing surface; no repeating checker grid.
  for (let row = 0; row < 7; row++) {
    const depth = row / 7;
    const y = groundAtDepth(frame, depth);
    const p = frame.focal / (frame.near + frame.range * depth);
    const stride = Math.max(7, Math.round(13 * p));
    const size = Math.max(1, Math.round(p));
    for (let x = (row * 11) % stride; x < frame.width; x += stride)
      R(ctx, row % 2 ? '#43864b' : '#174d2b', x, Math.round(y - 4 * p), size, size);
  }
}

function drawUprights(ctx: CanvasRenderingContext2D, frame: ReturnType<typeof fieldGoalFrame>) {
  const base = projectFieldGoal({ y: FIELD_GOAL.center, z: 0, depth: 1 }, frame);
  const cross = projectFieldGoal({ y: FIELD_GOAL.center, z: FIELD_GOAL.crossbar, depth: 1 }, frame);
  const leftTop = projectFieldGoal({ y: FIELD_GOAL.center - FIELD_GOAL.half, z: FIELD_GOAL.top, depth: 1 }, frame);
  const rightTop = projectFieldGoal({ y: FIELD_GOAL.center + FIELD_GOAL.half, z: FIELD_GOAL.top, depth: 1 }, frame);
  const left = projectFieldGoal({ y: FIELD_GOAL.center - FIELD_GOAL.half, z: FIELD_GOAL.crossbar, depth: 1 }, frame);
  const right = projectFieldGoal({ y: FIELD_GOAL.center + FIELD_GOAL.half, z: FIELD_GOAL.crossbar, depth: 1 }, frame);
  const thickness = Math.max(1, Math.round(base.perspective * 1.5));
  const topHeight = Math.max(1, cross.y - leftTop.y);
  const leftX = Math.round(left.x), rightX = Math.round(right.x);
  // A square, shaded base and crossbar put the bright uprights in the foreground.
  R(ctx, '#6e5714', Math.round(base.x - thickness / 2), Math.round(cross.y), thickness + 2, Math.max(2, Math.round(base.y - cross.y)));
  R(ctx, '#9c7d12', Math.round(base.x), Math.round(cross.y), thickness, Math.max(1, Math.round(base.y - cross.y)));
  R(ctx, '#9c7d12', leftX, Math.round(leftTop.y), thickness + 1, Math.round(topHeight));
  R(ctx, '#9c7d12', rightX, Math.round(rightTop.y), thickness + 1, Math.round(topHeight));
  R(ctx, '#f4d23c', leftX, Math.round(leftTop.y), thickness, Math.round(topHeight));
  R(ctx, '#f4d23c', rightX, Math.round(rightTop.y), thickness, Math.round(topHeight));
  R(ctx, '#fff0a0', leftX, Math.round(leftTop.y), Math.max(1, thickness - 1), topHeight);
  R(ctx, '#fff0a0', rightX, Math.round(rightTop.y), Math.max(1, thickness - 1), topHeight);
  R(ctx, '#9c7d12', leftX, Math.round(cross.y), Math.max(1, Math.round(right.x - left.x)), thickness + 1);
  R(ctx, '#f4d23c', leftX, Math.round(cross.y), Math.max(1, Math.round(right.x - left.x)), thickness);
  R(ctx, '#fff0a0', leftX + 1, Math.round(cross.y), Math.max(1, Math.round(right.x - left.x) - 2), 1);
}

function drawKickViewPlayers(
  ctx: CanvasRenderingContext2D,
  s: SpecialTeams,
  frame: ReturnType<typeof fieldGoalFrame>,
  home: Kit,
  away: Kit,
) {
  const sourceKit = s.kicking === 'home' ? home : away;
  const kickingKit: Kit = { ...sourceKit, dir: s.toX >= s.fromX ? 1 : -1 };
  const kicker = s.athletes.find(a => a.id === s.kicker);
  const holder = s.athletes.find(a => a.id === s.returner);
  const screenPoint = (x: number, y: number) => {
    const travel = s.toX - s.fromX;
    const depth = Math.abs(travel) < .001 ? 0 : (x - s.fromX) / travel;
    const p = projectFieldGoal({ y, z: 0, depth }, frame);
    return { x: p.x, y: p.ground };
  };
  const drawHolder = () => {
    if (!holder) return;
    const p = screenPoint(holder.x, holder.y);
    slim(ctx, p.x, p.y, kickingKit, { hold: true, crouch: true });
  };
  const drawKicker = () => {
    if (!kicker) return;
    const p = screenPoint(kicker.x, kicker.y);
    const stage = s.stage;
    if (stage === 'approach' || stage === 'flight' && s.stageAge < .22) {
      const contact = stage === 'flight' ? Math.max(0, Math.min(1, .5 + s.stageAge / .44))
        : s.stageAge > .24 ? .35 : -1;
      if (contact >= 0) slim(ctx, p.x, p.y, kickingKit, { kick: contact });
      else slim(ctx, p.x, p.y, kickingKit, { step: s.age * 9, lean: kickingKit.dir, hold: true });
    } else {
      slim(ctx, p.x, p.y, kickingKit, {
        hold: true,
        crouch: stage === 'snap',
      });
    }
  };
  // The receiver slot is the snap holder in a field-goal formation.
  drawKicker();
  drawHolder();
}

function drawKickMeter(ctx: CanvasRenderingContext2D, g: FootballGame, s: SpecialTeams, frame: ReturnType<typeof fieldGoalFrame>, width: number, height: number) {
  if (s.stage !== 'hold' || s.accuracy !== undefined || g.live?.kickAccuracy !== undefined || s.kicking !== 'home' ||
      g.phase !== 'live' || g.live?.play !== 'field-goal') return;
  const geometry = kickGeometry(s.fromX, s.fromY, s.toX);
  const barWidth = frame.focal * .8 * frame.scale;
  const x = width / 2 - barWidth / 2;
  const goalGround = projectFieldGoal({ y: FIELD_GOAL.center, z: 0, depth: 1 }, frame).ground;
  const y = Math.round(Math.min(124, goalGround + 24) * frame.scale);
  const unit = Math.max(1, Math.round(frame.scale));
  const h = Math.max(8, Math.round(8 * frame.scale));
  const successX = width / 2 + (geometry.center - geometry.half - .5) * barWidth;
  const successW = geometry.half * 2 * barWidth;
  R(ctx, '#10213a', x - unit * 2, y - unit * 2, barWidth + unit * 4, h + unit * 4);
  R(ctx, '#b33a2a', x, y, barWidth, h);
  // This is the exact projection of the two upright x positions onto the bar.
  R(ctx, '#e3a83a', x, y, barWidth, Math.max(1, Math.round(unit * 1.5)));
  R(ctx, fieldGoalDistance(g) <= g.profiles[s.kicking].kickMax ? '#58c46a' : '#e3a83a', successX, y, successW, h);
  R(ctx, '#f4d23c', successX, y, 1, h);
  const marker = width / 2 + (Math.max(0, Math.min(1, g.live?.kickMeter ?? .5)) - .5) * barWidth;
  R(ctx, '#f1e6d0', marker - unit, y - unit * 2, unit * 2, h + unit * 4);

  const size = Math.max(10, Math.min(16, Math.round(7 * frame.scale)));
  ctx.font = `bold ${size}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f1e6d0';
  ctx.fillText(`${fieldGoalDistance(g)} YD ATTEMPT`, width / 2, y + h + size * 1.5);
  ctx.fillStyle = '#f4d23c';
  ctx.fillText(fieldGoalDistance(g) <= g.profiles[s.kicking].kickMax ? 'ACTION: KICK' : 'OUT OF RANGE', width / 2, height - Math.max(8, size * .6));
}

export function drawFieldGoalFlight(ctx: CanvasRenderingContext2D, g: FootballGame, view?: KickViewport) {
  const s = g.special!;
  const width = view?.width ?? 664, height = view?.height ?? 192;
  const frame = fieldGoalFrame(width, height, s);
  const sample = fieldGoalSample(s);
  const ball = projectFieldGoal(sample, frame);
  const teams = kickMatchupTeams(g.teams);
  const home = uniformKit(teams.player, 1, teams.opponent);
  const away = uniformKit(teams.opponent, -1, teams.player);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  R(ctx, '#081323', 0, 0, width, height);
  ctx.setTransform(frame.scale, 0, 0, frame.scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawCrowd(ctx, frame, home, away);
  drawField(ctx, frame);

  const drawBall = () => {
    if (ball.ground < height / frame.scale)
      R(ctx, '#173e27', ball.x - 2, ball.ground, 5, 1);
    const x = Math.round(ball.x), y = Math.round(ball.y);
    // Authored distance sprites: integral pixels rather than fractional canvas
    // scaling, so the small ball cannot blur or cover the entire far opening.
    const half = sample.depth > .55 ? 1 : 2;
    R(ctx, '#10213a', x - half - 1, y - 1, half * 2 + 3, 3);
    R(ctx, '#8c421e', x - half, y - 1, half * 2 + 1, 3);
    R(ctx, '#f1e6d0', x, y - 1, 1, 1);
  };
  if (sample.depth > 1) {
    drawBall();
    drawUprights(ctx, frame);
  } else {
    drawUprights(ctx, frame);
    drawBall();
  }
  drawKickViewPlayers(ctx, s, frame, home, away);
  ctx.restore();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (s.kicking !== 'home' && s.stage !== 'resolved') {
    const size = Math.max(10, Math.min(16, Math.round(7 * frame.scale)));
    ctx.font = `bold ${size}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1e6d0';
    ctx.fillText('CPU KICKING', width / 2, Math.max(size + 5, 52));
  }
  drawKickMeter(ctx, g, s, frame, width, height);
  if (!resultVisible(g) && s.good !== undefined && fieldGoalVerdictVisible(s)) {
    const size = Math.max(16, Math.min(28, Math.round(12 * frame.scale)));
    const w = Math.min(width - 16, size * 8);
    const y = height / 2;
    R(ctx, '#10213a', (width - w) / 2, y - size, w, size * 2);
    ctx.font = `bold ${size}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = s.good ? '#58c46a' : '#ff8a2a';
    ctx.fillText(s.good ? 'GOOD' : 'NO GOOD', width / 2, y);
  }
  ctx.restore();
}
