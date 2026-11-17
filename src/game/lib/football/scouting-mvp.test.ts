import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, stepFootball } from './engine';
import { startField } from './field';
import { inFootballFrame } from './direction';
import { LEGENDS, legendaryPlayer, type LegendPosition } from './legendary-roster';
import { capturePerformance, observePerformance, performanceScore, recordLegendStat, selectChampionshipMvp } from './mvp-performance';
import { createFranchise, startFranchiseGame, completeFranchiseGame, nextFranchiseSeason, resolveLegacyMvp, type Franchise } from './franchise';
import { scoutingLegend, scoutingTeams } from './scouting';
import { emptyAwards } from './league-ratings';
import { isFootballGame } from './storage';
import { isFranchise } from './franchise-validation';
import { franchiseAthleteFactor, effectiveAthleteFactor, franchiseFactor, specialAwardAdjustment, turnoverSkill, upgradedPassingBaseline } from './franchise-upgrades';
import { legacyTeamCounts, ownedTeamAwards, rewardSlot } from './legend-awards';
import { kickoffSequence } from './special-teams';
import { intercept } from './interception';
import type { FootballGame, Side } from './types';
import { KICK_TEAMS } from '../kick-return-teams';

function tracked(home: FootballGame['teams']['player'] = 'Grizzlies', away: FootballGame['teams']['opponent'] = home === 'Ponies' ? 'Grizzlies' : 'Ponies') {
  const g = createFootball(86, { player: home, opponent: away });
  g.franchise = { gameId: 'scout-test', awards: emptyAwards(), opponentAwards: emptyAwards(),
    performance: { version: 1, gameId: 'scout-test', coverage: 'full-game', players: {} } };
  return g;
}
function credit(g: FootballGame, side: Side, position: LegendPosition, stats: Parameters<typeof performanceScore>[0]) {
  const p = legendaryPlayer(side === 'home' ? g.teams.player : g.teams.opponent, position);
  assert(p, `${side} ${position} is a real legend`);
  for (const [metric, value] of Object.entries(stats)) recordLegendStat(g, side, p, metric as keyof typeof stats, value);
}
function finish(f: Franchise, won = true, contribute?: (g: FootballGame) => void) {
  f = startFranchiseGame(f);
  const g = structuredClone(f.active!.game);
  contribute?.(g);
  g.phase = 'final'; g.winner = won ? 'home' : 'away';
  g.score = won ? { home: 35, away: 21 } : { home: 14, away: 28 };
  const n = completeFranchiseGame(f, g);
  assert.equal(completeFranchiseGame(n, g), n);
  assert(isFranchise(JSON.parse(JSON.stringify(n))), 'new fields survive franchise validation');
  return n;
}
function finalist(team = 'Grizzlies', seed = 986) {
  let f = createFranchise(team, seed);
  for (let i = 0; i < 19; i++) f = finish(f);
  assert.equal(f.bracket!.round, 3);
  return f;
}
function ownedGame(f: Franchise) {
  const g = tracked(f.team as FootballGame['teams']['player']);
  g.franchise!.awards = legacyTeamCounts(f, f.team);
  g.franchise!.playerAwards = { home: ownedTeamAwards(f, f.team) };
  g.possession = 'home'; g.phase = 'live'; g.spot = 40;
  g.live = startField(g, 'power', 'man');
  return g;
}

