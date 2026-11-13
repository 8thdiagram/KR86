import type { FootballGame } from './types';
/** Shared by special-teams execution and save validation; not an MVP award. */
export const SPECIAL_EXECUTION_SPEED = 1.08;
/** Snapshot at the snap/kick, not at selection or when the clock expires. */
export const clutchEligible = (g: Pick<FootballGame, 'overtime' | 'quarter' | 'clock' | 'score'>) =>
  g.overtime || (g.quarter === 2 || g.quarter === 4) && g.clock > 0 && g.clock <= 6 &&
    Math.abs(g.score.home - g.score.away) <= 7;
export const lockClutch = (g: FootballGame) => { g.clutchActive = clutchEligible(g); };
export const chaosOpportunity = (g: Pick<FootballGame, 'clutchActive'>, probability: number, eligible = true, ceiling = .95) =>
  Math.min(ceiling, Math.max(0, probability * (g.clutchActive && eligible ? 1.25 : 1)));
