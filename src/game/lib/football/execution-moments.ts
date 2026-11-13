import { clamp, other, type Athlete, type FootballGame, type LivePlay } from './types';
import { PLAYBOOK } from './playbook';
import { progression } from './passing';
import { franchiseAthleteFactor } from './franchise-upgrades';
import { chaosOpportunity } from './clutch';

/** The old sharp-read opportunity was 6%. A 12% relative increase, not +12pp.
 * Each athlete owns an independent stable draw; neither side forces a failure
 * on the other. No draw consumes the pressure/catch/fumble RNG stream. */
export const MOMENTS = { opportunity: .06 * 1.12, routeLead: 16, routeCut: 5,
  routeSpeed: .22, coverSpeed: .095, coverReaction: .80, coverAcceleration: 1.14,
  sealSpeed: 26, sealSeconds: .42, recognitionLag: .30 } as const;

export const interiorRun = (l: LivePlay) =>
  l.play === 'power' || l.play === 'counter' || l.play === 'draw' || l.play === 'sneak';

export function momentRoll(l: LivePlay, a: Athlete) {
  if (l.executionSeed === undefined) return 1; // Undeclared historical live saves.
  let x = l.executionSeed ^ Math.imul(a.id + 1, 0x9e3779b1);
  x = Math.imul(x ^ x >>> 16, 0x85ebca6b);
  x = Math.imul(x ^ x >>> 13, 0xc2b2ae35);
  return ((x ^ x >>> 16) >>> 0) / 4294967296;
}
function opportunity(g: FootballGame, a: Athlete, ability: number, elite = false) {
  return chaosOpportunity(g, clamp(MOMENTS.opportunity + (ability - .7) * .025 +
    Math.min(.03, Math.max(0, franchiseAthleteFactor(g, a) - 1) * .02) +
    (elite ? .01 : 0), .04, .12), true, .15);
}
/** Rare, per-player snap-stable execution. Never reads future input. */
export function carrierMoment(g: FootballGame, a: Athlete) {
  const l = g.live!;
  return g.clutchActive !== undefined && momentRoll(l, a) < chaosOpportunity(g, MOMENTS.opportunity) &&
    l.time < 4 ? 1.08 : 1;
}
/** Independent rare execution at ACTUAL contact: a sharper cut can help the
 * runner, an exceptional finish can help the tackler. Neither creates contact. */
export function contactEscapeOpportunity(g: FootballGame, runner: Athlete, defender: Athlete, base: number) {
  if (g.clutchActive === undefined) return base;
  const threshold = chaosOpportunity(g, MOMENTS.opportunity);
  const cut = momentRoll(g.live!, runner) < threshold ? 1.2 : 1;
  const finish = momentRoll(g.live!, defender) < threshold ? 1.2 : 1;
  return clamp(base * cut / finish, .02, .4);
}

/** A short, smooth waypoint pulse ends BEFORE the second read. It sharpens the
 * actual designed cut instead of changing the route, highlight or catch odds. */
export function primaryMoment(g: FootballGame, a: Athlete) {
  const l = g.live!, p = PLAYBOOK[l.play];
  if (p.kind !== 'pass' || a.id !== progression({ ...l, time: 0 }).receiver ||
      l.mode !== 'dropback' && l.mode !== 'flight') return 0;
  const ability = g.profiles[g.possession].receivers;
  const chance = opportunity(g, a, ability) * (1 + clamp(l.advantage, -.3, .3) * .45);
  const roll = momentRoll(l, a);
  const upgrade = Math.max(0, franchiseAthleteFactor(g, a) - 1);
  const hesitation = clamp((MOMENTS.opportunity - (ability - .7) * .025) * .72 / (1 + upgrade * .15), .02, .065);
  // A mistimed cut is independent of the defender's draw. It changes physical
  // execution, never the catch lottery; ordinary routes remain the majority.
  const quality = roll < chance ? 1 : l.executionSeed !== undefined && roll > 1 - hesitation ? -.65 : 0;
  if (!quality) return 0;
  const begin = Math.max(.1, p.develop - .65), end = Math.max(.35, p.develop - .25) + .65;
  if (l.time <= begin || l.time >= end || progression(l).index !== 0) return 0;
  return quality * Math.sin(Math.PI * (l.time - begin) / (end - begin)) ** 2 * (.75 + ability * .5);
}
export function momentRoute(a: Athlete, point: { x: number; y: number }, strength: number, opponents: {x:number;y:number}[] = []) {
  const target = { x: Math.min(1110, point.x + MOMENTS.routeLead * (a.role === 'RB' ? .35 : 1) * strength),
    y: clamp(point.y + Math.sign(point.y - a.startY) * MOMENTS.routeCut * strength, 27, 165) };
  if (strength > 0 && opponents.length) {
    const gap = (p: {x:number;y:number}) => Math.min(...opponents.map(d => Math.hypot(d.x-p.x,d.y-p.y)));
    const clear = gap(point);
    // Do not turn a good route into a sprint directly at a visible safety.
    // Keep the designed lane if the extra burst would close useful space;
    // the defender can still move/recover and every catch is still contested.
    if (clear > 18 && gap(target) < clear - 4) return { ...point, x: Math.max(a.x, point.x) };
  }
  return target;
}

