/** Render-only, per-actor stride clock. It never writes to simulation objects. */
export type FootballBodyView = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type FootballAnimationSample = Readonly<{
  now: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
}>;
export type FootballAnimationFrame = Readonly<{
  /** Fraction through the authored eight-pose locomotion loop. */
  phase: number;
  /** Compatibility step for the existing sprite API: one full loop is 4. */
  step: number;
  moving: boolean;
  facing: 1 | -1;
  shuffling: boolean;
  view?: FootballBodyView;
}>;

type Clock = {
  now: number;
  x: number;
  y: number;
  phase: number;
  filteredSpeed: number;
  moving: boolean;
  shuffling: boolean;
  stoppedFor: number;
  facing: 1 | -1;
  facingCandidate?: 1 | -1;
  facingCandidateAt: number;
  view?: FootballBodyView;
  viewCandidate?: FootballBodyView;
  viewCandidateAt: number;
  viewClearAt: number;
  frame: FootballAnimationFrame;
};

const clocks = new WeakMap<object, Map<string, Clock>>();
const START_SPEED = 2.5;
const STOP_SPEED = 1.25;
const STOP_DWELL = 0.11;
const DIRECTION_DWELL = 0.09;
const VIEW_DWELL = 0.075;
const VIEW_RELEASE_DWELL = 0.14;
const SPEED_FILTER_SECONDS = 0.14;
const MAX_OBSERVED_SPEED = 180;

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

export const FOOTBALL_STRIDE_PERIOD_SCALE = .88;
/** Full eight-pose gait lasts .40–.55s; speed scales cadence without restarting
 * the continuously integrated per-athlete phase. */
export function footballStridePeriod(speed: number): number {
  if (!Number.isFinite(speed) || speed <= START_SPEED) return .625 * FOOTBALL_STRIDE_PERIOD_SCALE;
  if (speed <= 18) return (.625 - .08 * clamp01((speed - START_SPEED) / (18 - START_SPEED))) * FOOTBALL_STRIDE_PERIOD_SCALE;
  return (.545 - .09 * clamp01((speed - 18) / (60 - 18))) * FOOTBALL_STRIDE_PERIOD_SCALE;
}

/** Legacy stateless API retained for callers/tests; renderers use the integrated clock below. */
export function movementStep(vx: number, vy: number, seconds: number, offset = 0): number {
  const speed = Math.hypot(vx, vy);
  if (!Number.isFinite(speed) || speed <= 3 || !Number.isFinite(seconds)) return 0;
  const cycles = ((seconds + offset) / footballStridePeriod(speed)) % 1;
  return ((cycles + 1) % 1) * 4;
}

/** Original direction classifier, kept pure as a fallback for legacy callers. */
export function movementBodyView(vx: number, vy: number, facing: 1 | -1): FootballBodyView | undefined {
  if (Math.hypot(vx, vy) < 3 || Math.abs(vy) < Math.abs(vx) * .55) return undefined;
  if (Math.abs(vx) < 3) return vy > 0 ? 0 : 4;
  const lateral = Math.sign(vx) === facing, diagonal = Math.abs(vx / vy);
  if (diagonal >= .75 && diagonal <= 1.45)
    return vy > 0 ? (lateral ? 5 : 7) : (lateral ? 6 : 8);
  return vy > 0 ? (lateral ? 1 : 3) : (lateral ? 3 : 1);
}

function makeFrame(clock: Clock): FootballAnimationFrame {
  return Object.freeze({
    phase: clock.phase,
    step: clock.phase * 4,
    moving: clock.moving,
    facing: clock.facing,
    shuffling: clock.shuffling,
    ...(clock.view === undefined ? {} : { view: clock.view }),
  });
}

function firstClock(sample: FootballAnimationSample): Clock {
  const now = Number.isFinite(sample.now) ? sample.now : 0;
  const facing = sample.facing;
  const clock: Clock = {
    now,
    x: Number.isFinite(sample.x) ? sample.x : 0,
    y: Number.isFinite(sample.y) ? sample.y : 0,
    phase: 0,
    filteredSpeed: 0,
    moving: false,
    shuffling: Math.abs(sample.vy) > Math.abs(sample.vx),
    stoppedFor: 0,
    facing,
    facingCandidateAt: now,
    viewCandidateAt: now,
    viewClearAt: now,
    frame: Object.freeze({
      phase: 0, step: 0, moving: false, facing, shuffling: Math.abs(sample.vy) > Math.abs(sample.vx),
    }),
  };
  return clock;
}

function clockMap(owner: object): Map<string, Clock> {
  let entries = clocks.get(owner);
  if (!entries) {
    entries = new Map();
    clocks.set(owner, entries);
  }
  return entries;
}

