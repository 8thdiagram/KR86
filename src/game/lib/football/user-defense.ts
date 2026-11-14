import { eligibleReceivers, manAssignment, zoneTarget } from './coverage';
import { clamp, type Athlete, type FootballGame, type FootballInput, type LivePlay } from './types';
import { PASS_DEFENSE } from './pass-defense';

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

type Override = { id: number | undefined; active: boolean; receiver?: number; direction: number; nextRead: number };
// Transient intentions are not save data. Original assignments/pursuit are never overwritten.
const overrides = new WeakMap<LivePlay, Override>();
export function userDefenseIntent(g: FootballGame, input: FootballInput) {
  const l = g.live;
  if (!l) return;
  let state = overrides.get(l);
  if (!state) {
    state = { id: controlledDefenderId(l), active: false, direction: 0, nextRead: 0 };
    overrides.set(l, state);
  }
  state.active = isUserDefensivePlay(g) && (!!input.defenseHold || !!input.defenseDirection);
  state.direction = state.active ? input.defenseDirection ?? 0 : 0;
  if (!state.active) { state.receiver = undefined; state.nextRead = 0; }
}

/** Replace only a movement destination, before the existing blocker avoidance,
 * spacing, speed caps, acceleration and turning solver. No second movement step. */
export function userDefenseTarget(g: FootballGame, d: Athlete, original: { x: number; y: number }) {
  const l = g.live!, state = overrides.get(l);
  if (!state?.active || state.id !== d.id || !isUserDefensivePlay(g)) return;
  const direction = state.direction;
  const hold = currentHold.get(l) === true;
  let target = original;
  if (d.role === 'LB') {
    if (hold) {
      const carrier = l.athletes[l.carrier]!;
      // Do not chase an intended receiver before a pass actually exists.
      target = l.flight ? { x: l.flight.x, y: l.flight.y }
        : { x: carrier.x + clamp(carrier.vx * .18, -18, 18),
          y: carrier.y + clamp(carrier.vy * .18, -18, 18) };
    }
  } else if (d.role === 'DB') {
    const man = l.defense === 'man' || l.defense === 'blitz';
    if (direction && (state.nextRead <= l.time || state.direction !== lastDirection.get(l))) {
      // Physical receivers in the requested screen direction, not hidden QB selection.
      const threats = eligibleReceivers(l).filter(a => (a.y - d.y) * direction > 3);
      const receiver = threats.sort((a, b) =>
        Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y) || a.id - b.id)[0];
      state.receiver = receiver?.id;
      state.nextRead = l.time + .2;
    }
    const receiver = state.receiver === undefined ? undefined : l.athletes.find(a => a.id === state.receiver);
    if (l.mode === 'run' || l.mode === 'scramble' && l.crossedLos) {
      if (hold) {
        const runner = l.athletes[l.carrier]!;
        target = { x: runner.x + runner.vx * .18, y: runner.y + runner.vy * .18 };
      }
    } else if (hold && l.flight && l.flight.age >=
      (l.flight.type === 'bullet' ? .025 : PASS_DEFENSE.reactionSeconds)) {
      // Only a released ball supplies trajectory information.
      const f = l.flight, fraction = Math.min(1, (f.age + .18) / f.duration);
      target = { x: f.fromX + (f.toX - f.fromX) * fraction, y: f.fromY + (f.toY - f.fromY) * fraction };
    } else if (man && (receiver || hold)) {
      const threat = receiver ?? manAssignment(l, d);
      if (threat) target = { x: threat.x + threat.vx * .13 + (hold ? 0 : 4), y: threat.y + threat.vy * .13 };
    } else if (hold) {
      const zone = zoneTarget(l, d);
      if (zone.threat) target = { x: zone.threat.x + zone.threat.vx * .13, y: zone.threat.y + zone.threat.vy * .13 };
    }
  }
  lastDirection.set(l, direction);
  // An active arrow always has influence, including during assisted pursuit.
  // This changes intention, not velocity or a player's physical abilities.
  return { x: target.x, y: clamp(direction ? d.y + direction * 42 : target.y, 24, 168) };
}

const currentHold = new WeakMap<LivePlay, boolean>();
const lastDirection = new WeakMap<LivePlay, number>();
export function prepareUserDefense(g: FootballGame, input: FootballInput) {
  if (!g.live) return;
  currentHold.set(g.live, !!input.defenseHold && isUserDefensivePlay(g));
  userDefenseIntent(g, input);
}

export function heldDefender(g: FootballGame, input: FootballInput) {
  if (!input.defenseHold || !isUserDefensivePlay(g)) return;
  const id = controlledDefenderId(g.live!);
  return g.live!.athletes.find(a => a.id === id);
}
