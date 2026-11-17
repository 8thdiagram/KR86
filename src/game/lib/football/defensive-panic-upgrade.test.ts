import test from 'node:test';
import assert from 'node:assert/strict';
import {createFootball,stepFootball} from './engine';
import {startField,stepField} from './field';
import {createFootballControls} from './controls';
import {defensivePanicTarget as target,PANIC_LATERAL_OFFSET} from './defensive-panic';
import {startNearestDive} from './defensive-action';
import {releasePass} from './passing';
import {PASS_DEFENSE} from './pass-defense';
import {isFootballGame} from './storage';
import {stepInterception} from './interception';
import {kickoffSequence,stepSpecialTeams} from './special-teams';

const dt=1/60;
function fixture(mode:'dropback'|'run'='dropback'){
  const g=createFootball(86,{player:'Crows',opponent:'Bulls'});
  g.phase='live';g.possession='away';g.spot=40;g.homeOddDirection=-1;
  const l=g.live=startField(g,'slant','prevent');
  l.mode=mode;l.carrier=mode==='run'?6:5;l.time=2;l.snapAge=.18;l.target=100;
  l.penetration!.roll=.999;l.carrierCrossedLos=mode==='run';
  for(const a of l.athletes) Object.assign(a,{x:300,y:150,vx:0,vy:0,engaged:0});
  Object.assign(l.athletes[5]!,{x:470,y:130});
  Object.assign(l.athletes[6]!,{x:650,y:96,vx:73});
  Object.assign(l.athletes[3]!,{x:600,y:130});
  Object.assign(l.athletes.at(-1)!,{x:850,y:55});
  l.movement.player={x:mode==='run'?650:470,y:mode==='run'?96:130};
  return g;
}
const defenders=(g:ReturnType<typeof fixture>)=>g.live!.athletes.filter(a=>a.side==='defense');
const selected=(g:ReturnType<typeof fixture>)=>g.live!.athletes.at(-1)!;

test('A: the real defensive gesture activates at 180 ms during dropback and preserves its lane',()=>{
  const g=fixture(),l=g.live!,d=selected(g),c=createFootballControls();
  c.enter('touch','juke',0,g);
  assert(!c.sample(179).defenseHold);
  const input=c.sample(180);assert(input.defenseHold);assert(!input.action);
  for(let i=0;i<12;i++) stepField(g,c.sample(180+i*17),dt);
  assert(d.x>850);assert(Math.abs(d.y-55)<1e-8);
  assert.equal(l.mode,'dropback');assert(!d.dive);
  assert.notEqual(d.y,l.athletes[5]!.y,'retreat does not follow the QB laterally');
  c.release('touch',400);const released=c.sample(401);
  assert(!released.defenseHold&&!released.action);
  const x=d.x;stepField(g,released,dt);
  assert(d.pursuit && ['cover','deep'].includes(d.pursuit.role));
  assert(Math.abs(d.x-x)<5,'release preserves physical turning, not a snap');
});

test('B: hold plus keyboard/touch direction offsets the target, with acceleration and bounded turns',()=>{
  const up=fixture(),down=fixture(),u=selected(up),d=selected(down),c=createFootballControls();
  c.enter('action','juke',0,up);c.enter('arrow','up',180,up);
  for(let i=0;i<15;i++){
    stepField(up,c.sample(180+i*17),dt);
    stepField(down,{defenseHold:true,direction:1},dt);
  }
  assert(u.x>850&&d.x>850);assert(u.y<55&&d.y>55);
  assert(Math.hypot(u.vx,u.vy)<120,'no artificial movement bonus');
  const vy=u.vy;c.enter('arrow','down',500,up);
  stepField(up,c.sample(501),dt);
  assert(Math.abs(u.vy-vy)<=650*dt+1e-6,'opposite steering respects ordinary acceleration');
  c.release('arrow',510);
  const p=target(up.live!,true,defenders(up),{y:130},1100,up.live!.time,undefined,{coverage:true});
  assert.equal(p?.y,55,'releasing UP/DOWN restores the original coverage destination');
});

