import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { KICK_TEAMS } from '../kick-return-teams';
import { createKickAttempt, stepKickAttempt, KR } from '../kick-return-engine';
import { stepKickMoves } from '../kick-return-moves';
import { EVADE } from '../carrier-evasion';
import { playerSpeed } from '../player-pace';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { LEGENDS, legendaryPlayer, legendaryRoleFactor, type LegendPosition } from './legendary-roster';
import { legendaryAthlete, legendaryAthleteFactor, legendaryPassingFactor, effectiveKickRange } from './legendary';
import { franchiseAthleteFactor, effectiveAthleteFactor, effectiveKickControl, franchiseKickControl } from './franchise-upgrades';
import { fieldGoalSequence, kickoffSequence, puntSequence } from './special-teams';
import { fieldGoalAllowed } from './playbook';
import { fieldGoalHeight } from './field-goal-geometry';
import { releasePass, PASS_HOLD_MS, QB_SCRAMBLE_MS } from './passing';
import { contactEscapeOpportunity } from './execution-moments';
import { resolveReception } from './receiving';
import { stepDefense } from './pursuit';
import { tryFumble } from './rare-events';
import { jerseyMark, drawLegendaryUnit } from '../../components/legendary-indicators';
import { withBroadcastWorld, projectBroadcastPoint } from '../../components/football-broadcast';
import { isFootballGame } from './storage';
import type { FootballGame } from './types';
import { random } from './types';

