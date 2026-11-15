import type { FootballGame, SpecialTeams } from '../lib/football/types';
import type { KickViewport } from '../lib/kick-return-viewport';
import { resultVisible } from '../lib/football/play-result';
import { FIELD_GOAL, kickGeometry } from '../lib/football/field-goal-geometry';
import { FIELD_GOAL_FLIGHT_SCALE } from '../lib/football/celebration-timing';
import { fieldGoalDistance } from '../lib/football/playbook';
import { kickMatchupTeams } from '../lib/kick-return-teams';
import { uniformKit, positionKit, playerSkin } from './football-art';
import { slim, R, type Kit, type Pose } from './football-sprites';
import { drawFieldGoalPadding } from './football-field-goal-padding';

/** Camera and timing constants are presentation-only; scoring remains engine-owned. */
export const GOAL_VIEW = { halfWidth: 20, crossbar: 10, top: 46, followThrough: .22, continuation: .26 } as const;

export function fieldGoalFrame(width: number, height: number, s?: SpecialTeams) {
  const scale = height / 192;
  const w = width / scale;
  const geometry = s ? kickGeometry(s.fromX, s.fromY, s.toX) : undefined;
  const fromX = s?.fromX ?? FIELD_GOAL.x - 200;
  const fromY = s?.fromY ?? FIELD_GOAL.center;
  const range = geometry?.range ?? FIELD_GOAL.x - fromX;
  const focal = Math.min(480, w * 2.05);
  const denominator = FIELD_GOAL.near + range;
  const targetTop = 50 / scale + 6;
  const horizonForTop = (targetTop - 168 * FIELD_GOAL.near / denominator +
    FIELD_GOAL.top * focal / denominator) / (1 - FIELD_GOAL.near / denominator);
  const horizon = Math.max(82, horizonForTop);
  // A close lens can send a high kick above the screen. Pan the whole scene,
  // never just the football, so the real arc stays visible with the same posts.
  // Aiming stays completely stationary; the camera settles as the ball descends.
  let lift = 0;
  if (s && (s.stage === 'flight' || s.stage === 'resolved')) {
    const ball = fieldGoalSample(s);
    const d = Math.max(8, FIELD_GOAL.near + range * ball.depth);
    const ballY = horizon + (168 - horizon) * FIELD_GOAL.near / d - ball.z * focal / d;
    lift = Math.ceil(Math.max(0, targetTop - ballY));
  }
  return {
    scale,
    width: w,
    center: w / 2,
    focal,
    ground: 168 + lift,
    horizon: horizon + lift,
    stadiumHorizon: horizon,
    cameraLift: lift,
    near: FIELD_GOAL.near,
    range,
    fromX,
    fromY,
    toX: s?.toX ?? FIELD_GOAL.x,
  };
}