test('all 32 scouting reports use the authoritative 135-entry roster, both actual teams and no invented names', () => {
  for (const t of KICK_TEAMS) {
    const f = createFranchise(t.name, 86), opponent = f.schedule[0]!.opponent;
    const reports = scoutingTeams(f, opponent);
    assert.deepEqual(reports.map(t => t.label), ['YOUR TEAM', 'OPPONENT']);
    assert.deepEqual(reports.map(t => t.team), [t.name, opponent]);
    for (const r of reports) {
      assert.equal(r.players.length, LEGENDS.filter(p => p.team === r.team).length);
      for (const p of r.players) {
        const actual = legendaryPlayer(r.team, p.position as LegendPosition)!;
        assert.equal(p.number, actual.number); assert.equal(p.identity, actual.identity);
        assert.equal(p.mvpCount, 0); assert.equal(p.mvpBonuses.length, 0);
        assert(!('name' in p));
      }
    }
  }
});
test('QB passing/rushing and kicker control remain separate, and effective multipliers are not percentage-point sums', () => {
  const f = createFranchise('Ponies', 86), qb = legendaryPlayer('Ponies', 'QB')!;
  f.awards.push({ season: 1, slot: 'QB1' });
  const q = scoutingLegend(f, 'Ponies', qb);
  assert.deepEqual(q.legendBonuses, ['Passing +20%', 'Rushing +0%']);
  const game = ownedGame(f);
  const actualAccuracy = upgradedPassingBaseline(game, .30 + game.profiles.home.qb * 1.2 * .43);
  assert(q.totals.some(t => t.startsWith(`Base pass accuracy ${Number((actualAccuracy * 100).toFixed(2))}%`)));
  assert(!q.totals.includes('Passing +44%'), 'Legend boosts the QB attribute, not the constant accuracy term');
  assert(q.totals.includes('Rushing +0%'));
  const kicker = legendaryPlayer('Ponies', 'K')!;
  f.awards.push({ season: 2, slot: 'K1' });
  const k = scoutingLegend(f, 'Ponies', kicker);
  assert(k.totals.includes('Normal aim/meter ×0.9091'));
  assert(k.totals.includes('Clutch aim/meter ×0.8182'));
});
test('diminishing awards, clutch modifiers, and original Legend bonuses agree with actual engine factors', () => {
  const f = createFranchise('Grizzlies', 86);
  f.awards.push({ season: 1, slot: 'RB1' }, { season: 2, slot: 'RB1' });
  const row = scoutingLegend(f, f.team, legendaryPlayer(f.team, 'RB')!);
  assert.equal(row.mvpCount, 2);
  assert(row.totals.includes('Speed +56%'));
  assert(row.totals.includes('Clutch speed +92%'));
  const g = ownedGame(f);
  assert(Math.abs(effectiveAthleteFactor(g, g.live!.athletes[6]!) - 1.56) < 1e-12);
  g.clutchActive = true;
  assert(Math.abs(effectiveAthleteFactor(g, g.live!.athletes[6]!) - 1.92) < 1e-12);
});

