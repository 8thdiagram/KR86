import test from 'node:test';
import assert from 'node:assert/strict';
import {createFootball,stepFootball} from './engine';
import {startField,stepField} from './field';
import {stepDefense} from './pursuit';
import {defensivePanicTarget} from './defensive-panic';
import {cpuDefensivePanicTarget as cpu,cpuPanicDecision,cpuRetreatProbability,type CpuPanicFrame} from './cpu-defensive-panic';
import {startNearestDive} from './defensive-action';
import {stepInterception} from './interception';
import {releasePass} from './passing';
import {kickoffSequence,stepSpecialTeams} from './special-teams';
import {isFootballGame} from './storage';
import type {Defense,FootballGame} from './types';

function fixture(seed=1){
  const g=createFootball(seed,{player:'Crows',opponent:'Bulls'});
  g.phase='live';g.possession='home';g.homeOddDirection=1;g.quarter=2;g.clock=90;
  const f:CpuPanicFrame={kind:'field',defending:'away',mode:'runner',goalX:1100,los:500,now:2,
    carrier:{x:650,y:96,vx:64},defenders:[
      {id:7,x:620,y:70},{id:8,x:750,y:110},{id:13,x:850,y:96}],
    receivers:[{x:780,y:50,vx:60}]};
  return {g,f,owner:{}};
}
function accepted(mode:CpuPanicFrame['mode']='runner'){
  for(let seed=1;seed<100;seed++){
    const a=fixture(seed);a.f.mode=mode;
    cpu(a.g,a.owner,a.f);
    a.f.now+=.180001;
    const target=cpu(a.g,a.owner,a.f);
    if(target)return {...a,target};
  }
  throw Error('No accepted seeded decision');
}
function liveFixture(seed:number){
  const g=fixture(seed).g;g.spot=40;
  const l=g.live=startField(g,'power','man');
  l.mode='run';l.carrier=6;l.time=2;l.snapAge=.18;
  for(const a of l.athletes)Object.assign(a,{x:300,y:150,vx:0,vy:0,engaged:0});
  Object.assign(l.athletes[6]!,{x:650,y:96,vx:64});
  Object.assign(l.athletes.at(-1)!,{x:690,y:96});
  l.movement.player={x:650,y:96};
  return g;
}

test('A: score and real clock produce the configured baseline tendencies with smooth transitions',()=>{
  const {g}=fixture();
  const cases=[
    {margin:3,q:4,clock:5,p:.8},{margin:14,q:1,clock:100,p:.7},
    {margin:0,q:2,clock:90,p:.5},{margin:-7,q:2,clock:90,p:.3},
    {margin:-3,q:4,clock:5,p:.15},
  ];
  for(const c of cases){
    g.score={home:Math.max(0,-c.margin),away:Math.max(0,c.margin)};
    g.quarter=c.q;g.clock=c.clock;
    assert(Math.abs(cpuRetreatProbability(g,'away','man')-c.p)<.003);
  }
  g.score={home:0,away:3};g.quarter=4;
  let last=0;
  for(let clock=120;clock>=0;clock--){
    g.clock=clock;const p=cpuRetreatProbability(g,'away','man');
    assert(p>=last);if(last)assert(p-last<.005);last=p;
  }
  g.score={home:3,away:0};g.quarter=1;g.clock=100;
  assert(cpuRetreatProbability(g,'away','man')>.4,'early field goal deficit is not urgent desperation');
  g.overtime=true;g.score={home:0,away:0};g.clock=30;
  assert.equal(cpuRetreatProbability(g,'away','man'),.5);
});

test('A/B: thousands of seeded opportunities match tendencies, retain exceptions and preserve the contest RNG',()=>{
  const {g,f}=fixture(),samples=4000;
  const results=[];
  for(const c of [{margin:3,q:4,clock:5},{margin:14,q:1,clock:100},
    {margin:0,q:2,clock:90},{margin:-7,q:2,clock:90},{margin:-3,q:4,clock:5}]){
    g.score={home:Math.max(0,-c.margin),away:Math.max(0,c.margin)};g.quarter=c.q;g.clock=c.clock;
    let retreat=0;const rng=g.rng;
    for(let seed=1;seed<=samples;seed++){
      g.seed=seed;const owner={};cpu(g,owner,f);
      if(cpuPanicDecision(owner)?.status==='pending')retreat++;
    }
    const expected=cpuRetreatProbability(g,'away');
    assert(Math.abs(retreat/samples-expected)<.025);
    assert(retreat>0&&retreat<samples);assert.equal(g.rng,rng);
    results.push({margin:c.margin,quarter:c.q,clock:c.clock,expected,observed:retreat/samples,samples});
  }
  console.log('CPU strategy distributions:',JSON.stringify(results));
});

