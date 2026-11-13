import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, stepFootball } from './engine';
import { startField } from './field';
import { coachingAdvice } from './coaching-advice';
import { coachingLane, coachingTiming, coachObservations, coachingEvidence, defensiveCoachingPlan, offensiveCoachWeight,
  defensiveCoachWeight, humanOffenseScore, humanDefenseScore, recordCoaching, type CoachingObservation } from './coaching';
import { coachingAssignment, cpuReadOpen } from './coaching-execution';
import { cpuDefense, cpuPlay, offensiveChoices, eligibleOffensivePlays, defensiveChoices, PLAYBOOK, matchupAdvantage } from './playbook';
import { isFootballGame } from './storage';
import { progression } from './passing';
import type { Defense, FootballGame, PlayId } from './types';

const game=()=>createFootball(1986,{player:'Goldminers',opponent:'Porpoises'});
function evidence(g: FootballGame, patch: Partial<CoachingObservation>, count=5) {
  g.coaching ??= {version:1,observations:[]};
  for(let i=0;i<count;i++) g.coaching.observations.push({at:++g.plays,offense:g.possession,
    play:'slant',defense:'blitz',kind:'pass',depth:6,gain:12,success:true,stopped:false,
    sack:false,turnover:false,completed:true,target:3,targetLane:-1,timing:3,qbLane:0,...patch});
}
test('timing/lane windows group similar human movements without exact-input matching',()=>{
  assert.equal(coachingTiming(1.15),coachingTiming(1.25));
  assert.deepEqual([30,96,160].map(coachingLane),[-1,0,1]);
});
test('one ordinary result does not trigger a response; repeated successes do, symmetrically',()=>{
  for(const offense of ['home','away'] as const) {
    const g=game(); g.possession=offense;
    evidence(g,{},1); assert.equal(defensiveCoachingPlan(g),undefined);
    evidence(g,{},1); assert.equal(defensiveCoachingPlan(g),undefined);
    evidence(g,{},1); assert.equal(defensiveCoachingPlan(g)?.focus,'inside');
    assert(defensiveCoachingPlan(g)!.strength>0 && defensiveCoachingPlan(g)!.strength<=.85);
  }
});
test('separate coaches recognize sweep, deep throws and renewed counter-tendencies',()=>{
  const g=game(); evidence(g,{play:'sweep',kind:'run',depth:5,lane:-1,entry:-1});
  assert.equal(defensiveCoachingPlan(g)?.focus,'edge');
  const old=defensiveCoachingPlan(g)!.strength;
  evidence(g,{play:'post',depth:24,targetLane:1,timing:5},8);
  assert.equal(defensiveCoachingPlan(g)?.focus,'deep');
  assert(old>0);
  g.possession='away'; assert.equal(defensiveCoachingPlan(g),undefined);
  evidence(g,{play:'power',kind:'run',depth:3,lane:0,entry:0});
  assert.equal(defensiveCoachingPlan(g)?.focus,'inside');
  g.possession='home'; assert.equal(defensiveCoachingPlan(g)?.focus,'deep');
});
test('recommendations may change while the full legal playbook stays available',()=>{
  const g=game(), original=offensiveChoices(g).map(p=>p.id), defenses=defensiveChoices(g).map(d=>d.id);
  evidence(g,{play:'slant'},9);
  // Keep the same normal per-down rotation: advice, not learning, owns the indicator.
  const neutral={...g,coaching:undefined};
  assert.equal(offensiveChoices(g).length,6);
  assert(offensiveChoices(g).some(p=>p.id==='slant'));
  for(const p of original) assert(PLAYBOOK[p]);
  assert.deepEqual(defensiveChoices(g).map(d=>d.id),defenses);
  evidence(g,{gain:0,success:false,stopped:true},6);
  assert.equal(offensiveChoices(g).length,6);
  assert.deepEqual(eligibleOffensivePlays(g),eligibleOffensivePlays(neutral));
});
test('successful human offense stays recommended; only repeated stops lower its priority',()=>{
  const g=game(); evidence(g,{play:'power',kind:'run',target:undefined,timing:undefined,depth:3,gain:8});
  assert.equal(coachingAdvice(g),'power'); assert(humanOffenseScore(g,'power')>0);
  evidence(g,{play:'power',kind:'run',depth:3,gain:0,success:false,stopped:true},8);
  assert(humanOffenseScore(g,'power')<0); assert.notEqual(coachingAdvice(g),'power');
  assert(eligibleOffensivePlays(g).some(p=>p.id==='power'));
});
test('successful human blitz stays recommended until screens repeatedly exploit it',()=>{
  const g=game(); g.possession='away';
  evidence(g,{success:false,stopped:true,sack:true,completed:false,gain:-5});
  assert.equal(coachingAdvice(g),'blitz'); assert(humanDefenseScore(g,'blitz')>0);
  evidence(g,{play:'screen',sack:false},8);
  assert(humanDefenseScore(g,'blitz')<0); assert.notEqual(coachingAdvice(g),'blitz');
  assert(defensiveChoices(g).some(d=>d.id==='blitz'));
});
test('CPU offense lowers unsuccessful inside runs, slow blitz throws, and covered zone routes',()=>{
  for(const [play,defense,counter] of [['power','run','slant'],['play-action','blitz','screen'],['post','prevent','slant']] as [PlayId,Defense,PlayId][]) {
    const g=game(); g.possession='away';
    evidence(g,{play,defense,success:false,stopped:true,completed:false,gain:0,sack:defense==='blitz'});
    assert(offensiveCoachWeight(g,counter,matchupAdvantage)>offensiveCoachWeight(g,play,matchupAdvantage));
    const counts=new Set(Array.from({length:300},()=>cpuPlay(g)));
    assert(counts.has(counter),`${defense}: existing counter receives actual CPU calls`);
    assert(counts.size>3,'weighted decisions retain variety');
  }
});
test('CPU defense changes unsuitable calls without blacklisting them or punishing successful calls',()=>{
  const g=game(); evidence(g,{play:'post',depth:24,defense:'run',gain:30});
  assert(defensiveCoachWeight(g,'prevent',matchupAdvantage)>defensiveCoachWeight(g,'run',matchupAdvantage));
  const calls=new Set(Array.from({length:400},()=>cpuDefense(g)));
  assert(calls.has('run') && calls.has('prevent') && calls.size>=5);
});
test('repetition cannot cause CPU coaches to abandon strategies that are working',()=>{
  const g=game(); evidence(g,{success:false,stopped:true},7);
  assert(!coachingEvidence(g,'defense'),'a defense making stops needs no counter-exploit change');
  assert(coachingEvidence(g,'offense'),'the stopped offense does need a change');
  const winning=game(); evidence(winning,{success:true,stopped:false},7);
  assert(!coachingEvidence(winning,'offense'),'a successful offense is not penalized for repetition');
  assert(coachingEvidence(winning,'defense'),'its opponent needs a defensive response');
});
test('actual successful CPU calls retain priority even when the theoretical matchup prefers another concept',()=>{
  const defense=game(); evidence(defense,{play:'sweep',defense:'man',kind:'run',success:false,stopped:true},7);
  const neutral=structuredClone(defense); neutral.coaching!.observations.forEach(o=>{o.stopped=false;});
  assert(defensiveCoachWeight(defense,'man',matchupAdvantage)>defensiveCoachWeight(neutral,'man',matchupAdvantage));
  const offense=game(); offense.possession='away';
  evidence(offense,{play:'power',defense:'run',kind:'run',success:true,stopped:false},7);
  const noWins=structuredClone(offense); noWins.coaching!.observations.forEach(o=>{o.success=false;});
  assert(offensiveCoachWeight(offense,'power',matchupAdvantage)>offensiveCoachWeight(noWins,'power',matchupAdvantage));
});
test('current hidden calls and target locks cannot change coaching plans or CPU selections',()=>{
  const g=game(); evidence(g,{});
  const copy=structuredClone(g);
  copy.pendingSnap={play:'verticals',defense:'prevent',remaining:.16};
  copy.live=startField(copy,'screen','run'); copy.live.lockedReceiver=6;
  // Formation construction consumes legacy RNG; restore for matched CPU call draws.
  copy.rng=g.rng;
  assert.deepEqual(defensiveCoachingPlan(copy),defensiveCoachingPlan(g));
  assert.equal(cpuDefense(copy),cpuDefense(g));
  copy.rng=g.rng=123; assert.equal(cpuPlay(copy),cpuPlay(g));
});
test('real alignments and pursuit change within the selected defense, without changing speed/ratings',()=>{
  const g=game(); evidence(g,{});
  const neutral=structuredClone(g); delete neutral.coaching;
  for(const defense of ['pass','man','blitz','run','prevent'] as Defense[]) {
    const a=structuredClone(g), b=structuredClone(neutral);
    a.live=startField(a,'slant',defense); b.live=startField(b,'slant',defense);
    assert.equal(a.live.defense,defense);
    if(defense!=='prevent')
      assert.notDeepEqual(a.live.athletes.map(d=>[d.x,d.y]),b.live.athletes.map(d=>[d.x,d.y]));
    assert.deepEqual(a.profiles,b.profiles); assert.equal(a.live.advantage,b.live.advantage);
    const d=a.live.athletes.find(d=>d.role==='DB')!;
    const target=coachingAssignment(a,d,600,35,'cover');
    if(defense!=='prevent') assert(target.x<600);
    a.live.carrierCrossedLos=true;
    assert.deepEqual(coachingAssignment(a,d,600,35,'tackle'),{x:600,y:35,variation:1});
  }
});
test('CPU reads actual separation and waits without changing progression windows or human targets',()=>{
  const g=game(); g.possession='away'; const l=g.live=startField(g,'slant','man'); l.time=.7;
  const read=progression(l), receiver=l.athletes[read.receiver]!;
  for(const d of l.athletes.filter(a=>a.side==='defense')) {d.x=receiver.x+200; d.y=160;}
  assert(cpuReadOpen(l,read.receiver));
  const d=l.athletes.find(a=>a.side==='defense')!; d.x=receiver.x; d.y=receiver.y;
  assert(!cpuReadOpen(l,read.receiver)); assert.deepEqual(progression(l),read);
});
test('coaching survives serialization/halftime/overtime but resets on a genuinely new match',()=>{
  const g=game(); evidence(g,{}); const restored=JSON.parse(JSON.stringify(g));
  assert(isFootballGame(restored)); assert.deepEqual(defensiveCoachingPlan(restored),defensiveCoachingPlan(g));
  g.phase='halftime'; assert.deepEqual(g.coaching,restored.coaching);
  g.overtime=true; g.quarter=5; assert.deepEqual(g.coaching,restored.coaching);
  assert.equal(game().coaching,undefined);
  assert(!isFootballGame({...restored,coaching:{version:1,observations:[{...restored.coaching.observations[0],gain:NaN}]}}));
  assert(!isFootballGame({...restored,coaching:{version:1,observations:Array(65).fill(restored.coaching.observations[0])}}));
});
test('real completed plays record once, remain replay-deterministic, and bound the retained observations',()=>{
  const g=game(); g.phase='live'; g.live=startField(g,'power','run');
  const copy=structuredClone(g);
  for(let i=0;i<3000 && !g.playResult;i++) {stepFootball(g,{direction:0});stepFootball(copy,{direction:0});}
  assert.deepEqual(g,copy); assert.equal(g.coaching?.observations.length,1);
  assert.equal(coachObservations(g,'away').length,0);
  for(let i=0;i<100;i++) recordCoaching(g,{reason:'tackle',spot:43},'run',3);
  assert.equal(g.coaching?.observations.length,64);
});
