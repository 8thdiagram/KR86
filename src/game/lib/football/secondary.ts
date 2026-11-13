import { kickSeed, KR } from '../kick-return-engine';
import { EXECUTION } from './execution';
import type { FootballGame, Side } from './types';

/** Stable personnel slots: corner, free safety, strong safety. Separate streams
 * keep roster draws independent and leave the play/outcome RNG untouched. */
export function secondaryRoster(seed: number, team: string): number[] {
  let state = kickSeed(`${seed}:secondary:${team}`);
  const draw = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const count = draw() < .5 ? 1 : 2, pool = [0, 1, 2], slots: number[] = [];
  while (slots.length < count) slots.push(pool.splice(Math.floor(draw() * pool.length), 1)[0]!);
  return slots.sort();
}
export function eliteSlots(g: FootballGame, side: Side) {
  g.secondary ??= {
    home: secondaryRoster(g.seed, g.teams.player),
    away: secondaryRoster(g.seed, g.teams.opponent),
  };
  return g.secondary[side];
}
/** Match BOTH axes of the boosted primary, not just its straight-line rating.
 * No change to offensive movement, interception odds or contact admission. */
export const ELITE = {
  forward: KR.forwardSpeed * EXECUTION.skillSpeed * EXECUTION.primarySpeed * 1.025,
  lateral: KR.lateralSpeed * EXECUTION.skillSpeed * EXECUTION.primarySpeed * 1.025,
  acceleration: 380, closeAcceleration: 740, reaction: .16,
} as const;