export function fieldGoalSample(s: SpecialTeams) {
  const tail = s.stage === 'resolved' ? Math.min(s.stageAge, GOAL_VIEW.continuation) : 0;
  const duration = Math.max(.001, s.duration * FIELD_GOAL_FLIGHT_SCALE);
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
  const { width, stadiumHorizon: horizon } = frame;
  // Seats are authored once in stadium coordinates. Camera follow translates
  // the existing stand with the field; it never grows new rows of spectators.
  ctx.save();
  ctx.translate(0, frame.cameraLift);
  R(ctx, '#091321', 0, 0, width, horizon + 3);
  // Upper deck, shadowed fascia, and a second seating bowl establish stadium depth.
  R(ctx, '#17283b', 0, 8, width, 2);
  R(ctx, '#263a4c', 0, 10, width, 1);
  R(ctx, '#122033', 0, 29, width, 3);
  R(ctx, '#26384a', 0, 32, width, 2);
  R(ctx, '#0b1726', 0, 34, width, 4);
  R(ctx, '#17283a', 0, horizon - 5, width, 2);
  R(ctx, '#34475a', 0, horizon - 3, width, 1);
  R(ctx, '#26384a', 0, horizon - 2, width, 2);
  // Blocky floodlight banks, tiny warm bulbs against the blue-black night.
  for (const lx of [Math.round(width * .08), Math.round(width * .92)]) {
    R(ctx, '#314458', lx - 8, 5, 16, 3);
    for (let bulb = 0; bulb < 7; bulb++) R(ctx, bulb % 3 ? '#f4dca0' : '#fff1bf', lx - 6 + bulb * 2, 6, 1, 1);
  }
  const shirts = [home.body, home.body, home.trim, away.body, away.body, away.trim, '#d8d2bd', '#65727c'];
  let index = 0;
  for (let row = 0; row < Math.floor((horizon - 37) / 6); row++) {
    const y = 37 + row * 6;
    let x = row % 2 ? -3 : 1;
    while (x < width + 8) {
      const seed = hash(index * 83 + row * 101 + Math.floor(x * 3));
      const gap = 2 + (seed % 4);
      const headX = x + (seed % 2);
      const headY = y + (seed % 3);
      // Home and visiting supporters sit in readable, irregular blocks rather
      // than a field of unrelated colored pixels.
      const section = Math.floor(Math.max(0, x) / Math.max(1, width / 6));
      const teamColor = section % 2 === 0 ? home : away;
      const shirt = (seed % 5 < 3) ? teamColor.body : shirts[(seed >>> 5) % shirts.length]!;
      // Dark, irregular silhouettes with separate heads and jersey blocks.
      R(ctx, '#10131b', headX - 1, headY, 4, 3);
      R(ctx, (seed & 32) ? '#c99670' : '#e0b28a', headX, headY, 2, 1);
      R(ctx, '#202633', headX, headY + 1, 2, 1);
      R(ctx, '#111923', headX - 2, headY + 3, 6, 4);
      R(ctx, shirt, headX - 1, headY + 3, 4, 3);
      R(ctx, teamColor.trim, headX, headY + 3, 1, 1);
      if (seed & 128) R(ctx, '#d8d2bd', headX + 1, headY + 4, 1, 1);
      x += 6 + gap;
      index++;
    }
  }
  // Recessed aisle breaks and sparse rail glints keep the crowd from reading as static.
  for (let x = 18; x < width; x += 74) {
    R(ctx, '#0c1928', x, 13, 2, Math.max(1, horizon - 19));
    R(ctx, '#526174', x, horizon - 4, 7, 1);
  }
  ctx.restore();
}

function groundAtDepth(frame: ReturnType<typeof fieldGoalFrame>, depth: number) {
  return projectFieldGoal({ y: frame.fromY, z: 0, depth }, frame).ground;
}

