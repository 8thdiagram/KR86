import type { FootballGame, SpecialTeams } from './types';
import { fieldGoalDistance } from './playbook';

/** Existing field coordinates: the posts are at x1194, centered on y96. */
export const FIELD_GOAL = { x: 1194, center: 96, half: 20, crossbar: 10, top: 46, near: 60, sensor: .44 } as const;
/** Fair, continuous human timing: .65 cycles/sec at 20 yd to 1.35 at 60 yd. */
export function fieldGoalMeterSpeed(distance: number) {
  return .65 + Math.max(0, Math.min(1, (distance - 20) / 40)) * .7;
}
export function fieldGoalWindow(g: FootballGame) {
  const distance = fieldGoalDistance(g), max = g.profiles[g.possession].kickMax;
  return Math.max(.025, Math.min(.26, .26 - Math.max(0, distance - 20) / Math.max(1, max - 20) * .235));
}
export function kickGeometry(fromX: number, fromY: number, toX: number = FIELD_GOAL.x) {
  const range = Math.max(1, Math.abs(toX - fromX));
  // The meter is a fixed camera sensor, not a difficulty graphic. A fixed
  // fraction of that sensor subtends a larger physical width at greater range.
  const span = (range + FIELD_GOAL.near) * FIELD_GOAL.sensor;
  return { range, span, center: .5 + (FIELD_GOAL.center - fromY) / span,
    half: FIELD_GOAL.half / span };
}
export function fieldGoalMeterAccuracy(g: FootballGame, s: SpecialTeams, meter: number) {
  const geometry = kickGeometry(s.fromX, s.fromY, s.toX);
  return .5 + (meter - geometry.center) / geometry.half * fieldGoalWindow(g);
}
export function fieldGoalAim(g: FootballGame, accuracy: number) {
  // CPU's original timing lottery and success threshold are unchanged. Unlike
  // the old discontinuous good/miss endpoints, this is one continuous aim.
  const offset = (accuracy - .5) / fieldGoalWindow(g) * FIELD_GOAL.half;
  const inRange = fieldGoalDistance(g) <= g.profiles[g.possession].kickMax;
  return { good: Math.abs(accuracy - .5) <= fieldGoalWindow(g) && inRange,
    toY: FIELD_GOAL.center + offset };
}
export function fieldGoalHeight(g: FootballGame, t: number) {
  // There is no separate power button or wind model in the existing game.
  // kickMax remains the strength limit, including attempts resumed beyond range.
  const shortage = Math.max(0, fieldGoalDistance(g) - g.profiles[g.possession].kickMax);
  const terminal = shortage ? Math.max(0, FIELD_GOAL.crossbar - shortage * 2) : 23;
  return Math.sin(t * Math.PI) * 42 + t * terminal;
}