test('C/D: one held gesture and defender survive an actual throw, airborne steering and legal completion',()=>{
  let caught=false;
  for(let seed=1;seed<=12&&!caught;seed++){
    const g=fixture(),l=g.live!,d=selected(g),c=createFootballControls();
    c.enter('touch','juke',0,g);stepField(g,c.sample(180),dt);
    const id=d.id,profiles=structuredClone(g.profiles);
    releasePass(g,'normal',3);assert(l.flight);g.rng=seed;
    l.flight!.accuracy=1;
    const receiver=l.athletes[3]!;
    receiver.x=l.flight!.toX;receiver.y=l.flight!.toY;
    l.flight!.age=l.flight!.duration-dt*.5;
    const input=c.sample(200);assert(input.defenseHold);
    stepField(g,input,dt);
    assert(!d.dive,'holding never tackles an uncaught receiver');
    if(l.mode==='run'&&l.passCaught){
      caught=true;
      assert.equal(target(l,true,defenders(g),receiver,1100,l.time)?.id,id);
      const current=target(l,true,defenders(g),receiver,1100,l.time);
      assert.equal(current?.y,Math.max(24,Math.min(168,receiver.y)));
      assert(c.sample(230).defenseHold);
      assert.deepEqual(g.profiles,profiles);
    }
  }
  assert(caught,'a real completion transitions without releasing the held button');
});

test('C: airborne positioning ignores the intended receiver and flight destination',()=>{
  const g=fixture(),l=g.live!,d=selected(g),c=createFootballControls();
  c.enter('touch','juke',0,g);stepField(g,c.sample(180),dt);
  releasePass(g,'normal',3);
  l.flight!.deflected=true;
  assert(c.sample(200).defenseHold,'a deflected pass does not silently end hold ownership');
  const first=target(l,true,defenders(g),l.athletes[5]!,1100,l.time,undefined,{coverage:true,direction:1});
  l.flight!.toY=25;l.flight!.receiver=4;l.athletes[5]!.y=25;
  const second=target(l,true,defenders(g),l.athletes[5]!,1100,l.time,undefined,{coverage:true,direction:1});
  assert.deepEqual(second,first);assert.equal(second?.id,d.id);
  assert.equal(second?.y,55+PANIC_LATERAL_OFFSET);
});

test('C: a physically nearby low pass remains interceptable while ACTION stays held, without guaranteed picks',t=>{
  let picks=0,other=0,attempts=0;
  for(let seed=1;seed<=64;seed++){
    const g=fixture(),l=g.live!,d=selected(g);
    l.mode='flight';g.rng=seed*1986;
    l.flight={fromX:730,fromY:55,toX:860,toY:55,x:841.8,y:55,z:12.77,
      duration:1,age:.86,receiver:3,accuracy:1,type:'normal'};
    Object.assign(l.athletes[3]!,{x:860,y:55});
    for(let i=0;i<20;i++){
      const result=stepField(g,{defenseHold:true},dt);
      if(d.defensiveAttempt?.kind==='intercept') attempts++;
      assert.notEqual(d.defensiveAttempt?.kind,'tackle');
      if(l.mode==='return'||result||!l.flight||l.flight.deflected) break;
    }
    if(l.returnKind==='interception') picks++;else other++;
  }
  assert(attempts>0&&picks>0&&other>0);
  t.diagnostic(JSON.stringify({picks,other}));
});

test('E: a sustained hold admits exactly the ordinary selected-defender dive, with normal cooldown and committed trajectory',()=>{
  const g=fixture('run'),l=g.live!,d=selected(g);
  Object.assign(d,{x:680,y:96});
  const expected=structuredClone(defenders(g));
  const ordinary=startNearestDive(expected,l.athletes[6]!,l.time+dt,d.id);
  assert(ordinary?.dive);
  stepField(g,{defenseHold:true},dt);
  assert(d.dive);assert.equal(d.defensiveAttempt?.kind,'tackle');
  assert.equal(d.dive.vx,ordinary.dive.vx);assert.equal(d.dive.vy,ordinary.dive.vy);
  const velocity={vx:d.dive.vx,vy:d.dive.vy},at=l.defensiveActionAt;
  for(let i=0;i<6;i++) stepField(g,{defenseHold:true,direction:i%2?1:-1},dt);
  assert.deepEqual({vx:d.dive!.vx,vy:d.dive!.vy},velocity,'held steering cannot home a committed dive');
  assert.equal(l.defensiveActionAt,at,'holding cannot restart a committed maneuver');
  const blocked=fixture('run');Object.assign(selected(blocked),{x:680,y:96});
  blocked.live!.defensiveActionAt=blocked.live!.time;
  stepField(blocked,{defenseHold:true},dt);assert(!selected(blocked).dive);
});