/** Read current position/velocity, not the hidden offensive play or primary
 * receiver. Good zone/deep positioning naturally makes this more useful. */
export function coverageMoment(g: FootballGame, d: Athlete, elite: boolean) {
  const l = g.live!;
  if (d.role !== 'DB' && d.role !== 'LB' || l.mode !== 'dropback' && l.mode !== 'flight') return 0;
  const ability = g.profiles[other(g.possession)].coverage;
  const seen = d.pursuit, los = 100 + l.snapSpot * 10;
  const suited = !!seen && (l.defense === 'prevent' ? seen.seenX > los + 100 :
    l.defense === 'pass' ? seen.seenX < los + 110 && Math.abs(seen.seenY - d.startY) < 38 :
    l.defense === 'man' && Math.abs(seen.seenVy) > 18 && seen.seenX < los + 115);
  return momentRoll(l, d) < opportunity(g, d, ability, elite) * (suited ? 1.10 : 1)
    ? .75 + ability * .5 : 0;
}

/** Occasionally continue the old pursuit point a little too long after an
 * OBSERVED break. The draw is independent of the receiver's execution; a good
 * receiver does not force a defender to hesitate. Existing acceleration and
 * collisions still apply, and the same defender cannot repeatedly reroll. */
export function recognizeRouteBreak(g: FootballGame, d: Athlete, elite: boolean) {
  const l = g.live!, seen = d.pursuit;
  if (l.executionSeed === undefined || !seen || d.coverageHesitated || l.time < .28 ||
      l.mode !== 'dropback' || momentRoll(l, d) <= 1 -
        clamp((MOMENTS.opportunity - (g.profiles[other(g.possession)].coverage - .7) * .025) *
          (elite ? .55 : .75), .02, .065)) return;
  const observed = l.athletes.filter(a => a.side === 'offense' && (a.role === 'WR' || a.role === 'TE' || a.role === 'RB'))
    .sort((a,b) => Math.hypot(a.x-seen.seenX,a.y-seen.seenY)-Math.hypot(b.x-seen.seenX,b.y-seen.seenY))[0];
  if (observed && Math.hypot(observed.x-seen.seenX,observed.y-seen.seenY) < 38 &&
      Math.abs(observed.vy-seen.seenVy) > 18) {
    d.coverageHesitated = true;
    seen.until = Math.max(seen.until, l.time + MOMENTS.recognitionLag);
  }
}

/** Small relative blocking improvement, smaller against a prepared front.
 * Protection is explicitly excluded by the caller: no new pressure lottery. */
export function interiorBlockBonus(g: FootballGame, a: Athlete, base: number) {
  const l = g.live!;
  if (l.executionSeed === undefined || !interiorRun(l) || a.role !== 'OL') return 0;
  const prepared = l.defense === 'run' || l.defense === 'goal-line' || l.defense === 'run-blitz';
  return base * (prepared ? .030 : .050 + Math.max(0, l.advantage) * .025) *
    (.8 + g.profiles[g.possession].line * .3);
}
export function canSeal(g: FootballGame, a: Athlete) {
  const l = g.live!;
  return interiorRun(l) && a.role === 'OL' && l.time < PLAYBOOK[l.play].develop + .65 &&
    momentRoll(l, a) < opportunity(g, a, g.profiles[g.possession].line);
}
/** A rare fit improves movement toward an OBSERVED ballcarrier near the line;
 * it cannot choose a future offensive input, cause contact or award a stop. */
export function runFitMoment(g: FootballGame, d: Athlete) {
  const l = g.live!, a = l.athletes[l.carrier]!;
  if (d.role !== 'LB' || l.mode !== 'run' || l.passCaught || a.x > 100 + l.snapSpot * 10 + 35) return 0;
  const prepared = l.defense === 'run' || l.defense === 'goal-line' || l.defense === 'run-blitz';
  return momentRoll(l, d) < opportunity(g, d, g.profiles[other(g.possession)].rush) * (prepared ? 1.10 : 1) ? 1 : 0;
}
