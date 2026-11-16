import { KICK_TEAMS } from '../kick-return-teams';
import { clamp, random, type Defense, type FootballGame, type Play, type PlayId, type Profile, type Side } from './types';
import { coachObservations, coachingEvidence, defensiveCoachWeight, offensiveCoachWeight } from './coaching';
import { rankOffensiveMenu, rankDefensiveMenu } from './coaching-menu';
import { effectiveKickRange } from './legendary';

export const PLAYBOOK: Record<PlayId, Play> = {
  power: { id: 'power', name: 'Power run', kind: 'run', formation: 'I', description: 'Lead blocker through an inside gap.', depth: 3, develop: .45, risk: .1 },
  sweep: { id: 'sweep', name: 'Sweep', kind: 'run', formation: 'single-back', description: 'Follow the pulling guard toward the edge.', depth: 5, develop: .65, risk: .16 },
  counter: { id: 'counter', name: 'Counter', kind: 'run', formation: 'I', description: 'Sell one edge, cut inside. Punish an overcommitted blitz.', depth: 5, develop: .8, risk: .18 },
  draw: { id: 'draw', name: 'Draw', kind: 'run', formation: 'shotgun', description: 'Invite pressure, then hand off underneath it.', depth: 4, develop: 1.1, risk: .15 },
  sneak: { id: 'sneak', name: 'QB sneak', kind: 'run', formation: 'goal-line', description: 'A compact surge behind center. Strong inside fronts can stop it.', depth: 1, develop: .08, risk: .08 },
  slant: { id: 'slant', name: 'Quick slant', kind: 'pass', formation: 'under-center', description: 'Quick inside breaks against pressure. Action throws.', depth: 6, develop: .65, risk: .14 },
  screen: { id: 'screen', name: 'Screen', kind: 'pass', formation: 'shotgun', description: 'Let the rush through and release the back behind blockers.', depth: 2, develop: 1.15, risk: .12 },
  out: { id: 'out', name: 'Short out', kind: 'pass', formation: 'pistol', description: 'A timed sideline break; action releases the pass.', depth: 7, develop: .95, risk: .16 },
  cross: { id: 'cross', name: 'Crossing routes', kind: 'pass', formation: 'single-back', description: 'Receivers work across coverage at different depths.', depth: 12, develop: 1.3, risk: .2 },
  post: { id: 'post', name: 'Deep post', kind: 'pass', formation: 'shotgun', description: 'Attack space behind a blitz. Give the post time to clear.', depth: 24, develop: 2.1, risk: .3 },
  verticals: { id: 'verticals', name: 'Four verticals', kind: 'pass', formation: 'shotgun', description: 'Stretch the secondary. Deep timing carries interception risk.', depth: 30, develop: 2.3, risk: .35 },
  'play-action': { id: 'play-action', name: 'Play action', kind: 'pass', formation: 'I', description: 'Sell the run before looking downfield.', depth: 17, develop: 1.7, risk: .25 },
  flood: { id:'flood',name:'Flood',kind:'pass',formation:'shotgun',description:'Three sideline levels: medium out, short flat, deep corner.',depth:13,develop:1.35,risk:.2 },
  'speed-option': { id:'speed-option',name:'Speed option',kind:'run',formation:'pistol',description:'Run outside with the QB. ACTION pitches during the option window; otherwise keep.',depth:5,develop:.45,risk:.17 },
  punt: { id: 'punt', name: 'Punt', kind: 'kick', formation: 'punt', description: 'Trade possession for field position. Action kicks.', depth: 0, develop: .8, risk: 0 },
  'fake-punt': { id: 'fake-punt', name: 'Fake punt', kind: 'run', formation: 'punt', description: 'A disguised, high-risk run. Not a reliable short-yardage substitute.', depth: 4, develop: 1.2, risk: .4 },
  'field-goal': { id: 'field-goal', name: 'Field goal', kind: 'kick', formation: 'goal-line', description: 'Action stops the accuracy meter. Three points in regulation.', depth: 0, develop: .5, risk: 0 },
};
/** Execution identity never changes with the hidden defensive call. */
export const executionPlay = (id: PlayId, _defense: Defense) => PLAYBOOK[id];
/** Qualitative 1986 inspiration; coefficients and ranges are arcade balance, not historical ratings. See TEAM_PROFILES.md. */
export function teamProfile(name: string): Profile {
  const index = Math.max(0, KICK_TEAMS.findIndex(t => t.name === name));
  const archetype = index % 4;
  const base = { identity: ['Ground game', 'Air attack', 'Pressure defense', 'Balanced'][archetype]!,
    run: archetype === 0 ? .68 : archetype === 1 ? .38 : .52,
    line: archetype === 0 ? .78 : .62 + (index % 3) * .035,
    qb: archetype === 1 ? .82 : .64 + (index % 3) * .025,
    receivers: archetype === 1 ? .79 : .64, rush: archetype === 2 ? .82 : .65,
    coverage: archetype === 2 ? .76 : .66, back: archetype === 0 ? .8 : .67,
     kickMax: 49 + index % 7 };
  const inspired: Record<string, Partial<Profile>> = {
    'Big Blue': { identity: 'Power run / pressure', run: .63, line: .79, qb: .76, receivers: .70, rush: .85, coverage: .78, back: .82 },
    Grizzlies: { identity: 'Ground game / strong front', run: .68, line: .8, qb: .62, receivers: .67, rush: .84, coverage: .76, back: .85 },
    Porpoises: { identity: 'Pass-first attack', run: .32, line: .72, qb: .88, receivers: .84, rush: .59, coverage: .63, back: .65 },
    Goldminers: { identity: 'Timing passes / coverage', run: .43, line: .76, qb: .82, receivers: .86, rush: .77, coverage: .84, back: .77 },
  };
  return { ...base, ...inspired[name] };
}
export const fieldGoalDistance = (g: FootballGame) => Math.ceil(100 - g.spot + 17);
export const fieldGoalAllowed = (g: FootballGame) => !g.overtime && fieldGoalDistance(g) <= effectiveKickRange(g);
export const distanceToGo = (g: FootballGame) => Math.max(.1, g.target - g.spot);
export const DEFENSES: { id: Defense; name: string; description: string }[] = [
  { id: 'run', name: 'Run defense', description: 'Crowd inside gaps; fewer deep coverage resources.' },
  { id: 'pass', name: 'Zone coverage', description: 'Defenders guard areas; strong on deep routes, soft against crossers and underneath throws.' },
  { id: 'man', name: 'Man coverage', description: 'Each defender sticks to a receiver; tight on quick routes, vulnerable to runs, draws and scrambles.' },
  { id: 'blitz', name: 'Man blitz', description: 'Extra rushers with man coverage behind; fast pressure, but screens, draws and quick breaks can burn it.' },
  { id: 'run-blitz', name: 'Run blitz', description: 'Linebackers crash the line; stuffs runs, but passes and counters get open.' },
  { id: 'prevent', name: 'Prevent defense', description: 'Keep everything in front; concede underneath room.' },
  { id: 'goal-line', name: 'Goal Line Defense', description: 'Seal inside gaps near the goal. Risk outside runs and quick passes.' },
  { id:'contain',name:'Contain defense',description:'Set the edges and spy the quarterback. Leaves room for inside runs and underneath routes.' },
];
export const goalLineAvailable = (g: FootballGame) => g.spot > 95 && g.spot < 100;
export const defensiveChoices = (g: FootballGame) => DEFENSES.filter(d => d.id !== 'goal-line' || goalLineAvailable(g));
/** Presentation-only four-card menu. Keep historical/CPU call admission intact. */
export function defensiveMenuChoices(g: FootballGame) {
  return rankDefensiveMenu(g,defensiveChoices(g),matchupAdvantage);
}
/** Legal admission is distinct from the compact recommendation window. */
export function eligibleOffensivePlays(g:FootballGame):Play[] {
  return Object.values(PLAYBOOK).filter(p=>p.id==='field-goal' ? fieldGoalAllowed(g)&&
    (g.down===4||((g.quarter===2||g.quarter>=4)&&g.clock<20)) :
    p.id==='punt'||p.id==='fake-punt' ? g.down===4 : true);
}
export function offensiveMenuChoices(g:FootballGame):Play[] {
  return rankOffensiveMenu(g,eligibleOffensivePlays(g),matchupAdvantage);
}
/** Exactly six unique legal choices; always a conventional run and pass. */
export function offensiveChoices(g: FootballGame): Play[] {
  return offensiveMenuChoices(g).slice(0,6);
}
/** Matchups change assignments and leverage, never choose a precomputed yardage result. */
export function matchupAdvantage(play: PlayId, defense: Defense) {
  if(defense==='contain') return ({power:.13,draw:.16,counter:.12,sneak:.1,slant:.1,cross:.12,
    screen:.06,out:-.04,post:.02,verticals:.04,'play-action':.06,sweep:-.16,'speed-option':-.2,flood:.04} as Partial<Record<PlayId,number>>)[play]??0;
  if(play==='flood') return ({run:.12,pass:.16,man:-.14,blitz:-.16,'run-blitz':-.08,prevent:.14,'goal-line':.08} as Partial<Record<Defense,number>>)[defense]??0;
  if(play==='speed-option') return ({run:.01,pass:.08,man:.12,blitz:.14,'run-blitz':.08,prevent:.1,'goal-line':.04} as Partial<Record<Defense,number>>)[defense]??0;
  if (defense === 'goal-line') return ({
    sneak: -.34, power: -.32, draw: -.18, counter: -.32, sweep: .24,
    slant: .24, screen: .18, out: .24, cross: .18, post: .12,
    verticals: .14, 'play-action': .34, 'fake-punt': -.3,
  } as Partial<Record<PlayId, number>>)[play] ?? 0;
  const table: Record<string, Partial<Record<Defense, number>>> = {
    power: { run: -.23, pass: .12, man: .1, blitz: -.12, 'run-blitz': -.3, prevent: .2 },
    sneak: { run: -.16, pass: .12, man: .08, blitz: -.12, 'run-blitz': -.24, prevent: .17 },
    sweep: { run: -.12, pass: .1, man: .14, blitz: .0, 'run-blitz': .06, prevent: .16 },
    draw: { run: -.2, pass: .08, man: .12, blitz: .22, 'run-blitz': -.12, prevent: .12 },
    counter: { run: -.23, pass: .12, man: .1, blitz: .19, 'run-blitz': .14, prevent: .2 },
    slant: { run: .13, pass: -.12, man: -.08, blitz: .17, 'run-blitz': .22, prevent: .16 },
    screen: { run: .04, pass: -.12, man: .1, blitz: .24, 'run-blitz': .2, prevent: .18 },
    out: { run: .1, pass: -.12, man: -.14, blitz: .04, 'run-blitz': .2, prevent: .16 },
    cross: { run: .15, pass: -.12, man: .0, blitz: -.15, 'run-blitz': .18, prevent: .08 },
    post: { run: .2, pass: -.13, man: -.1, blitz: .12, 'run-blitz': .22, prevent: -.27 },
    verticals: { run: .15, pass: -.18, man: -.12, blitz: .09, 'run-blitz': .2, prevent: -.32 },
    'play-action': { run: .27, pass: -.12, man: .08, blitz: -.23, 'run-blitz': .22, prevent: -.15 },
    'fake-punt': { run: -.3, pass: -.16, man: -.2, blitz: -.25, 'run-blitz': -.3, prevent: .12 },
  };
  return table[play]?.[defense] ?? 0;
}
/** Only past calls influence CPU reads, not this down's hidden selection or input. */
export function cpuDefense(g: FootballGame): Defense {
  if (coachingEvidence(g,'defense')) {
    return coachPick(g,defensiveCoachingWeights(g));
  }
  return situationalDefense(g,defensiveRunRate(g),random(g));
}
function defensiveRunRate(g: FootballGame) {
  if(g.possession==='home') return (g.playerRuns+2)/(g.playerRuns+g.playerPasses+4);
  const rows=coachObservations(g,g.possession);
  const runs=rows.reduce((n,r)=>n+(r.o.kind==='run' ? r.w : 0),0);
  return (runs+2)/(rows.reduce((n,r)=>n+r.w,0)+4);
}
/** The established situational selector, factored without changing its cold-game draw. */
function situationalDefense(g: FootballGame, runRate: number, r: number): Defense {
  if (goalLineAvailable(g) && r < clamp(.14 + runRate * .4 +
      (distanceToGo(g) <= 1.5 ? .12 : 0) + (g.down >= 3 ? .08 : 0), .2, .72)) return 'goal-line';
  if (g.target - g.spot <= 1.5 && r < .52) return 'run';
  if (g.quarter >= 4 && g.clock < 40 &&
      g.score[g.possession==='home' ? 'away' : 'home'] > g.score[g.possession] &&
      g.target - g.spot > 5) return r < .65 ? 'prevent' : 'pass';
  if (r < .14) return 'blitz';
  if (r < .22) return runRate >= .5 ? 'run-blitz' : 'blitz';
  return r < .22 + runRate * .55 ? 'run' : Math.floor(r * 100) % 3 === 0 ? 'man' : 'pass';
}
/** Exact probability mass of the old selector, not a new uniform prior.
 * Percent boundaries cover the legacy man/zone split; the extra boundaries
 * preserve short-yardage, goal-line and late-game decisions exactly. */
