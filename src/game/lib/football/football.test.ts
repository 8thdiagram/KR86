import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, advanceFootball, tossFootball, chooseKick, chooseOffense, chooseDefense, snapFootball, takeTimeout, stepFootball,
  offensiveChoices, fieldGoalDistance, fieldGoalAllowed, matchupAdvantage, PLAYBOOK, type FootballGame, type PlayId } from './engine';
import { startField } from './field';
import { KR, createKickAttempt, stepKickAttempt, kickWitnessDirection } from '../kick-return-engine';
import { playerSpeed } from '../player-pace';
import { isFootballGame, loadFootball, saveFootball } from './storage';

const teams = { player: 'Big Blue', opponent: 'Redbirds' } as const;
function atSnap(seed = 42, spot = 35, down = 1, target = spot + 10) {
  const g = createFootball(seed, teams); g.phase = 'play-call'; g.spot = spot; g.down = down; g.target = Math.min(100, target); return g;
}
function playOut(g: FootballGame, id: PlayId, defense: 'run' | 'pass' | 'blitz' | 'prevent' = 'pass') {
  g.live = startField(g, id, defense); g.phase = 'live'; g.stats.home.plays++;
  for (let i = 0; i < 1400 && g.phase === 'live'; i++) {
    const l = g.live!;
    stepFootball(g, { action: l.mode === 'dropback' && l.time >= PLAYBOOK[id].develop + .25 || l.mode === 'kick' && Math.abs(l.kickMeter - .5) < .04 });
  }
  assert.notEqual(g.phase, 'live', `play ${id} must finish`); return g;
}
test('random coin-toss winner always defers; halftime kickoff goes to that same team', () => {
  const winners = new Set<string>();
  for (let seed = 1; seed <= 50; seed++) {
    const g = createFootball(seed * 98643, teams); tossFootball(g);
    winners.add(g.openingWinner!);
    assert.equal(g.secondHalfReceiver, g.openingWinner);
    assert.notEqual(g.kickReceiver, g.openingWinner);
    g.phase = 'halftime'; advanceFootball(g);
    assert.equal(g.quarter, 3); assert.equal(g.clock, 120); assert.equal(g.kickReceiver, g.openingWinner);
  }
  assert.equal(winners.size, 2);
});
test('full receiving kickoff visibly fields the kick then preserves original return movement for identical input', () => {
  const g = createFootball(100, teams); g.phase = 'kickoff-choice'; g.kickReceiver = 'home'; chooseKick(g, 'full');
  for (let i = 0; i < 600 && g.special!.stage !== 'return'; i++) stepFootball(g);
  assert.equal(g.special!.stage, 'return');
  let original = structuredClone(g.returnAttempt!);
  for (let i = 0; i < 800 && g.phase === 'kickoff'; i++) {
    const direction = i % 100 < 50 ? -1 : 1;
    const juke = i % 100 === 20;
    original = stepKickAttempt(original, direction, KR.dt, { juke });
    stepFootball(g, { direction, juke });
    // Full-game receiving teammates may block; runner mechanics stay original.
    assert(Math.abs(g.returnAttempt!.player.x - original.player.x) < 1e-7);
    assert(Math.abs(g.returnAttempt!.player.y - original.player.y) < 1e-7);
    if (g.returnAttempt!.phase !== 'returning') break;
    original = structuredClone(g.returnAttempt!);
  }
  assert.notEqual(g.phase, 'kickoff');
  assert.equal(createKickAttempt(2, 1).defenders.length, 11);
});
test('six unique legal situational choices always contain a run and pass; punts only on fourth; field goals legal', () => {
  for (const spot of [1, 30, 65, 85, 99]) for (const down of [1, 2, 3, 4]) for (const distance of [1, 6, 12]) for (const overtime of [false, true]) {
    const g = atSnap(4, spot, down, spot + distance); g.overtime = overtime;
    const choices = offensiveChoices(g);
    assert.equal(choices.length, 6); assert.equal(new Set(choices.map(p => p.id)).size, 6);
    assert(choices.some(p => p.kind === 'run')); assert(choices.some(p => p.kind === 'pass'));
    if (down !== 4) assert(!choices.some(p => p.id === 'punt' || p.id === 'fake-punt'));
    if (!fieldGoalAllowed(g)) assert(!choices.some(p => p.id === 'field-goal'));
    if (distance === 1 && down < 4) assert(choices.some(p => p.id === 'sneak'));
  }
  const g = atSnap(1, 80, 4); assert.equal(fieldGoalDistance(g), 37);
});
test('every ordinary play has seven per side, three linemen each and deterministic snapshot continuation', () => {
  for (const id of Object.keys(PLAYBOOK) as PlayId[]) {
    const g = atSnap(); g.live = startField(g, id, 'blitz'); g.phase = 'live';
    assert.equal(g.live.athletes.filter(a => a.side === 'offense').length, 7);
    assert.equal(g.live.athletes.filter(a => a.side === 'defense').length, 7);
    assert.equal(g.live.athletes.filter(a => a.role === 'OL').length, 3);
    assert.equal(g.live.athletes.filter(a => a.role === 'DL').length, 3);
    for (let i = 0; i < 50; i++) stepFootball(g, {});
    const copy = JSON.parse(JSON.stringify(g));
    assert(isFootballGame(copy));
    for (let i = 0; i < 70; i++) { stepFootball(g, { action: i === 10 }); stepFootball(copy, { action: i === 10 }); }
    assert.deepEqual(g, copy);
  }
});
test('historical eleven-player live saves stay readable and the following formation uses seven', () => {
  const g = atSnap(); g.phase = 'live'; g.live = startField(g, 'slant', 'pass');
  const current = g.live.athletes;
  const oldSlots = [0, 1, 2, 0, 2, 5, 6, 3, 3, 4, 4, 7, 8, 9, 7, 10, 10, 10, 11, 11, 12, 13];
  g.live.athletes = oldSlots.map((slot, id) => ({ ...current[slot]!, id,
    role: id < 5 ? 'OL' : current[slot]!.role }));
  const copy = JSON.parse(JSON.stringify(g));
  assert(isFootballGame(copy));
  for (let i = 0; i < 90 && copy.phase === 'live'; i++) stepFootball(copy, { action: i === 40 });
  assert(isFootballGame(copy));
  assert.equal(startField(copy, 'power', 'run').athletes.length, 14);
});
test('carrier movement adds only a smooth modest open-field ramp; hesitation and lateral control remain', () => {
  const g = atSnap(); g.live = startField(g, 'power', 'prevent'); g.phase = 'live';
  const l = g.live; l.mode = 'run'; l.carrier = 6; l.time = 2;
  l.movement.player = { x: 500, y: 96 }; l.athletes[6]!.x = 500;
  l.athletes.filter(a => a.side === 'defense').forEach(a => { a.x = 900; a.y = 30; });
  stepFootball(g, { direction: -1 });
  assert(l.movement.player.x - 500 > playerSpeed(KR.forwardSpeed) / 60 && l.movement.player.x - 500 < playerSpeed(KR.forwardSpeed) / 60 * 1.001);
  assert(96 - l.movement.player.y > playerSpeed(KR.lateralSpeed) / 60 && 96 - l.movement.player.y < playerSpeed(KR.lateralSpeed) / 60 * 1.001);
  const x = l.movement.player.x, y = l.movement.player.y;
  stepFootball(g, { direction: 1, hesitate: true });
  assert.equal(l.movement.player.x, x); assert(l.movement.player.y > y);
});
test('touchdowns always award seven; first-and-goal, turnovers on downs, incomplete clocks and sacks are coherent', () => {
  const g = atSnap(5, 99, 1, 100); g.live = startField(g, 'power', 'prevent'); g.phase = 'live';
  g.live.mode = 'run'; g.live.carrier = 6; g.live.movement.player = { x: 1099.5, y: 96 }; g.live.athletes[6]!.x = 1099.5;
  stepFootball(g); assert.equal(g.score.home, 7); assert.equal(g.phase, 'play-dead'); assert.equal(g.kickReceiver, 'away');
  const short = atSnap(8, 95, 4, 100);
  playOut(short, 'sneak', 'run'); assert(short.down >= 1 && short.down <= 4);
  if (short.possession === 'home' && short.score.home === 0) assert.equal(short.target, 100);
});
test('quarter boundaries, two timeouts per game, tied regulation and touchdown-only overtime', () => {
  const g = atSnap(); assert(takeTimeout(g)); assert(takeTimeout(g)); assert(!takeTimeout(g));
  g.phase = 'play-dead'; g.clock = 0; g.quarterPending = true; advanceFootball(g);
  assert.equal(g.quarter, 2); assert.equal(g.clock, 120);
  stepFootball(g); g.sideSwitch = undefined;
  g.phase = 'play-dead'; g.clock = 0; g.quarterPending = true; advanceFootball(g); assert.equal(g.phase, 'halftime');
  g.secondHalfReceiver = 'home'; advanceFootball(g); assert.equal(g.timeouts.home, 0); assert.equal(g.quarter, 3);
  g.sideSwitch = undefined;
  g.phase = 'play-dead'; g.quarter = 4; g.clock = 0; g.quarterPending = true; advanceFootball(g);
  assert.equal(g.phase, 'overtime-toss'); assert(g.overtime);
  g.phase = 'play-call'; g.spot = 90; g.down = 4; assert(!offensiveChoices(g).some(p => p.id === 'field-goal'));
  g.live = startField(g, 'power', 'prevent'); g.phase = 'live'; g.live.mode = 'run'; g.live.carrier = 6;
  g.live.movement.player = { x: 1099.5, y: 96 }; g.live.athletes[6]!.x = 1099.5;
  stepFootball(g); assert.equal(g.phase, 'final'); assert.equal(g.winner, 'home'); assert.equal(g.score.home, 7);
});
test('field goals use distance-aware timing and three points; punts trade field position, fakes remain running plays', () => {
  const good = atSnap(4, 90, 4); good.live = startField(good, 'field-goal', 'run'); good.phase = 'live';
  good.live.kickAccuracy = .5;
  for (let i = 0; i < 240 && good.phase === 'live'; i++) stepFootball(good);
  assert.equal(good.score.home, 3); assert.equal(good.stats.home.fieldGoals, 1);
  const miss = atSnap(4, 70, 4); miss.live = startField(miss, 'field-goal', 'run'); miss.phase = 'live'; miss.live.kickAccuracy = .01;
  for (let i = 0; i < 240 && miss.phase === 'live'; i++) stepFootball(miss);
  assert.equal(miss.score.home, 0); assert.equal(miss.possession, 'away');
  const punt = playOut(atSnap(2, 20, 4), 'punt'); assert.equal(punt.possession, 'away'); assert(punt.spot < 65); assert.equal(punt.stats.home.punts, 1);
  assert.equal(PLAYBOOK['fake-punt'].formation, 'punt'); assert.equal(PLAYBOOK['fake-punt'].kind, 'run');
});
test('strategic interactions have sensible direction, not predetermined gain results', () => {
  assert(matchupAdvantage('draw', 'blitz') > matchupAdvantage('draw', 'run'));
  assert(matchupAdvantage('counter', 'blitz') > matchupAdvantage('power', 'blitz'));
  assert(matchupAdvantage('slant', 'blitz') > matchupAdvantage('post', 'blitz'));
  assert(matchupAdvantage('screen', 'blitz') > 0);
  assert(matchupAdvantage('post', 'prevent') < 0);
  const gains = new Set<number>();
  for (let seed = 1; seed <= 30; seed++) {
    const g = playOut(atSnap(seed, 40, 1, 41), 'sneak', 'run');
    gains.add(Math.round((g.history[0]?.gain ?? 0) * 10));
  }
  assert(gains.size > 3, 'blocking, tackle execution and randomness must create differing outcomes');
});
test('actual catches switch immediately to a controllable existing-movement receiver; pressured passes can fail', () => {
  let caught = 0, failures = 0, controlled = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const g = atSnap(seed * 617); chooseOffense(g, 'slant'); snapFootball(g);
    for (let i = 0; i < 600 && g.phase === 'live'; i++) {
      const before = g.live!.passCaught;
      stepFootball(g, { action: g.live!.mode === 'dropback' && g.live!.time > .7 });
      if (!before && g.live!.passCaught) {
        caught++; if (g.phase !== 'live' || g.tackleScene || g.playResult || g.live!.mode !== 'run') break;
        controlled++; const l = g.live!, x = l.movement.player.x, y = l.movement.player.y;
        assert(['WR', 'TE', 'RB'].includes(l.athletes[l.carrier]!.role));
        stepFootball(g, { direction: 1, hesitate: true });
        assert.equal(l.movement.player.x, x); assert(l.movement.player.y > y); break;
      }
    }
    if (!g.live?.passCaught) failures++;
  }
  assert(caught > 0); assert(controlled > 0); assert(failures > 0);
});