test('E: no held tackle against a passer behind the line, including a pre-line scramble',()=>{
  for(const mode of ['dropback','scramble'] as const){
    const g=fixture(),l=g.live!;l.mode=mode;
    Object.assign(selected(g),{x:495,y:130});
    stepField(g,{defenseHold:true},dt);
    assert(!selected(g).dive);
    assert.equal(l.defensiveActionAt,undefined);
  }
});

test('E/H: actual held tackles can succeed or miss against ordinary CPU running and evasion',t=>{
  let hits=0,misses=0,launches=0;
  for(const cooldown of [0,.4]) for(const dx of [10,20,30,45,55]) for(const dy of [-25,-10,0,10,25]){
    const g=fixture('run'),l=g.live!,d=selected(g);
    for(const a of l.athletes) Object.assign(a,{x:100,y:155,vx:0,vy:0,engaged:0});
    Object.assign(l.athletes[6]!,{x:650,y:96,vx:73});
    l.movement.player={x:650,y:96};l.movement.returnTime=1;
    l.movement.moves={version:2,sequence:0,readyAt:1+cooldown,backward:false,vx:73,furthestX:650};
    Object.assign(d,{x:650+dx,y:96+dy});
    let launched=false,result:ReturnType<typeof stepField>;
    for(let i=0;i<115;i++){
      result=stepField(g,{defenseHold:true},dt);launched ||= !!d.dive;
      if(result||g.tackleScene||l.mode==='return'||l.mode==='loose') break;
    }
    if(launched){launches++;if(result?.reason==='tackle'||g.tackleScene) hits++;else misses++;}
  }
  assert(launches>0&&hits>0&&misses>0,'physical contact and real evasions produce both outcomes');
  t.diagnostic(JSON.stringify({launches,hits,misses}));
});

test('held automatic tackles also use ordinary dives on opposite-field returns and kickoff coverage',()=>{
  const g=fixture('run'),l=g.live!;
  l.offense='home';l.mode='return';l.carrier=11;l.returnKind='interception';
  l.interception={catcher:11,age:1,catchX:650,catchY:96};
  for(const a of l.athletes) Object.assign(a,{x:1000,y:155,engaged:0,vx:0,vy:0});
  Object.assign(l.athletes[11]!,{x:650,y:96,vx:-73});
  Object.assign(l.athletes[0]!,{x:620,y:96});
  stepInterception(g,{defenseHold:true,direction:1},dt);
  assert(l.athletes[0]!.dive);
  assert.equal(l.athletes[0]!.defensiveAttempt?.kind,'tackle');

  const k=fixture();k.phase='kickoff';k.kickReceiver='away';
  const s=k.special=kickoffSequence(k,'full');
  s.stage='recovery';s.stageAge=.32;s.recovery=s.returner;
  s.recoveryFrom={x:200,y:96};s.ball={x:200,y:96,z:0};
  stepSpecialTeams(k,{},dt);assert.equal(s.stage,'return');
  const a=k.returnAttempt!;
  for(const d of a.defenders) Object.assign(d,{x:50,y:145,active:true,dive:undefined});
  const d=a.defenders.at(-1)!;Object.assign(d,{x:230,y:96});
  for(const b of s.athletes.filter(b=>b.side==='defense'&&b.id!==s.returner)) b.x=1000;
  stepSpecialTeams(k,{defenseHold:true,direction:-1},dt);
  assert(k.returnAttempt!.defenders.find(b=>b.id===d.id)!.dive);
});

