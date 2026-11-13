import { clamp, other, type Defense, type FootballGame, type PlayId, type Side } from './types';

export type Lane = -1 | 0 | 1;
export type CoachingObservation = {
  at: number; offense: Side; play: PlayId; defense: Defense; kind: 'run' | 'pass';
  depth: number; gain: number; success: boolean; stopped: boolean;
  sack: boolean; turnover: boolean; completed: boolean;
  lane?: Lane; entry?: Lane; cutback?: boolean; target?: number;
  targetLane?: Lane; timing?: number; qbLane?: Lane;
  scramble?: boolean; optionChoice?: 'keep'|'pitch'; pitchTiming?: 'early'|'late';
};
export type CoachingMemory = { version: 1; observations: CoachingObservation[] };
export type CoachingPlan = {
  focus: 'inside' | 'edge' | 'deep' | 'lane'; strength: number;
  lane: Lane; timing?: number;
  optionChoice?: 'keep'|'pitch'; pitchTiming?: 'early'|'late';
};
export type CoachingSample = {
  target?: number; targetLane?: Lane; timing?: number; qbLane?: Lane;
  lane?: Lane; entry?: Lane; cutback?: boolean;
  scramble?: boolean; optionChoice?: 'keep'|'pitch'; pitchTiming?: 'early'|'late';
};
export const coachingLane = (y: number): Lane => y < 68 ? -1 : y > 124 ? 1 : 0;
/** Similar controller timing is grouped, not matched to an exact ACTION instant. */
export const coachingTiming = (seconds: number) => Math.min(20, Math.round(seconds / .4));
export function coachObservations(g: FootballGame, offense: Side) {
  return (g.coaching?.observations ?? []).filter(o => o.offense === offense).slice(-24)
    .map(o => ({ o, w: .90 ** Math.max(0, g.plays - o.at) }));
}
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
export function coachingEvidence(g: FootballGame, role: 'offense' | 'defense') {
  // Repetition alone is not a problem. Preserve working CPU calls until the
  // opponent has actually exploited them, just as we do for human advice.
  const rows=coachObservations(g,g.possession).filter(r=>r.w>.25).slice(-10)
    .filter(r=>role==='offense' ? r.o.stopped : r.o.success);
  const keys=rows.map(r=>role==='offense' ? r.o.defense : r.o.play);
  return keys.some(k=>keys.filter(v=>v===k).length>=3);
}
/** No mutation, random draws, current hidden play, target lock, or input access. */
export function defensiveCoachingPlan(g: FootballGame): CoachingPlan | undefined {
  const rows = coachObservations(g, g.possession);
  const patterns = new Map<string, typeof rows>();
  for (const row of rows) {
    const o = row.o;
    const key = o.kind === 'pass' ? `${o.play}:${o.target}:${o.timing}:${o.qbLane}`
      : `${o.play}:${o.entry}:${o.lane}:${o.cutback}:${o.optionChoice}:${o.pitchTiming}`;
    const group = patterns.get(key) ?? []; group.push(row); patterns.set(key, group);
  }
  let best: { score: number; plan: CoachingPlan } | undefined;
  for (const group of patterns.values()) {
    const wins = group.filter(r => r.o.success);
    const n = sum(wins, r => r.w), all = sum(group, r => r.w);
    const explosive = sum(wins.filter(r => r.o.gain >= 20), r => r.w);
    if (wins.length < 3 && !(wins.length >= 2 && explosive >= 1.4)) continue;
    const strength = clamp((n - (explosive >= 1.4 ? 1 : 1.6)) / 2.5, 0, .85) * n / Math.max(1, all);
    if (strength < .08) continue;
    // A delayed outside run can cross the LOS through a central gap. Its
    // observed finish lane still matters; entry alone mislabeled such sweeps
    // as inside runs and mixed opposite-edge patterns in the same group.
    const last = wins.at(-1)!.o, lane = last.kind==='run' ? last.lane ?? last.entry ?? 0 : last.targetLane ?? 0;
    const focus = last.kind === 'run' ? lane ? 'edge' : 'inside'
      : last.depth >= 17 ? 'deep' : last.play === 'slant' || last.play === 'cross' ? 'inside' : 'lane';
    const score = strength * (1 + Math.min(20, last.gain) / 50);
    if (!best || score > best.score) best = { score, plan: { focus, strength,
      lane: last.kind === 'pass' ? last.targetLane ?? 0 : lane, ...(last.timing !== undefined ? { timing:last.timing } : {}),
      ...(last.optionChoice ? {optionChoice:last.optionChoice,pitchTiming:last.pitchTiming} : {}) } };
  }
  return best?.plan;
}
/** Outcome evidence is collected once, after the play; both teams use the same rules. */
export function recordCoaching(g: FootballGame, result: {
  reason: string; spot: number; detail?: string; recovered?: Side;
}, kind: 'run' | 'pass', depth: number) {
  const l = g.live!, offense = l.offense ?? g.possession;
  const gain = result.reason === 'incomplete' || result.reason === 'interception' ? 0
    : (l.turnoverSpot ?? result.spot) - l.snapSpot;
  const turnover = result.reason === 'interception' || result.reason === 'fumble' || !!result.recovered;
  const score = result.reason === 'touchdown';
  const converted = !turnover && result.spot >= g.target;
  const success = !turnover && (score || converted || gain >= Math.max(3, (g.target - l.snapSpot) * (g.down <= 2 ? .45 : 1)));
  const o: CoachingObservation = { at:g.plays,offense,play:l.play,defense:l.defense,kind,depth,
    gain,success,stopped:turnover || result.reason === 'sack' || !success && (gain <= 2 || g.down >= 3),
    sack:result.reason === 'sack',turnover,completed:l.passCaught,...l.coachingSample };
  const observations = [...(g.coaching?.observations ?? []), o].slice(-64);
  g.coaching = { version:1, observations };
}
/** Weighted matchup assessments use only completed plays. Floors keep every CPU option alive. */
export function offensiveCoachWeight(g: FootballGame, id: PlayId, matchup: (p: PlayId, d: Defense) => number) {
  const rows = coachObservations(g,g.possession);
  if (rows.length < 3) return 1;
  const total = sum(rows,r=>r.w);
  const own = rows.filter(r=>r.o.play===id);
  const failures = sum(own.filter(r=>r.o.stopped),r=>r.w);
  const wins = sum(own.filter(r=>r.o.success),r=>r.w);
  const fit = sum(rows,r=>r.w * matchup(id,r.o.defense)) / Math.max(1,total);
  // Observed effectiveness outweighs a merely theoretical counter matchup.
  return clamp(Math.exp(fit * 3 - Math.max(0,failures - 1) * .55 +
    Math.min(1.4,Math.max(0,wins-1)*.45)),.22,3.2);
}
export function defensiveCoachWeight(g: FootballGame, id: Defense, matchup: (p: PlayId, d: Defense) => number) {
  const rows = coachObservations(g,g.possession);
  if (rows.length < 3) return 1;
  const total = sum(rows,r=>r.w), own = rows.filter(r=>r.o.defense===id);
  const exposure = sum(own,r=>r.w);
  const failures = sum(own.filter(r=>r.o.success),r=>r.w);
  const stops = sum(own.filter(r=>r.o.stopped),r=>r.w);
  const fit = sum(rows,r=>r.w * matchup(r.o.play,id)) / Math.max(1,total);
  // Counts penalized frequently used defenses just for having more exposure.
  // Learn an outcome RATE, with modest confidence for small samples. A bounded
  // explosive-gain cost distinguishes a leaky call from conceding ordinary yards.
  const explosive = sum(own,r=>r.w*clamp((r.o.gain-10)/20,0,2));
  const performance = (stops-failures-explosive)/Math.max(1,exposure);
  const confidence = exposure/(exposure+2);
  return clamp(Math.exp(-fit*3*(1-confidence)+performance*confidence*1.4),.22,3.2);
}
/** Human advice is deliberately NOT the CPU's counter-tendency selector. */
export function humanOffenseScore(g: FootballGame, id: PlayId) {
  const rows = coachObservations(g,'home').filter(r=>r.o.play===id);
  const failed = sum(rows.filter(r=>r.o.stopped),r=>r.w);
  const won = sum(rows.filter(r=>r.o.success),r=>r.w);
  return won * .6 - Math.max(0,failed-1) * 1.4;
}
export function humanDefenseScore(g: FootballGame, id: Defense) {
  const rows = coachObservations(g,other('home')).filter(r=>r.o.defense===id);
  const failed = sum(rows.filter(r=>r.o.success),r=>r.w);
  const won = sum(rows.filter(r=>r.o.stopped),r=>r.w);
  return won * .6 - Math.max(0,failed-1) * 1.4;
}
