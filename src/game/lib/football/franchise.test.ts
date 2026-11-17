import test from 'node:test';
import assert from 'node:assert/strict';
import { createFranchise, startFranchiseGame, completeFranchiseGame, nextFranchiseSeason, franchiseRecord, awardMvp, mvpCounts, type Franchise, type MvpSlot } from './franchise';
import { isFranchise } from './franchise-validation';
import { franchiseAthleteFactor, franchiseFactor, upgradedPassingBaseline } from './franchise-upgrades';
import { createFootball, stepFootball } from './engine';
import { startField, stepField } from './field';
import { releasePass } from './passing';
import { isFootballGame } from './storage';
import { kickoffSequence, stepSpecialTeams } from './special-teams';
import { stepDefense } from './pursuit';
import { KICK_TEAMS } from '../kick-return-teams';

function result(f: Franchise, won: boolean) {
  f = startFranchiseGame(f);
  const g = structuredClone(f.active!.game);
  g.phase = 'final'; g.winner = won ? 'home' : 'away'; g.score = won ? { home: 28, away: 14 } : { home: 7, away: 21 };
  const n = completeFranchiseGame(f, g);
  assert.equal(completeFranchiseGame(n, g), n, 'completion acknowledgment is idempotent');
  assert(isFranchise(JSON.parse(JSON.stringify(n))));
  return n;
}
function season(wins: number, seed = 1986) {
  let f = createFranchise('Big Blue', seed);
  for (let i = 0; i < 16; i++) f = result(f, i < wins);
  return f;
}
function champion(f = season(12)) {
  for (let i = 0; i < 4; i++) f = result(f, true);
  // Historical pending-selection fixture: retain all legacy reward tests.
  // New measured championship finalization is covered by scouting-mvp.test.
  f.phase = 'mvp';
  return f;
}
function upgraded(slot: MvpSlot, count: number) {
  const g = createFootball(617, { player: 'Big Blue', opponent: 'Redbirds' });
  g.franchise = { gameId: 'qa', awards: { QB1: 0, KR1: 0, DB1: 0, RB1: 0, WR1: 0, [slot]: count } };
  g.possession = 'home'; g.spot = 40; g.target = 50; g.phase = 'live';
  return g;
}