export function defensiveCallPriors(g: FootballGame) {
  const runRate=defensiveRunRate(g);
  const cuts=[...new Set([...Array.from({length:101},(_,i)=>i/100),
    .14,.22,.52,.65,.22+runRate*.55,
    clamp(.14+runRate*.4+(distanceToGo(g)<=1.5 ? .12 : 0)+(g.down>=3 ? .08 : 0),.2,.72)])].sort((a,b)=>a-b);
  const priors=defensiveChoices(g).map(d=>({id:d.id,weight:0}));
  for(let i=1;i<cuts.length;i++) {
    const lo=cuts[i-1]!,hi=cuts[i]!;
    const id=situationalDefense(g,runRate,(lo+hi)/2);
    priors.find(d=>d.id===id)!.weight+=hi-lo;
  }
  const outside=coachObservations(g,g.possession).filter(r=>r.o.success&&
    (r.o.play==='sweep'||r.o.play==='speed-option'||r.o.scramble));
  if(outside.length>=3) {
    const share=clamp(outside.reduce((n,r)=>n+r.w,0)*.06,0,.28);
    priors.forEach(p=>{p.weight=p.id==='contain' ? share : p.weight*(1-share);});
  }
  return priors;
}
/** Small exploration retains legal alternatives; learning reweights the
 * established football situation instead of discarding it after three gains. */
