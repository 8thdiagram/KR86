import { kickSeed } from '../kick-return-engine';
import { PLAYBOOK } from './playbook';
import { clamp, other, type Athlete, type FootballGame, type LivePlay } from './types';
import { chaosOpportunity } from './clutch';
import { linebackerSkill } from './franchise-upgrades';

/** Group CDFs, not per-athlete or per-frame probabilities. Time is live WORLD
 * seconds, just like routes and blocking, never the selection/play/quarter clock. */
export const PENETRATION = {
  line: [[0, .10], [1, .20], [3, .33], [5, .50]],
  slowBlitz: [[0, .12], [1, .38], [2, .56]],
  ordinaryBlitz: [[0, .14], [.8, .20]],
} as const;
export function cumulativePressure(points: readonly (readonly [number, number])[], time: number) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    if (time < b[0]) return a[1] + clamp((time - a[0]) / (b[0] - a[0]), 0, 1) * (b[1] - a[1]);
  }
  return points.at(-1)![1];
}
/** Inverse of the same group CDF. One quantile fixes the whole play's entry
 * opportunity; there is no new roll as frames/thresholds elapse. */
export function pressureDeadline(points: readonly (readonly [number, number])[], roll: number) {
  if (roll < points[0]![1]) return points[0]![0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    if (roll < b[1]) return a[0] + (roll - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
  }
  return Infinity;
}
export const slowPressurePlay = (l: LivePlay) => l.play === 'draw' ||
  PLAYBOOK[l.play].kind === 'pass' && PLAYBOOK[l.play].develop >= 1.7 && PLAYBOOK[l.play].depth >= 17;

/** Dedicated persisted draws do not perturb passing, fumbles or elite rosters.
 * Sharing the group quantile correlates overlapping pressure instead of adding
 * independent line + blitz chances. One designated winner per play/engagement. */
export function pressureTicket(g: FootballGame, l: LivePlay): NonNullable<LivePlay['penetration']> {
  let rng = kickSeed(`${g.seed}:${g.plays}:${l.snapSpot}:${g.possession}:pressure`);
  const draw = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  return { roll: draw(), selection: draw(), recognition: draw() };
}
export function stepPenetration(g: FootballGame) {
  const l = g.live!;
  // No new wins after release, a loose ball or the end of a scrimmage play.
  if (!['handoff', 'dropback', 'scramble', 'run', 'flight'].includes(l.mode)) return;
  const state = l.penetration ??= pressureTicket(g, l);
  if (state.event) {
    const e = state.event, d = l.athletes[e.defender]!, b = l.athletes[e.blocker]!;
    const cleared = e.stageX === undefined ? Math.abs(d.y - b.y) >= 13 || d.x < b.x - 7
      : Math.abs(d.y - e.escapeY) < 4;
    if (e.cleared === undefined && cleared) { e.cleared = l.time; d.pursuit = undefined; }
    if (e.entered === undefined && d.x < 100 + l.snapSpot * 10 - 3) e.entered = l.time;
    return;
  }
  if (l.mode === 'flight') return;
  const blitzCall = l.defense === 'blitz' || l.defense === 'run-blitz' && PLAYBOOK[l.play].kind === 'run';
  // Same CDF outside clutch. Relative 25% eligible execution, not +25pp.
  const roll = state.roll / chaosOpportunity(g, 1, true, 1.25);
  const lineDue = pressureDeadline(PENETRATION.line, roll);
  const blitzDue = blitzCall ? pressureDeadline(
    slowPressurePlay(l) ? PENETRATION.slowBlitz : PENETRATION.ordinaryBlitz, roll) : Infinity;
  const entryDue = Math.min(lineDue, blitzDue);
  if (!Number.isFinite(entryDue)) return;
  const blitz = blitzDue <= lineDue;
  const offense = l.athletes.filter(a => a.side === 'offense' && a.role === 'OL');
  const profile = g.profiles[other(g.possession)], blocking = g.profiles[g.possession];
  const los = 100 + l.snapSpot * 10;
  const candidates = l.athletes.filter(d => d.side === 'defense' &&
    (d.role === 'DL' || blitz && d.role === 'LB') && !d.dive && d.x >= los - 3 && d.x <= los + 60)
    .map(d => {
      const b = [...offense].sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0]!;
      const distance = Math.hypot(b.x - d.x, b.y - d.y);
      // Ability, actual engagement, leverage and a play's blocking requirement
      // choose WHO wins; they never multiply the specified group CDF.
      const leverage = Math.abs(d.y - b.y);
      // Use an actual outside shoulder, not an inward "gap" already occupied
      // by another held lineman. Stacked rushers first go behind that front.
      const side: -1 | 1 = d.startY < 90 ? -1 : d.startY > 102 ? 1 : state.recognition < .5 ? -1 : 1;
      const escapeY = clamp(side < 0 ? Math.min(...offense.map(a => a.y)) - 18
        : Math.max(...offense.map(a => a.y)) + 18, 25, 167);
      const edge = d.role === 'DL' && Math.abs(d.startY - 96) >= 10;
      const stageX = edge ? los - 6 : Math.max(los + 28, d.x);
      const speed = ((l.mode === 'dropback' || l.mode === 'flight' ? 26 : 44) +
        profile.rush * 18 + (blitzCall ? 17 : 0)) * 1.018;
      // Forecast the ENTRY plane, not arrival at the deeper escape waypoint.
      // Draw/running movement also uses its real live-mode speed, not pass-rush
      // speed; otherwise the anticipation silently advances their CDF.
      const firstLeg = Math.hypot(stageX - d.x, escapeY - d.y);
      const distanceToEntry = edge ? firstLeg * clamp((d.x - (los - 3)) / Math.max(.001, d.x - stageX), 0, 1)
        : firstLeg + Math.max(0, stageX - (los - 3));
      const travel = distanceToEntry / speed +
        .12 + (l.defense !== 'run' && l.defense !== 'goal-line' ? Math.max(0, .28 - l.time) * .65 : 0);
      const weight = Math.max(.05, 1 + profile.rush - blocking.line +
        (d.engaged > l.time ? -.15 : .15) + leverage / 65 - distance / 110 +
        (l.play === 'screen' || l.play === 'draw' ? .15 : 0) +
        (d.role === 'LB' ? .15 : 0) + (d.startY < 96 ? profile.rush * .12 : blocking.line * .06)) * linebackerSkill(g, d);
      return { d, b, weight, distance, side, escapeY, stageX, travel };
    }).filter(c => c.distance < 65);
  if (!candidates.length) return;
  // An existing unblocked backfield defender already provides this pressure.
  // Do not manufacture a second random winner on top of it.
  if (l.athletes.some(d => d.side === 'defense' && (d.role === 'DL' || d.role === 'LB') && d.x < los - 3)) return;
  const fastest = Math.min(...candidates.map(c => c.travel));
  // An immediate win still needs physical travel. For later deadlines, do not
  // select an athlete whose geometry cannot reach the entry window from snap.
  const reachable = candidates.filter(c => c.travel <= Math.max(entryDue, fastest + .04));
  let pick = state.selection * reachable.reduce((sum, c) => sum + c.weight, 0);
  const chosen = reachable.find(c => (pick -= c.weight) <= 0) ?? reachable.at(-1)!;
  const { d, b } = chosen;
  if (l.time + chosen.travel < entryDue) return;
  state.event = { defender: d.id, blocker: b.id, kind: blitz ? 'blitz' : 'line',
    at: l.time, side: chosen.side, escapeX: los - 6, escapeY: chosen.escapeY,
    stageX: chosen.stageX, entryDue,
    // Draw recognition is delayed for some rushers, not knowledge of future input.
    fooledUntil: l.play === 'draw' && state.recognition > .45 ? 1.35 + state.recognition * .35 : 0 };
  d.engaged = Math.min(d.engaged, l.time);
  d.beaten = Math.max(d.beaten, l.time + .55);
  d.pursuit = undefined;
}

