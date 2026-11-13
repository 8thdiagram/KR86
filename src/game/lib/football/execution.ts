import { PLAYBOOK, executionPlay } from './playbook';
import { progression } from './passing';
import { type Athlete, type LivePlay } from './types';

/** Small assignment-specific gains, shared by both teams. Never change ratings,
 * Classic, pass-origin scrambles, or the original evasion state machine. */
export const EXECUTION = { skillSpeed: 1.025, primarySpeed: 1.025, defenseAcceleration: 1.035,
  defenseSpeed: 1.018, routeBreak: 1.07, blockSpread: 3 } as const;
export function primaryPlayer(l: LivePlay) {
  if (PLAYBOOK[l.play].kind !== 'pass') return l.play === 'sneak'||l.play==='speed-option' ? 5 : 6;
  return progression({ ...l, time: 0 }).receiver;
}
export function skillExecution(l: LivePlay, a: Athlete) {
  const play = executionPlay(l.play, l.defense);
  const primary = a.id === primaryPlayer(l) && l.time < play.develop + .55;
  // Exploit the blitz's downfield isolation through actual route separation;
  // protection, pass timing, catch contests and elite pursuit still apply.
  const deepBlitz = primary && play.kind === 'pass' && play.depth >= 24 &&
    l.defense === 'blitz' && (l.mode === 'dropback' || l.mode === 'flight');
  return EXECUTION.skillSpeed * (primary ? EXECUTION.primarySpeed : 1) * (deepBlitz ? 1.09 : 1);
}
/** Initial assignments only; after handoff the established steering remains authoritative. */
export function runApproach(l: LivePlay) {
  const los = 100 + l.snapSpot * 10;
  if (l.play === 'sweep') return { x: los - 20, y: 143 };
  if (l.play === 'counter')
    return l.time < .34 ? { x: los - 32, y: 124 } : { x: los - 20, y: 82 };
  if (l.play === 'draw') return l.time < .55 ? { x: los - 43, y: 100 } : { x: los - 23, y: 110 };
  return { x: los - 23, y: 96 };
}
