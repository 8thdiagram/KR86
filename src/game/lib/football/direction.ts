import type { FootballGame, Side } from './types';

export type FieldDirection = 1 | -1;
/** Absolute stadium coordinates: left goal 100, right goal 1100. Yardage
 * remains offense-relative, so changing ends never changes down/distance. */
export function attackDirection(g: FootballGame, side: Side = g.possession): FieldDirection {
  const home = (g.quarter % 2 ? 1 : -1) * (g.homeOddDirection ?? 1);
  return (side === 'home' ? home : -home) as FieldDirection;
}
export const worldX = (x: number, direction: FieldDirection) => direction === 1 ? x : 1200 - x;
export const yardX = (g: FootballGame, yards: number, side = g.possession) =>
  worldX(100 + yards * 10, attackDirection(g, side));
export function sequenceDirection(g: FootballGame): FieldDirection {
  if (g.special) return attackDirection(g, g.special.kind === 'field-goal' ? g.special.kicking : g.special.receiver);
  if (g.live) return attackDirection(g, g.live.offense ?? g.possession);
  // Finish pre-amendment kickoff saves in their historical frame.
  if (g.phase === 'kickoff' && g.returnAttempt) return 1;
  return attackDirection(g);
}
const positions = new Set(['x', 'startX', 'homeX', 'fromX', 'toX', 'aimX', 'originX', 'catchX', 'receiveX',
  'escapeX', 'stageX', 'seenX', 'targetX', 'furthestX']);
const velocities = new Set(['vx', 'seenVx']);
/** Reflect ALL physical state, including committed velocities, trajectories,
 * blocker waypoints, loose balls and recovery origins. Never reflect Y/input. */
export function reflectPhysicalState(value: unknown, seen = new WeakSet<object>()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'number') {
      const target = value as Record<string, unknown>;
      if (positions.has(key)) target[key] = 1200 - v;
      else if (velocities.has(key)) target[key] = v === 0 ? 0 : -v;
      else if (key === 'angle') target[key] = Math.atan2(Math.sin(v), -Math.cos(v));
    } else reflectPhysicalState(v, seen);
  }
}
function reflectGame(g: FootballGame) {
  const seen = new WeakSet<object>();
  for (const state of [g.live, g.special, g.returnAttempt, g.tackleScene]) reflectPhysicalState(state, seen);
  if (g.tackleScene) g.tackleScene.direction = g.tackleScene.direction === 1 ? -1 : 1;
}
function stabilizePhysicalState(value: unknown, seen = new WeakSet<object>()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'number' && (positions.has(key) || velocities.has(key) || key === 'angle'))
      (value as Record<string, unknown>)[key] = Math.round(v * 1e8) / 1e8 || 0;
    else if (v && typeof v === 'object') stabilizePhysicalState(v, seen);
  }
}
function stabilizeGame(g: FootballGame) {
  const seen = new WeakSet<object>();
  for (const state of [g.live, g.special, g.returnAttempt, g.tackleScene]) stabilizePhysicalState(state, seen);
}
const active = new WeakSet<FootballGame>();
/** Public engine state is always physical WORLD state. The shared football
 * solver runs in an offense/receiver-local coordinate frame, then transforms
 * its resulting positions AND velocities back before callers/renderers see it.
 * This is a physics coordinate transform, not a canvas/sprite flip. */
export function inFootballFrame<T>(g: FootballGame, run: () => T): T {
  if (active.has(g)) return run();
  if (g.fieldFrame === -1) reflectGame(g);
  // Sub-pixel normalization in BOTH directions prevents floating-point mirror
  // roundoff from breaking otherwise-exact blocker/pursuit tie decisions.
  stabilizeGame(g);
  delete g.live?.fieldFrame;
  g.fieldFrame = 1; active.add(g);
  try { return run(); }
  finally {
    active.delete(g);
    stabilizeGame(g);
    const direction = sequenceDirection(g);
    if (direction === -1) reflectGame(g);
    g.fieldFrame = direction;
    if (g.live && direction === -1) g.live.fieldFrame = -1;
    else if (g.live) delete g.live.fieldFrame;
  }
}
export function playTravelDirection(g: FootballGame): FieldDirection {
  const frame = g.fieldFrame ?? 1;
  if (g.special) {
    const s = g.special;
    return (frame * (s.kind === 'field-goal' ? 1 : s.stage === 'return' ? s.mirrored ? -1 : 1 : -1)) as FieldDirection;
  }
  return (frame * (g.live?.mode === 'return' ? -1 : 1)) as FieldDirection;
}