/** Real sidestep/disengagement through the existing movement/acceleration system.
 * Blocker remains solid: go around its shoulder before turning into the pocket. */
export function penetrationTarget(l: LivePlay, d: Athlete) {
  const e = l.penetration?.event;
  if (!e || e.defender !== d.id) return;
  if (e.cleared === undefined) return { x: e.stageX ?? e.escapeX, y: e.escapeY };
  if (e.stageX !== undefined && e.entered === undefined) return { x: e.escapeX, y: e.escapeY };
  if (l.play === 'draw' && l.time < e.fooledUntil) {
    const qb = l.athletes[5]!;
    return { x: qb.x - 18, y: qb.y };
  }
  if (e.stageX !== undefined && e.entered !== undefined && l.mode === 'dropback') {
    // An edge win creates an edge-pressure/containment responsibility, not
    // instant perfect pursuit of the quarterback's center. Compress the pocket
    // over time while reacting to his OBSERVED position on normal read cadence.
    const qb = l.athletes[5]!, read = d.pursuit;
    const x = read?.seenX ?? qb.x, y = read?.seenY ?? qb.y;
    const compression = clamp((l.time - e.entered - (l.defense === 'blitz' ? .12 : .3)) /
      (l.defense === 'blitz' ? .95 : 2.2), 0, 1);
    return { x: x + 20 * (1 - compression), y: clamp(y + e.side * 32 * (1 - compression), 25, 167) };
  }
  return undefined;
}
