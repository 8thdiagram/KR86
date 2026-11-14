import test from 'node:test';
import assert from 'node:assert/strict';
import { createFranchise, completeFranchiseGame, startFranchiseGame, nextFranchiseSeason, awardMvp, type Franchise, type MvpSlot } from './franchise';
import { currentTeamRating, teamAwardCounts, leagueWinProbability, migrateFranchise, simulateLeagueMatch } from './league';
import { emptyAwards } from './league-ratings';
import { isFranchise } from './franchise-validation';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { releasePass } from './passing';
import { stepDefense } from './pursuit';
import { franchiseAthleteFactor, franchiseFactor } from './franchise-upgrades';
import { kickoffSequence, stepSpecialTeams } from './special-teams';
import { isFootballGame } from './storage';
import { KICK_TEAMS } from '../kick-return-teams';

function finish(f: Franchise, won: boolean, yards = 0) {
  f = startFranchiseGame(f);
  const g = structuredClone(f.active!.game);
  g.phase = 'final'; g.winner = won ? 'home' : 'away';
  g.score = won ? { home: 28, away: 14 } : { home: 7, away: 21 };
  g.stats.home.rushYards = yards; g.stats.away.passYards = 100;
  const n = completeFranchiseGame(f, g);
  assert.equal(completeFranchiseGame(n, g), n);
  assert(isFranchise(JSON.parse(JSON.stringify(n))));
  return n;
}
function regular(wins = 8, f = createFranchise('Big Blue', 617)) {
  for (let i = 0; i < 16; i++) f = finish(f, i < wins, 11.25);
  return f;
}
function cpuGame(slot: MvpSlot, count: number) {
  const g = createFootball(617, { player: 'Big Blue', opponent: 'Redbirds' });
  g.franchise = { gameId: 'cpu-qa', awards: emptyAwards(), opponentAwards: { ...emptyAwards(), [slot]: count } };
  g.possession = 'away'; g.spot = 40; g.target = 50; g.phase = 'live';
  return g;
}
test('new leagues begin without future results; completed weeks pair every team exactly once with balanced totals', () => {
  let f = createFranchise('Big Blue', 617);
  assert(f.league!.seasons[0]!.teams.every(t => t.regular.games === 0));
  f = finish(f, true, 11.25);
  const s = f.league!.seasons[0]!;
  assert.equal(s.week, 1); assert(s.teams.every(t => t.regular.games === 1));
  const totals = (key: keyof typeof s.teams[0]['regular']) => s.teams.reduce((sum, t) => sum + t.regular[key], 0);
  assert.equal(totals('wins'), totals('losses')); assert.equal(totals('pointsFor'), totals('pointsAgainst'));
  assert.equal(totals('played'), 2); assert.equal(totals('simulated'), KICK_TEAMS.length - 2);
  assert.equal(s.teams.find(t => t.team === f.team)!.regular.rushYards, 11.25, 'Retain actual engine fractions.');
  assert.deepEqual(finish(createFranchise('Big Blue', 617), true, 11.25), f, 'No render/reload rerolls.');
});
test('missed playoffs still produce a CPU Super Cup champion, statistical postseason and one saved random MVP', () => {
  const f = regular(), s = f.league!.seasons[0]!;
  assert.equal(f.phase, 'offseason'); assert(!f.bracket!.teams.some(t => t.team === f.team));
  assert(s.teams.every(t => t.regular.games === 16));
  assert.equal(s.teams.reduce((sum, t) => sum + t.playoffs.games, 0), 30);
  assert.equal(f.league!.awards.length, 1); assert.equal(f.awards.length, 0);
  assert.equal(s.champion, f.ceremony!.winner); assert.equal(s.mvp!.team, s.champion);
  assert.equal(f.ceremony!.mvp!.slot, s.mvp!.slot); assert.notEqual(f.ceremony!.loser, f.team);
  assert.equal(teamAwardCounts(f, s.champion!)[s.mvp!.slot], 1);
  assert(s.teams.find(t => t.team === s.champion)!.playoffs.wins === 4);
});
test('early elimination and a human Super Cup loss both persist the CPU award without granting a human reward', () => {
  for (const wonRounds of [0, 3]) {
    let f = regular(12);
    for (let i = 0; i < wonRounds; i++) f = finish(f, true);
    f = finish(f, false);
    assert.equal(f.league!.awards.length, 1); assert.equal(f.championships.length, 0); assert.equal(f.awards.length, 0);
    assert(f.ceremony!.mvp); assert.notEqual(f.ceremony!.winner, f.team);
    const serialized = JSON.stringify(f);
    f = JSON.parse(serialized); assert(isFranchise(f));
    assert.equal(JSON.stringify(f), serialized);
  }
});
test('rival awards improve next-season ratings and actual opponent roster, and archived stats never change', () => {
  let f = regular();
  const champion = f.ceremony!.winner, slot = f.ceremony!.mvp!.slot;
  const old = JSON.stringify(f.league!.seasons[0]);
  const oldRating = f.league!.seasons[0]!.teams.find(t => t.team === champion)!.rating.overall;
  assert(currentTeamRating(f, champion).overall > oldRating);
  f.ceremony = null; f = nextFranchiseSeason(f);
  assert.equal(JSON.stringify(f.league!.seasons[0]), old);
  assert.equal(f.league!.seasons[1]!.teams.find(t => t.team === champion)!.awards[slot], 1);
  assert(f.league!.seasons[1]!.teams.every(t => t.regular.games === 0));
  f.schedule[0]!.opponent = champion;
  f = startFranchiseGame(f);
  assert.equal(f.active!.game.franchise!.opponentAwards![slot], 1);
  assert.equal(franchiseFactor(f.active!.game, slot, 'away'), 1.2);
  assert.equal(franchiseFactor(f.active!.game, slot, 'home'), 1);
});
test('CPU stacking is additive and probabilistic: stronger sides still suffer simulated upsets', () => {
  const base = createFranchise('Big Blue', 617), boosted = structuredClone(base);
  for (let season = 1; season <= 3; season++) boosted.league!.awards.push({ season, team: 'Redbirds', slot: 'QB1' });
  assert.equal(teamAwardCounts(boosted, 'Redbirds').QB1, 3);
  assert(leagueWinProbability(boosted, 'Redbirds', 'Big Blue') > leagueWinProbability(base, 'Redbirds', 'Big Blue'));
  assert.equal(franchiseFactor(cpuGame('QB1', 3), 'QB1', 'away'), 1.6);
  let normalWins = 0, improvedWins = 0;
  for (let i = 0; i < 2000; i++) {
    base.rng = boosted.rng = (Math.imul(i + 123, 2654435761) >>> 0);
    normalWins += Number(simulateLeagueMatch(base, 'Redbirds', 'Big Blue').winner === 'Redbirds');
    improvedWins += Number(simulateLeagueMatch(boosted, 'Redbirds', 'Big Blue').winner === 'Redbirds');
  }
  assert(improvedWins > normalWins); assert(improvedWins < 2000);
});
test('CPU QB accuracy increases for both pass types; one CPU RB/WR/DB moves faster without upgrading the user', () => {
  for (const pass of ['normal', 'bullet'] as const) {
    const base = cpuGame('QB1', 0), fast = cpuGame('QB1', 2);
    for (const g of [base, fast]) { g.live = startField(g, 'slant', 'pass'); g.live.time = .8; releasePass(g, pass); }
    assert(fast.live!.flight!.accuracy > base.live!.flight!.accuracy);
    assert.equal(franchiseAthleteFactor(fast, fast.live!.athletes[5]!), 1);
  }
  for (const [slot, play, id] of [['RB1', 'power', 6], ['WR1', 'post', 3]] as const) {
    const base = cpuGame(slot, 0), fast = cpuGame(slot, 2);
    for (const g of [base, fast]) {
      g.live = startField(g, play, 'pass');
      if (slot === 'RB1') { g.live.mode = 'run'; g.live.carrier = 6; g.live.time = 1.5; g.live.movement.player = { x: 510, y: 96 }; }
      for (const a of g.live.athletes.filter(a => a.side === 'defense')) a.engaged = 100;
    }
    for (let i = 0; i < 15; i++) { stepField(base, {}, 1 / 60); stepField(fast, {}, 1 / 60); }
    assert(fast.live!.athletes[id]!.x > base.live!.athletes[id]!.x);
    assert.equal(franchiseAthleteFactor(fast, fast.live!.athletes[4]!), 1);
  }
  const base = cpuGame('DB1', 0), fast = cpuGame('DB1', 3);
  for (const g of [base, fast]) {
    g.possession = 'home'; g.live = startField(g, 'power', 'pass'); g.live.mode = 'run'; g.live.carrier = 6; g.live.time = 2;
    g.live.athletes[6]!.x = 850;
    for (const d of g.live.athletes.filter(a => a.role === 'DB')) { d.x = 600; d.y = 96; }
  }
  for (let i = 0; i < 30; i++) { stepDefense(base, 1 / 60); stepDefense(fast, 1 / 60); }
  assert(fast.live!.athletes[11]!.x > base.live!.athletes[11]!.x);
  assert.equal(franchiseAthleteFactor(fast, fast.live!.athletes[12]!), 1);
});
test('CPU kickoff returner and coverage DB carry their own saved speed modifiers', () => {
  for (const slot of ['KR1', 'DB1'] as const) {
    const g = cpuGame(slot, 2);
    g.kickReceiver = slot === 'KR1' ? 'away' : 'home'; g.phase = 'kickoff'; g.special = kickoffSequence(g, 'full');
    for (let i = 0; i < 800 && !g.returnAttempt; i++) stepSpecialTeams(g, {}, 1 / 60);
    assert(g.returnAttempt); assert(isFootballGame(JSON.parse(JSON.stringify(g))));
    if (slot === 'KR1') assert.equal(g.returnAttempt.fullCoverage!.returnSpeed, 1.3);
    else assert.equal(g.returnAttempt.fullCoverage!.defenderSpeed!.factor, 1.3);
    delete g.franchise; assert(!isFootballGame(g), 'A powered return cannot masquerade as a standalone save.');
  }
});
test('human MVP path remains separate, old histories migrate honestly, and a new franchise resets the entire league', () => {
  let f = regular(12);
  for (let i = 0; i < 4; i++) f = finish(f, true);
  assert.equal(f.league!.awards.length, 0);
  f = awardMvp(f, 'RB1'); assert.equal(f.league!.awards[0]!.team, f.team);
  f.ceremony = null; f = nextFranchiseSeason(f);
  const old = structuredClone(f); delete old.league;
  // Old saved CPU standings were finalized at the beginning of a season.
  old.standings = old.standings.map(s => ({ ...s, wins: 8, losses: 8 }));
  const migrated = migrateFranchise(old);
  assert.deepEqual(migrated.schedule, old.schedule); assert.deepEqual(migrated.history, old.history);
  assert.equal(migrated.rng, old.rng); assert.equal(migrated.awards.length, 1); assert(isFranchise(migrated));
  assert(migrated.league!.seasons.every(s => s.legacy && s.teams.every(t => t.regular.games === 0)));
  assert.equal(migrateFranchise(migrated), migrated);
  const fresh = createFranchise('Redbirds', 617);
  assert.equal(fresh.season, 1); assert.equal(fresh.league!.awards.length, 0); assert.equal(fresh.league!.seasons.length, 1);
  assert.equal(fresh.history.length, 0); assert.equal(fresh.championships.length, 0);
});
