import { defensiveMenuChoices, offensiveChoices } from './playbook';
import type { FootballGame } from './types';

/** Subtle advice among legal cards. Scores never affect availability or execution. */
export function coachingAdvice(g: FootballGame) {
  return g.possession==='home' ? offensiveChoices(g)[0]?.id : defensiveMenuChoices(g)[0]?.id;
}
