import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCarrierEvasion, cpuCarrierAction, EVADE } from '../carrier-evasion';
import { createKickAttempt, stepKickAttempt, type KickAttempt } from '../kick-return-engine';
import { isKickMoves, stepKickMoves } from '../kick-return-moves';
import { playerSpeed } from '../player-pace';
import { createFootball } from './engine';
import { startField, stepField } from './field';

const bounds={minY:24,maxY:168},dt=1/60;
function attempt(seed=1986){
  const a=createKickAttempt(seed,1);
  a.phase='returning';a.player={x:500,y:96};a.time=a.returnTime=1;
  a.moves={version:2,sequence:0,readyAt:0,backward:false,vx:60,furthestX:500};
  a.defenders=[{id:0,x:482,y:96,homeX:482,minY:24,maxY:168,
    active:true,speed:160,lateralSpeed:120,vx:160,vy:0}];
  return a;
}
const forward=(a:KickAttempt)=>playerSpeed((a.difficulty==='hard'?73:57)*(a.kickoffBoost??1));
function ahead(a:KickAttempt,x=900){
  const d={...a.defenders[0]!,id:1,x,y:155,homeX:x,vx:0,vy:0};
  a.defenders.push(d);return d;
}
function tick(a:KickAttempt,press=false,hesitate=false,direction:-1|0|1=0){
  const m=stepKickMoves(a,direction,dt,{evasion:true,juke:press,hesitate},bounds);
  a.player=m.player;a.moves=m.moves;a.returnTime+=dt;return m;
}

test('a clear breakaway ACTION randomly spins or jukes, even with a fast closing rear pursuer',()=>{
  for(const direction of [-1,0,1] as const) for(const factor of [1,1.32]) for(let seed=1;seed<=24;seed++){
    const a=attempt(seed),x=forward(a)*factor,y=direction*playerSpeed(a.difficulty==='hard'?86:78)*factor;
    Object.assign(a.defenders[0]!,{vx:x+120,vy:y});
    const m=stepKickMoves(a,direction,dt,{evasion:true,juke:true},bounds,factor);
    assert(['spin','juke'].includes(m.moves?.active?.kind!));
    assert(m.started);
    const dx=m.player.x-a.player.x,dy=m.player.y-a.player.y;
    assert(Math.abs((dx*x+dy*y)/Math.hypot(x,y)-Math.hypot(x,y)*dt)<1e-8,
      'lateral evasion adds no acceleration along the running heading');
    assert(isKickMoves(m.moves,a));
  }
});

test('random clear-field actions vary across presses and survive preview and save/reload unchanged',()=>{
  const a=attempt(),kinds=new Set<string>(),before=JSON.stringify(a);
  for(let sequence=0;sequence<64;sequence++){
    a.moves!.sequence=sequence;
    const saved=JSON.stringify(a),first=chooseCarrierEvasion(a,bounds);
    kinds.add(first.kind);
    assert.deepEqual(chooseCarrierEvasion(a,bounds),first);
    assert.deepEqual(chooseCarrierEvasion(JSON.parse(saved),bounds),first);
    assert.equal(JSON.stringify(a),saved,'selection does not advance RNG or mutate the runner');
  }
  assert.deepEqual([...kinds].sort(),['juke','spin']);
  a.moves!.sequence=0;assert.equal(JSON.stringify(a),before);
});

test('the whole goal-side field counts, including inactive and far-lateral defenders, not teammates or end-zone bodies',()=>{
  for(const x of [500.01,900,1100]){
    const a=attempt();ahead(a,x).active=false;
    assert.equal(chooseCarrierEvasion(a,bounds).kind,'boost');
  }
  for(const x of [480,500,1100.01,1150]){
    const a=attempt();ahead(a,x);
    assert.notEqual(chooseCarrierEvasion(a,bounds).kind,'boost');
  }
  for(const phase of ['grounded','recovering'] as const){
    const a=attempt();ahead(a).dive={phase,elapsed:.1,vx:0,vy:0};
    assert.notEqual(chooseCarrierEvasion(a,bounds).kind,'boost');
  }
  const a=attempt();
  assert.notEqual(chooseCarrierEvasion(a,bounds,[{x:900,y:155}]).kind,'boost');
  // A diagonal heading may put the rear pursuer ahead in travel-space. The
  // end-zone eligibility boundary must still use the attacking field direction.
  for(const direction of [-1,1] as const)
    assert.notEqual(chooseCarrierEvasion(a,bounds,[],direction).kind,'boost');
});

