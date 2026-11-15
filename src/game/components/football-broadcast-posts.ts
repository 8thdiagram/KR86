import { projectBroadcastElevatedPoint, type BroadcastView } from './football-broadcast';
import { sharpPixelRect } from './football-pixel-scale';
import { FIELD_GOAL } from '../lib/football/field-goal-geometry';
import { KR } from '../lib/kick-return-engine';

type Point = { x: number; y: number };
export type BroadcastGoalPostSide = 1 | -1;

export type BroadcastGoalPostGeometry = {
  side: BroadcastGoalPostSide;
  planeX: number;
  crossbarStart: Point;
  crossbarEnd: Point;
  uprightStartTop: Point;
  uprightEndTop: Point;
  postCenter: Point;
  gooseneckFoot: Point;
  gooseneckJoint: Point;
  padNear: Point;
  padFar: Point;
  padFront: Point;
  padBack: Point;
};

const GOLD = '#e8b844';
const GOLD_DARK = '#936b27';
const GOLD_LIGHT = '#fff0a4';
const GOLD_EDGE = '#c89132';

/**
 * Endpoint data for one elevated post. Gameplay sensor dimensions and world
 * coordinates remain owned by FIELD_GOAL; only the rendered endpoints lift.
 */
export function broadcastGoalPostGeometry(side: BroadcastGoalPostSide, view: BroadcastView): BroadcastGoalPostGeometry {
  const planeX = side === 1 ? FIELD_GOAL.x : KR.worldWidth - FIELD_GOAL.x;
  const backDirection = side;
  const centerY = FIELD_GOAL.center;
  const startY = centerY - FIELD_GOAL.half;
  const endY = centerY + FIELD_GOAL.half;
  const project = (x: number, y: number, z: number) => projectBroadcastElevatedPoint(x, y, z, view);
  const footX = planeX + backDirection * 7;

  return {
    side,
    planeX,
    crossbarStart: project(planeX, startY, FIELD_GOAL.crossbar),
    crossbarEnd: project(planeX, endY, FIELD_GOAL.crossbar),
    uprightStartTop: project(planeX, startY, FIELD_GOAL.top),
    uprightEndTop: project(planeX, endY, FIELD_GOAL.top),
    postCenter: project(planeX, centerY, FIELD_GOAL.crossbar),
    gooseneckFoot: project(footX, centerY, 0),
    gooseneckJoint: project(planeX + backDirection * 3, centerY, FIELD_GOAL.crossbar * 0.55),
    padNear: project(footX - 2, centerY - 4, 0),
    padFar: project(footX - 2, centerY + 4, 0),
    padFront: project(footX + 2, centerY - 4, 0),
    padBack: project(footX + 2, centerY + 4, 0),
  };
}

/** Draw a square-capped, pixel-stepped beam between already-projected points. */
function beam(ctx: CanvasRenderingContext2D, a: Point, b: Point, width: number, color: string) {
  ctx.fillStyle = color;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const matrix = ctx.getTransform?.();
  const scale = matrix ? Math.max(Math.abs(matrix.a), Math.abs(matrix.d), 0.01) : 1;
  const steps = Math.max(1, Math.ceil(length * scale * 1.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    sharpPixelRect(ctx, a.x + dx * t - width / 2, a.y + dy * t - width / 2, width, width);
  }
}

function tube(ctx: CanvasRenderingContext2D, a: Point, b: Point, thickness = 1.4) {
  beam(ctx, a, b, thickness + .8, GOLD_DARK);
  beam(ctx, a, b, thickness, GOLD_EDGE);
  beam(ctx, a, b, thickness * .75, GOLD);
  beam(ctx, a, b, .5, GOLD_LIGHT);
}

/**
 * Render both end-zone goalposts in the live world transform. The far and near
 * posts use the same elevated projection, so their bars stay aligned to the
 * projected end-line while the uprights remain genuinely vertical.
 */
export function drawBroadcastGoalPosts(ctx: CanvasRenderingContext2D, x0: number, x1: number, view: BroadcastView) {
  for (const side of [1, -1] as const) {
    const planeX = side === 1 ? FIELD_GOAL.x : KR.worldWidth - FIELD_GOAL.x;
    if (planeX < x0 - 24 || planeX > x1 + 24) continue;
    const post = broadcastGoalPostGeometry(side, view);

    // Compact ground socket and the single swept support sit behind the post plane.
    beam(ctx, post.padNear, post.padFar, 4, GOLD_DARK);
    beam(ctx, post.padFront, post.padBack, 4, GOLD_DARK);
    beam(ctx, post.padNear, post.padFront, 3, GOLD_EDGE);
    beam(ctx, post.padFar, post.padBack, 3, GOLD_EDGE);
    tube(ctx, post.gooseneckFoot, post.gooseneckJoint, 1.8);
    tube(ctx, post.gooseneckJoint, post.postCenter, 1.6);

    // Main crossbar follows the projected end-line; uprights lift from its ends.
    tube(ctx, post.crossbarStart, post.crossbarEnd);
    tube(ctx, post.crossbarStart, post.uprightStartTop);
    tube(ctx, post.crossbarEnd, post.uprightEndTop);

    // Small bright crowns make the open tube ends legible at game scale.
    beam(ctx, post.uprightStartTop, post.uprightStartTop, 1.4, GOLD_LIGHT);
    beam(ctx, post.uprightEndTop, post.uprightEndTop, 1.4, GOLD_LIGHT);
  }
}