test('a dominant runner wins over a modest QB and ignores a losing legend with enormous statistics', () => {
  const g = tracked('Bison', 'Ponies');
  credit(g, 'home', 'QB', { passingYards: 160, passingTD: 1, completions: 12, attempts: 20 });
  credit(g, 'home', 'RB', { rushingYards: 185, rushingTD: 3 });
  credit(g, 'away', 'QB', { passingYards: 600, passingTD: 7 });
  g.winner = 'home';
  assert.equal(selectChampionshipMvp(g).award?.position, 'RB');
});
test('a dominant passer can win on actual passing production', () => {
  const g = tracked('Bison');
  credit(g, 'home', 'QB', { passingYards: 390, passingTD: 5, completions: 25, attempts: 31 });
  credit(g, 'home', 'RB', { rushingYards: 60 });
  g.winner = 'home'; assert.equal(selectChampionshipMvp(g).award?.position, 'QB');
});
test('WR, TE, LB, CB, S, KR and K can all win on their actual contributions', () => {
  const cases = [
    ['Ponies', 'WR', { receivingYards: 190, receivingTD: 3, receptions: 10 }],
    ['Arrowheads', 'TE', { receivingYards: 150, receivingTD: 3, receptions: 9 }],
    ['Crows', 'LB', { sacks: 4, tackles: 10, forcedFumbles: 2 }],
    ['Hawks', 'CB', { interceptions: 3, defensiveTD: 1, tackles: 5 }],
    ['Crows', 'S', { interceptions: 2, defensiveTD: 1, tackles: 8 }],
    ['Grizzlies', 'KR', { returnYards: 230, returnTD: 2 }],
    ['Grizzlies', 'K', { fieldGoals: 5 }],
  ] as const;
  for (const [team, position, stats] of cases) {
    const g = tracked(team); credit(g, 'home', position, stats); g.winner = 'home';
    const selected = selectChampionshipMvp(g).award!;
    assert.equal(selected.position, position); assert.equal(selected.slot, rewardSlot(position));
    assert.equal(selected.legendId, legendaryPlayer(team, position)!.identity);
    assert(selected.performance.length > 0);
  }
});
test('the same role-aware selection applies when the CPU wins a played Super Cup', () => {
  const g = tracked('Ponies', 'Grizzlies');
  credit(g, 'home', 'QB', { passingYards: 500, passingTD: 5 });
  credit(g, 'away', 'RB', { rushingYards: 195, rushingTD: 3 });
  g.winner = 'away';
  assert.equal(selectChampionshipMvp(g).award?.team, 'Grizzlies');
  assert.equal(selectChampionshipMvp(g).award?.position, 'RB');
});
test('ties use stable player identity, never RNG, jersey alone, ratings or insertion order', () => {
  const g = tracked('Grizzlies');
  credit(g, 'home', 'RB', { rushingTD: 1 }); credit(g, 'home', 'K', { fieldGoals: 2 });
  g.winner = 'home';
  const seed = g.rng, first = selectChampionshipMvp(g);
  g.franchise!.performance!.players.home = Object.fromEntries(Object.entries(g.franchise!.performance!.players.home!).reverse());
  assert.deepEqual(selectChampionshipMvp(g), first); assert.equal(g.rng, seed);
});
test('same-jersey different players remain separate; multi-role identities aggregate once', () => {
  const g = tracked('Norsemen');
  credit(g, 'home', 'WR', { receivingTD: 1 });
  credit(g, 'home', 'KR', { returnTD: 1 });
  g.winner = 'home';
  assert.notEqual(legendaryPlayer('Norsemen', 'WR')!.identity, legendaryPlayer('Norsemen', 'KR')!.identity);
  assert.equal(selectChampionshipMvp(g).award!.position, 'KR');
  const shared = tracked('Black Cats');
  credit(shared, 'home', 'WR', { receivingYards: 70, receivingTD: 1 });
  credit(shared, 'home', 'KR', { returnYards: 65 });
  shared.winner = 'home';
  assert.equal(selectChampionshipMvp(shared).award!.position, 'WR');
  assert.match(selectChampionshipMvp(shared).award!.performance, /65 return yd/);
});
test('missing historical statistics or no eligible contribution never invent a reward', () => {
  const g = tracked(); g.winner = 'home';
  assert.match(selectChampionshipMvp(g).reason!, /No winning legend/);
  delete g.franchise!.performance;
  assert.match(selectChampionshipMvp(g).reason!, /unavailable/);
});

