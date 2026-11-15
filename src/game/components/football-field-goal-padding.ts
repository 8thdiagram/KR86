import type { fieldGoalFrame, projectFieldGoal } from './football-field-goal';

type Frame = ReturnType<typeof fieldGoalFrame>;
type Project = typeof projectFieldGoal;

export const FIELD_GOAL_PADDING_COLORS = {
  face: '#142844',
  shadow: '#0b1b30',
  seam: '#09172a',
  highlight: '#344b64',
} as const;

type Point = { x: number; y: number };

function quad(ctx: CanvasRenderingContext2D, points: Point[], color: string) {
  const top = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))));
  const bottom = Math.ceil(Math.max(...points.map(p => p.y)));
  ctx.fillStyle = color;
  for (let y = top; y <= bottom; y++) {
    const intersections: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        intersections.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
      }
    }
    if (intersections.length < 2) continue;
    const left = Math.max(0, Math.floor(Math.min(...intersections)));
    const right = Math.ceil(Math.max(...intersections));
    if (right > left) ctx.fillRect(left, y, right - left, 1);
  }
}

export function drawFieldGoalPadding(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  project: Project,
) {
  const point = (y: number, z: number, depth: number) => project({ y, z, depth }, frame);
  const rearDepth = 1.08;
  const rearLeft = point(0, 0, rearDepth);
  const rearRight = point(192, 0, rearDepth);
  const rearTopLeft = point(0, 5, rearDepth);
  const rearTopRight = point(192, 5, rearDepth);

  // A low, continuous backstop sits beyond the goal plane, under the seating bowl.
  quad(ctx, [rearLeft, rearRight, rearTopRight, rearTopLeft], FIELD_GOAL_PADDING_COLORS.shadow);
  quad(ctx, [
    point(1, 0, rearDepth), point(191, 0, rearDepth),
    point(191, 4, rearDepth), point(1, 4, rearDepth),
  ], FIELD_GOAL_PADDING_COLORS.face);
  quad(ctx, [
    point(1, 4, rearDepth), point(191, 4, rearDepth),
    point(191, 5, rearDepth), point(1, 5, rearDepth),
  ], FIELD_GOAL_PADDING_COLORS.highlight);

  // Narrow side cushions follow the real sidelines toward the camera.
  for (const [inner, outer] of [[0, -4], [192, 196]]) {
    const edge = (y: number, depth: number, z = 0) => point(y, z, depth);
    const near = 0.02, far = 1.08;
    quad(ctx, [
      edge(outer, near), edge(inner, near), edge(inner, far), edge(outer, far),
    ], FIELD_GOAL_PADDING_COLORS.shadow);
    quad(ctx, [
      edge(inner, near), edge(inner, far),
      edge(inner, far, 5), edge(inner, near, 5),
    ], FIELD_GOAL_PADDING_COLORS.face);
    quad(ctx, [
      edge(outer, near, 5), edge(inner, near, 5),
      edge(inner, far, 5), edge(outer, far, 5),
    ], FIELD_GOAL_PADDING_COLORS.highlight);

    // Short block seams are placed at fixed field depths, never at screen x positions.
    for (const depth of [0.18, 0.38, 0.58, 0.78, 0.98]) {
      quad(ctx, [
        edge(inner, depth), edge(inner, depth, 5),
        edge(inner, depth + 0.006, 5), edge(inner, depth + 0.006),
      ], FIELD_GOAL_PADDING_COLORS.seam);
    }
  }

  // Panel joints and restrained square glints on the rear pad.
  for (const y of [32, 64, 96, 128, 160]) {
    quad(ctx, [
      point(y, 0, rearDepth), point(y + 1, 0, rearDepth),
      point(y + 1, 5, rearDepth), point(y, 5, rearDepth),
    ], FIELD_GOAL_PADDING_COLORS.seam);
  }
  for (const y of [18, 82, 146]) {
    const glint = point(y, 3.6, rearDepth);
    ctx.fillStyle = FIELD_GOAL_PADDING_COLORS.highlight;
    ctx.fillRect(Math.round(glint.x), Math.round(glint.y), 2, 1);
  }
}