function drawField(ctx: CanvasRenderingContext2D, frame: ReturnType<typeof fieldGoalFrame>) {
  R(ctx, '#1d592f', 0, frame.horizon, frame.width, Math.max(0, 192 - frame.horizon));
  R(ctx, '#184b2b', 0, frame.horizon, frame.width, 2);
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const d0 = i / steps, d1 = (i + 1) / steps;
    const y0 = groundAtDepth(frame, d0), y1 = groundAtDepth(frame, d1);
    const band = i % 3 === 1 ? '#246638' : i % 2 === 0 ? '#28703a' : '#205b32';
    R(ctx, band, 0, Math.round(y1), frame.width, Math.max(1, Math.ceil(y0 - y1)));
    if (i % 3 === 0) R(ctx, '#367a42', 0, Math.round(y1), frame.width, 1);
  }
  const paintAcrossField = (worldX: number, color: string, worn = false) => {
    const depth = (worldX - frame.fromX) / frame.range;
    const left = projectFieldGoal({ y: 0, z: 0, depth }, frame);
    const right = projectFieldGoal({ y: 192, z: 0, depth }, frame);
    const x0 = Math.round(left.x), x1 = Math.round(right.x);
    const y = Math.round((left.ground + right.ground) / 2);
    const span = Math.max(1, x1 - x0);
    for (let px = Math.max(0, x0); px <= Math.min(frame.width, x1); px++) {
      // Tiny deterministic breaks give the chalk a scuffed, hand-laid edge.
      if (worn && hash(worldX * 7 + px * 13) % 19 === 0) continue;
      R(ctx, color, px, y, 1, 1);
    }
    return { depth, x0, x1, y, span };
  };
  // Physical sidelines are projected from the field edges, not screen edges.
  for (const side of [0, 192]) {
    const near = projectFieldGoal({ y: side, z: 0, depth: 0 }, frame);
    const far = projectFieldGoal({ y: side, z: 0, depth: 1 }, frame);
    for (let row = Math.ceil(far.ground); row <= Math.floor(near.ground); row++) {
      const t = (row - far.ground) / Math.max(1, near.ground - far.ground);
      const x = far.x + (near.x - far.x) * t;
      R(ctx, '#e0e1cf', x, row, 2, 1);
      if (row % 7 === 0) R(ctx, '#aab99d', x + 2, row, 1, 1);
    }
  }
  // Ten world units per yard: worn transverse chalk every five yards,
  // stopping at the actual goal line. Each stripe spans only physical turf.
  for (let x = Math.ceil(frame.fromX / 50) * 50; x <= 1100; x += 50) {
    const line = paintAcrossField(x, '#e0e1cf', true);
    if (x % 100 === 0) {
      // A faint turf-side edge keeps major five-yard stripes legible without
      // turning the field into a stack of hard, screen-wide bars.
      for (let px = Math.max(0, line.x0); px <= Math.min(frame.width, line.x1); px += 2) {
        if (hash(x + px * 3) % 4 === 0) R(ctx, '#aebd9f', px, line.y + 1, 1, 1);
      }
    }
  }
  // Fixed hash lanes at world y=65/127, marked at each one-yard (10-unit)
  // interval. Their short cross-field strokes shrink with the same projection.
  for (let x = Math.ceil(frame.fromX / 10) * 10; x <= 1100; x += 10) {
    const depth = (x - frame.fromX) / frame.range;
    for (const lane of [65, 127]) {
      const a = projectFieldGoal({ y: lane - 2, z: 0, depth }, frame);
      const b = projectFieldGoal({ y: lane + 2, z: 0, depth }, frame);
      const left = Math.round(Math.min(a.x, b.x));
      const right = Math.round(Math.max(a.x, b.x));
      for (let px = left; px <= right; px++) {
        if (hash(x * 7 + lane * 31 + px) % 13 !== 0) R(ctx, '#d8dfce', px, Math.round(a.ground), 1, 1);
      }
    }
  }
  // Irregular divots, clipped turf tufts, and chalk scuffs recede with the surface.
  for (let row = 0; row < 9; row++) {
    const depth = row / 8;
    const y = groundAtDepth(frame, depth);
    const p = frame.focal / (frame.near + frame.range * depth);
    const stride = Math.max(7, Math.round(17 * p));
    const size = Math.max(1, Math.round(p));
    for (let x = (row * 13 + 7) % stride; x < frame.width; x += stride) {
      const seed = hash(row * 127 + x * 19);
      const markY = Math.round(y - (2 + seed % 5) * p);
      R(ctx, seed % 4 === 0 ? '#71905a' : seed % 2 ? '#397746' : '#174a2b',
        x, markY, Math.max(1, size + (seed % 3 === 0 ? 1 : 0)), Math.max(1, size - (seed % 3 === 0 ? 0 : 1)));
      if (seed % 11 === 0) R(ctx, '#b8c5a3', x + size, markY, 1, 1);
    }
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
  const postY = Math.round(leftTop.y);
  const postH = Math.max(1, Math.round(topHeight));
  const opening = Math.max(1, Math.round(right.x - left.x));
  // Dark rear edge, ochre side plane, gold face, and a one-pixel sunlit edge.
  // At close range the same physical tube grows through perspective, not art scaling.
  R(ctx, '#4e451f', leftX - 1, postY, thickness + 2, postH);
  R(ctx, '#9b7416', leftX, postY, thickness + 1, postH);
  R(ctx, '#f0c83a', leftX, postY, thickness, postH);
  R(ctx, '#fff0a0', leftX, postY, Math.max(1, thickness - 1), postH);
  R(ctx, '#b28a1b', rightX - 1, Math.round(rightTop.y), thickness + 2, postH);
  R(ctx, '#f0c83a', rightX, Math.round(rightTop.y), thickness, postH);
  R(ctx, '#fff0a0', rightX, Math.round(rightTop.y), Math.max(1, thickness - 1), postH);
  R(ctx, '#4e451f', leftX, Math.round(cross.y) - 1, opening + 2, thickness + 2);
  R(ctx, '#9b7416', leftX, Math.round(cross.y), opening + 1, thickness);
  R(ctx, '#f0c83a', leftX, Math.round(cross.y), opening, Math.max(1, thickness - 1));
  R(ctx, '#fff0a0', leftX + 1, Math.round(cross.y), Math.max(1, opening - 2), 1);
  // A squared, dark socket and two-tone lower mast visibly anchor the post.
  R(ctx, '#10213a', Math.round(base.x - thickness * 1.5), Math.round(base.y - 3), thickness * 3, 3);
  R(ctx, '#6b571d', Math.round(base.x - thickness / 2), Math.round(cross.y), 1, Math.max(1, Math.round(base.y - cross.y)));
  R(ctx, '#d5aa2c', Math.round(base.x), Math.round(cross.y), Math.max(1, thickness - 1), Math.max(1, Math.round(base.y - cross.y)));
}

