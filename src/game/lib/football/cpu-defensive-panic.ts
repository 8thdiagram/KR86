import {clamp,other,random,type Defense,type FootballGame,type Side} from './types';
import {DEFENSIVE_HOLD_MS,defensivePanicTarget,eligiblePanicDefender,type DefensivePosition,type PanicDefender} from './defensive-panic';

type VisiblePlayer={x:number;y:number;vx?:number;vy?:number};
export type CpuPanicFrame={
  kind:'field'|'turnover'|'kickoff'; defending:Side; defense?:Defense;
  mode:'coverage'|'airborne'|'runner'|'none'; goalX:100|1100; los:number; now:number;
  defenders:PanicDefender[]; carrier:VisiblePlayer; receivers?:readonly VisiblePlayer[];
  blocked?:ReadonlySet<number>;
};
type Decision={
  context:string; status:'waiting'|'rejected'|'pending'|'active'|'released';
  stream:{rng:number}; rolls:number; probability?:number; selectedId?:number;
  startedAt:number; minimum:number; maximum:number; lead:number; lateral:number; close:number;
};
const decisions=new WeakMap<object,Decision>();
const smooth=(x:number)=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
const adjustments:Record<Defense,number>={
  prevent:.15,pass:.05,man:0,run:-.05,blitz:-.15,'run-blitz':-.20,'goal-line':-.05,contain:.05,
};

/** Score/clock strategy only: probabilities of choosing a tool, not stopping a play.
 * 'pass' and 'blitz' are the saved ids for Zone and Man Blitz respectively. */
export function cpuRetreatProbability(g:FootballGame,defending:Side,defense?:Defense,room=300){
  const margin=g.score[defending]-g.score[other(defending)];
  const quarter=g.quarterSeconds??120;
  const remaining=g.overtime?g.clock:Math.max(0,4-g.quarter)*quarter+g.clock;
  const urgency=1-smooth(remaining/(quarter*1.5));
  const lead=margin>0;
  const ordinary=margin===0?.5:lead?.5+.2*smooth(margin/14):.5-.2*smooth(-margin/7);
  const late=lead?.8:.15;
  const baseline=margin===0?ordinary:ordinary+(late-ordinary)*urgency*smooth(Math.abs(margin)/3);
  const goalLineCost=.05*(1-smooth(Math.max(0,room)/150));
  return clamp(baseline+(defense?adjustments[defense]:0)-goalLineCost,.05,.95);
}

/** Fork the established PRNG, rather than advancing the live contest stream.
 * Do not key on frame count, targeted receiver, hidden play or future input. */
function fork(g:FootballGame,kind:CpuPanicFrame['kind']){
  let n=(g.seed^Math.imul(g.plays+1,0x9e3779b9)^
    (kind==='field'?0x43a72:kind==='turnover'?0x91b25:0x5ce19))>>>0;
  n=Math.imul(n^n>>>16,0x7feb352d);
  return {rng:(n^n>>>15)>>>0};
}
const draw=(s:Decision)=>random(s.stream as FootballGame);
function visibleThreat(f:CpuPanicFrame){
  const sign=f.goalX===1100?1:-1;
  const available=f.defenders.filter(d=>eligiblePanicDefender(d,f.now,f.blocked));
  if(!available.length) return false;
  if(f.mode==='runner')
    return sign*(f.carrier.x-f.los)>=55 && available.some(d=>sign*(d.x-f.carrier.x)>-35);
  if(f.mode!=='coverage'&&f.mode!=='airborne') return false;
  const deepest=Math.max(...available.map(d=>sign*d.x));
  return !!f.receivers?.some(r=>sign*(r.x-f.los)>=70 && sign*(r.vx??0)>5 && sign*r.x>=deepest-110);
}
function release(owner:object,s:Decision,f:CpuPanicFrame){
  s.status='released';
  return defensivePanicTarget(owner,false,f.defenders,f.carrier,f.goalX,f.now);
}
/** One weighted opportunity per continuous defensive possession/play context.
 * A rejected or released threat cannot accumulate extra chances every frame. */
