import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFootball, advanceFootballReady, advanceFootballPresentation, canTakeTimeout, createFootball,
  CPU_SNAP_SECONDS, footballClockStoppage, queueDefense, queueOffense, snapFootball, stepFootball, takeTimeout } from './engine';
import { startField } from './field';
import { intercept } from './interception';
import { FOOTBALL_SIDELINES } from './sidelines';
import { isFootballGame, loadFootball, saveFootball } from './storage';
import type { FootballGame, Side } from './types';

function ready(possession: Side = 'home') {
  const g = createFootball(1986);
  g.phase = 'play-call'; g.possession = possession; g.spot = 35; g.target = 45;
  g.clock = 100; g.clockRunning = true; g.clockStoppage = undefined;
  return g;
}
function noContact(g: FootballGame) {
  for (const a of g.live!.athletes) a.engaged = 100;
}
function assertStoppedUntilSnap(g: FootballGame) {
  const clock = g.clock;
  advanceFootballPresentation(g, 1);
  assert.equal(g.phase, 'play-call'); assert.equal(g.playClock, 15); assert.equal(g.clock, clock);
  advanceFootballReady(g, 2);
  assert.equal(g.clock, clock); assert.equal(g.playClock, 13);
  queueOffense(g, 'power'); advanceFootballReady(g, 1);
  assert.equal(g.clock, clock); assert.equal(g.playClock, 12);
  snapFootball(g); assert.equal(g.phase, 'live'); assert.equal(g.clockStoppage, undefined);
  stepFootball(g); assert(g.clock < clock);
}

