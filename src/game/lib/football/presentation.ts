import { startField } from './field';
import { attackDirection, reflectPhysicalState } from './direction';
import type { FootballGame, LivePlay } from './types';

const formations = new WeakMap<FootballGame, { key: string; live: LivePlay }>();
/** Read-only neutral line-up while choosing. Do not choose the CPU's hidden play,
 * draw gameplay tickets on the actual game, reset deadlines or create a snap. */
export function footballFormationPreview(game: FootballGame): FootballGame {
  if (game.phase !== 'play-call' || game.live || game.special || game.playResult || game.tackleScene || game.sideSwitch)
    return game;
  const direction = attackDirection(game);
  const key = [game.seed, game.plays, game.quarter, game.possession, game.spot, game.homeOddDirection].join(':');
  let formation = formations.get(game);
  if (!formation || formation.key !== key) {
    const live = startField({ ...game }, 'power', 'pass');
    if (direction === -1) { reflectPhysicalState(live); live.fieldFrame = -1; }
    formation = { key, live }; formations.set(game, formation);
  }
  return { ...game, fieldFrame: direction, live: formation.live };
}
