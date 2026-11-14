import type { Athlete, FootballGame, FootballInput, LivePlay } from './types';

/** Defensive personnel/call only. Never reads offensive play, progression or a locked target. */
export function controlledDefenderId(l: Pick<LivePlay, 'defense' | 'athletes'>): number | undefined {
  const defenders = l.athletes.filter(a => a.side === 'defense');
  const linebackers = defenders.filter(d => d.role === 'LB');
  const backs = defenders.filter(d => d.role === 'DB');
  return (linebackers.length ? linebackers : backs.length ? backs : defenders)
    .sort((a, b) => Math.abs(a.startY - 96) - Math.abs(b.startY - 96) || a.id - b.id)[0]?.id;
}

export function isUserKickoffCoverage(g: FootballGame) {
  const s = g.special;
  return !!s && ['full', 'squib', 'onside'].includes(s.kind) && s.kicking === 'home' &&
    (s.returnSide ?? s.receiver) === 'away' &&
    (s.stage === 'flight' || s.stage === 'bounce' ||
      s.stage === 'return' && g.returnAttempt?.phase === 'returning');
}

export function isUserDefensivePlay(g: FootballGame) {
  if (isUserKickoffCoverage(g)) return true;
  return g.phase === 'live' && g.possession === 'away' && !g.special && !!g.live &&
    !['return', 'loose', 'kick'].includes(g.live.mode);
}

type Override = { id: number | undefined; active: boolean;
  direction: -1 | 0 | 1; refreshAssignment: boolean };
// Only transient input state: no receiver selection or permanent assignment changes.
const overrides = new WeakMap<LivePlay, Override>();
export function prepareUserDefense(g: FootballGame, input: FootballInput) {
  const l = g.live;
  if (!l) return;
  let state = overrides.get(l);
  if (!state) {
    state = { id: controlledDefenderId(l), active: false, direction: 0, refreshAssignment: false };
    overrides.set(l, state);
  }
  const enabled = !g.special && isUserDefensivePlay(g);
  const active = enabled && !!input.defenseDirection;
  if (state.active && !active) state.refreshAssignment = true;
  if (active) state.refreshAssignment = false;
  state.active = active;
  state.direction = enabled ? input.defenseDirection ?? 0 : 0;
}

/** Release refreshes the ordinary AI's target from current play positions,
 * without changing the defensive call, personnel or original man assignment. */
export function consumeDefenseRelease(g: FootballGame, d: Athlete) {
  const state = g.live && overrides.get(g.live);
  if (!state?.refreshAssignment || state.id !== d.id) return false;
  state.refreshAssignment = false;
  return true;
}

export type ManualDefenseTarget = { x: number; y: number; direction: -1 | 0 | 1 };
/** Only arrows override movement. ACTION never owns or redirects this player. */
export function userDefenseTarget(g: FootballGame, d: Athlete): ManualDefenseTarget | undefined {
  const l = g.live!, state = overrides.get(l);
  if (!state?.active || state.id !== d.id || !isUserDefensivePlay(g)) return;
  const direction = state.direction;
  return { x: d.x, y: d.y + direction * 42, direction };
}

/** Pure vertical intention, within existing speed and acceleration limits. */
export function userDefenseVelocity(direction: ManualDefenseTarget['direction'], lateral: number) {
  return { x: 0, y: direction * lateral };
}

export function manualDefender(g: FootballGame, input: FootballInput) {
  if (!input.defenseDirection || g.special || !isUserDefensivePlay(g)) return;
  const id = controlledDefenderId(g.live!);
  return g.live!.athletes.find(a => a.id === id);
}
