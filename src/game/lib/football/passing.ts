import { PLAYBOOK } from './playbook';
import { clamp, random, type Athlete, type FootballGame, type LivePlay, type PassType, type PlayId } from './types';
import { eligibleReceivers } from './coverage';
import { observeCoachingThrow } from './coaching-execution';
import { passProjection, safeCompletionScore } from './passing-safety';
import { throwAccuracy } from './passing-accuracy';

/** Passing-only timing. Original evasion/hold thresholds remain untouched. */
export const PASS_HOLD_MS = 220;
export const QB_SCRAMBLE_MS = 1000;
const READS: Partial<Record<PlayId, number[]>> = {
  slant: [7, 10, 8], screen: [6, 10, 7], out: [8, 7, 10], cross: [8, 10, 9],
  post: [7, 9, 10], verticals: [7, 9, 8], 'play-action': [10, 7, 9],
};
export function progression(l: LivePlay) {
  // Older in-progress 11-player saves finish their current play unchanged.
  const sevenReads: Partial<Record<PlayId, number[]>> = {
    slant: [3, 4, 6], screen: [6, 4, 3], out: [3, 6, 4], cross: [3, 4, 6], flood:[3,6,4],
    post: [3, 4, 6], verticals: l.athletes[2]?.route === 1 ? [3, 4, 6, 2] : [3, 4, 6], 'play-action': [4, 3, 6],
  };
  const reads = l.athletes.length === 14 ? sevenReads[l.play] ?? [3, 4, 6] : READS[l.play] ?? [7, 8, 10];
  const first = Math.max(.35, PLAYBOOK[l.play].develop - .25), window = .65;
  const index = clamp(Math.floor((l.time - first) / window), 0, reads.length - 1);
  return { receiver: reads[index]!, index, expires: first + reads.length * window };
}
export function canForwardPass(l: LivePlay) {
  return (l.mode === 'dropback' || l.mode === 'scramble') && !l.crossedLos &&
    l.carrier === 5 && (l.fieldFrame === -1 ? 1200 - l.athletes[5]!.x : l.athletes[5]!.x) < 100 + l.snapSpot * 10;
}
/** A pending gesture owns its highlight; otherwise show only an active read. */
export function highlightedReceiver(l: LivePlay) {
  if (!canForwardPass(l) || l.mode !== 'dropback') return undefined;
  if (l.holdingPass) return l.lockedReceiver;
  const read = progression(l);
  return l.time < read.expires ? read.receiver : undefined;
}
function opportunity(g: FootballGame, a: Athlete, type: PassType) {
  const delivery = throwAccuracy(g, a, type);
  return { a, ...delivery, merit: safeCompletionScore(g.live!, a, type, delivery.accuracy) };
}
export function releasePass(g: FootballGame, type: PassType = 'normal', locked?: number) {
  const l = g.live!;
  if (!canForwardPass(l)) { l.holdingPass = false; l.lockedReceiver = undefined; return; }
  const qb = l.athletes[5]!;
  const receivers = eligibleReceivers(l);
  // Never re-read progression or rank alternatives for a selected human target.
  // A gesture that began without a highlight keeps the existing safety selection.
  const target = g.possession === 'home'
    ? l.mode === 'dropback' ? l.holdingPass ? l.lockedReceiver : highlightedReceiver(l) : undefined
    : locked;
  const selected = receivers.find(a => a.id === target);
  const chosen = target !== undefined
    ? selected && { a: selected, ...throwAccuracy(g, selected, type) }
    : receivers.map(a => opportunity(g, a, type)).sort((a, b) => b.merit - a.merit)[0];
  if (!chosen) { l.holdingPass = false; l.lockedReceiver = undefined; return; }
  const { a, accuracy, spreadX, spreadY } = chosen;
  observeCoachingThrow(l,a);
  const { duration, x: aimX, y: aimY } = passProjection(l, a, type);
  l.flight = { type, contested: [], fromX: qb.x, fromY: qb.y, x: qb.x, y: qb.y, z: 4,
    toX: clamp(a.x + a.vx * duration * .7 + (random(g) - .5) * spreadX, 30, 1115),
    toY: clamp(a.y + a.vy * duration * .65 + (random(g) - .5) * spreadY, 20, 172),
    age: 0, duration, receiver: a.id, accuracy, aimX, aimY };
  l.mode = 'flight'; l.holdingPass = false; l.lockedReceiver = undefined;
  g.stats[g.possession].attempts++;
}
/** Deterministic scramble drill: respond to coverage, QB pressure, lanes and teammate spacing. */
export function scramblePoint(l: LivePlay, a: Athlete) {
  if (a.scrambleTarget && a.scrambleTarget.until > l.time) return a.scrambleTarget;
  const qb = l.athletes[5]!, defenders = l.athletes.filter(d => d.side === 'defense');
  const los = 100 + l.snapSpot * 10;
  // A genuinely beaten deep secondary stays a legitimate downfield opportunity.
  const beatenDeep = PLAYBOOK[l.play].depth >= 24 && a.x > los + 140 &&
    defenders.every(d => d.x < a.x - 12 || Math.abs(d.y - a.y) > 38);
  if (beatenDeep) return a.scrambleTarget = {
    x: Math.min(1108, a.x + 65), y: clamp(a.y, 28, 164), until: l.time + .7,
  };
  const band = [34, 63, 132, 160, 96][a.role === 'RB' ? 4 : a.route]!;
  const points = [
    { x: Math.max(qb.x + 45, a.x - 55), y: a.y },
    { x: Math.max(qb.x + 45, a.x - 45), y: a.y + (a.y < 96 ? 24 : -24) },
    { x: Math.max(qb.x + 45, a.x - 55), y: band },
    { x: a.x + 60, y: band },
    { x: a.x + 18, y: a.y < 96 ? 30 : 162 },
    { x: a.x - 15, y: a.y < 96 ? 114 : 76 },
  ].map(p => ({ x: clamp(p.x, qb.x + 20, 1108), y: clamp(p.y, 28, 164) }));
  const score = (p: { x: number; y: number }) => {
    const gap = Math.min(...defenders.map(d => Math.hypot(d.x - p.x, d.y - p.y)));
    const crowd = l.athletes.filter(w => w.side === 'offense' && w.id !== a.id && w.role !== 'OL')
      .reduce((n, w) => n + Math.max(0, 35 - Math.hypot(w.x - p.x, w.y - p.y)), 0);
    const lane = defenders.reduce((risk, d) => {
      const dx = p.x - qb.x, dy = p.y - qb.y, length = dx * dx + dy * dy;
      const t = clamp(((d.x - qb.x) * dx + (d.y - qb.y) * dy) / Math.max(1, length), 0, 1);
      return risk + Math.max(0, 18 - Math.hypot(d.x - qb.x - dx * t, d.y - qb.y - dy * t));
    }, 0);
    const blocked = defenders.some(d => {
      const dx = p.x - a.x, dy = p.y - a.y;
      const t = clamp(((d.x - a.x) * dx + (d.y - a.y) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1);
      return Math.hypot(d.x - a.x - dx * t, d.y - a.y - dy * t) < 12;
    });
    const continuity = a.scrambleTarget && Math.hypot(p.x - a.scrambleTarget.x, p.y - a.scrambleTarget.y) < 28 ? 10 : 0;
    return Math.min(90, gap) - crowd * .8 - lane * .65 - (blocked ? 35 : 0) + continuity -
      Math.hypot(p.x - a.x, p.y - a.y) * .12 - Math.hypot(p.x - qb.x, p.y - qb.y) * .18;
  };
  const best = points.sort((a, b) => score(b) - score(a))[0]!;
  return a.scrambleTarget = { ...best, until: l.time + .7 };
}
