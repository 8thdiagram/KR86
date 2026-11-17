import test from 'node:test';
import assert from 'node:assert/strict';
import { MVP_IDS, mvpMultiplier, speedBonus, skillBonus, kickerControl } from './mvp';
import { clutchEligible, chaosOpportunity, lockClutch } from './clutch';
import { createFootball, queueOffense, snapFootball, advanceFootballReady, stepFootball } from './engine';
import { franchiseFactor, franchiseAthleteFactor, linebackerSkill, turnoverSkill, franchiseKickControl } from './franchise-upgrades';
import { legendaryDefensiveFactor } from './legendary';
import { startField, stepField } from './field';
import { emptyAwards, currentTeamRating } from './league-ratings';
import { createFranchise, awardMvp, nextFranchiseSeason, startFranchiseGame, completeFranchiseGame, type Franchise } from './franchise';
import { isFranchise } from './franchise-validation';
import { isFootballGame } from './storage';
import { simulateLeagueMatch, simulateClutchPossession, teamAwardCounts } from './league';
import { kickoffSequence, stepSpecialTeams, fieldGoalSequence } from './special-teams';
import { stepDefense } from './pursuit';
import { momentRoll, MOMENTS, primaryMoment } from './execution-moments';
import { fumbleChance, tryFumble } from './rare-events';
import { resolvePassDefense } from './pass-defense';
import { stepInterception } from './interception';
import type { FootballGame, Side } from './types';
import { offensiveChoices } from './playbook';
import { kickSeed } from '../kick-return-engine';
import { stepPenetration } from './penetration';
import { canForwardPass } from './passing';