test('B: actual Zone, Man Blitz, Run Blitz and other saved play ids retain distinct adjustments',()=>{
  const {g}=fixture();
  for(const [defense,p]of Object.entries({prevent:.65,pass:.55,man:.5,run:.45,blitz:.35,'run-blitz':.3,'goal-line':.45,contain:.55}))
    assert(Math.abs(cpuRetreatProbability(g,'away',defense as Defense)-p)<1e-10);
  g.score={home:0,away:3};g.quarter=4;g.clock=0;
  assert.equal(cpuRetreatProbability(g,'away','prevent'),.95);
  g.score={home:3,away:0};
  assert.equal(cpuRetreatProbability(g,'away','run-blitz'),.05);
  assert(cpuRetreatProbability(g,'away','man',50)<cpuRetreatProbability(g,'away','man',300));
});

test('C: reproducible policy stream never advances ordinary gameplay randomness',()=>{
  for(let seed=1;seed<=50;seed++){
    const a=fixture(seed),b=fixture(seed),rng=a.g.rng;
    assert.deepEqual(cpu(a.g,a.owner,a.f),cpu(b.g,b.owner,b.f));
    assert.deepEqual(cpuPanicDecision(a.owner),cpuPanicDecision(b.owner));
    assert.equal(a.g.rng,rng);assert.equal(b.g.rng,rng);
  }
});

test('C: an unchanged rejected threat never gains more chances, even after a catch or score change',()=>{
  let a=fixture();
  for(let seed=1;seed<100;seed++){
    a=fixture(seed);cpu(a.g,a.owner,a.f);
    if(cpuPanicDecision(a.owner)?.status==='rejected')break;
  }
  assert.equal(cpuPanicDecision(a.owner)?.status,'rejected');
  a.g.score.away=30;a.g.quarter=4;a.g.clock=1;
  for(let frame=0;frame<1000;frame++){
    a.f.now+=1/60;a.f.carrier.x+=.1;
    assert.equal(cpu(a.g,a.owner,a.f),undefined);
  }
  assert.equal(cpuPanicDecision(a.owner)?.rolls,1);
  a.g.plays++;cpu(a.g,a.owner,a.f);
  assert.equal(cpuPanicDecision(a.owner)?.rolls,1,'a new play has one new opportunity');
});

test('D/E: no retreat for a short route, ordinary unthreatening dropback or a run behind the line',()=>{
  const a=fixture();
  a.f.carrier.x=480;
  for(let i=0;i<60;i++){a.f.now+=1/60;assert(!cpu(a.g,a.owner,a.f));}
  assert.equal(cpuPanicDecision(a.owner)?.rolls,0);
  a.f.mode='coverage';a.f.receivers=[{x:535,y:60,vx:60}];
  for(let i=0;i<60;i++){a.f.now+=1/60;assert(!cpu(a.g,a.owner,a.f));}
  assert.equal(cpuPanicDecision(a.owner)?.rolls,0);
  a.f.receivers=[{x:780,y:60,vx:60}];cpu(a.g,a.owner,a.f);
  assert.equal(cpuPanicDecision(a.owner)?.rolls,1);
});

test('D: hidden target, future route and landing destination do not influence policy',()=>{
  for(let seed=1;seed<=30;seed++){
    const a=fixture(seed),b=fixture(seed);
    a.g.live=startField(a.g,'verticals','man');
    releasePass(a.g,'lob',3);assert(a.g.live.flight);
    b.g.live=structuredClone(a.g.live);
    a.g.live.flight.toX=600;a.g.live.flight.toY=30;
    b.g.live.flight!.toX=1050;b.g.live.flight!.toY=160;b.g.live.flight!.receiver=4;
    a.g.live.target=1;b.g.live.target=100;
    a.g.live.lockedReceiver=0;b.g.live.lockedReceiver=4;
    a.f.mode=b.f.mode='airborne';
    assert.deepEqual(cpu(a.g,a.owner,a.f),cpu(b.g,b.owner,b.f));
    assert.deepEqual(cpuPanicDecision(a.owner),cpuPanicDecision(b.owner));
  }
});