function drawKickViewPlayers(
  ctx: CanvasRenderingContext2D,
  s: SpecialTeams,
  frame: ReturnType<typeof fieldGoalFrame>,
  home: Kit,
  away: Kit,
) {
  const sourceKit = s.kicking === 'home' ? home : away;
  const kickingKit: Kit = positionKit({ ...sourceKit, dir: s.toX >= s.fromX ? 1 : -1 }, 'K');
  const holderKit = positionKit(sourceKit, 'H');
  const kicker = s.athletes.find(a => a.id === s.kicker);
  const holder = s.athletes.find(a => a.id === s.returner);
  const screenPoint = (x: number, y: number) => {
    const travel = s.toX - s.fromX;
    const depth = Math.abs(travel) < .001 ? 0 : (x - s.fromX) / travel;
    const p = projectFieldGoal({ y, z: 0, depth }, frame);
    return { x: Math.max(18, Math.min(frame.width - 18, p.x)), y: p.ground };
  };
  const player = (p: { x: number; y: number }, pose: Pose) => {
    // Integer enlargement of the authored anatomy keeps the foreground player
    // substantial without smoothing or altering any shared gameplay sprite.
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y - 12));
    ctx.scale(2, 2);
    slim(ctx, 0, 0, kickingKit, pose);
    ctx.restore();
  };
  let holderPoint: { x: number; y: number } | undefined;
  const drawHolder = () => {
    if (!holder) return;
    holderPoint = screenPoint(holder.x, holder.y);
    // A planted knee, bent white trouser leg and reaching hands distinguish
    // the holder from the standing kicker. Leave the placed ball unobscured.
    const x = Math.round(holderPoint.x + 9), y = Math.round(holderPoint.y);
    R(ctx, '#173e27', x - 7, y, 15, 2);
    R(ctx, '#10213a', x - 5, y - 19, 10, 8);
    R(ctx, kickingKit.body, x - 4, y - 18, 8, 6);
    R(ctx, '#f1e6d0', x - 3, y - 18, 5, 1);
    R(ctx, kickingKit.body, x, y - 17, 2, 4);
    R(ctx, '#10213a', x - 5, y - 16, 5, 3);
    R(ctx, playerSkin(holderKit), x - 3, y - 16, 1, 1);
    R(ctx, kickingKit.body, x - 5, y - 15, 5, 1);
    R(ctx, '#10213a', x - 5, y - 12, 12, 7);
    R(ctx, kickingKit.body, x - 4, y - 11, 10, 5);
    R(ctx, kickingKit.trim, x + 2, y - 11, 3, 2);
    R(ctx, kickingKit.trim, x - 4, y - 10, 2, 2);
    R(ctx, kickingKit.body, x - 6, y - 8, 3, 4);
    R(ctx, playerSkin(holderKit), x - 8, y - 4, 3, 2);
    R(ctx, '#b8bdd1', x + 2, y - 6, 4, 5);
    R(ctx, '#f1e6d0', x - 2, y - 5, 7, 3);
    R(ctx, '#f1e6d0', x - 4, y - 4, 3, 4);
    R(ctx, '#10213a', x - 5, y - 1, 4, 2);
    R(ctx, '#10213a', x + 3, y, 5, 1);
  };
  const drawKicker = () => {
    if (!kicker) return;
    const projected = screenPoint(kicker.x, kicker.y);
    // Compose the two authored sprites as one foreground kicking unit. Their
    // gameplay coordinates remain untouched; only this camera's staging moves.
    const p = holderPoint
      ? { x: holderPoint.x - 12, y: Math.max(projected.y, holderPoint.y + 7) }
      : { x: projected.x - 6, y: projected.y + 5 };
    const stage = s.stage;
    if (stage === 'approach' || stage === 'flight' && s.stageAge < .22) {
      const contact = stage === 'flight' ? Math.max(0, Math.min(1, .5 + s.stageAge / .44))
        : s.stageAge > .24 ? .35 : -1;
      if (contact >= 0) player(p, { kick: contact });
      else player(p, { step: s.age * 9, lean: kickingKit.dir, hold: true, view: 3 });
    } else {
      player(p, {
        hold: true,
        crouch: stage === 'snap',
        view: 3,
      });
    }
  };
  // The receiver slot is the snap holder in a field-goal formation.
  drawHolder();
  drawKicker();
}