function game(n = 0, clutch = false, side: Side = 'home') {
  const g = createFootball(1986, { player: 'Big Blue', opponent: 'Redbirds' });
  g.phase = 'play-call'; g.quarter = 4; g.clock = clutch ? 4 : 40; g.clutchActive = clutch;
  g.possession = side; g.spot = 40; g.target = 50;
  g.franchise = { gameId: 'clutch-qa', awards: Object.fromEntries(MVP_IDS.map(k => [k, n])) as ReturnType<typeof emptyAwards>,
    opponentAwards: emptyAwards() };
  return g;
}
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-12, `${a} vs ${b}`);
for (const slot of ['KR1', 'RB1', 'WR1', 'DB1'] as const) {
  test(`${slot}: exact diminished normal/clutch multipliers, no compounding or endpoint overflow`, () => {
    const normal = [1, 1.2, 1.3, 1.35, 1.375, 1.3875, 1.39375];
    const clutch = [1, 1.4, 1.6, 1.7, 1.75, 1.775, 1.7875];
    for (let n = 0; n < normal.length; n++) {
      near(franchiseFactor(game(n), slot), normal[n]!);
      near(franchiseFactor(game(n, true), slot), clutch[n]!);
      near(franchiseFactor(JSON.parse(JSON.stringify(game(n, true))), slot), clutch[n]!);
    }
    for (const n of [7, 20, 100, 1000, Number.MAX_SAFE_INTEGER]) {
      assert(speedBonus(n) < .4); assert(speedBonus(n, true) < .8);
      assert(mvpMultiplier(slot, n) < 1.4); assert(mvpMultiplier(slot, n, true) < 1.8);
    }
    for (let n = 1; n < 20; n++) near(speedBonus(n + 1) - speedBonus(n), .2 * .5 ** n);
  });
}
test('skill bonuses stay additive and kicking stays clutch-only with a functional floor', () => {
  for (let n = 0; n <= 4; n++) {
    near(skillBonus(n), .2 * n); near(skillBonus(n, true), .4 * n);
    near(franchiseFactor(game(n), 'QB1'), 1 + .2 * n);
    near(franchiseFactor(game(n, true), 'QB1'), 1 + .4 * n);
    near(kickerControl(n, false), 1); near(kickerControl(n, true), Math.max(.35, 1 - .1 * n));
    for (const side of ['home', 'away'] as const) {
      const g = game(n, true); if (side === 'away') [g.franchise!.awards, g.franchise!.opponentAwards] = [g.franchise!.opponentAwards!, g.franchise!.awards];
      near(franchiseKickControl(g, side), kickerControl(n, true));
    }
  }
  assert.equal(kickerControl(10000, true), .35);
});
test('full activation table excludes ordinary drives, Q1/Q3 and margins over seven', () => {
  for (const [quarter, clock, margin, active] of [
    [2,4,0,1], [2,4,7,1], [2,4,8,0], [2,45,0,0], [4,3,4,1], [4,3,7,1],
    [4,3,10,0], [4,60,0,0], [1,3,0,0], [3,3,0,0], [4,6,7,1], [4,6.01,0,0], [4,0,0,0],
  ]) {
    const g = game(); g.quarter = quarter!; g.clock = clock!; g.score.home = margin!;
    assert.equal(clutchEligible(g), !!active, `${quarter}/${clock}/${margin}`);
    g.score.home = 0; g.score.away = margin!; assert.equal(clutchEligible(g), !!active);
  }
  const g = game(); g.overtime = true; g.clock = 0; g.score.away = 99; assert(clutchEligible(g));
});
test('selection is not eligibility: snap locks actual clock, persists through expiry and re-evaluates next snap', () => {
  const g = game(2); g.clock = 7; g.clockRunning = true; g.timeouts.away = 0;
  queueOffense(g, offensiveChoices(g)[0]!.id); assert(!g.clutchActive);
  advanceFootballReady(g, 2); snapFootball(g); assert(g.clutchActive);
  g.clock = 0; g.quarterPending = true;
  for (let i = 0; i < 10; i++) stepFootball(g);
  assert(g.clutchActive); assert(isFootballGame(JSON.parse(JSON.stringify(g))));
  g.phase = 'play-call'; g.quarterPending = false; g.clock = 45; g.live = undefined;
  queueOffense(g, offensiveChoices(g)[0]!.id); snapFootball(g); assert(!g.clutchActive);
});
test('all earned players act independently; neither possession changes nor opponent awards compensate', () => {
  for (const side of ['home', 'away'] as const) for (const clutch of [false, true]) {
    const g = game(3, clutch, side); g.live = startField(g, 'verticals', 'blitz');
    const players = g.live.athletes;
    near(franchiseAthleteFactor(g, players[3]!), side === 'home' ? mvpMultiplier('WR1', 3, clutch) : 1);
    near(franchiseAthleteFactor(g, players[6]!), side === 'home' ? mvpMultiplier('RB1', 3, clutch) : 1);
    near(franchiseAthleteFactor(g, players[11]!), side === 'away' ? mvpMultiplier('DB1', 3, clutch) : 1);
    near(franchiseAthleteFactor(g, players[12]!), 1);
    near(linebackerSkill(g, players[10]!), (side === 'away' ? 1 + skillBonus(3, clutch) : 1) * legendaryDefensiveFactor(g,players[10]!));
    near(turnoverSkill(g, players[11]!), (side === 'away' && clutch ? 2.2 : 1) * legendaryDefensiveFactor(g,players[11]!));
    const before = franchiseAthleteFactor(g, players[11]!);
    g.possession = side === 'home' ? 'away' : 'home'; near(franchiseAthleteFactor(g, players[11]!), before);
    delete g.franchise;
    for (const a of players) assert.equal(franchiseAthleteFactor(g, a), 1);
  }
});
function win(f: Franchise) {
  const n = startFranchiseGame(f), g = structuredClone(n.active!.game);
  g.phase = 'final'; g.winner = 'home'; g.score = { home: 21, away: 7 };
  return completeFranchiseGame(n, g);
}
test('all seven human awards survive full seasons, ceremony, reload and next season without duplication', () => {
  let f = createFranchise('Big Blue', 1986);
  for (const slot of MVP_IDS) {
    for (let i = 0; i < 20; i++) f = win(f);
    f.phase = 'mvp'; // Historical pending award fixture, not the new automatic path.
    f = awardMvp(f, slot); assert.equal(awardMvp(f, slot), f);
    assert.equal(f.ceremony!.mvp!.slot, slot); assert(isFranchise(f));
    f = JSON.parse(JSON.stringify(f)); f.ceremony = null;
    f = nextFranchiseSeason(f); assert(isFranchise(f));
    assert.equal(teamAwardCounts(f, f.team)[slot], 1);
  }
  assert.equal(f.awards.length, 7); assert.equal(f.championships.length, 7);
  const fresh = createFranchise('Big Blue', 1986); assert.equal(fresh.league!.awards.length, 0);
});
test('CPU statistical champions never receive invented MVPs and remain valid into future seasons', () => {
  for (let seed = 1; seed <= 120; seed++) {
    let f = createFranchise('Big Blue', seed);
    for (let i = 0; i < 16; i++) {
      f = startFranchiseGame(f); const g = structuredClone(f.active!.game);
      g.phase = 'final'; g.winner = 'away'; g.score = {home: 0, away: 21}; f = completeFranchiseGame(f, g);
    }
    assert.equal(f.ceremony!.mvp, undefined); assert.notEqual(f.ceremony!.winner, f.team);
    assert.match(f.ceremony!.mvpUnavailable!, /individual MVP performance is unavailable/);
    f = JSON.parse(JSON.stringify(f)); assert(isFranchise(f)); f.ceremony = null; f = nextFranchiseSeason(f);
    assert.equal(f.league!.awards.length, 0); assert(isFranchise(f));
  }
});
test('legacy five-slot save snapshots remain valid; malformed new award counts are rejected', () => {
  const f = createFranchise('Big Blue', 1986);
  for (const row of f.league!.seasons[0]!.teams) { delete (row.awards as Partial<typeof row.awards>).LB1; delete (row.awards as Partial<typeof row.awards>).K1; }
  assert(isFranchise(f));
  const g = game(); delete g.franchise!.awards.LB1; delete g.franchise!.awards.K1; assert(isFootballGame(g));
  g.franchise!.awards.LB1 = -1; assert(!isFootballGame(g)); g.franchise!.awards.LB1 = 1.5; assert(!isFootballGame(g));
});
test('shared conditional chances rise 25% relatively and do not depend on human side or awards', () => {
  for (const side of ['home', 'away'] as const) for (const n of [0, 1, 30]) {
    near(chaosOpportunity(game(n, true, side), .05), .0625);
    near(chaosOpportunity(game(n, false, side), .05), .05);
    near(chaosOpportunity(game(n, true, side), .05, false), .05);
    assert(chaosOpportunity(game(n, true), 1) < 1);
  }
});
test('exceptional route and coverage opportunities use separate fixed athlete draws, with physical route motion', () => {
  let normal = 0, clutch = 0;
  for (let seed = 1; seed <= 10000; seed++) {
    const g = game(); g.seed = seed; g.live = startField(g, 'post', 'prevent');
    g.live.time = 1.6; const receiver = g.live.athletes[3]!;
    if (primaryMoment(g, receiver) > 0) normal++;
    g.clutchActive = true; if (primaryMoment(g, receiver) > 0) clutch++;
    assert.notEqual(momentRoll(g.live, receiver), momentRoll(g.live, g.live.athletes[11]!));
  }
  assert(clutch > normal * 1.15 && clutch < normal * 1.4, `${normal}/${clutch}`);
  console.log('CLUTCH measured route opportunities', {normal, clutch});
});
test('near-asymptotic RB/WR/DB speeds stay frame-bounded, inside sidelines and tackleable', () => {
  for (const slot of ['RB1', 'WR1', 'DB1'] as const) {
    const g = game(60, true, slot === 'DB1' ? 'away' : 'home'); g.phase = 'live';
    g.live = startField(g, 'power', 'pass'); const l = g.live!;
    const runner = l.athletes[slot === 'WR1' ? 3 : 6]!;
    l.carrier = runner.id; l.mode = 'run'; l.time = 2;
    runner.x = 550; runner.y = 96; l.movement.player = {x:550,y:96};
    for (const d of l.athletes.filter(a => a.side === 'defense')) { d.x = 900; d.y = 30; d.engaged = 100; }
    if (slot === 'DB1') {
      const d = l.athletes[11]!; d.x = 700; d.y = 96; d.engaged = 0;
      let max = 0;
      for (let i = 0; i < 60; i++) { const x = d.x; stepDefense(g, 1/60); max = Math.max(max, Math.abs(d.x-x)); assert(Number.isFinite(d.x)); }
      assert(max < 4); console.log('CLUTCH peak DB frame travel', max);
    } else {
      let max = 0;
      for (let i = 0; i < 50; i++) { const x = runner.x; stepField(g, {direction:i%2 ? 1:-1}, 1/60); max = Math.max(max, Math.abs(runner.x-x)); assert(runner.y >= 12 && runner.y <= 168); }
      assert(max < 4); assert(runner.x < 1100);
      const d = l.athletes[11]!; d.x = runner.x + 1; d.y = runner.y; d.engaged = 0;
      l.broken = 2; const result = stepField(g, {}, 1/60); assert.equal(result?.reason, 'tackle');
      console.log(`CLUTCH peak ${slot} frame travel`, max);
    }
  }
});
test('near-limit MVP kickoff returns physically move, retain collision/pursuit and roundtrip their saves', () => {
  for (const side of ['home', 'away'] as const) {
    const g = game(60, true);
    g.franchise!.opponentAwards = {...g.franchise!.awards}; g.kickReceiver = side; g.phase = 'kickoff';
    g.special = kickoffSequence(g, 'full');
    for (let i = 0; i < 1000 && !g.returnAttempt; i++) stepSpecialTeams(g, {}, 1/60);
    assert(g.returnAttempt); assert(isFootballGame(JSON.parse(JSON.stringify(g))));
    const a = g.returnAttempt!; a.player = {x: 500, y:96};
    for (const d of a.defenders) { d.x = 1000; d.y = 30; }
    let max = 0;
    for (let i = 0; i < 30; i++) { const x = g.returnAttempt!.player.x; stepSpecialTeams(g, {direction:0}, 1/60); max = Math.max(max, g.returnAttempt!.player.x-x); }
    assert(max < 4); assert(g.returnAttempt!.player.x < 1100); assert(isFootballGame(JSON.parse(JSON.stringify(g))));
    const d = g.returnAttempt!.defenders[0]!; d.x = g.returnAttempt!.player.x + 1; d.y = g.returnAttempt!.player.y;
    const r = stepSpecialTeams(g, {}, 1/60); assert(r && r.kind !== 'touchdown', 'Contact still stops a near-limit returner');
    console.log('CLUTCH peak KR frame travel', side, max);
  }
});
test('CPU simulations use permanent attributes and isolate clutch to explicit touchdown-only overtime', () => {
  const f = createFranchise('Big Blue', 1986), boosted = structuredClone(f);
  for (let season = 1; season <= 3; season++) boosted.league!.awards.push({team:'Big Blue',season,slot:'RB1'});
  assert(currentTeamRating(boosted,'Big Blue').offense > currentTeamRating(f,'Big Blue').offense);
  assert(currentTeamRating(boosted,'Big Blue',Infinity,true).offense > currentTeamRating(boosted,'Big Blue').offense);
  let overtime = 0, wins = 0;
  for (let i = 0; i < 500; i++) {
    const m = simulateLeagueMatch(boosted,'Big Blue','Redbirds');
    assert(m.score[0] !== m.score[1]); if(m.winner === 'Big Blue') wins++;
    if(m.overtime) {overtime++; assert.equal(Math.abs(m.score[0]-m.score[1]),7);}
  }
  assert(overtime > 0); assert(wins > 0 && wins < 500);
  let score = 0; for (let i=0;i<500;i++) score += Number(simulateClutchPossession(boosted,'Big Blue','Redbirds'));
  assert(score > 0 && score < 500);
  console.log('CLUTCH statistical sample', {overtime,wins,possessionsScored:score});
});
test('physically reached deep catches, interceptions, breakups and contact fumbles increase without guaranteed outcomes', () => {
  const totals = [0, 1, 3].map(n => {
    const rows = [false,true].map(clutch => {
      const result = {catches:0,interceptions:0,breakups:0,fumbles:0,pressure:0,bursts:0};
      for(let seed=1;seed<=2500;seed++) {
        const g = game(n,clutch,'away'); g.seed = seed; g.rng = kickSeed(`clutch-outcome:${seed}`);
        g.live = startField(g,'post','prevent'); const l = g.live!;
        l.mode = 'flight'; l.time = 1.9;
        const wr = l.athletes[3]!, db = l.athletes[11]!;
        for(const a of l.athletes) {a.x=900; a.y=30; a.engaged=100;}
        wr.x = 650; wr.y=96; db.x=650; db.y=96; db.engaged=0;
        l.flight = {type:'normal',x:650,y:96,z:5,fromX:500,fromY:96,toX:650,toY:96,
          age:.79,duration:.8,receiver:3,accuracy:.55,attempted:[11],contested:[]};
        db.dive={phase:'airborne',elapsed:.03,vx:0,vy:0,angle:0};
        db.defensiveAttempt={kind:'intercept',at:1.8,ideal:true};
        const contest = resolvePassDefense(g,649,96);
        if(contest === 'interception') result.interceptions++;
        if(contest === 'breakup') result.breakups++;
        // Same seed/contact, separate conditional trial (not an extra attempt in play).
        l.mode='run'; db.dive=undefined; wr.vx=65;db.vx=-60;
        g.rng=kickSeed(`clutch-fumble:${seed}`);
        result.fumbles += Number(tryFumble(g,'away',wr,db));
        // Actual catch pipeline: ball arrives at a physically waiting receiver.
        g.rng=kickSeed(`clutch-catch:${seed}`); l.mode='flight'; l.passCaught=false; l.carrier=5;
        for(const a of l.athletes.filter(a=>a.side==='defense')) {a.x=900;a.y=30;a.engaged=100; a.dive=undefined; a.defensiveAttempt=undefined;}
        db.x=671; db.y=96;
        l.flight={type:'normal',x:648,y:96,z:2,fromX:500,fromY:96,toX:650,toY:96,
          age:.79,duration:.8,receiver:3,accuracy:.55,attempted:[],contested:[]};
        l.athletes[5]!.x=500; l.athletes[5]!.y=96;
        stepField(g,{},1/60); result.catches += Number(l.passCaught);
        // Group pressure opportunity still requires a real reachable escape path.
        g.live = startField(g,'post','blitz');
        for(let i=0;i<180 && !g.live.penetration?.event;i++) {
          g.live.time=i/60; stepPenetration(g);
        }
        result.pressure += Number(!!g.live.penetration?.event);
        result.bursts += Number(momentRoll(g.live,g.live.athletes[6]!) < chaosOpportunity(g,MOMENTS.opportunity));
      }
      return result;
    });
    const [normal,clutch] = rows;
    for(const key of ['catches','interceptions','breakups','pressure','bursts'] as const)
      assert(clutch![key] > normal![key], `${n} ${key}: ${normal![key]}/${clutch![key]}`);
    assert(clutch!.interceptions < 2500 && clutch!.catches < 2500);
    return {awards:n,normal,clutch};
  });
  console.log('CLUTCH paired 2500-seed conditional outcome samples', JSON.stringify(totals));
});
test('a distant receiver cannot receive a miracle catch, and human interceptions still need a committed ACTION dive', () => {
  const g = game(60,true,'away'); g.live=startField(g,'post','prevent'); const l=g.live!;
  l.mode='flight'; l.time=2;
  for(const a of l.athletes) {a.x=900;a.y=30;a.engaged=100;}
  l.athletes[3]!.x=500;l.athletes[3]!.y=96;l.athletes[5]!.x=490;
  l.flight={x:650,y:96,z:0,fromX:500,fromY:96,toX:650,toY:96,age:.79,duration:.8,
    receiver:3,accuracy:.94,attempted:[],contested:[]};
  const db=l.athletes[11]!;db.x=650;db.y=96;db.engaged=0;
  assert.equal(resolvePassDefense(g,650,96),undefined);
  const result=stepField(g,{},1/60);
  assert.equal(result?.reason,'incomplete');assert(!l.passCaught);
});
test('complete physical plays compare deep coverage, blitz pressure and breakaway runs with and without earned awards', () => {
  const rows: unknown[]=[];
  for(const awards of [0,6]) for(const clutch of [false,true]) {
    for(const [play,defense] of [['power','run'],['post','prevent'],['post','blitz'],['verticals','prevent']] as const) {
      const outcomes: Record<string,number>={};let gains=0,longRuns=0,completions=0,frames=0;
      for(let seed=1;seed<=60;seed++) {
        const g=game(awards,clutch);g.seed=seed;g.rng=kickSeed(`full-clutch:${seed}`);g.phase='live';
        g.live=startField(g,play,defense);const l=g.live!;let result:ReturnType<typeof stepField>;
        for(let frame=0;frame<1201&&!result;frame++) {
          result=stepField(g,{direction:frame%180<90?1:-1,
            ...(canForwardPass(l)&&l.time>=2.2?{passRelease:'normal' as const}:{})},1/60);
          for(const a of l.athletes) assert(Number.isFinite(a.x)&&Number.isFinite(a.y));
          frames++;
        }
        assert(result,'Each actual play must resolve');outcomes[result.reason]=(outcomes[result.reason]??0)+1;
        const gain=result.spot-l.snapSpot;gains+=gain;longRuns+=Number(play==='power'&&gain>=20);
        completions+=g.stats.home.completions;
      }
      assert((outcomes.touchdown??0)<60,'No guaranteed miracle TDs');
      rows.push({awards,clutch,play,defense,outcomes,averageGain:Number((gains/60).toFixed(2)),longRuns,completions,frames});
    }
  }
  console.log('CLUTCH full physical-play sample (60 matched seeds/row)',JSON.stringify(rows));
});
test('DB earned speed remains active on physical interception returns, not just coverage', () => {
  const distance: number[]=[];
  for(const n of [0,6]) {
    const g=game(n,true,'away');g.live=startField(g,'post','prevent');const l=g.live!;
    const db=l.athletes[11]!;db.x=700;db.y=96;
    l.mode='return';l.carrier=db.id;l.interception={catcher:db.id,age:1,catchX:700,catchY:96};l.time=2;
    l.movement.player={x:500,y:96};g.possession='home';
    for(const a of l.athletes.filter(a=>a.side==='offense')) {a.x=1100;a.y=30;}
    for(let i=0;i<30;i++) {stepInterception(g,{},1/60);l.time+=1/60;}
    distance.push(700-db.x);
  }
  assert(distance[1]!>distance[0]!*1.6,JSON.stringify(distance));
});
test('human and CPU kicker awards slow the real meter and reduce equivalent CPU timing error, never guarantee scoring', () => {
  const meter:number[]=[];
  for(const n of [0,1,7,60]) {
    const g=game(n,true);g.spot=70;g.live=startField(g,'field-goal','pass');
    // A normal scrimmage kick uses the actual hold stage/meter.
    g.phase='live';
    // Direct sequence avoids menu restrictions without changing scoring rules.
    const s=fieldGoalSequence(g);g.special=s;s.stage='hold';s.stageAge=0;
    stepSpecialTeams(g,{},.1);meter.push(g.live.kickMeter);
    assert(Number.isFinite(g.live.kickMeter));
    const c=game(n,true,'away');c.franchise!.opponentAwards={...c.franchise!.awards};c.spot=70;
    c.live=startField(c,'field-goal','pass');c.special=fieldGoalSequence(c);c.special.stage='hold';c.special.stageAge=.81;
    stepSpecialTeams(c,{},1/60);
    assert(Math.abs(c.special.accuracy!-.5)<=.5*franchiseKickControl(c,'away'));
  }
  assert(meter[0]!>meter[1]!&&meter[1]!>meter[2]!);assert.equal(meter[2],meter[3]);
});
