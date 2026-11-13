import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, queueOffense, snapFootball, stepFootball } from './engine';
import { startField, routePoint } from './field';
import { progression, canForwardPass } from './passing';
import { PLAYBOOK, DEFENSES, offensiveChoices, offensiveMenuChoices, eligibleOffensivePlays, defensiveChoices,
  defensiveMenuChoices, cpuPlay, matchupAdvantage } from './playbook';
import { offensiveCoachWeight, defensiveCoachingPlan, type CoachingObservation } from './coaching';
import { defensiveCoachWeight } from './coaching';
import { cpuOptionPitch } from './speed-option';
import { containmentTarget } from './containment';
import { diagramForPlay, diagramForDefense } from './diagrams';
import { isFootballGame } from './storage';
import { createFootballControls } from './controls';
import type { Defense, FootballGame } from './types';

function ready(seed=1986) {
  const g=createFootball(seed,{player:'Goldminers',opponent:'Porpoises'});
  Object.assign(g,{phase:'play-call',spot:30,target:40,homeOddDirection:1});return g;
}
function observations(g:FootballGame,patch:Partial<CoachingObservation>,n=6) {
  g.coaching??={version:1,observations:[]};
  for(let i=0;i<n;i++) g.coaching.observations.push({at:++g.plays,offense:g.possession,play:'sweep',defense:'man',
    kind:'run',depth:5,gain:12,success:true,stopped:false,sack:false,turnover:false,completed:false,lane:1,entry:0,...patch});
}
function option(dir:1|-1=1,seed=1986,spot=30) {
  const g=ready(seed);g.homeOddDirection=dir;
  g.spot=spot;g.target=Math.min(100,spot+10);
  queueOffense(g,'speed-option');
  assert.equal(g.phase,'pre-snap');assert.equal(g.live!.option!.pitchedAt,undefined);
  // Keep these fixtures open; real matchup tests separately use every actual defense.
  g.live!.athletes.filter(a=>a.side==='defense').forEach(a=>{a.x=dir===1 ? spot>90 ? 50:1150 : spot>90 ? 1150:50;});
  snapFootball(g);
  return g;
}
test('expanded books retain every old call and contain exactly three new strategies',()=>{
  assert.equal(Object.keys(PLAYBOOK).length,17);assert.equal(DEFENSES.length,8);
  assert(PLAYBOOK.flood&&PLAYBOOK['speed-option']);assert(DEFENSES.some(d=>d.id==='contain'));
});
test('six recommended offense cards and four-defense windows retain every eligible alternative',()=>{
  for(const down of [1,2,3,4]) for(const spot of [20,97]) for(const distance of [1,8,15]) {
    const g=ready();g.down=down;g.spot=spot;g.target=Math.min(100,spot+distance);
    const offense=offensiveMenuChoices(g),defense=defensiveMenuChoices(g);
    assert.equal(offensiveChoices(g).length,6);assert.equal(new Set(offense.slice(0,6).map(p=>p.id)).size,6);
    assert.deepEqual(new Set(offense.map(p=>p.id)),new Set(eligibleOffensivePlays(g).map(p=>p.id)));
    const reached=new Set<string>();
    for(let page=0;page<Math.ceil(defense.length/4);page++) {
      const shown=Array.from({length:4},(_,i)=>defense[(page*4+i)%defense.length]!.id);
      assert.equal(new Set(shown).size,4);shown.forEach(id=>reached.add(id));
    }
    assert.deepEqual(reached,new Set(defensiveChoices(g).map(d=>d.id)));
    assert.equal(reached.has('goal-line'),spot>95);
    assert(!offense.some(p=>p.id==='punt')||down===4);
  }
});
test('opportunities promote Speed Option, Flood and Contain without automatic permanent inclusion',()=>{
  const g=ready();assert(!offensiveChoices(g).some(p=>p.id==='flood'));
  observations(g,{});assert(offensiveChoices(g).some(p=>p.id==='speed-option'));
  const flood=ready();observations(flood,{play:'out',kind:'pass',defense:'pass',lane:undefined,depth:7});
  assert(offensiveChoices(flood).some(p=>p.id==='flood'));
  g.possession='away';observations(g,{});
  assert(defensiveMenuChoices(g).slice(0,4).some(d=>d.id==='contain'));
});
test('successful Flood and option remain recommended; stopped calls stay accessible through admission',()=>{
  for(const play of ['flood','speed-option'] as const) {
    const g=ready();observations(g,{play,kind:PLAYBOOK[play].kind as 'run'|'pass'});
    assert(offensiveChoices(g).some(p=>p.id===play));
    observations(g,{play,kind:PLAYBOOK[play].kind as 'run'|'pass',gain:0,success:false,stopped:true},10);
    assert(!offensiveChoices(g).some(p=>p.id===play));
    assert(eligibleOffensivePlays(g).some(p=>p.id===play));
    queueOffense(g,play);assert.equal(g.pendingSnap!.play,play);
  }
});
test('exploited Contain falls out of recommendations but remains a legal human choice',()=>{
  const g=ready();g.possession='away';observations(g,{play:'power',defense:'contain',lane:0});
  assert(!defensiveMenuChoices(g).slice(0,4).some(d=>d.id==='contain'));
  assert(defensiveChoices(g).some(d=>d.id==='contain'));
});
test('CPU offense responds to stopped outside runs against Contain with existing interior concepts',()=>{
  const g=ready();g.possession='away';
  observations(g,{play:'speed-option',defense:'contain',gain:0,success:false,stopped:true});
  assert(offensiveCoachWeight(g,'power',matchupAdvantage)>offensiveCoachWeight(g,'speed-option',matchupAdvantage));
  const calls=Array.from({length:300},()=>cpuPlay(g));
  assert(calls.some(p=>['power','draw','counter','slant'].includes(p)));assert(new Set(calls).size>5);
});
test('recommendations are independent of hidden pending calls, target locks and RNG draws',()=>{
  const g=ready();observations(g,{});
  const other=structuredClone(g);other.pendingSnap={play:'flood',defense:'contain',remaining:.16};
  other.live=startField(other,'post','run');other.live.lockedReceiver=6;
  other.rng=g.rng;
  assert.deepEqual(offensiveMenuChoices(g),offensiveMenuChoices(other));
  assert.deepEqual(defensiveMenuChoices(g),defensiveMenuChoices(other));
  const rng=g.rng;offensiveMenuChoices(g);defensiveMenuChoices(g);assert.equal(g.rng,rng);
});
test('Flood uses the established three-read timing with medium/flat/deep sideline routes',()=>{
  const g=ready(),l=startField(g,'flood','pass');
  assert.equal(progression(l).receiver,3);
  l.time=1.8;assert.equal(progression(l).receiver,6);
  l.time=2.5;assert.equal(progression(l).receiver,4);
  const routes=[3,6,4].map(i=>routePoint(l,l.athletes[i]!));
  assert(routes.every(p=>p.y>145));
  assert(routes[1]!.x<routes[0]!.x&&routes[0]!.x<routes[2]!.x);
  assert(canForwardPass(l));
  for(const dir of [1,-1] as const) {
    g.homeOddDirection=dir;const d=diagramForPlay(g,'flood');
    assert.deepEqual(d.filter(r=>r.read).map(r=>r.read).sort(),[1,2,3]);
    assert(d.find(r=>r.read===1)!.primary);
  }
});
test('option snap is separate from pitch, and real lateral flight survives both-direction saves',()=>{
  for(const dir of [1,-1] as const) {
    const g=option(dir);
    for(let i=0;i<30;i++) stepFootball(g,{});
    stepFootball(g,{action:true});
    const l=g.live!;assert.equal(l.option!.phase,'pitch');assert.equal(l.carrier,5);
    const b=l.option!.ball!;assert((b.toX-b.fromX)*dir<0);assert(b.duration>=.2);
    assert.equal(l.movement.moves!.active,undefined,'ACTION was a pitch, not a juke');
    const saved=JSON.parse(JSON.stringify(g)) as FootballGame;
    assert(isFootballGame(saved));
    for(let i=0;i<60&&l.option!.phase==='pitch';i++) {
      stepFootball(g,{});stepFootball(saved,{});assert(isFootballGame(g));
    }
    assert.deepEqual(JSON.parse(JSON.stringify(g)),JSON.parse(JSON.stringify(saved)));assert.equal(l.option!.phase,'received');assert.equal(l.carrier,6);
    assert.equal(g.stats.home.attempts,0);assert.equal(l.passCaught,false);
  }
});
test('no pitch produces an actual QB rush; a received pitch credits RB rushing without a pass attempt',()=>{
  for(const pitch of [false,true]) {
    const g=option(1,1986,97);
    for(let i=0;i<3000&&g.phase==='live';i++) stepFootball(g,{action:pitch&&i===30});
    assert.equal(g.phase,'play-dead');assert.equal(g.lastResult.includes('TOUCHDOWN'),true);
    const role=pitch ? 'RB':'QB';
    assert(g.rushing?.home?.[role]!.yards!>0);
    assert.equal(g.rushing?.home?.[role]!.touchdowns,1);
    assert.equal(g.stats.home.attempts,0);assert(isFootballGame(g));
  }
});
test('CPU option decision responds to actual commitment and pitch-lane protection, not the hidden call',()=>{
  const g=ready();g.live=startField(g,'speed-option','run');
  const qb=g.live.athletes[5]!,back=g.live.athletes[6]!,ds=g.live.athletes.filter(d=>d.side==='defense');
  ds.forEach(d=>{d.x=1000;});
  ds[0]!.x=qb.x+20;ds[0]!.y=qb.y;ds[0]!.vx=-20;
  assert(cpuOptionPitch(g));g.live.defense='contain';assert(cpuOptionPitch(g));
  ds[1]!.x=back.x+5;ds[1]!.y=back.y;assert(!cpuOptionPitch(g));
});
test('only an actual disrupted pitch becomes a loose football and uses existing recovery',()=>{
  const g=option();for(let i=0;i<30;i++)stepFootball(g,{});
  stepFootball(g,{action:true});const l=g.live!,b=l.option!.ball!;
  const d=l.athletes.find(a=>a.side==='defense')!;
  const t=Math.min(1,(b.age+1/60)/b.duration);
  d.x=b.fromX+(b.toX-b.fromX)*t;d.y=b.fromY+(b.toY-b.fromY)*t;d.engaged=0;
  stepFootball(g,{});assert.equal(l.option!.phase,'loose');assert.equal(l.mode,'loose');
  assert(l.loose);assert.equal(g.rareEvents!.fumbles,1);assert(isFootballGame(g));
  for(let i=0;i<300&&l.mode==='loose';i++) stepFootball(g,{});
  assert.notEqual(l.mode,'loose');assert.equal(g.rareEvents!.fumbles,1);
});
test('Contain physically separates QB spy, pitch-edge responsibility and coverage without ratings changes',()=>{
  const g=ready();g.live=startField(g,'speed-option','contain');
  const l=g.live!,qb=l.athletes[5]!,lb=l.athletes.find(a=>a.role==='LB')!,ends=l.athletes.filter(a=>a.role==='DL');
  const spy=containmentTarget(g,lb)!,edge=containmentTarget(g,ends.at(-1)!)!;
  assert.equal(spy.observed.id,qb.id);assert.equal(edge.observed.id,6);
  const neutral=structuredClone(g);neutral.live!.defense='run';
  assert.equal(containmentTarget(neutral,neutral.live!.athletes[lb.id]!),undefined);
  assert.deepEqual(g.profiles,neutral.profiles);
  const diagram=diagramForDefense(g,'contain');
  assert(diagram.some(r=>r.label==='SPY'&&r.assignment===5));
  assert.equal(diagram.filter(r=>r.zone).length,4);
  assert.notDeepEqual(diagram,diagramForDefense(g,'run-blitz'));
  const optionDiagram=diagramForPlay(g,'speed-option');
  assert(optionDiagram.some(r=>r.pitch));assert(optionDiagram.find(r=>r.id===5)!.primary);
});
test('option choices and timing are real saved coaching evidence; corrupted new state is rejected',()=>{
  const g=ready();observations(g,{play:'speed-option',optionChoice:'pitch',pitchTiming:'early'});
  assert.equal(defensiveCoachingPlan(g)?.optionChoice,'pitch');
  assert.equal(defensiveCoachingPlan(g)?.pitchTiming,'early');
  assert(isFootballGame(g));
  const bad=option();bad.live!.option!.until=NaN;assert(!isFootballGame(bad));
  const badStats=ready();badStats.rushing={home:{QB:{carries:1,yards:NaN,touchdowns:0,fumbles:0}}};assert(!isFootballGame(badStats));
});
test('the opponent learns counters to successful Flood and Option while the human keeps those calls',()=>{
  const g=ready();observations(g,{play:'flood',kind:'pass',defense:'pass',target:3,targetLane:1,timing:2});
  assert(offensiveChoices(g).some(p=>p.id==='flood'));
  assert(defensiveCoachWeight(g,'man',matchupAdvantage)>defensiveCoachWeight(g,'pass',matchupAdvantage));
  const o=ready();observations(o,{play:'speed-option',optionChoice:'keep'});
  assert(offensiveChoices(o).some(p=>p.id==='speed-option'));
  assert(defensiveCoachWeight(o,'contain',matchupAdvantage)>defensiveCoachWeight(o,'man',matchupAdvantage));
});
test('late pitches retain their actual timing and normal carrier ACTION returns after the read',()=>{
  const g=option();for(let i=0;i<70;i++)stepFootball(g,{});
  stepFootball(g,{action:true});assert.equal(g.live!.option!.phase,'pitch');
  assert.equal(g.live!.coachingSample!.pitchTiming,'late');
  const keep=option();for(let i=0;i<115;i++)stepFootball(keep,{});
  assert.equal(keep.live!.option!.phase,'kept');stepFootball(keep,{action:true});
  assert(keep.live!.movement.moves!.active,'ordinary evasion is restored');
});
test('keyboard and touch ACTION pitch on press, consume the hold, and never replay as a juke',()=>{
  for(const id of ['key:Space','pointer:1']) {
    const g=option(),controls=createFootballControls();
    for(let i=0;i<30;i++)stepFootball(g,{});
    controls.enter(id,'juke',100,g);
    const press=controls.sample(100);
    assert.equal(press.action,true);assert.equal(press.juke,false);
    stepFootball(g,press);assert.equal(g.live!.option!.phase,'pitch');
    assert.equal(controls.sample(600).action,false);assert.equal(controls.sample(600).hesitate,false);
    controls.release(id,650);
    assert.equal(controls.sample(650).action,false);assert.equal(controls.sample(650).juke,false);
  }
});
test('CPU option uses both real keeps and pitches against unmodified defensive formations',()=>{
  const choices=new Set<string>();
  for(const defense of ['blitz','contain','run','goal-line'] as const) for(const seed of [81,82,83,84]) {
    const g=ready(seed);Object.assign(g,{phase:'pre-snap',possession:'away',playClock:15,fieldFrame:1});
    g.pendingSnap={play:'speed-option',defense,remaining:0};g.live=startField(g,'speed-option',defense);
    for(let i=0;i<800&&(g.phase==='pre-snap'||g.phase==='live');i++) {
      stepFootball(g,{});assert(isFootballGame(g));
    }
    choices.add(g.live!.option!.pitchedAt===undefined ? 'keep':'pitch');
  }
  assert.deepEqual(choices,new Set(['keep','pitch']));
});