type Team = FootballGame['teams']['player'];
function game(team: Team = 'Crows', opponent: Team = 'Bulls') {
  const g = createFootball(86, {player:team, opponent});
  g.phase = 'live'; g.spot = 40;
  g.live = startField(g, 'slant', 'man');
  g.live.snapAge = .18;
  return g;
}
const positionId: Partial<Record<LegendPosition, number>> = { QB:5, RB:6, WR:3, TE:4, LB:10, CB:11, S:13 };
test('exact roster totals: 32 franchises, 135 entries, 103 non-KR and 12 non-KR superstars', () => {
  // Independently checked against all 135 rows in the supplied roster.
  const canonical=LEGENDS.map(p=>[p.team,p.number,p.position,p.boost,p.passing,p.rushing].join('|')).join('\n');
  assert.equal(createHash('sha256').update(canonical).digest('hex'),
    '59ca7b4456112df35068c3acfadc7ebec601d75cc4073da6230ec5cf25f55922');
  assert.equal(LEGENDS.length, 135);
  assert.deepEqual([...new Set(LEGENDS.map(p => p.team))], KICK_TEAMS.map(t => t.name));
  assert.equal(LEGENDS.filter(p => p.position !== 'KR').length, 103);
  assert.equal(LEGENDS.filter(p => p.position !== 'KR' && p.boost === 20).length, 12);
  assert.deepEqual(LEGENDS.filter(p => p.position === 'KR').map(p => p.boost).sort((a,b)=>a-b),
    Array.from({length:32},(_,i)=>i+1));
  for (const team of KICK_TEAMS) {
    const unit = LEGENDS.filter(p => p.team === team.name);
    assert.equal(unit.filter(p => p.position === 'KR').length, 1);
    assert.equal(unit.filter(p => p.position === 'K').length, 1);
    assert.equal(new Set(unit.map(p=>p.position)).size, unit.length);
    assert.equal(unit.find(p => p.position === 'K')!.boost, 10);
  }
  assert(LEGENDS.every(p => p.boost > 0 && !['OL','DL'].includes(p.position)));
  assert(LEGENDS.every(p => Object.isFrozen(p)));
});
for (const team of KICK_TEAMS) test(`${team.name}: every legend resolves to its own stable slot and exact allocation`, () => {
  const g = game(team.name, team.name === 'Bulls' ? 'Crows' : 'Bulls');
  const profiles = JSON.stringify(g.profiles);
  for (const p of LEGENDS.filter(p => p.team === team.name && positionId[p.position] !== undefined)) {
    g.possession = ['LB','CB','S'].includes(p.position) ? 'away' : 'home';
    g.live = startField(g, 'slant', 'man');
    const a = g.live.athletes[positionId[p.position]!]!;
    assert.equal(legendaryAthlete(g,a), p);
    assert.equal(legendaryAthleteFactor(g,a), 1 + (p.position === 'QB' ? p.rushing : p.boost)/100);
    assert.equal(legendaryAthleteFactor(g,a,'skill'), 1 + (p.position === 'QB' ? p.passing : p.boost)/100);
    assert.equal(effectiveAthleteFactor(g,a), franchiseAthleteFactor(g,a)*legendaryAthleteFactor(g,a));
  }
  for (const a of g.live!.athletes.filter(a=>['OL','DL'].includes(a.role))) {
    assert.equal(legendaryAthlete(g,a), undefined);
    assert.equal(legendaryAthleteFactor(g,a), 1);
  }
  assert.equal(JSON.stringify(g.profiles), profiles);
});
test('multi-role identities share the right person but never stack; Norsemen #84s remain distinct', () => {
  for (const [team,role,ordinary,returned] of [['Black Cats','WR',10,16],['Hawks','CB',20,22]] as const) {
    assert.equal(legendaryPlayer(team,role)!.identity, legendaryPlayer(team,'KR')!.identity);
    assert.equal(legendaryRoleFactor(team,role),1+ordinary/100);
    assert.equal(legendaryRoleFactor(team,'KR'),1+returned/100);
  }
  assert.notEqual(legendaryPlayer('Norsemen','WR')!.identity,legendaryPlayer('Norsemen','KR')!.identity);
  assert.equal(legendaryRoleFactor('Marauders','RB'),1.2);
  assert.equal(legendaryPlayer('Generals','KR'),legendaryPlayer('Comanches','KR'),
    'historical saved team names use their existing current-team alias');
});
test('QB allocation is passing-only for pocket QBs and split exactly for mobile QBs', () => {
  for (const [team,passing,rushing] of [['Militia',20,0],['Ponies',20,0],['Black Cats',5,5],['Bison',5,5],['Arrowheads',10,10]] as const) {
    const g=game(team);
    assert.equal(legendaryPassingFactor(g),1+passing/100);
    assert.equal(legendaryAthleteFactor(g,g.live!.athletes[5]!),1+rushing/100);
  }
  assert.equal(PASS_HOLD_MS,220); assert.equal(QB_SCRAMBLE_MS,1000);
});
test('real running movement applies exactly one RB boost and preserves hold-to-halt', () => {
  const baseline=game('Crows'), boosted=game('Grizzlies');
  boosted.profiles=structuredClone(baseline.profiles);
  for(const g of [baseline,boosted]) {
    const l=g.live!; l.mode='run';l.carrier=6;l.time=3;
    for(const a of l.athletes) {a.x=1050;a.y=35;a.engaged=100;}
    Object.assign(l.athletes[6]!,{x:700,y:96,engaged:0});
    l.movement.player={x:700,y:96};
  }
  const before=JSON.stringify(boosted.profiles);
  stepField(baseline,{direction:0},KR.dt);stepField(boosted,{direction:0},KR.dt);
  const normal=baseline.live!.athletes[6]!.x-700, legend=boosted.live!.athletes[6]!.x-700;
  assert(Math.abs(legend/normal-1.2)<1e-9);
  const x=boosted.live!.athletes[6]!.x,y=boosted.live!.athletes[6]!.y;
  stepField(boosted,{hesitate:true,direction:1},KR.dt);
  assert.equal(boosted.live!.athletes[6]!.x,x);
  assert(boosted.live!.athletes[6]!.y>y);
  assert.equal(JSON.stringify(boosted.profiles),before);
  assert.equal(boosted.live!.movement.athleticFactor,undefined);
});
test('effective evasion uses the same move, cooldown and collision rules with rated movement', () => {
  const a=createKickAttempt(86);a.phase='returning';a.player={x:500,y:96};a.defenders=[];
  const before=structuredClone(a);
  const b=stepKickMoves(a,1,KR.dt,{evasion:true,juke:true});
  const p=stepKickMoves(a,1,KR.dt,{evasion:true,juke:true},undefined,1.2);
  assert.equal(b.moves!.active!.kind,p.moves!.active!.kind);
  assert.equal(b.moves!.readyAt,p.moves!.readyAt);
  assert(p.player.x>a.player.x);
  assert.deepEqual(a,before);
});
test('legendary speed preserves the original perpendicular spin distance at every steering angle', () => {
  for(const direction of [-1,0,1] as const) for(const factor of [1,1.2,1.32]){
    const a=createKickAttempt(86);a.phase='returning';a.player={x:500,y:96};a.defenders=[];
    delete a.kickoffBoost;
    a.moves={version:2,backward:false,sequence:1,readyAt:1,furthestX:500,
      active:{kind:'spin',side:1,evasive:true,elapsed:0,duration:EVADE.spin,
        spinDirection:direction,travelDuration:EVADE.outward,lateralDistance:EVADE.spinDistance}};
    const frames=Math.ceil(EVADE.spin/KR.dt);
    const vx=playerSpeed(a.difficulty==='hard'?73:57)*factor,vy=direction*playerSpeed(a.difficulty==='hard'?86:78)*factor;
    for(let frame=0;frame<frames;frame++){
      const result=stepKickMoves(a,direction,KR.dt,{evasion:true},undefined,factor);
      a.player=result.player;a.moves=result.moves;a.returnTime+=KR.dt;
    }
    const dx=a.player.x-500-vx*frames*KR.dt,dy=a.player.y-96-vy*frames*KR.dt;
    assert(Math.abs(Math.hypot(dx,dy)-EVADE.spinDistance)<1e-8);
    assert(Math.abs(dx*vx+dy*vy)<1e-8);
    assert.equal(a.athleticFactor,undefined);
  }
});
test('all KR ranks affect actual return motion once, without persisting or compounding bonuses', () => {
  for(const p of LEGENDS.filter(p=>p.position==='KR')) {
    const a=createKickAttempt(86);a.phase='returning';a.player={x:500,y:96};a.defenders=[];
    const base=stepKickAttempt(a,0,KR.dt,{evasion:true});
    a.teams={player:p.team as Team,opponent:p.team==='Bulls'?'Crows':'Bulls'};
    const step=stepKickAttempt(a,0,KR.dt,{evasion:true});
    assert(Math.abs((step.player.x-500)/(base.player.x-500)-(1+p.boost/100))<1e-9,p.team);
    assert.equal(step.athleticFactor,undefined);
    const second=stepKickAttempt(step,0,KR.dt,{evasion:true});
    assert(Math.abs((second.player.x-step.player.x)-(step.player.x-500))<1e-9);
  }
});
test('kickers gain power and control through the existing range, meter and trajectory', () => {
  const g=game('Redbirds');g.profiles.home.kickMax=50;
  assert.equal(effectiveKickRange(g),55.00000000000001);
  assert.equal(effectiveKickControl(g,'home'),franchiseKickControl(g,'home')/1.1);
  g.spot=63;assert(fieldGoalAllowed(g)); // 54 yards: boosted range, not guaranteed accuracy.
  g.live=startField(g,'field-goal','run');g.live.kickAccuracy=.5;
  g.special=fieldGoalSequence(g);
  assert.equal(legendaryAthlete(g,g.special.athletes[g.special.kicker]!)!.position,'K');
  assert.equal(legendaryAthleteFactor(g,g.special.athletes[g.special.kicker]!),1);
  assert(fieldGoalHeight(g,1)>10);
  g.spot=60;assert.equal(fieldGoalAllowed(g),false);assert(fieldGoalHeight(g,1)<10);
  const p=game('Redbirds');p.live=startField(p,'punt','pass');p.rng=86;
  const unchanged=structuredClone(p);
  const baseTravel=33+random(unchanged)*18;
  const baseOffset=(random(unchanged)-.5)*112;
  const punt=puntSequence(p);
  assert(Math.abs(punt.travel!/baseTravel-1.1)<1e-12);
  assert(Math.abs(punt.toY-96-baseOffset/1.1)<1e-12);
  assert.equal(p.rng,unchanged.rng,'power and accuracy add no extra random outcomes');
});
test('kickoff identities stay attached to the roster, not a different fumble recoverer', () => {
  const g=game('Black Cats','Hawks');g.kickReceiver='home';g.special=kickoffSequence(g,'full');
  const s=g.special;
  assert.equal(legendaryAthlete(g,s.athletes[13]!)!.number,89);
  assert.equal(legendaryAthleteFactor(g,s.athletes[13]!),1.16);
  assert.equal(legendaryAthlete(g,s.athletes[3]!)!.number,21);
  assert.equal(legendaryAthleteFactor(g,s.athletes[3]!),1.2);
  s.returner=4;s.stage='return';
  assert.equal(legendaryAthlete(g,s.athletes[4]!),undefined);
  assert.equal(legendaryAthlete(g,s.athletes[13]!)!.position,'KR');
});
test('passing velocity and accuracy are team-owned, identical under human/CPU ownership', () => {
  const human=game('Militia','Bulls'), cpu=game('Bulls','Militia');
  cpu.possession='away';cpu.live=structuredClone(human.live!);cpu.live.offense='away';
  cpu.profiles.away=structuredClone(human.profiles.home);cpu.profiles.home=structuredClone(human.profiles.away);
  for(const g of [human,cpu]){
    const l=g.live!;l.time=1.3;l.snapAge=.18;l.holdingPass=true;l.lockedReceiver=3;
    l.athletes[3]!.x=760;l.athletes[3]!.vx=50;l.athletes[5]!.x=450;
    g.rng=86;releasePass(g,'normal',3);
  }
  assert.deepEqual(human.live!.flight,cpu.live!.flight);
  const baseline=game('Crows');baseline.profiles=structuredClone(human.profiles);
  baseline.live=structuredClone(human.live!);baseline.live.mode='dropback';baseline.live.flight=undefined;baseline.live.offense='home';
  baseline.live.holdingPass=true;baseline.live.lockedReceiver=3;baseline.rng=86;
  releasePass(baseline,'normal',3);
  assert(Math.abs(baseline.live.flight!.duration/human.live!.flight!.duration-1.2)<1e-9);
  assert(human.live!.flight!.accuracy>=baseline.live.flight!.accuracy);
});
test('tackle breaking and defensive tackling improve only at contact and remain probabilistic', () => {
  const g=game('Marauders','Crows'), l=g.live!;
  const runner=l.athletes[6]!, tackler=l.athletes[10]!;
  assert(Math.abs(contactEscapeOpportunity(g,runner,tackler,.1)-.1)<1e-12); // both +20%.
  g.teams.opponent='Bulls';
  assert(Math.abs(contactEscapeOpportunity(g,runner,tackler,.1)-.12)<1e-12);
  assert(contactEscapeOpportunity(g,runner,tackler,.39)<1);
});
test('normal JSON saves remain valid and repeated effective lookups never alter ratings or athletes', () => {
  const g=game('Arrowheads','Crows'), before=JSON.stringify(g);
  for(let n=0;n<100;n++) for(const a of g.live!.athletes) legendaryAthleteFactor(g,a);
  assert.equal(JSON.stringify(g),before);assert(isFootballGame(JSON.parse(before)));
});
test('WR receiving boosts improve physically contested catches without eliminating drops or base-rating differences', () => {
  const normal=game('Crows'), legend=game('Goldminers');
  legend.profiles=structuredClone(normal.profiles);
  const counts:number[]=[];
  for(const g of [normal,legend]){
    const l=g.live!, a=l.athletes[3]!;
    g.clutchActive=false;g.profiles.home.receivers=.6;
    for(const d of l.athletes.filter(a=>a.side==='defense')) d.engaged=100;
    Object.assign(l.athletes[11]!,{x:a.x,y:a.y,engaged:0});
    l.flight={type:'normal',fromX:400,fromY:96,toX:a.x,toY:a.y,x:a.x,y:a.y,z:0,age:1,duration:1,receiver:3,accuracy:.7};
    let caught=0;
    for(let i=1;i<=4000;i++){g.rng=Math.imul(i,2654435761)>>>0;caught+=Number(resolveReception(g)===undefined);}
    counts.push(caught);
  }
  assert(counts[1]!>counts[0]!+20);
  assert(counts[0]!>0&&counts[1]!<4000);
});
test('a legendary linebacker physically pursues and accelerates faster without changing the pursuit assignment', () => {
  const boosted=game('Crows');boosted.possession='away';
  boosted.live=startField(boosted,'power','man');
  const l=boosted.live;l.time=3;l.mode='run';l.carrier=6;
  for(const a of l.athletes){a.x=1050;a.y=35;a.engaged=0;}
  Object.assign(l.athletes[6]!,{x:600,y:96,vx:0,vy:0});
  Object.assign(l.athletes[10]!,{x:700,y:96,vx:0,vy:0});
  const normal=structuredClone(boosted);normal.teams={player:'Bulls',opponent:'Crows'};
  stepDefense(normal,1/120);stepDefense(boosted,1/120);
  const b=boosted.live.athletes[10]!,n=normal.live!.athletes[10]!;
  assert(Math.hypot(b.vx,b.vy)>Math.hypot(n.vx,n.vy)*1.19);
  assert.equal(b.pursuit!.role,n.pursuit!.role);
  assert(b.pursuit!.until<n.pursuit!.until);
});
test('improved carrying reduces real contact fumbles without making a runner immune', () => {
  const baseline=game('Crows'), legend=game('Grizzlies');legend.profiles=structuredClone(baseline.profiles);
  const counts:number[]=[];
  for(const g of [baseline,legend]){
    let fumbles=0;g.clutchActive=false;
    const a=g.live!.athletes[6]!,d=g.live!.athletes[10]!;
    a.vx=80;d.vx=-80;
    for(let i=1;i<=20000;i++){g.rng=Math.imul(i,2654435761)>>>0;fumbles+=Number(tryFumble(g,'home',a,d));}
    counts.push(fumbles);
  }
  assert(counts[1]!>0&&counts[1]!<counts[0]!);
});
function canvas() {
  const pixels:{x:number;y:number;w:number;h:number}[]=[];
  let x=0,y=0;const stack:number[][]=[];
  const ctx={ fillStyle:'',fillRect:(px:number,py:number,w:number,h:number)=>pixels.push({x:px+x,y:py+y,w,h}),
    save:()=>stack.push([x,y]),restore:()=>{[x,y]=stack.pop()! as [number,number];},
    translate:(px:number,py:number)=>{x+=px;y+=py;} } as unknown as CanvasRenderingContext2D;
  return {ctx,pixels};
}
test('jersey bitmap retains the exact arrow bob and tracks existing broadcast projection without drift', () => {
  const a=canvas(),b=canvas(),c=canvas();
  jerseyMark(a.ctx,500,96,0,84);jerseyMark(b.ctx,500,96,.25,84);
  assert.equal(a.pixels.length,b.pixels.length);
  a.pixels.forEach((p,i)=>{assert.equal(p.x,b.pixels[i]!.x);assert.equal(p.y-1,b.pixels[i]!.y);});
  withBroadcastWorld(c.ctx,{centerX:300},()=>jerseyMark(c.ctx,500,96,0,84));
  const projected=projectBroadcastPoint(500,96,{centerX:300});
  a.pixels.forEach((p,i)=>assert(Math.abs(c.pixels[i]!.x-p.x-(projected.x-500))<1e-9));
});
test('multiple legends render simultaneously, avoid duplicate labels and never mutate the game', () => {
  const g=game('Militia','Crows'), before=JSON.stringify(g), all=canvas(), one=canvas();
  drawLegendaryUnit(all.ctx,g,g.live!.athletes,0);
  jerseyMark(one.ctx,g.live!.athletes[5]!.x,g.live!.athletes[5]!.y,0,12);
  assert(all.pixels.length>one.pixels.length*3);
  assert.equal(legendaryAthlete(g,g.live!.athletes[12]!),undefined);
  assert.equal(JSON.stringify(g),before);
});