test('F/G: release re-reads CPU assignment from actual position and a later quick tap retains normal admission',()=>{
  const g=fixture('run'),l=g.live!,c=createFootballControls(),d=selected(g);
  c.enter('hold','juke',0,g);
  for(let i=0;i<5;i++) stepField(g,c.sample(180+i*17),dt);
  c.release('hold',300);
  const normal=structuredClone(g);delete selected(normal).pursuit;
  stepField(g,c.sample(301),dt);stepField(normal,{},dt);
  assert.deepEqual(d,selected(normal));assert(!d.dive);
  assert.notEqual(d.pursuit?.x,1100);
  Object.assign(d,{x:l.athletes[6]!.x+30,y:l.athletes[6]!.y,vx:0,vy:0});
  c.enter('tap','juke',320,g);c.release('tap',380);
  const tap=c.sample(381);assert(tap.action&&!tap.defenseHold);
  stepField(g,tap,dt);assert(d.dive,'no added post-release cooldown');
});

test('selection is fixed across blocks, inactive players, dives and temporary loose-ball suspension',()=>{
  const owner={},players=[{id:1,x:850,y:55,active:false},{id:2,x:800,y:90},{id:3,x:700,y:120}];
  assert.equal(target(owner,true,players,{y:96},1100,2)?.id,2);
  players[2]!.x=1000;
  assert.equal(target(owner,true,players,{y:96},1100,2)?.id,2);
  assert(!target(owner,true,players,{y:96},1100,2,new Set([2])));
  assert(!target(owner,true,players,{y:96},1100,2,undefined,{suspended:true}));
  assert.equal(target(owner,true,players,{y:96},1100,2)?.id,2);
  target(owner,false,players,{y:96},1100,2);
  assert.equal(target(owner,true,players,{y:96},1100,2)?.id,3);
});

test('H: poor timing, wrong lateral choices and out-of-range positioning cannot force tackles',()=>{
  const up=fixture('run'),down=fixture('run');
  for(let i=0;i<15;i++){
    stepField(up,{defenseHold:true,direction:-1},dt);
    stepField(down,{defenseHold:true,direction:1},dt);
  }
  assert(selected(up).y<selected(down).y);
  assert(Math.abs(selected(up).y-up.live!.athletes[6]!.y)>Math.abs(selected(down).y-down.live!.athletes[6]!.y));
  assert(!selected(up).dive&&!selected(down).dive,'no tackles at an artificially expanded range');
  for(const goal of [100,1100] as const){
    const owner={},players=[{id:1,x:goal===100?200:1000,y:25}];
    assert.equal(target(owner,true,players,{y:25},goal,1,undefined,{direction:-1})?.y,24);
    assert.equal(target(owner,true,players,{y:167},goal,1,undefined,{direction:1})?.y,168);
  }
});

test('cancellation, pauses and changes of possession consume the gesture without creating an offensive action',()=>{
  for(const canceled of [false,true]){
    const g=fixture(),c=createFootballControls();
    c.enter('touch','juke',0,g);assert(c.sample(180).defenseHold);
    if(canceled) c.clear(); else {g.possession='home';c.sample(200);g.possession='away';}
    assert(!c.sample(220).defenseHold);
    c.release('touch',300,canceled);
    const s=c.sample(301);assert(!s.action&&!s.juke&&!s.defenseHold);
  }
});

test('both physical field orientations preserve the same pre-pass trajectory and serialize no held state',()=>{
  const right=fixture(),left=structuredClone(right);
  left.homeOddDirection=1;
  const profiles=JSON.stringify(right.profiles);
  for(let i=0;i<8;i++){
    stepFootball(right,{defenseHold:true,direction:-1});
    stepFootball(left,{defenseHold:true,direction:-1});
  }
  const rx=selected(right).x,ly=selected(left).y;
  assert(Math.abs(rx+selected(left).x-1200)<1e-6);
  assert(Math.abs(selected(right).y-ly)<1e-6);
  assert.equal(JSON.stringify(right.profiles),profiles);
  assert(!/defenseHold|panic|selectedDefender/.test(JSON.stringify(right)));
  assert(isFootballGame(right));
  assert(PASS_DEFENSE.actionCooldown>0);
});
