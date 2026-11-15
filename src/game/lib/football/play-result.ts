import type { FieldResult } from './field';
import type { SpecialResult } from './special-teams';
import type { FootballGame } from './types';
import { TD_SECONDS } from './celebration-timing';

export const RESULT_SECONDS = 1;
export function beginPlayResult(g: FootballGame, text: string) {
  g.playResult = { remaining: text.includes('TOUCHDOWN') ? TD_SECONDS : RESULT_SECONDS, text };
  g.playClockRunning = false;
}
/** Recovery, falling bodies and referee signals finish before the text appears. */
export const resultVisible = (g: FootballGame) => !!g.playResult &&
  !(g.playResult.text.includes('TOUCHDOWN') && g.tackleScene) &&
  (!g.tackleScene || g.tackleScene.phase === 'ground') &&
  !(g.turnoverNotice! > 0) && !(g.delayPenalty?.remaining! > 0);

const distance = (g: FootballGame) =>
  `${['1ST', '2ND', '3RD', '4TH'][g.down - 1] ?? g.down} & ${g.target === 100 ? 'GOAL' : Math.max(1, Math.ceil(g.target - g.spot))}`;
const yards = (n: number) => Math.round(Math.abs(n) * 10) / 10;
export function fieldResultText(g: FootballGame, result: FieldResult, offense: FootballGame['possession']) {
  const gain = (g.live?.turnoverSpot ?? result.spot) - g.live!.snapSpot;
  if (result.detail?.includes('RETURN TOUCHDOWN'))
    return `${result.reason === 'interception' ? 'INTERCEPTION' : 'FUMBLE'} RETURN TOUCHDOWN! +7`;
  if (result.reason === 'touchdown') return 'TOUCHDOWN! +7';
  if (result.reason === 'safety') return 'SAFETY! +2';
  if (result.reason === 'interception') return 'INTERCEPTION!';
  if (result.reason === 'fumble' || result.detail?.startsWith('FUMBLE')) {
    // Athlete sides are fixed at the snap; current possession has already changed.
    const recovering = result.recoverySide ?? (result.reason === 'fumble' ? 'defense' : 'offense');
    return `FUMBLE! ${recovering.toUpperCase()} RECOVERS${recovering === 'offense' && g.possession !== offense ? ' — TURNOVER ON DOWNS' : ''}`;
  }
  if (g.lastResult.includes('TURNOVER ON DOWNS')) return 'TURNOVER ON DOWNS';
  if (result.reason === 'incomplete') return `INCOMPLETE PASS — ${distance(g)}`;
  if (result.reason === 'sack') return `SACK! LOSS OF ${yards(gain)} YARDS — ${distance(g)}`;
  if (g.lastResult.startsWith('FIRST')) return g.target === 100 ? 'FIRST AND GOAL!' : 'FIRST DOWN!';
  return `${gain < 0 ? 'LOSS' : 'GAIN'} OF ${yards(gain)} YARDS — ${distance(g)}`;
}
export function specialResultText(g: FootballGame, result: SpecialResult) {
  const s = g.special!;
  if (result.kind === 'touchdown') return `${s.rareOrigin === 'block' ? 'BLOCKED KICK RETURN ' : 'RETURN '}TOUCHDOWN! +7`;
  if (result.kind === 'good') return 'FIELD GOAL GOOD! +3';
  if (result.kind === 'miss') return 'FIELD GOAL NO GOOD';
  if (result.kind === 'safety') return 'SAFETY! +2';
  if ((g.turnoverNotice ?? 0) > 0) return `${s.rareOrigin === 'block' ? 'KICK BLOCKED! — ' : ''}TURNOVER ON DOWNS`;
  const ball = result.side === s.kicking ? 'KICKING TEAM BALL' : 'RECEIVING TEAM BALL';
  if (s.rareOrigin === 'block') return `${s.kind === 'punt' ? 'PUNT' : 'FIELD GOAL'} BLOCKED! — ${ball}`;
  if (s.rareOrigin === 'muff') return `MUFFED ${s.kind === 'punt' ? 'PUNT' : 'KICK'} — ${result.kind === 'touchback' ? 'TOUCHBACK' : ball}`;
  if (s.rareOrigin === 'fumble') return `FUMBLE! ${ball}`;
  if (s.kind === 'punt') return `PUNT — ${result.kind === 'touchback' ? 'TOUCHBACK' : ball}`;
  return g.lastResult;
}
