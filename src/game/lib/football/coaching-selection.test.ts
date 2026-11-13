import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { defensiveCallPriors, defensiveCoachingWeights, cpuDefense, offensiveChoices, defensiveChoices } from './playbook';
import type { CoachingObservation } from './coaching';
import { defensiveCoachWeight, defensiveCoachingPlan } from './coaching';
import { random } from './types';

function runHeavy() {
  const g=createFootball(1986,{player:'Goldminers',opponent:'Porpoises'});
  Object.assign(g,{phase:'play-call',spot:30,target:40,down:1,playerRuns:20,playerPasses:0,plays:20});
  return g;
}
test('adaptive defense retains the exact run-aware situational probability mass',()=>{
  const g=runHeavy(), priors=defensiveCallPriors(g);
  const runRate=22/24;
  assert(Math.abs(priors.reduce((n,p)=>n+p.weight,0)-1)<1e-12);
  assert(Math.abs(priors.find(p=>p.id==='run')!.weight-.55*runRate)<1e-12);
  assert(Math.abs(priors.find(p=>p.id==='blitz')!.weight-.14)<1e-12);
  assert(Math.abs(priors.find(p=>p.id==='run-blitz')!.weight-.08)<1e-12);
  assert.equal(priors.find(p=>p.id==='prevent')!.weight,0);
});
test('short-yardage, goal-line and late-game priors preserve their real situational branches',()=>{
  const g=runHeavy();g.target=31;
  assert(defensiveCallPriors(g).find(p=>p.id==='run')!.weight>=.52);
  g.spot=97;g.target=100;
  assert(defensiveCallPriors(g).find(p=>p.id==='goal-line')!.weight>0);
  g.spot=30;g.target=40;g.quarter=4;g.clock=20;g.score.away=7;
  const p=defensiveCallPriors(g);
  assert(Math.abs(p.find(p=>p.id==='prevent')!.weight-.65)<1e-12);
  assert(Math.abs(p.find(p=>p.id==='pass')!.weight-.35)<1e-12);
  assert.equal(p.find(p=>p.id==='run')!.weight,0);
});
test('turning coaching on cannot replace a working run-aware prior with a flat distribution',()=>{
  const g=runHeavy();
  const observations:CoachingObservation[]=Array.from({length:5},(_,i)=>({
    at:16+i,offense:'home',play:'sweep',defense:'pass',kind:'run',depth:5,gain:12,
    success:true,stopped:false,sack:false,turnover:false,completed:false,entry:-1,lane:-1,
  }));
  g.coaching={version:1,observations};
  const weights=defensiveCoachingWeights(g), run=weights.find(p=>p.id==='run')!.weight;
  assert(run>weights.find(p=>p.id==='pass')!.weight);
  assert(run>weights.find(p=>p.id==='run-blitz')!.weight);
  assert(weights.every(p=>p.weight>0),'no permanent blacklist, including a normally unused call');
});
test('probability diagnostics do not draw RNG, inspect current hidden calls, or alter human choices',()=>{
  const g=runHeavy(), copy=structuredClone(g);
  copy.pendingSnap={play:'sweep',defense:'run-blitz',remaining:.16};
  const rng=g.rng;
  assert.deepEqual(defensiveCallPriors(g),defensiveCallPriors(copy));
  assert.deepEqual(defensiveCoachingWeights(g),defensiveCoachingWeights(copy));
  assert.equal(g.rng,rng);
  assert.deepEqual(offensiveChoices(g),offensiveChoices(copy));
  assert.deepEqual(defensiveChoices(g),defensiveChoices(copy));
});
test('a neutral home-defense draw still matches the established selector exactly',()=>{
  const g=runHeavy(), priors=defensiveCallPriors(g), reference=structuredClone(g);
  const counts=new Map<string,number>();
  for(let i=0;i<2000;i++) {
    const r=random(reference), runRate=22/24;
    const expected=r<.14 ? 'blitz' : r<.22 ? 'run-blitz' :
      r<.22+runRate*.55 ? 'run' : Math.floor(r*100)%3===0 ? 'man' : 'pass';
    const id=cpuDefense(g);assert.equal(id,expected);
    assert.equal(g.rng,reference.rng,'exactly one legacy draw, not extra random sampling');
    counts.set(id,(counts.get(id)??0)+1);
  }
  assert(counts.get('run')!>850);
  for(const p of priors) if(p.weight===0) assert.equal(counts.get(p.id)??0,0);
});
test('equal defensive outcome rates do not acquire a cumulative exposure penalty',()=>{
  const few=runHeavy();
  const rows:CoachingObservation[]=Array.from({length:5},(_,i)=>({
    at:few.plays,offense:'home',play:'sweep',defense:'run',kind:'run',depth:5,
    gain:i<3 ? 5 : 0,success:i<3,stopped:i>=3,sack:false,turnover:false,completed:false,
  }));
  few.coaching={version:1,observations:rows};
  const many=structuredClone(few);many.coaching!.observations=[...rows,...rows,...rows,...rows];
  const sparse=defensiveCoachWeight(few,'run',()=>0), frequent=defensiveCoachWeight(many,'run',()=>0);
  assert(frequent/sparse>.9,'same rate stays comparable; only confidence grows with exposure');
});
test('an observed explosive leak matters more than ordinary gains, without blacklisting the call',()=>{
  const ordinary=runHeavy();
  ordinary.coaching={version:1,observations:Array.from({length:5},()=>({
    at:ordinary.plays,offense:'home',play:'sweep',defense:'run-blitz',kind:'run',depth:5,
    gain:5,success:true,stopped:false,sack:false,turnover:false,completed:false,
  }))};
  const leaky=structuredClone(ordinary);leaky.coaching!.observations.forEach(o=>{o.gain=50;});
  const leakWeight=defensiveCoachWeight(leaky,'run-blitz',()=>0);
  assert(leakWeight<defensiveCoachWeight(ordinary,'run-blitz',()=>0));
  assert(leakWeight>0);
});
test('a delayed outside finish is not mistaken for an inside run just because entry was central',()=>{
  for(const lane of [-1,1] as const) {
    const g=runHeavy();
    g.coaching={version:1,observations:Array.from({length:5},()=>({
      at:g.plays,offense:'home',play:'sweep',defense:'run',kind:'run',depth:5,
      gain:12,success:true,stopped:false,sack:false,turnover:false,completed:false,entry:0,lane,
    }))};
    const plan=defensiveCoachingPlan(g);
    assert.equal(plan?.focus,'edge');assert.equal(plan?.lane,lane);
    g.coaching.observations.forEach(o=>{o.lane=0;});
    assert.equal(defensiveCoachingPlan(g)?.focus,'inside');
  }
});