test('D: one selected defender holds his visible lane through flight, then tracks the actual carrier after catch',()=>{
  const a=accepted('coverage');const id=a.target.id;
  a.f.receivers=[{x:825,y:50,vx:60}];
  a.f.carrier.y=25;a.f.mode='airborne';a.f.now+=.05;
  assert.deepEqual(cpu(a.g,a.owner,a.f),a.target);
  a.f.mode='runner';a.f.now+=.05;a.f.carrier.x=820;
  const target=cpu(a.g,a.owner,a.f)!;
  assert.equal(target.id,id);assert.equal(target.y,25);
  assert.equal(cpuPanicDecision(a.owner)?.rolls,1);
});

test('F: imperfect sampled release times immediately clear retreat without snapping momentum or rerolling',()=>{
  const a=accepted();const d=a.f.defenders.find(d=>d.id===a.target.id)!;
  Object.assign(d,{vx:33,vy:-9,pursuit:{x:1100,y:96},motion:{reactionLeft:.5}});
  const before=structuredClone(d);
  a.f.now+=cpuPanicDecision(a.owner)!.maximum+.01;
  assert(!cpu(a.g,a.owner,a.f));assert.equal(cpuPanicDecision(a.owner)?.status,'released');
  assert.equal((d as typeof d&{vx:number}).vx,(before as typeof d&{vx:number}).vx);
  assert.equal((d as typeof d&{vy:number}).vy,-9);assert.equal(d.pursuit,undefined);
  assert.equal(d.motion?.reactionLeft,0);
  for(let i=0;i<120;i++){a.f.now+=1/60;assert(!cpu(a.g,a.owner,a.f));}
  const timings=new Set<number>();
  for(let seed=1;seed<=50;seed++){const b=fixture(seed);cpu(b.g,b.owner,b.f);if(cpuPanicDecision(b.owner)?.status==='pending')timings.add(cpuPanicDecision(b.owner)!.maximum);}
  assert(timings.size>10);
});

test('F/G: a blocked, diving or absent defender is never replaced during one decision',()=>{
  for(const unavailable of ['blocked','diving','absent']){
    const a=accepted(),id=a.target.id;
    if(unavailable==='blocked')a.f.blocked=new Set([id]);
    if(unavailable==='diving')startNearestDive(a.f.defenders,{x:830,y:96},a.f.now,id);
    if(unavailable==='absent')a.f.defenders=a.f.defenders.filter(d=>d.id!==id);
    assert(!cpu(a.g,a.owner,a.f));
    assert.equal(cpuPanicDecision(a.owner)?.status,'released');
    a.f.blocked=undefined;assert(!cpu(a.g,a.owner,a.f));
    assert.equal(cpuPanicDecision(a.owner)?.rolls,1);
  }
});

test('F: a useful goal-side close-down can release early instead of forcing a held dive',()=>{
  const a=accepted(),d=a.f.defenders.find(d=>d.id===a.target.id)!;
  d.x=a.f.carrier.x+20;d.y=a.f.carrier.y;
  assert(!cpu(a.g,a.owner,a.f));
  assert.equal(cpuPanicDecision(a.owner)?.status,'released');
  assert(!d.dive);assert.equal(cpuPanicDecision(a.owner)?.rolls,1);
});

test('G: CPU and human requests use identical selection, destinations, physics, turning and ordinary dives',()=>{
  const a=accepted(),humanOwner={},humanDefenders=structuredClone(a.f.defenders);
  const human=defensivePanicTarget(humanOwner,true,humanDefenders,a.f.carrier,1100,a.f.now);
  assert.deepEqual(a.target,human);
  const cpuGame=liveFixture(a.g.seed),humanGame=structuredClone(cpuGame);
  stepDefense(cpuGame,1/60,a.target);stepDefense(humanGame,1/60,human);
  assert.deepEqual(cpuGame,humanGame);
  const x=structuredClone(a.f.defenders),y=structuredClone(a.f.defenders);
  startNearestDive(x,{x:830,y:96},2,a.target.id);startNearestDive(y,{x:830,y:96},2,human!.id);
  assert.deepEqual(x,y);
});

