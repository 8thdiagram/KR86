import { UNIFORM, type FootballKit } from './football-art';
import {
  footballPlayerGrip,
  paintFootballPlayerFrame,
  paintFootballPlayerPossessionFrame,
  selectFootballPlayerFrame,
  PLAYER_FRAME_DIRECTIONS,
  PLAYER_FRAME_SCALE,
} from './football-player-frames';
import {
  type FootballPlayerAction,
  type FootballLocomotionGait,
  type FootballPlayerOptions,
  type FootballPlayerView,
  type FootballProneOptions,
} from './football-player-actions';

export type {
  FootballLocomotionGait, FootballPlayerAction, FootballPlayerOptions, FootballPlayerView, FootballProneOptions,
};
export { PLAYER_FRAME_DIRECTIONS };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const viewForProne = (angle: number): FootballPlayerView => {
  // 0=right, pi/2=down, pi=left, 3pi/2=up. Each band selects an authored
  // prone construction rather than rotating an upright figure.
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const sector = Math.round(normalized / (Math.PI / 4)) % 8;
  return ([0, 1, 2, 3, 4, 5, 6, 7] as FootballPlayerView[])[sector]!;
};

function resolveAction(options: FootballPlayerOptions): FootballPlayerAction {
  if (options.action) return options.action;
  if (options.kick !== undefined) return 'kick';
  if (options.hold) return 'hold';
  if (options.engaged) return 'block';
  if (options.crouch) return 'stance';
  // Legacy step is a velocity-driven 0..4 cycle. A stationary zero remains
  // planted; callers can opt into a run frame explicitly with action: 'run'.
  return (options.step ?? 0) > 0 ? 'run' : 'idle';
}

function resolvePhase(action: FootballPlayerAction, options: FootballPlayerOptions): number {
  if (options.action && options.progress !== undefined) {
    const progress = clamp01(options.progress);
    if (action === 'run' || action === 'backpedal')
      return Math.floor(progress * 4) % 4;
    if (action === 'throw') {
      // State emits <=.59 while the QB still owns the ball, then starts flight
      // at .60. Keep that release boundary visible in the authored arm phases.
      if (progress < .18) return 0;
      if (progress < .4) return 1;
      if (progress < .6) return 2;
      if (progress < .72) return 3;
      if (progress < .9) return 4;
      return 5;
    }
    return Math.min(5, Math.floor(progress * 6));
  }
  if (action === 'kick' && options.kick !== undefined) {
    return Math.min(5, Math.floor(clamp01(options.kick) * 6));
  }
  if (action === 'run' || action === 'backpedal') {
    const step = options.step ?? 0;
    return step <= 0 ? 0 : Math.floor(((step % 4) + 4) % 4);
  }
  return options.progress === undefined ? 0 : Math.min(5, Math.floor(clamp01(options.progress) * 6));
}

/**
 * Draw an authored 16x22 character sheet expanded to a crisp 32x44 atlas.
 * Existing broadcast wrappers keep ownership of contact shadows and snapping.
 */
export function drawFootballPlayer(
  ctx: CanvasRenderingContext2D, x: number, y: number, kit: FootballKit,
  options: FootballPlayerOptions = {},
) {
  const action = resolveAction(options);
  const view = options.view ?? 0;
  const phase = resolvePhase(action, options);
  const position = (kit as FootballKit & { position?: string }).position;
  // Locomotion cadence is independent of the action's arm/release phase. The
  // state layer supplies it only while genuinely moving (including QB pocket
  // movement); legacy callers and planted poses keep their existing frames.
  const locomotionStep = options.locomotionStep;
  const frame = selectFootballPlayerFrame(
    action, view, phase, !!options.ball, position, locomotionStep, options.locomotionGait,
  );
  // A kick uses the same normalized visual phase as the legacy input while
  // keeping its visual follow-through independent of mechanics/timing.
  paintFootballPlayerFrame(ctx, frame, Math.round(x), Math.round(y), kit, options.lean ?? 0, kit.dir);
  return frame;
}

/**
 * Authored prone/dive sheets are selected by directional bands, never rotated.
 * lift/crouch are intentionally accepted unchanged for API compatibility;
 * their physical meaning remains owned by the existing caller.
 */
export function drawFootballProne(
  ctx: CanvasRenderingContext2D, x: number, y: number, kit: FootballKit,
  options: FootballProneOptions,
) {
  const { frame } = selectProneFrame(kit, options);
  paintFootballPlayerFrame(ctx, frame, Math.round(x), Math.round(y - options.lift), kit);
  return frame;
}

function selectProneFrame(kit: FootballKit, options: FootballProneOptions) {
  const view = viewForProne(options.angle);
  const action: FootballPlayerAction = options.lift > 0 ? 'dive'
    : options.crouch ? 'fall' : 'ground';
  const position = (kit as FootballKit & { position?: string }).position;
  const phase = options.lift > 0 ? 3 : 5;
  return { frame: selectFootballPlayerFrame(action, view, phase, !!options.ball, position), view, action, phase };
}

/**
 * Redraw only the hand contact and embedded football from the identical prone
 * frame, so the carrier can be foreground-occluded by a tackler without an
 * independently positioned ball overlay.
 */
export function drawFootballPronePossession(
  ctx: CanvasRenderingContext2D, x: number, y: number, kit: FootballKit,
  options: FootballProneOptions,
) {
  const { frame } = selectProneFrame(kit, { ...options, ball: true });
  paintFootballPlayerPossessionFrame(
    ctx, frame, Math.round(x), Math.round(y - options.lift), kit,
  );
  return frame;
}

/** Grip helper for renderers that need a later contact/occlusion redraw. */
export function getFootballPlayerGrip(
  action: FootballPlayerAction, view: FootballPlayerView, phase = 0, ball = true,
  direction: 1 | -1 = 1, position?: string,
): Readonly<{ x: number; y: number }> | null {
  const frame = selectFootballPlayerFrame(action, view, phase, ball, position);
  return footballPlayerGrip(frame, direction);
}

/** Compatibility constants retained for older renderer code. */
export const FOOTBALL_PLAYER_ART = Object.freeze({
  width: 32, height: 44, pixelWorldSize: PLAYER_FRAME_SCALE, footAnchor: Object.freeze({ x: 16, y: 42 }),
  palette: Object.freeze({ pants: UNIFORM.pants, ink: UNIFORM.ink }),
});