function drawKickMeter(ctx: CanvasRenderingContext2D, g: FootballGame, s: SpecialTeams, frame: ReturnType<typeof fieldGoalFrame>, width: number, height: number) {
  if (s.stage !== 'hold' || s.accuracy !== undefined || g.live?.kickAccuracy !== undefined || s.kicking !== 'home' ||
      g.phase !== 'live' || g.live?.play !== 'field-goal') return;
  const geometry = kickGeometry(s.fromX, s.fromY, s.toX);
  const barWidth = frame.focal * FIELD_GOAL.sensor * frame.scale;
  const x = width / 2 - barWidth / 2;
  const goalGround = projectFieldGoal({ y: FIELD_GOAL.center, z: 0, depth: 1 }, frame).ground;
  const crossbar = projectFieldGoal({ y: FIELD_GOAL.center, z: FIELD_GOAL.crossbar, depth: 1 }, frame);
  const y = Math.round(Math.max(crossbar.y + 4, Math.min(116, goalGround + 5)) * frame.scale);
  const unit = Math.max(1, Math.round(frame.scale));
  const h = Math.max(8, Math.round(8 * frame.scale));
  const successX = width / 2 + (geometry.center - geometry.half - .5) * barWidth;
  const successW = geometry.half * 2 * barWidth;
  // Square-cut silver frame and dark outline; the bar remains tied to the
  // projected upright opening through the shared sensor and kick geometry.
  R(ctx, '#101b2a', x - unit * 2, y - unit * 2, barWidth + unit * 4, h + unit * 4);
  R(ctx, '#78828a', x - unit, y - unit, barWidth + unit * 2, h + unit * 2);
  R(ctx, '#c4c9c3', x, y, barWidth, h);
  R(ctx, '#394957', x, y + h - unit, barWidth, unit);
  R(ctx, '#a63e36', x, y, barWidth, h);
  // This is the exact projection of the two upright x positions onto the bar.
  R(ctx, '#d9d7bf', x, y, barWidth, Math.max(1, Math.round(unit * 1.5)));
  R(ctx, fieldGoalDistance(g) <= g.profiles[s.kicking].kickMax ? '#58b867' : '#c89638', successX, y, successW, h);
  R(ctx, '#f4d23c', successX, y, 1, h);
  const marker = width / 2 + (Math.max(0, Math.min(1, g.live?.kickMeter ?? .5)) - .5) * barWidth;
  R(ctx, '#f1e6d0', marker - unit, y - unit * 2, unit * 2, h + unit * 4);

  const size = Math.max(10, Math.min(16, Math.round(7 * frame.scale)));
  ctx.font = `bold ${size}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const distanceLabel = `${fieldGoalDistance(g)} YD ATTEMPT`;
  const labelWidth = size * distanceLabel.length * .65 + unit * 4;
  const labelY = y + h + size * 1.5;
  R(ctx, '#10213a', (width - labelWidth) / 2, labelY - size, labelWidth, size + unit * 2);
  ctx.fillStyle = '#f1e6d0';
  ctx.fillText(distanceLabel, width / 2, labelY);
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
  drawFieldGoalPadding(ctx, frame, projectFieldGoal);

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
  if (s.stage === 'snap' || s.stage === 'hold' || s.stage === 'approach') drawBall();
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
