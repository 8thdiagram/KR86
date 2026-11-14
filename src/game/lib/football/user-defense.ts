import { clamp, type Athlete, type FootballGame, type FootballInput, type LivePlay } from './types';

export const DEFENSE_HOLD_MS = 200;

/** Defensive personnel/call only. Never reads offensive play, progression or a locked target. */
export function controlledDefenderId(l: Pick<LivePlay, 'defense' | 'athletes'>): number | undefined {
  const defenders = l.athletes.filter(a => a.side === 'defense');
  if (l.defense === 'man')
    return defenders.filter(d => d.role === 'DB').sort((a, b) => a.startY - b.startY || a.id - b.id)[0]?.id;
  if (l.defense === 'prevent')
    return defenders.filter(d => d.role === 'DB')
      .sort((a, b) => Math.abs(a.startY - 96) - Math.abs(b.startY - 96) || a.id - b.id)[0]?.id;
  return defenders.find(d => d.role === 'LB')?.id ?? defenders.find(d => d.role === 'DB')?.id;
}

export function isUserDefensivePlay(g: FootballGame) {
  return g.phase === 'live' && g.possession === 'away' && !g.special && !!g.live &&
    !['return', 'loose', 'kick'].includes(g.live.mode);
}

type Override = { id: number | undefined; active: boolean; hold: boolean;
  direction: -1 | 0 | 1; refreshAssignment: boolean };
// Only transient input state: no receiver selection or permanent assignment changes.
const overrides = new WeakMap<LivePlay, Override>();
export function prepareUserDefense(g: FootballGame, input: FootballInput) {
  const l = g.live;
  if (!l) return;
  let state = overrides.get(l);
  if (!state) {
    state = { id: controlledDefenderId(l), active: false, hold: false, direction: 0, refreshAssignment: false };
    overrides.set(l, state);
  }
  const enabled = isUserDefensivePlay(g);
  const active = enabled && (!!input.defensePressed || !!input.defenseHold || !!input.defenseDirection);
  if (state.active && !active) state.refreshAssignment = true;
  if (active) state.refreshAssignment = false;
  state.active = active;
  state.hold = enabled && !!input.defenseHold;
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
/** Arrows are direct movement. ACTION pursues the actual carrier (or the
 * visible airborne ball), never an AI coverage target or selected receiver. */
export function userDefenseTarget(g: FootballGame, d: Athlete): ManualDefenseTarget | undefined {
  const l = g.live!, state = overrides.get(l);
  if (!state?.active || state.id !== d.id || !isUserDefensivePlay(g)) return;
  const direction = state.direction;
  const ball = l.flight ?? l.option?.ball ?? l.athletes[l.carrier]!;
  return { x: state.hold ? ball.x : d.x,
    y: direction ? d.y + direction * 42 : state.hold ? ball.y : d.y, direction };
}

/** Same independent-axis input convention as the carrier, bounded by this
 * defender's existing speed/lateral/diagonal limits. Steering takes priority;
 * horizontal pursuit uses the remaining budget, never the reverse. */
export function userDefenseVelocity(d: Pick<Athlete, 'x' | 'y'>, target: ManualDefenseTarget,
  speed: number, lateral: number, independentAxes: boolean, dt: number) {
  const dx = target.x - d.x, dy = target.y - d.y;
  const arrival = Math.max(dt, Math.abs(dx) / speed, Math.abs(dy) / lateral);
  let x = dx / arrival, y = dy / arrival;
  if (target.direction) {
    y = clamp(dy / dt, -lateral, lateral);
    x = clamp(dx / dt, -speed, speed);
    if (!independentAxes) {
      const horizontal = Math.sqrt(Math.max(0, speed * speed - y * y));
      x = clamp(x, -horizontal, horizontal);
    }
  } else if (!independentAxes) {
    const cap = Math.min(1, speed / Math.max(.001, Math.hypot(x, y)));
    x *= cap; y *= cap;
  }
  return { x, y };
}

export function manualDefender(g: FootballGame, input: FootballInput) {
  // A pending short ACTION press changes color/movement ownership, not actions.
  if (!(input.defenseHold || input.defenseDirection) || !isUserDefensivePlay(g)) return;
  const id = controlledDefenderId(g.live!);
  return g.live!.athletes.find(a => a.id === id);
}