test('an active burst stops as soon as the last defender is passed, retaining the existing cooldown',()=>{
  const a=attempt();ahead(a,500.1);
  const first=tick(a,true);assert.equal(first.moves?.active?.kind,'boost');
  assert(a.player.x>500.1);
  const pressed=structuredClone(a),readyAt=a.moves!.readyAt,x=a.player.x;
  const next=tick(a);
  assert.equal(next.moves?.active,undefined);
  assert.equal(next.started,false);
  assert.equal(next.moves?.readyAt,readyAt);
  assert(Math.abs(a.player.x-x-forward(a)*dt)<1e-8,'no remaining burst acceleration');
  const replacement=tick(pressed,true);
  assert(['spin','juke'].includes(replacement.moves?.active?.kind!),
    'a fresh ACTION can replace a currently active burst with the normal escape move');
});

test('both random moves finish before held ACTION halts forward progress and keeps lateral steering',()=>{
  const seen=new Set<string>();
  for(let seed=1;seed<=24;seed++){
    const a=attempt(seed);a.defenders=[];
    tick(a,true);seen.add(a.moves!.active!.kind);
    for(let i=0;i<Math.ceil(EVADE.spin/dt);i++) tick(a,false,true);
    assert(!a.moves!.active);
    const {x,y}=a.player;tick(a,false,true,1);
    assert.equal(a.player.x,x);
    assert(a.player.y>y);
    const start=a.player.x;tick(a);
    assert(a.player.x>start);
  }
  assert.deepEqual([...seen].sort(),['juke','spin']);
});

test('Classic ACTION uses its normal top running speed once all coverage is behind',()=>{
  for(let seed=1;seed<=12;seed++){
    const a=attempt(seed),straight=structuredClone(a);
    const running=stepKickAttempt(straight,0,dt,{},bounds);
    const dodging=stepKickAttempt(a,0,dt,{evasion:true,juke:true},bounds);
    assert(['spin','juke'].includes(dodging.moves?.active?.kind!));
    assert(Math.abs(dodging.player.x-running.player.x)<1e-8);
  }
});

test('CPU breakaway decisions cannot select a burst but retain useful lateral escapes',()=>{
  for(let seed=1;seed<=24;seed++){
    const a=attempt(seed),input=cpuCarrierAction(a,0,bounds);
    const m=stepKickMoves(a,0,dt,input,bounds);
    assert.notEqual(m.moves?.active?.kind,'boost');
    if(input.juke) assert(['spin','juke'].includes(m.moves?.active?.kind!));
    a.defenders=[];
    assert(!cpuCarrierAction(a,0,bounds).juke,'no purposeless CPU moves on an empty field');
  }
});

test('scrimmage and opposite-field turnover ACTION share the clear-breakaway restriction',()=>{
  for(const returning of [false,true]){
    const g=createFootball(1986,{player:'Crows',opponent:'Bulls'});
    g.phase='live';g.possession=returning?'away':'home';g.spot=40;
    const l=g.live=startField(g,'power','pass');
    l.mode=returning?'return':'run';l.time=3;l.carrierCrossedLos=true;
    for(const a of l.athletes) Object.assign(a,{x:returning?1000:200,y:155,engaged:100,vx:0,vy:0});
    const runner=returning?l.athletes.find(a=>a.role==='DB')!:l.athletes[6]!;
    Object.assign(runner,{x:650,y:96,engaged:0});l.carrier=runner.id;
    l.movement.player={x:returning?550:650,y:96};l.movement.returnTime=1;
    l.movement.moves={version:2,sequence:0,readyAt:0,backward:false,vx:60,furthestX:l.movement.player.x};
    if(returning){
      l.offense='away';g.possession='home';l.returnKind='interception';
      l.interception={catcher:runner.id,age:1,catchX:650,catchY:96};
    }
    stepField(g,{action:true},dt);
    assert(['spin','juke'].includes(l.movement.moves?.active?.kind!),
      returning?'leftward return uses the normalized goal-side test':'normal run uses the same test');
  }
});