test('new playable games persist an unfinished scouting screen; re-entry cannot create another match', () => {
  const f = startFranchiseGame(createFranchise('Grizzlies', 86));
  assert.equal(f.active!.scoutingDone, false);
  assert.equal(startFranchiseGame(f), f);
  assert(isFranchise(JSON.parse(JSON.stringify(f))));
  const old = structuredClone(f); delete old.active!.scoutingDone;
  assert(isFranchise(old), 'old in-progress games require no artificial scouting checkpoint');
});
test('played championship finalization awards a real winner once, persists and updates next-season scouting', () => {
  const before = finalist();
  const f = finish(before, true, g => credit(g, 'home', 'RB', { rushingYards: 180, rushingTD: 3 }));
  assert.equal(f.phase, 'offseason'); assert.equal(f.awards.length, 1);
  const a = f.awards[0]!;
  assert.equal(a.legendId, legendaryPlayer(f.team, 'RB')!.identity); assert.equal(a.position, 'RB');
  assert.equal(f.ceremony!.mvp!.legendId, a.legendId);
  const saved = JSON.parse(JSON.stringify(f)); assert(isFranchise(saved));
  saved.ceremony = null;
  const next = nextFranchiseSeason(saved), g = startFranchiseGame(next).active!.game;
  assert.equal(franchiseFactor(g, 'RB1'), 1.2);
  const row = scoutingTeams(next, next.schedule[0]!.opponent)[0]!.players.find(p => p.position === 'RB')!;
  assert.equal(row.mvpCount, 1); assert(row.totals.includes('Speed +44%'));
});
test('repeated championships improve the same player with existing diminishing returns, not duplicate awards', () => {
  let f = finalist();
  for (let season = 1; season <= 2; season++) {
    f = finish(f, true, g => credit(g, 'home', 'RB', { rushingYards: 180, rushingTD: 3 }));
    assert.equal(f.awards.length, season);
    assert.equal(new Set(f.awards.map(a => a.legendId)).size, 1);
    f.ceremony = null; f = nextFranchiseSeason(f);
    if (season < 2) for (let i = 0; i < 19; i++) f = finish(f);
  }
  const g = startFranchiseGame(f).active!.game;
  assert.equal(franchiseFactor(g, 'RB1'), 1.3);
  assert.equal(scoutingLegend(f, f.team, legendaryPlayer(f.team, 'RB')!).mvpCount, 2);
});
test('a CPU winner in a played championship gets its own permanent, saved identity award', () => {
  const f = finish(finalist(), false, g => credit(g, 'away', 'K', { fieldGoals: 4 }));
  assert.equal(f.awards.length, 0);
  assert.equal(f.league!.awards.length, 1);
  const award = f.league!.awards[0]!;
  assert.equal(award.team, f.ceremony!.winner); assert.equal(award.position, 'K');
  assert.equal(scoutingLegend(f, award.team, legendaryPlayer(award.team, 'K')!).mvpCount, 1);
});
test('CPU-only championship results are retained but insufficient individual data is explicitly reported', () => {
  let f = createFranchise('Grizzlies', 86);
  for (let i = 0; i < 16; i++) f = finish(f, false);
  assert(f.league!.seasons[0]!.champion); assert(f.ceremony);
  assert.equal(f.league!.awards.length, 0);
  assert.match(f.ceremony!.mvpUnavailable!, /CPU simulation/);
  assert.equal(f.league!.seasons[0]!.mvpUnavailable, f.ceremony!.mvpUnavailable);
});
test('legacy pending selection preserves its title, old awards and random stream without fabricating performance', () => {
  const f = finish(finalist());
  f.phase = 'mvp';
  const next = resolveLegacyMvp(f);
  assert.deepEqual(next.championships, f.championships); assert.deepEqual(next.awards, f.awards);
  assert.equal(next.rng, f.rng); assert.equal(next.phase, 'offseason');
  assert.match(next.ceremony!.mvpUnavailable!, /Historical/);
});