export function defensiveCoachingWeights(g: FootballGame) {
  const priors=defensiveCallPriors(g);
  return priors.map(p=>({id:p.id,weight:
    (.94*p.weight+.06/priors.length)*defensiveCoachWeight(g,p.id,matchupAdvantage)}));
}
export function cpuPlay(g: FootballGame, side: Side = g.possession): PlayId {
  const choices = offensiveChoices(g);
  if (g.down === 4) {
    if (fieldGoalAllowed(g) && (g.spot > 65 || g.clock < 20)) return 'field-goal';
    const desperate = g.quarter >= 4 && g.clock < 80 && g.score[side] < g.score[side === 'home' ? 'away' : 'home'];
    if (!desperate && distanceToGo(g) > 2 && random(g) < .86) return 'punt';
    if (!desperate && distanceToGo(g) <= 3 && random(g) < .06) return 'fake-punt';
  }
  const trailing = g.score[side] < g.score[side === 'home' ? 'away' : 'home'];
  let runWeight = g.profiles[side].run + (distanceToGo(g) <= 1.5 ? .22 : 0);
  if (g.quarter >= 4 && g.clock < 60) runWeight += trailing ? -.33 : .17;
  if (coachingEvidence(g,'offense')) {
    // CPU counters can use existing ordinary concepts, without replacing human cards.
    const ids=eligibleOffensivePlays(g).filter(p=>p.kind!=='kick'&&p.id!=='fake-punt').map(p=>p.id);
    const runs=ids.filter(id=>PLAYBOOK[id].kind==='run').length, passes=ids.length-runs;
    return coachPick(g,ids.map(id=>({id,weight:
      (PLAYBOOK[id].kind==='run' ? clamp(runWeight,.15,.86)/runs : (1-clamp(runWeight,.15,.86))/passes) *
      offensiveCoachWeight(g,id,matchupAdvantage)})));
  }
  const kind = random(g) < clamp(runWeight, .15, .86) ? 'run' : 'pass';
  let pool = choices.filter(p => p.kind === kind && p.id !== 'fake-punt');
  if (!pool.length) pool = choices.filter(p => p.kind !== 'kick');
  if (distanceToGo(g) <= 1.5 && pool.some(p => p.id === 'sneak') && random(g) < .6) return 'sneak';
  const last=coachObservations(g,g.possession).at(-1)?.o;
  const fresh = last?.success ? pool : pool.filter(p => p.id !== g.cpuLast.at(-1));
  const selected = fresh.length && random(g) < .7 ? fresh : pool;
  const calls = g.defensiveCalls;
  const count = Object.values(calls).reduce((a, b) => a + b, 0);
  if (count >= 3 && random(g) < .6) {
    const tendency = (Object.keys(calls) as Defense[]).sort((a, b) => calls[b] - calls[a])[0]!;
    const weighted = selected.map(p => ({ id: p.id, weight: Math.max(.2, 1 + matchupAdvantage(p.id, tendency) * 2) }));
    let roll = random(g) * weighted.reduce((sum, p) => sum + p.weight, 0);
    for (const p of weighted) { roll -= p.weight; if (roll <= 0) return p.id; }
  }
  return selected[Math.floor(random(g) * selected.length)]!.id;
}
function coachPick<T extends string>(g: FootballGame, choices: {id:T;weight:number}[]): T {
  let roll=random(g)*choices.reduce((n,p)=>n+p.weight,0);
  for(const p of choices) { roll-=p.weight; if(roll<=0) return p.id; }
  return choices.at(-1)!.id;
}