/**
 * Integrate elapsed simulation time once per actor and clock sample.
 * Displacement—not instantaneous velocity multiplied by absolute time—drives
 * cadence. Re-rendering an unchanged clock sample is idempotent.
 */
export function updateFootballAnimation(
  owner: object, actor: string | number, sample: FootballAnimationSample,
): FootballAnimationFrame {
  const key = String(actor), entries = clockMap(owner);
  const now = Number.isFinite(sample.now) ? sample.now : 0;
  const x = Number.isFinite(sample.x) ? sample.x : 0;
  const y = Number.isFinite(sample.y) ? sample.y : 0;
  const vx = Number.isFinite(sample.vx) ? sample.vx : 0;
  const vy = Number.isFinite(sample.vy) ? sample.vy : 0;
  let clock = entries.get(key);
  if (!clock) {
    clock = firstClock({ ...sample, now, x, y, vx, vy });
    entries.set(key, clock);
  } else if (now < clock.now) {
    // A play/clock rewind starts planted rather than inheriting a stale sprint.
    clock = firstClock({ ...sample, now, x, y, vx, vy });
    entries.set(key, clock);
  } else if (now > clock.now) {
    const dt = now - clock.now;
    const dx = x - clock.x, dy = y - clock.y;
    const distance = Math.hypot(dx, dy);
    const plausible = distance <= Math.max(12, dt * MAX_OBSERVED_SPEED);
    const observedSpeed = plausible ? Math.min(MAX_OBSERVED_SPEED, distance / dt) : 0;
    // Some render callers (including Classic's carrier) intentionally supply
    // positions without velocities. Infer orientation from the same actual
    // displacement that advances their feet, rather than treating a strafe as
    // a motionless forward-facing pose. Never write the inference into physics.
    const hasVelocity = Math.hypot(vx, vy) >= START_SPEED;
    const directionVx = hasVelocity ? vx : plausible ? dx / dt : 0;
    const directionVy = hasVelocity ? vy : plausible ? dy / dt : 0;

    // Ignore one-frame coordinate spikes; the low-pass cadence still responds
    // smoothly to real acceleration and sprinting.
    const alpha = 1 - Math.exp(-dt / SPEED_FILTER_SECONDS);
    clock.filteredSpeed += (observedSpeed - clock.filteredSpeed) * alpha;
    if (observedSpeed >= START_SPEED) {
      clock.moving = true;
      clock.stoppedFor = 0;
    } else if (observedSpeed <= STOP_SPEED) {
      clock.stoppedFor += dt;
      if (clock.stoppedFor >= STOP_DWELL) clock.moving = false;
    } else {
      clock.stoppedFor = 0;
    }
    if (!clock.shuffling && Math.abs(directionVy) > Math.abs(directionVx) * 1.2) clock.shuffling = true;
    else if (clock.shuffling && Math.abs(directionVy) < Math.abs(directionVx) * .8) clock.shuffling = false;

    const cadenceDt = Math.min(dt, .25);
    if (clock.moving && observedSpeed > STOP_SPEED) {
      clock.phase = (clock.phase + cadenceDt / footballStridePeriod(clock.filteredSpeed)) % 1;
    }

    const requestedFacing: 1 | -1 = Math.abs(directionVx) > 8 ? directionVx < 0 ? -1 : 1 : sample.facing;
    if (requestedFacing === clock.facing) {
      clock.facingCandidate = undefined;
      clock.facingCandidateAt = now;
    } else if (clock.facingCandidate !== requestedFacing) {
      clock.facingCandidate = requestedFacing;
      clock.facingCandidateAt = now;
    } else if (now - clock.facingCandidateAt >= DIRECTION_DWELL) {
      clock.facing = requestedFacing;
      clock.facingCandidate = undefined;
    }

    const desiredView = clock.moving ? movementBodyView(directionVx, directionVy, clock.facing) : undefined;
    if (desiredView === undefined) {
      clock.viewCandidate = undefined;
      if (clock.view !== undefined) {
        if (!clock.viewClearAt) clock.viewClearAt = now;
        if (now - clock.viewClearAt >= VIEW_RELEASE_DWELL) clock.view = undefined;
      }
    } else if (desiredView === clock.view) {
      clock.viewCandidate = undefined;
      clock.viewClearAt = now;
    } else if (clock.viewCandidate !== desiredView) {
      clock.viewCandidate = desiredView;
      clock.viewCandidateAt = now;
      clock.viewClearAt = now;
    } else if (now - clock.viewCandidateAt >= VIEW_DWELL) {
      clock.view = desiredView;
      clock.viewCandidate = undefined;
      clock.viewClearAt = now;
    }

    clock.now = now;
    clock.x = x;
    clock.y = y;
  }
  clock.frame = makeFrame(clock);
  return clock.frame;
}