test('new TE and safety MVP rewards belong to those exact actors, not the first WR/CB', () => {
  for (const [team, position, id, peer] of [['Arrowheads', 'TE', 4, 3], ['Crows', 'S', 13, 11]] as const) {
    const f = createFranchise(team, 86), p = legendaryPlayer(team, position)!;
    f.awards.push({ season: 1, slot: rewardSlot(position), legendId: p.identity, position, number: p.number, performance: 'actual test' });
    const g = ownedGame(f);
    if (position === 'S') { g.possession = 'away'; g.live = startField(g, 'power', 'man'); }
    assert.equal(franchiseAthleteFactor(g, g.live!.athletes[id]!), 1.2);
    assert.equal(franchiseAthleteFactor(g, g.live!.athletes[peer]!), 1);
    if (position === 'S') {
      g.clutchActive = true;
      assert(Math.abs(turnoverSkill(g, g.live!.athletes[id]!) - 1.54) < 1e-12);
    }
  }
});
test('historical and identity-owned awards combine before diminishing returns, with no double application', () => {
  const f = createFranchise('Grizzlies', 86), p = legendaryPlayer(f.team, 'RB')!;
  f.awards.push({ season: 1, slot: 'RB1' },
    { season: 2, slot: 'RB1', legendId: p.identity, position: 'RB', number: p.number, performance: '180 rush yd' });
  const g = ownedGame(f);
  assert.equal(g.franchise!.awards.RB1, 1);
  assert.equal(franchiseFactor(g, 'RB1'), 1.3);
  assert.equal(franchiseAthleteFactor(g, g.live!.athletes[6]!), 1.3);
});
test('special teams apply the actual safety reward without also upgrading the first CB or duplicating returner rewards', () => {
  const f = createFranchise('Crows', 86), s = legendaryPlayer('Crows', 'S')!;
  f.awards.push({ season: 1, slot: 'DB1', legendId: s.identity, position: 'S', number: s.number, performance: '2 INT' });
  const g = ownedGame(f);
  g.kickReceiver = 'away'; g.special = kickoffSequence(g, 'full');
  const safety = g.special.athletes[5]!, cb = g.special.athletes[3]!;
  assert.equal(specialAwardAdjustment(g, safety, 'home'), 1.2);
  assert.equal(specialAwardAdjustment(g, cb, 'home'), 1);
});

