import type { FootballGame, SpecialTeams } from '../lib/football/types';
import type { KickViewport } from '../lib/kick-return-viewport';
import { resultVisible } from '../lib/football/play-result';
import { drawFootballBall } from './football-art';
import { R } from './football-sprites';

/** One goal-plane projection for the posts AND the real kick trajectory.
 * The regular top-down field collapses vertical posts into a line. Only the
 * flight gets this behind-kicker view; approach, timing and game camera stay intact. */
// Clearance for the entire sprite around good center aims (±13); modeled
// misses start outside ±28. This aperture changes presentation, never scoring.
export const GOAL_VIEW = { halfWidth: 20, crossbar: 10, top: 46, followThrough: .22, continuation: .26 } as const;
export function fieldGoalFrame(width: number, height: number) {
  const scale = height / 192, w = width / scale;
  return { scale, width: w, center: w / 2, ground: 100, half: Math.max(20, w * .17) };
}
export function fieldGoalSample(s: SpecialTeams) {
  const tail = s.stage === 'resolved' ? Math.min(s.stageAge, GOAL_VIEW.continuation) : 0;
  // Continue the existing trajectory's terminal velocity, without advancing
  // engine time, changing the kick outcome, or altering any saved coordinates.
  const x = s.ball.x + (s.toX - s.fromX) * tail / s.duration;
  const y = s.ball.y + (s.toY - s.fromY) * tail / s.duration;
  const z = Math.max(0, s.ball.z + (23 - 42 * Math.PI) * tail / s.duration);
  return { x, y, z, depth: (x - s.fromX) / (s.toX - s.fromX) };
}
export function projectFieldGoal(
  point: { y: number; z: number; depth: number }, frame: ReturnType<typeof fieldGoalFrame>,
) {
  const perspective = 1.65 / (1 + .65 * point.depth);
  const ground = frame.ground + (1 - point.depth) * 82 / (1 + .35 * point.depth);
  return { x: frame.center + (point.y - 96) * frame.half / GOAL_VIEW.halfWidth * perspective,
    y: ground - point.z * perspective, ground, perspective };
}
export function fieldGoalVerdictVisible(s: SpecialTeams) {
  return s.stage === 'resolved' && s.stageAge >= GOAL_VIEW.continuation;
}

export function drawFieldGoalFlight(ctx: CanvasRenderingContext2D, g: FootballGame, view?: KickViewport) {
  const s = g.special!, width = view?.width ?? 664, height = view?.height ?? 192;
  const f = fieldGoalFrame(width, height), sample = fieldGoalSample(s), ball = projectFieldGoal(sample, f);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  R(ctx, '#081633', 0, 0, width, height);
  ctx.setTransform(f.scale, 0, 0, f.scale, 0, 0); ctx.imageSmoothingEnabled = false;
  // Fixed palette and square pixels, with a receding grass/yard-line grid.
  for (let row = 0; row < 5; row++) {
    R(ctx, row % 2 ? '#102b50' : '#071326', 0, 24 + row * 6, f.width, 5);
    for (let x = row % 2 ? 3 : 0; x < f.width; x += 7)
      R(ctx, (x + row * 3) % 5 ? '#537da2' : '#a9bdd1', x, 25 + row * 6, 2, 2);
  }
  R(ctx, '#205d32', 0, 61, f.width, 131);
  for (let y = 63; y < 192; y++)
    if (Math.floor((y - 60) / 13) % 2) R(ctx, '#277a37', 0, y, f.width, 1);
  for (const depth of [0, .2, .4, .6, .8, 1]) {
    const p = projectFieldGoal({ y: 96, z: 0, depth }, f);
    R(ctx, '#b8cbb0', 0, p.ground, f.width, 1);
    for (const side of [-1, 1]) R(ctx, '#b8cbb0', f.center + side * f.half * 1.6 * p.perspective, p.ground - 2, 1, 4);
  }
  const posts = () => {
    const barY = f.ground - GOAL_VIEW.crossbar, topY = f.ground - GOAL_VIEW.top;
    R(ctx, '#9c7d12', f.center - 1, barY, 2, GOAL_VIEW.crossbar + 3);
    R(ctx, '#f4d23c', f.center - f.half, barY - 1, f.half * 2 + 2, 2);
    for (const x of [f.center - f.half, f.center + f.half]) {
      R(ctx, '#f4d23c', x, topY, 2, barY - topY);
      R(ctx, '#fff0a0', x, topY, 1, barY - topY - 2);
    }
  };
  const football = () => {
    if (ball.ground < 192) R(ctx, '#173e27', ball.x - 2, ball.ground, 5, 1);
    drawFootballBall(ctx, ball.x, ball.y, { small: true, spin: s.age, shadow: false });
  };
  // Near ball occludes the posts; after crossing it is correctly behind them.
  if (sample.depth > 1) { football(); posts(); } else { posts(); football(); }
  ctx.restore();
  if (!resultVisible(g) && s.good !== undefined && fieldGoalVerdictVisible(s)) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const size = Math.round(Math.max(16, Math.min(28, 12 * f.scale)));
    const w = Math.min(width - 16, size * 8);
    R(ctx, '#10213a', (width - w) / 2, (height - size * 2) / 2, w, size * 2);
    ctx.font = `bold ${size}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = s.good ? '#58c46a' : '#ff8a2a';
    ctx.fillText(s.good ? 'GOOD' : 'NO GOOD', width / 2, height / 2); ctx.restore();
  }
}