test('G: CPU sustained positioning admits a real ordinary tackle and ends its decision after that committed dive',()=>{
  let attempts=0;
  for(let seed=1;seed<=40;seed++){
    const g=liveFixture(seed),l=g.live!;
    l.athletes.at(-1)!.x=850;
    stepField(g,{},1/60);
    l.time+=.181;l.athletes.at(-1)!.x=690;
    stepField(g,{},1/60);
    const decision=cpuPanicDecision(l);
    if(decision?.status!=='active')continue;
    const d=l.athletes.find(d=>d.id===decision.selectedId)!;
    assert(d.dive);assert.equal(d.defensiveAttempt?.kind,'tackle');
    stepField(g,{},1/60);
    assert.equal(cpuPanicDecision(l)?.status,'released');
    assert.equal(cpuPanicDecision(l)?.rolls,1);attempts++;
  }
  assert(attempts>5);
});

test('G/H: CPU return coverage uses the same ordinary leftward tackle, without intercepting an uncaught runner',()=>{
  let attempts=0;
  for(let seed=1;seed<=40;seed++){
    const g=liveFixture(seed),l=g.live!;l.offense='away';l.mode='return';l.carrier=13;
    l.interception={catcher:13,age:.5,catchX:850,catchY:96};
    Object.assign(l.athletes[13]!,{x:650,y:96,vx:-64});
    Object.assign(l.athletes[0]!,{x:610,y:96});
    for(const p of l.athletes.slice(1,7))p.x=950;
    l.movement.player={x:550,y:96};
    stepInterception(g,{},1/60);
    l.time+=.181;stepInterception(g,{},1/60);
    if(cpuPanicDecision(l)?.status==='active'){
      assert(l.athletes[0]!.dive);attempts++;
    }
  }
  assert(attempts>5);
});

test('H: human controls remain authoritative, interruptions release CPU intent, saves have no new schema',()=>{
  const a=accepted();a.f.defending='home';
  assert(!cpu(a.g,{},a.f),'never controls the human defense');
  a.f.defending='away';a.f.mode='none';assert(!cpu(a.g,a.owner,a.f));
  assert.equal(cpuPanicDecision(a.owner)?.status,'released');
  const g=liveFixture(86);
  for(let i=0;i<40&&g.phase==='live'&&!g.playResult;i++)stepFootball(g,{},1/60);
  assert(isFootballGame(g));assert(!/cpuPanic|retreatDecision|selectedId/.test(JSON.stringify(g)));
});

test('G/H: modern kickoff coverage honors active blocks and one ordinary held tackle',()=>{
  let attempts=0;
  for(let seed=1;seed<=30;seed++){
    const g=liveFixture(seed);g.phase='kickoff';g.kickReceiver='home';
    const s=g.special=kickoffSequence(g,'full');
    s.stage='recovery';s.stageAge=.32;s.recovery=s.returner;
    s.recoveryFrom={x:200,y:96};s.ball={x:200,y:96,z:0};
    stepSpecialTeams(g,{},1/60);
    assert.equal(s.stage,'return');
    const a=g.returnAttempt!;
    a.landing.x=200;a.player={x:350,y:96};
    if(a.moves)Object.assign(a.moves,{furthestX:350,vx:64});
    for(const d of a.defenders)Object.assign(d,{x:50,y:145,active:true,dive:undefined});
    const d=a.defenders.at(-1)!;Object.assign(d,{x:450,y:96});
    for(const b of s.athletes.filter(b=>b.side==='defense'&&b.id!==s.returner))b.x=1000;
    stepSpecialTeams(g,{},1/60);
    const b=g.returnAttempt!;b.time+=.181;
    Object.assign(b.defenders.find(p=>p.id===d.id)!,{x:b.player.x+50,y:b.player.y});
    stepSpecialTeams(g,{},1/60);
    if(cpuPanicDecision(s)?.status==='active'){
      assert(g.returnAttempt!.defenders.find(b=>b.id===d.id)!.dive);attempts++;
      stepSpecialTeams(g,{},1/60);
      assert.equal(cpuPanicDecision(s)?.status,'released');
    }
  }
  assert(attempts>5);
});

test('G: CPU activation must satisfy the same 180 ms threshold as human ACTION',()=>{
  let checked=0;
  for(let seed=1;seed<30;seed++){
    const a=fixture(seed);
    assert(!cpu(a.g,a.owner,a.f));
    if(cpuPanicDecision(a.owner)?.status!=='pending')continue;
    a.f.now+=.179;assert(!cpu(a.g,a.owner,a.f));
    assert.equal(cpuPanicDecision(a.owner)?.selectedId,undefined);
    a.f.now+=.001001;assert(cpu(a.g,a.owner,a.f));checked++;
  }
  assert(checked>5);
});