test('observer attributes actual completion and yardage to QB and receiver, not both receivers', () => {
  const g = tracked('Arrowheads'); g.phase = 'live'; g.possession = 'home';
  const l = g.live = startField(g, 'slant', 'man');
  l.mode = 'flight'; l.carrier = 5;
  const before = capturePerformance(g);
  g.stats.home.attempts++; g.stats.home.completions++; g.stats.home.passYards += 16;
  l.carrier = 4; l.passCaught = true; l.mode = 'run';
  observePerformance(g, before);
  const rows = Object.values(g.franchise!.performance!.players.home!);
  assert.equal(rows.find(r => r.position === 'QB')!.stats.passingYards, 16);
  assert.equal(rows.find(r => r.position === 'TE')!.stats.receivingYards, 16);
  assert(!rows.some(r => r.position === 'WR'));
});
test('real engine touchdown credits runner once and telemetry cannot change outcomes, motion, animations or RNG', () => {
  for (const side of ['home', 'away'] as const) for (const direction of [1, -1] as const) {
    const g = tracked('Grizzlies', 'Bison');
    g.possession = side; g.homeOddDirection = direction; g.phase = 'live'; g.spot = 99; g.target = 100;
    inFootballFrame(g, () => {
      const l = g.live = startField(g, 'power', 'man');
      l.snapAge = .18; l.mode = 'run'; l.carrier = 6; l.rusher = 6; l.time = 2;
      l.athletes[6]!.x = 1098; l.athletes[6]!.y = 96;
      l.movement.player = { x: 1098, y: 96 };
      for (const a of l.athletes.filter(a => a.side === 'defense')) { a.x = 100; a.y = 30; }
    });
    const plain = structuredClone(g); delete plain.franchise!.performance;
    for (let i = 0; i < 60 && !g.score[side]; i++) { stepFootball(g, {}, 1 / 60); stepFootball(plain, {}, 1 / 60); }
    assert.equal(g.score[side], 7);
    const rb = Object.values(g.franchise!.performance!.players[side]!).find(p => p.position === 'RB')!;
    assert.equal(rb.stats.rushingTD, 1); assert.equal(rb.stats.rushingYards, g.stats[side].rushYards);
    const comparable = structuredClone(g); delete comparable.franchise!.performance;
    assert.deepEqual(comparable, plain);
  }
});
test('new saves reject damaged contribution/award identities and still accept legacy saves', () => {
  const g = tracked(); assert(isFootballGame(g));
  credit(g, 'home', 'RB', { rushingYards: 120 }); assert(isFootballGame(g));
  const bad = structuredClone(g);
  Object.values(bad.franchise!.performance!.players.home!)[0]!.identity = 'invented player';
  assert(!isFootballGame(bad));
  const nan = structuredClone(g); Object.values(nan.franchise!.performance!.players.home!)[0]!.stats.rushingYards = NaN;
  assert(!isFootballGame(nan));
  delete g.franchise!.performance; delete g.franchise!.playerAwards;
  assert(isFootballGame(g));
  assert(!isFootballGame({ franchise: {} }));
});
test('actual CPU pass plays credit the same passing totals and leave untracked receiver roles uncredited', () => {
  const g = tracked('Grizzlies', 'Ponies');
  g.possession = 'away'; g.quarter = 1; g.clock = 120;
  for (let play = 0; play < 8; play++) {
    g.phase = 'live'; g.spot = 35; g.target = 45; g.possession = 'away';
    delete g.tackleScene; delete g.playResult;
    inFootballFrame(g, () => { g.live = startField(g, play % 2 ? 'slant' : 'verticals', 'zone'); });
    for (let frame = 0; frame < 1000 && g.phase === 'live'; frame++) stepFootball(g, {}, 1 / 60);
  }
  const qb = Object.values(g.franchise!.performance!.players.away ?? {}).find(p => p.position === 'QB')!;
  assert(g.stats.away.attempts > 0);
  assert.equal(qb.stats.attempts, g.stats.away.attempts);
  assert.equal(qb.stats.completions ?? 0, g.stats.away.completions);
  assert.equal(qb.stats.passingYards ?? 0, g.stats.away.passYards);
});
test('real contact sacks credit the actual legendary tackler, not the nearest rated player', () => {
  const g = tracked('Bison', 'Crows'); g.phase = 'live'; g.possession = 'home'; g.spot = 40;
  const l = g.live = startField(g, 'slant', 'man');
  l.snapAge = .18; l.time = 1;
  const qb = l.athletes[5]!, lb = l.athletes[10]!;
  for (const d of l.athletes.filter(a => a.side === 'defense')) { d.x = 900; d.y = 30; }
  lb.x = qb.x; lb.y = qb.y; lb.startX = qb.x; lb.engaged = 0;
  stepFootball(g, {}, 1 / 60);
  assert.equal(g.stats.home.sacks, 1);
  const row = Object.values(g.franchise!.performance!.players.away!).find(p => p.position === 'LB')!;
  assert.equal(row.stats.sacks, 1);
  assert.equal(row.identity, legendaryPlayer('Crows', 'LB')!.identity);
});
test('interceptions credit the actual catcher and original passer only once', () => {
  const g = tracked('Bison', 'Crows'); g.phase = 'live'; g.spot = 40; g.possession = 'home';
  const l = g.live = startField(g, 'slant', 'man');
  l.mode = 'flight';
  l.flight = { type: 'bullet', receiver: 3, fromX: 420, fromY: 96, toX: 510, toY: 30,
    x: 470, y: 80, z: 2, duration: .5, age: .25 };
  const before = capturePerformance(g);
  intercept(l, l.athletes[13]!); observePerformance(g, before);
  const defense = Object.values(g.franchise!.performance!.players.away!);
  assert.equal(defense.find(p => p.position === 'S')!.stats.interceptions, 1);
  const offense = Object.values(g.franchise!.performance!.players.home!);
  assert.equal(offense.find(p => p.position === 'QB')!.stats.interceptionsThrown, 1);
  const next = capturePerformance(g); observePerformance(g, next);
  assert.equal(defense.find(p => p.position === 'S')!.stats.interceptions, 1);
});