test('actual short-yardage samples favor sneaks over conventional power without guaranteeing a gain', () => {
  let sneaks = 0, powers = 0;
  const trials = 1000;
  for (let seed = 1; seed <= trials; seed++) {
    if ((playOut(atSnap(seed * 617, 40, 3, 41), 'sneak', 'run').history[0]?.gain ?? 0) >= 1) sneaks++;
    if ((playOut(atSnap(seed * 617, 40, 3, 41), 'power', 'run').history[0]?.gain ?? 0) >= 1) powers++;
  }
  // Rare physical execution can tie a small prefix of seeds. Use the same
  // 1,000-trial standard as the balance audit, not a tuned 120-seed margin.
  assert(sneaks > powers, JSON.stringify({ sneaks, powers })); assert(sneaks > 0 && sneaks < trials); assert(powers > 0);
});
test('spatial matchup samples allow both outcomes, pressure deep passes, and reward draws against blitzes', () => {
  const sample = (play: PlayId, defense: 'run' | 'blitz' | 'pass' | 'prevent') => {
    let yards = 0, sacks = 0, gains = 0, short = 0, long = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const g = playOut(atSnap(seed * 617, 40), play, defense), gain = g.history[0]?.gain ?? 0;
      yards += gain; sacks += g.stats.home.sacks; if (gain > 0) gains++;
      if (gain < 10) short++; else long++;
    }
    return { yards, sacks, gains, short, long };
  };
  const drawBlitz = sample('draw', 'blitz'), drawRun = sample('draw', 'run');
  assert(drawBlitz.yards > drawRun.yards, JSON.stringify({ drawBlitz, drawRun }));
  // A correct offensive counter can gain a little without guaranteeing a first down.
  assert(drawBlitz.short > 0 && drawBlitz.long > 0, JSON.stringify({ drawBlitz, drawRun }));
  const postBlitz = sample('post', 'blitz'), slantBlitz = sample('slant', 'blitz');
  assert(postBlitz.gains < slantBlitz.gains, JSON.stringify({ postBlitz, slantBlitz })); assert(postBlitz.gains > 0);
  const postPrevent = sample('post', 'prevent');
  assert(postPrevent.gains > 0 && postPrevent.gains < 80);
});
test('loose football recovery uses actual nearby players and can change possession', () => {
  for (const recovering of ['offense', 'defense'] as const) {
    const g = atSnap(); g.live = startField(g, 'power', 'run'); g.phase = 'live';
    const l = g.live; l.mode = 'loose'; l.loose = { x: 600, y: 96, time: 0 };
    for (const a of l.athletes) { a.x = 200; a.y = 30; }
    const nearest = l.athletes.find(a => a.side === recovering)!; nearest.x = 600; nearest.y = 96;
    for (let i = 0; i < 90 && g.phase === 'live' && g.live?.mode === 'loose'; i++) stepFootball(g);
    assert(g.phase === 'play-dead' || g.live!.mode === 'return');
    assert.equal(g.possession, recovering === 'defense' ? 'away' : 'home');
    assert(g.message.includes('RECOVER') || g.lastResult.includes('RECOVERS') || g.lastResult === 'FIRST DOWN');
  }
});
test('in-bounds selection clock runs, incomplete clock stops, and a timeout cannot be double consumed after depletion', () => {
  const g = atSnap(); g.clockRunning = true;
  for (let i = 0; i < 60; i++) stepFootball(g);
  assert(Math.abs(g.clock - 119) < 1e-8);
  assert(takeTimeout(g));
  for (let i = 0; i < 60; i++) stepFootball(g);
  assert(Math.abs(g.clock - 119) < 1e-8);
  g.clockRunning = true; assert(takeTimeout(g)); assert(!takeTimeout(g));
  assert.equal(g.timeouts.home, 0);
});
test('full-game saves are identity isolated, deterministic and never silently replace an unreadable save', () => {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  } });
  try {
    const g = atSnap(); assert(saveFootball('test-a', g));
    assert.deepEqual(loadFootball('test-a'), g); assert.equal(loadFootball('test-b'), null);
    const key = [...store.keys()][0]!; store.set(key, '{broken');
    assert.throws(() => loadFootball('test-a')); assert.equal(store.get(key), '{broken');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

/** Full real-clock engine games, no forced quarter/score/state shortcuts. */
test('seeded complete games progress opening kickoff through four real 120-second quarters and final', () => {
  for (const seed of [17, 352, 7881]) {
    const g = createFootball(seed, teams); let steps = 0;
    while (g.phase !== 'final' && steps++ < 180000) {
      if (g.sideSwitch || g.tackleScene || g.playResult) stepFootball(g);
      else if (g.phase === 'coin-toss' || g.phase === 'overtime-toss') tossFootball(g);
      else if (g.phase === 'kickoff-choice') chooseKick(g, g.quarter >= 4 && g.score.home < g.score.away ? 'onside' : 'full');
      // The referee's possession signal must elapse before either side can choose again.
      else if (g.phase === 'play-call' && (g.turnoverNotice ?? 0) > 0) stepFootball(g, {});
      else if (g.phase === 'play-call') {
        if (g.possession === 'home') {
          const options = offensiveChoices(g); const fieldGoal = options.find(p => p.id === 'field-goal');
          chooseOffense(g, fieldGoal?.id ?? options[(g.plays * 7 + seed) % options.length]!.id);
        } else chooseDefense(g, (['run', 'pass', 'blitz', 'prevent'] as const)[g.plays % 4]!);
      } else if (g.phase === 'pre-snap' && g.possession === 'home') snapFootball(g);
      else if (g.phase === 'play-dead' || g.phase === 'halftime') advanceFootball(g);
      else {
        const l = g.live;
        stepFootball(g, { direction: g.returnAttempt && g.phase === 'kickoff' ? kickWitnessDirection(g.returnAttempt) : 0,
          action: !!l && (l.mode === 'dropback' && l.time >= PLAYBOOK[l.play].develop + .25 || l.mode === 'kick' && Math.abs(l.kickMeter - .5) < .05) });
      }
    }
    assert.equal(g.phase, 'final', `seed ${seed} did not finish: ${g.phase}, Q${g.quarter}, ${g.clock}`);
    assert(g.quarter >= 4); assert(g.totalTime >= 480 - 2); assert(g.winner); assert(g.plays > 20);
    assert(isFootballGame(JSON.parse(JSON.stringify(g))));
  }
});