test('offensive decisions run both clocks; defensive decisions suspend only the game clock', () => {
  for (const side of ['home', 'away'] as const) {
    const g = ready(side); advanceFootballReady(g, 4);
    assert.equal(g.clock, side === 'home' ? 96 : 100); assert.equal(g.playClock, 11);
    assert.equal(footballClockStoppage(g), side === 'away' ? 'defensive-selection' : undefined);
    if (side === 'home') queueOffense(g, 'power'); else queueDefense(g, 'run');
    advanceFootballReady(g, .5);
    assert.equal(g.clock, side === 'home' ? 95.5 : 99.5);
    assert.equal(g.playClock, 10.5);
  }
});
test('defensive selection completion preserves every durable stoppage until the snap', () => {
  for (const reason of ['incomplete', 'out-of-bounds', 'timeout'] as const) {
    const g = ready('away'); g.clockRunning = false; g.clockStoppage = reason;
    advanceFootballReady(g, 2); assert.equal(footballClockStoppage(g), reason);
    queueDefense(g, 'blitz'); advanceFootballReady(g, CPU_SNAP_SECONDS - .01);
    assert.equal(g.clock, 100); assert.equal(g.phase, 'pre-snap');
    advanceFootballReady(g, .01); assert.equal(g.phase, 'live');
    assert.equal(g.clockStoppage, undefined);
    stepFootball(g); assert(g.clock < 100);
  }
});
test('a real incomplete forward pass stops immediately and keeps both following menus/formation fair', () => {
  const g = ready(); queueOffense(g, 'slant'); snapFootball(g);
  const l = g.live!; noContact(g); l.snapAge = .18; l.mode = 'flight';
  // A physically missed receiver at the actual flight endpoint.
  l.flight = { x: 550, y: 96, z: 0, fromX: 450, fromY: 96, toX: 550, toY: 96,
    age: 1, duration: 1, receiver: 3, accuracy: 0, type: 'normal' };
  l.athletes[3]!.x = 900; l.athletes[3]!.y = 24;
  stepFootball(g);
  assert.equal(g.clockStoppage, 'incomplete'); assert(!g.clockRunning);
  assert.match(g.playResult!.text, /INCOMPLETE/);
  assertStoppedUntilSnap(g);
});
test('actual sideline contact stops RBs, scrambling QBs and completed-pass receivers, not proximity', () => {
  for (const mode of ['run', 'scramble', 'caught'] as const) {
    const g = ready(); g.phase = 'live'; g.live = startField(g, mode === 'run' ? 'power' : 'slant', 'pass');
    const l = g.live; l.snapAge = .18; l.time = 2; l.mode = mode === 'scramble' ? 'scramble' : 'run';
    l.carrier = mode === 'scramble' ? 5 : mode === 'caught' ? 3 : 6;
    l.passCaught = mode === 'caught'; noContact(g);
    const runner = l.athletes[l.carrier]!;
    runner.x = 470; runner.y = 26; l.movement.player = { x: runner.x, y: runner.y };
    stepFootball(g); assert.equal(g.phase, 'live'); assert(g.clockRunning);
    runner.y = FOOTBALL_SIDELINES.minY; l.movement.player.y = FOOTBALL_SIDELINES.minY;
    stepFootball(g, { direction: -1 });
    assert.equal(g.clockStoppage, 'out-of-bounds'); assert(!g.clockRunning);
    assertStoppedUntilSnap(g);
  }
});
test('interception sideline exits use actual carrier collision and retain the stoppage', () => {
  const g = ready('away'); g.phase = 'live'; g.live = startField(g, 'slant', 'pass');
  const l = g.live, catcher = l.athletes.find(a => a.role === 'DB')!;
  catcher.x = 600; catcher.y = FOOTBALL_SIDELINES.minY;
  l.flight = { x: 600, y: FOOTBALL_SIDELINES.minY, z: 0, fromX: 500, fromY: 96, toX: 600, toY: FOOTBALL_SIDELINES.minY,
    age: 0, duration: 1, receiver: 3, accuracy: .5 };
  intercept(l, catcher); noContact(g); g.possession = 'home';
  l.interception!.age = 2; l.flight = undefined;
  for (const a of l.athletes.filter(a => a.side === 'offense')) { a.x = 950; a.y = 140; }
  stepFootball(g, { direction: -1 });
  assert.equal(g.phase, 'play-dead'); assert.equal(g.possession, 'home');
  assert.equal(g.clockStoppage, 'out-of-bounds'); assert(!g.clockRunning);
});
test('timeouts fully discard BOTH pre-snap choices and allow consecutive offensive/defensive reselection', () => {
  for (const side of ['home', 'away'] as const) {
    const g = ready(side);
    for (let i = 0; i < 2; i++) {
      if (side === 'home') queueOffense(g, 'slant'); else queueDefense(g, 'run');
      const old = g.live, clock = g.clock;
      advanceFootballReady(g, .25);
      assert(canTakeTimeout(g)); assert(takeTimeout(g));
      assert.equal(g.phase, 'play-call'); assert.equal(g.live, undefined); assert.equal(g.pendingSnap, undefined);
      assert.equal(g.timeouts.home, 1 - i); assert.equal(g.timeouts.away, 2);
      assert.equal(g.playClock, 15); assert.equal(g.clockStoppage, 'timeout');
      const stoppedAt = g.clock; assert(stoppedAt <= clock);
      advanceFootballReady(g, 2); assert.equal(g.playClock, 13); assert.equal(g.clock, stoppedAt);
      if (side === 'home') queueOffense(g, 'power'); else queueDefense(g, 'pass');
      assert.notEqual(g.live, old);
      assert.equal(side === 'home' ? g.live!.play : g.live!.defense, side === 'home' ? 'power' : 'pass');
      // The next timeout can be called from this freshly reconsidered formation.
      if (i === 0) {
        assert(takeTimeout(g)); assert.equal(g.timeouts.home, 0); assert(!takeTimeout(g));
        break;
      }
    }
    assert.equal(g.playClock, 15); assert.equal(g.phase, 'play-call');
  }
});
test('timeouts before any selection work even with a stopped game clock, and cannot interrupt live/result/kick phases', () => {
  const g = ready(); g.clockRunning = false;
  assert(takeTimeout(g)); assert.equal(g.playClock, 15);
  for (const phase of ['live', 'kickoff', 'kickoff-choice', 'penalty', 'halftime', 'coin-toss', 'final'] as const) {
    const blocked = ready(); blocked.phase = phase;
    const before = JSON.stringify(blocked); assert(!takeTimeout(blocked)); assert.equal(JSON.stringify(blocked), before);
  }
  const held = ready(); held.phase = 'play-dead'; held.playResult = { text: 'GAIN OF 8 YARDS', remaining: 1 };
  assert(!takeTimeout(held)); advanceFootballPresentation(held, .999);
  assert(held.playResult); assert.equal(held.timeouts.home, 2);
});
test('both teams keep exactly two per GAME across halftime, quarter changes and save/resume', () => {
  const g = ready(); assert.deepEqual(g.timeouts, { home: 2, away: 2 });
  takeTimeout(g); takeTimeout(g, 'away'); takeTimeout(g, 'away');
  g.phase = 'halftime'; g.secondHalfReceiver = 'home'; advanceFootball(g);
  assert.equal(g.quarter, 3); assert.equal(g.clock, 120);
  assert.deepEqual(g.timeouts, { home: 1, away: 0 });
  assert(isFootballGame(JSON.parse(JSON.stringify(g))));
});
test('CPU uses public late-half situations, never spends twice for one play, and respects game-long depletion', () => {
  for (const possession of ['home', 'away'] as const) {
    const g = ready(possession); g.quarter = 4; g.clock = 30; g.score.home = 14; g.score.away = 7;
    advanceFootballReady(g, .2);
    assert.equal(g.timeouts.away, 1); assert.equal(g.clock, 30);
    advanceFootballReady(g, 2); assert.equal(g.timeouts.away, 1);
    if (possession === 'home') { queueOffense(g, 'power'); snapFootball(g); }
    else { queueDefense(g, 'pass'); advanceFootballReady(g, CPU_SNAP_SECONDS); }
    assert.equal(g.phase, 'live');
    // A subsequent completed inbounds play offers a second legitimate decision.
    g.phase = 'play-call'; g.pendingSnap = undefined; g.live = undefined; g.clockRunning = true;
    advanceFootballReady(g, .1); assert.equal(g.timeouts.away, 0);
    g.plays++; g.clockRunning = true; advanceFootballReady(g, .1); assert.equal(g.timeouts.away, 0);
  }
  const leading = ready(); leading.quarter = 4; leading.clock = 20; leading.score.away = 21;
  advanceFootballReady(leading, 2); assert.equal(leading.timeouts.away, 2);
});
test('late-half timeout threshold is elapsed-time invariant and preserves regulation length', () => {
  for (const elapsed of [10, .1]) {
    const g = ready(); g.quarter = 2; g.clock = 40;
    for (let t = 0; t < 10 - 1e-8; t += elapsed) advanceFootballReady(g, elapsed);
    assert.equal(g.clock, 35); assert.equal(g.timeouts.away, 1);
  }
  const g = ready(); g.clock = .5; advanceFootballReady(g, 1);
  assert.equal(g.quarter, 2); assert.equal(g.clock, 120);
});
test('timeout play clock expires normally: penalty preserves down/line to gain, and result gets its full second', () => {
  const g = ready(); g.down = 3; takeTimeout(g);
  advanceFootballReady(g, 15);
  assert.equal(g.phase, 'penalty'); assert.equal(g.spot, 30); assert.equal(g.down, 3); assert.equal(g.target, 45);
  assert.equal(g.timeouts.home, 1); assert.equal(g.clock, 100);
  advanceFootballPresentation(g, 1.25); assert.equal(g.playResult!.remaining, 1);
  advanceFootballPresentation(g, .999); assert(g.playResult);
  advanceFootballPresentation(g, .001); assert.equal(g.playClock, 15); assert.equal(g.phase, 'play-call');
});
test('timeout remainder and pending reselected defense round-trip without renewing either clock', () => {
  const store = new Map<string, string>(), original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
  try {
    const g = ready('away'); takeTimeout(g); queueDefense(g, 'blitz'); advanceFootballReady(g, .4);
    assert(saveFootball('clock-test', g));
    const loaded = loadFootball('clock-test')!;
    assert.equal(JSON.stringify(loaded), JSON.stringify(g));
    advanceFootballReady(loaded, .4); assert.equal(loaded.clock, 100);
    assert.equal(loaded.playClock, 14.2); assert.equal(loaded.timeouts.home, 1);
    assert(!isFootballGame({ ...loaded, clockStoppage: 'invented' }));
  } finally { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original }); }
});