test('all existing teams can create a permanent 16-game franchise; schedules permit replacement and persist', () => {
  assert(KICK_TEAMS.length >= 16);
  let repeated = false, omitted = false;
  for (const team of KICK_TEAMS) {
    const f = createFranchise(team.name, 617);
    assert.equal(f.schedule.length, 16); assert(isFranchise(f));
    assert(f.schedule.every(g => g.opponent !== team.name));
    repeated ||= new Set(f.schedule.map(g => g.opponent)).size < 16;
    omitted ||= KICK_TEAMS.some(t => t.name !== team.name && !f.schedule.some(g => g.opponent === t.name));
    assert.deepEqual(JSON.parse(JSON.stringify(f)), createFranchise(team.name, 617));
    assert.equal(franchiseRecord(f).remaining, 16);
  }
  assert(repeated && omitted);
});
test('only winning 16-game records qualify; tied and losing seasons stay intact', () => {
  for (const wins of [0, 7, 8, 9, 10, 16]) {
    const f = season(wins, 1986 + wins), r = franchiseRecord(f);
    assert.deepEqual(r, { wins, losses: 16 - wins, remaining: 0 });
    assert.equal(f.phase, wins > 8 ? 'playoffs' : 'offseason');
    assert(f.bracket, 'The league still plays its postseason when the player misses qualification.');
    if (f.bracket) {
      assert.equal(f.bracket.teams.length, 16);
      assert.equal(new Set(f.bracket.teams.map(t => t.team)).size, 16);
      assert.equal(f.bracket.teams.some(t => t.team === f.team), wins > 8);
      assert.deepEqual(f.bracket.rounds.map(r => r.length), [8, 4, 2, 1]);
    }
  }
});
test('four actual completed playoff games are required; bracket advancement uses the semifinal winners', () => {
  let f = season(9);
  for (let round = 0; round < 4; round++) {
    assert.equal(f.bracket!.round, round);
    const started = startFranchiseGame(f);
    assert.deepEqual(startFranchiseGame(started), started);
    assert.equal(started.active!.round, round);
    if (round === 3) {
      const semi = f.bracket!.rounds[2]!.map(m => m.winner);
      assert(semi.includes(f.team)); assert(semi.includes(started.active!.opponent));
      assert.equal(started.active!.introDone, false);
      assert.equal(started.active!.halftimeRemaining, 15);
    }
    f = result(started, true);
    assert.equal(f.championships.length, round === 3 ? 1 : 0);
  }
  assert.equal(f.phase, 'offseason'); assert.equal(f.ceremony!.winner, f.team);
  assert(f.ceremony!.mvpUnavailable, 'A score-only fixture must not invent individual performance.');
  assert.equal(f.bracket!.round, 4); assert.equal(f.bracket!.rounds[3]![0]!.winner, f.team);
  assert.throws(() => nextFranchiseSeason(f));
});
test('early playoff elimination resolves the remaining tournament and preserves the fixed bracket', () => {
  let f = result(season(12), false);
  assert.equal(f.phase, 'eliminated'); assert.equal(f.championships.length, 0);
  assert.equal(f.bracket!.round, 4);
  assert(f.bracket!.rounds.flat().every(m => m.winner));
  assert(f.ceremony?.mvpUnavailable, 'CPU champion reports missing individual statistics.');
  f.ceremony = null; // Acknowledge the CPU trophy before opening the next season.
  const n = nextFranchiseSeason(f);
  assert.equal(n.season, 2); assert.equal(n.history[0]!.bracket!.round, 4);
  assert.equal(n.team, f.team); assert.equal(n.phase, 'regular');
});
test('Super Cup loss celebrates only the opponent and never permits an MVP', () => {
  let f = season(10);
  for (let i = 0; i < 3; i++) f = result(f, true);
  f = result(f, false);
  assert(!f.ceremony!.won); assert.notEqual(f.ceremony!.winner, f.team);
  assert.equal(f.championships.length, 0);
  assert.throws(() => awardMvp(f, 'RB1'));
});
test('MVPs persist across seasons, stack additively on one stable slot, and cannot be awarded twice', () => {
  let f = createFranchise('Big Blue', 1986);
  for (const slot of ['QB1', 'QB1', 'QB1', 'RB1', 'WR1', 'DB1', 'KR1'] as const) {
    for (let i = 0; i < 16; i++) f = result(f, true);
    f = champion(f);
    const won = f; f = awardMvp(f, slot);
    assert.equal(awardMvp(f, slot), f);
    assert.equal(f.awards.length, f.championships.length);
    assert.equal(f.awards.length, won.championships.length);
    f.ceremony = null;
    const oldSchedule = f.schedule; f = nextFranchiseSeason(f);
    assert.equal(f.team, 'Big Blue'); assert.equal(franchiseRecord(f).wins, 0);
    assert.notDeepEqual(f.schedule, oldSchedule);
    assert(isFranchise(f));
  }
  assert.equal(mvpCounts(f).QB1, 3);
  assert.equal(f.championships.length, 7); assert.equal(f.history.length, 7);
  assert.equal(franchiseFactor(upgraded('QB1', 3), 'QB1'), 1.6);
});
test('unplayed, tied or wrong-game results cannot advance a franchise', () => {
  const f = startFranchiseGame(createFranchise('Big Blue', 1986));
  assert.throws(() => completeFranchiseGame(f, f.active!.game));
  const wrong = structuredClone(f.active!.game); wrong.phase = 'final'; wrong.winner = 'home';
  wrong.score = { home: 0, away: 0 }; assert.throws(() => completeFranchiseGame(f, wrong));
  wrong.score.home = 7; wrong.franchise!.gameId = 'not-the-active-game';
  assert.throws(() => completeFranchiseGame(f, wrong));
  assert.equal(franchiseRecord(f).remaining, 16);
});
test('QB upgrades multiply original accuracy and improve both real pass trajectories without granting QB speed', () => {
  for (const type of ['normal', 'bullet'] as const) {
    const base = upgraded('QB1', 0), boosted = upgraded('QB1', 1);
    for (const g of [base, boosted]) { g.live = startField(g, 'slant', 'pass'); g.live.time = .8; releasePass(g, type); }
    assert(boosted.live!.flight!.accuracy > base.live!.flight!.accuracy);
    assert.equal(franchiseAthleteFactor(boosted, boosted.live!.athletes[5]!), 1);
  }
  assert.equal(upgradedPassingBaseline(upgraded('QB1', 1), .7), .84);
  assert.equal(upgradedPassingBaseline(upgraded('QB1', 2), .5), .7);
  assert(upgradedPassingBaseline(upgraded('QB1', 100), .7) < 1);
});
test('RB and WR rewards accelerate only the selected athlete in real movement; standalone stays baseline', () => {
  for (const [slot, play, id] of [['RB1', 'power', 6], ['WR1', 'post', 3]] as const) {
    const normal = upgraded(slot, 0), fast = upgraded(slot, 2);
    for (const g of [normal, fast]) {
      g.live = startField(g, play, 'pass');
      if (slot === 'RB1') {
        g.live.mode = 'run'; g.live.carrier = 6; g.live.time = 1.5;
        g.live.movement.player = { x: 510, y: 96 };
      }
      for (const a of g.live.athletes.filter(a => a.side === 'defense')) a.engaged = 100;
    }
    const starts = [normal, fast].map(g => g.live!.athletes[id]!.x);
    for (let i = 0; i < 15; i++) { stepField(normal, {}, 1 / 60); stepField(fast, {}, 1 / 60); }
    assert(fast.live!.athletes[id]!.x - starts[1]! > normal.live!.athletes[id]!.x - starts[0]!);
    assert.equal(franchiseAthleteFactor(fast, fast.live!.athletes[id]!), 1.3);
    assert.equal(franchiseAthleteFactor(fast, fast.live!.athletes[4]!), 1);
    const standalone = structuredClone(fast); delete standalone.franchise;
    assert.equal(franchiseAthleteFactor(standalone, standalone.live!.athletes[id]!), 1);
  }
});
test('one stable DB gains real coverage/pursuit speed without upgrading the opponent or every defensive back', () => {
  const normal = upgraded('DB1', 0), fast = upgraded('DB1', 3);
  for (const g of [normal, fast]) {
    g.possession = 'away'; g.live = startField(g, 'power', 'pass');
    g.live.mode = 'run'; g.live.carrier = 6; g.live.time = 2;
    g.live.athletes[6]!.x = 850;
    for (const d of g.live.athletes.filter(a => a.role === 'DB')) { d.x = 600; d.y = 96; }
  }
  for (let i = 0; i < 30; i++) { stepDefense(normal, 1 / 60); stepDefense(fast, 1 / 60); }
  assert(fast.live!.athletes[11]!.x > normal.live!.athletes[11]!.x);
  assert.equal(franchiseAthleteFactor(fast, fast.live!.athletes[11]!), 1.35);
  assert.equal(franchiseAthleteFactor(fast, fast.live!.athletes[12]!), 1);
  fast.possession = 'home'; assert.equal(franchiseAthleteFactor(fast, fast.live!.athletes[11]!), 1.35, 'Turnover possession never changes a stable player identity.');
});
test('KR reward follows the franchise kickoff returner, saves cleanly, and does not change other modes', () => {
  const games = [upgraded('KR1', 0), upgraded('KR1', 2)];
  for (const g of games) {
    g.kickReceiver = 'home'; g.phase = 'kickoff'; g.special = kickoffSequence(g, 'full');
    for (let i = 0; i < 800 && !g.returnAttempt; i++) stepSpecialTeams(g, {}, 1 / 60);
    assert(g.returnAttempt); assert(isFootballGame(g));
    // Separate everyone for a clean open-field speed measurement.
    g.returnAttempt!.player = { x: 500, y: 96 };
    for (const d of g.returnAttempt!.defenders) { d.x = 1000; d.y = 30; }
    for (const a of g.special!.athletes.filter(a => a.side === 'defense')) a.x = 1100;
  }
  const before = games.map(g => g.returnAttempt!.player.x);
  for (let i = 0; i < 10; i++) for (const g of games) stepFootball(g);
  assert(games[1]!.returnAttempt!.player.x - before[1]! > games[0]!.returnAttempt!.player.x - before[0]!);
  assert.equal(games[1]!.returnAttempt!.fullCoverage!.returnSpeed, 1.3);
});
