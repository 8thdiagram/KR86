import { kickSeed } from '../kick-return-engine';
import { clamp, type Athlete, type FootballGame, type LivePlay } from './types';
import { coachingLane, coachingTiming, defensiveCoachingPlan, type CoachingSample } from './coaching';

/** Freeze the between-play assessment. No history scans on animation frames. */
export function prepareCoaching(g: FootballGame, l: LivePlay) {
  const p = defensiveCoachingPlan(g);
  if (!p) return;
  l.coachingPlan=p;
  const los = 100 + l.snapSpot * 10;
  for (const d of l.athletes.filter(a=>a.side==='defense')) {
    let dx=0,dy=0;
    if (d.role==='DB' && p.focus==='deep') dx=18*p.strength;
    else if (d.role==='DB' && (p.focus==='inside' || p.focus==='lane') && l.defense!=='prevent') {
      dx=-10*p.strength;
      dy=(p.focus==='inside' ? 96-d.y : p.lane*40+96-d.y)*.09*p.strength;
    } else if (d.role==='LB' && p.focus==='edge') dy=p.lane*14*p.strength;
    else if (d.role==='LB' && p.focus==='inside' && l.defense!=='blitz' && l.defense!=='run-blitz') dy=(96-d.y)*.08*p.strength;
    if (l.defense==='goal-line') dx=clamp(dx,-3,3);
    // Real pre-snap alignments, never in-play teleports or attribute changes.
    d.x=d.startX=clamp(d.x+dx,los+3,1110); d.y=d.startY=clamp(d.y+dy,25,167);
  }
}
/** Keep every chosen defense's identity and stop coverage immediately at LOS crossing. */
export function coachingAssignment(g: FootballGame,d: Athlete,x: number,y: number,role: NonNullable<Athlete['pursuit']>['role']) {
  const l=g.live!, p=l.coachingPlan;
  if (!p || l.carrierCrossedLos || l.crossedLos || l.mode==='return' || l.mode==='flight') return {x,y,variation:1};
  const jitter=kickSeed(`${l.executionSeed}:${d.id}:coach`) / 4294967296-.5;
  const strength=p.strength, cover=role==='cover' || role==='deep';
  if (cover && d.role==='DB') {
    if (p.focus==='deep') x+=22*strength;
    else if (l.defense!=='prevent') {
      const recognition=p.timing===undefined ? 1 : clamp(l.time/(p.timing*.4+.1),.25,1);
      x-=14*strength*recognition;
      y+=(p.focus==='inside' ? 96-y : p.lane*40+96-y)*.12*strength;
    }
    y+=jitter*3*strength;
  } else if (d.role==='LB' && p.focus==='edge' && role==='contain') y+=p.lane*12*strength;
  return {x:clamp(x,8,1180),y:clamp(y,25,167),variation:1+jitter*.08*strength};
}
export function observeCoachingRun(l: LivePlay) {
  if (l.mode!=='run' && l.mode!=='scramble') return;
  const a=l.athletes[l.carrier]!;
  const sample: CoachingSample=l.coachingSample ??= {};
  if(l.mode==='scramble') sample.scramble=true;
  sample.lane=coachingLane(a.y);
  if (sample.entry===undefined && a.x>=100+l.snapSpot*10) sample.entry=sample.lane;
  if (sample.entry!==undefined && sample.entry!==0 && sample.lane!==0 && sample.entry!==sample.lane) sample.cutback=true;
}
/** Store an observable released throw, never a held or hidden target selection. */
export function observeCoachingThrow(l: LivePlay,target: Athlete) {
  l.coachingSample={...l.coachingSample,target:target.id,targetLane:coachingLane(target.y),
    timing:coachingTiming(l.time),qbLane:coachingLane(l.athletes[5]!.y)};
}
/** A CPU may wait for the next EXISTING read. No early progression or new target lock. */
export function cpuReadOpen(l: LivePlay,receiver: number) {
  const a=l.athletes[receiver];
  if (!a) return false;
  const separation=Math.min(...l.athletes.filter(d=>d.side==='defense').map(d=>Math.hypot(d.x-a.x,d.y-a.y)));
  return separation>=18 || l.pressure>1.2 && separation>=12;
}