export function cpuDefensivePanicTarget(g:FootballGame,owner:object,f:CpuPanicFrame):DefensivePosition|undefined{
  if(f.defending!=='away') return;
  let s=decisions.get(owner);
  const context=`${g.plays}:${f.kind}:${f.defending}`;
  if(!s||s.context!==context){
    defensivePanicTarget(owner,false,f.defenders,f.carrier,f.goalX,f.now);
    s={context,status:'waiting',stream:fork(g,f.kind),rolls:0,startedAt:0,minimum:0,maximum:0,lead:0,lateral:0,close:0};
    decisions.set(owner,s);
  }
  if(g.playResult||g.tackleScene||!['live','kickoff'].includes(g.phase)||f.mode==='none'){
    if(s.status==='active'||s.status==='pending') return release(owner,s,f);
    return;
  }
  if(s.status==='waiting'){
    if(!visibleThreat(f)) return;
    s.probability=cpuRetreatProbability(g,f.defending,f.defense,Math.abs(f.goalX-f.carrier.x));
    s.rolls++;
    if(draw(s)>=s.probability){s.status='rejected';return;}
    s.status='pending';s.startedAt=f.now;
    // Early/useful/late releases, not optimal interception timing. All are
    // destinations/durations; no speed, acceleration or tackle multipliers.
    s.minimum=.18+draw(s)*.25;
    s.maximum=.75+draw(s)*.9;
    s.lead=55+draw(s)*55;s.lateral=25+draw(s)*20;s.close=24+draw(s)*36;
  }
  // A CPU decision cannot bypass the human tool's 180 ms hold threshold.
  // Release timing is measured from noticing the threat, not reset after
  // admission; an already-contained threat may warrant an early release.
  if(s.status==='pending'){
    if(f.now-s.startedAt<DEFENSIVE_HOLD_MS/1000) return;
    if(!visibleThreat(f)) return release(owner,s,f);
    s.status='active';
  }
  if(s.status!=='active') return;
  const coverage=f.mode==='coverage'||f.mode==='airborne';
  const target=defensivePanicTarget(owner,true,f.defenders,f.carrier,f.goalX,f.now,f.blocked,{coverage});
  if(s.selectedId===undefined) s.selectedId=target?.id;
  const d=f.defenders.find(d=>d.id===s!.selectedId);
  // No replacement after a block, dive or disappearance. A committed dive is
  // finished by the original engine; this decision cannot spam another launch.
  if(!target||!d) return release(owner,s,f);
  const age=f.now-s.startedAt,sign=f.goalX===1100?1:-1;
  const threatX=coverage&&f.receivers?.length
    ? Math.max(...f.receivers.map(r=>sign*r.x)):sign*f.carrier.x;
  const contained=sign*d.x-threatX>=s.lead && (coverage||Math.abs(d.y-f.carrier.y)<=s.lateral);
  const inTackleRange=!coverage&&Math.hypot(d.x-f.carrier.x,d.y-f.carrier.y)<=60;
  // Sometimes close normally instead of holding ACTION into an unnecessary
  // maximum-range dive. The sampled distance permits early and late releases.
  const readyToClose=!coverage&&sign*(d.x-f.carrier.x)>8&&
    Math.abs(d.y-f.carrier.y)<s.lateral&&Math.hypot(d.x-f.carrier.x,d.y-f.carrier.y)<s.close;
  if(readyToClose || age>=s.maximum || Math.abs(d.x-f.goalX)<20 ||
      age>=s.minimum&&contained&&!inTackleRange) return release(owner,s,f);
  return target;
}

/** Read-only diagnostics, never attached to the saved game or renderer. */
export function cpuPanicDecision(owner:object){
  const s=decisions.get(owner);
  return s?{status:s.status,rolls:s.rolls,probability:s.probability,selectedId:s.selectedId,
    startedAt:s.startedAt,minimum:s.minimum,maximum:s.maximum,lead:s.lead}:undefined;
}
