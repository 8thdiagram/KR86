import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFootball, advanceFootballPresentation, advanceFootballReady, createFootball as createMatch, queueOffense,
  queueDefense, snapFootball, stepFootball, chooseKick, offensiveChoices, PLAYBOOK, type FootballGame, type PlayId } from './engine';
import { attackDirection, inFootballFrame, worldX, yardX } from './direction';
import { diagramForPlay } from './diagrams';
import { canForwardPass } from './passing';
import { eligibleOffensivePlays } from './playbook';
import { kickoffSequence } from './special-teams';
import { createKickAttempt, stepKickAttempt, KR, kickWitnessDirection } from '../kick-return-engine';
import { stepKickMoves } from '../kick-return-moves';
import { isFootballGame, saveFootball, loadFootball } from './storage';
import { intercept } from './interception';
import { footballCameraX } from '../../components/football-renderer';
const createFootball = (seed: number) => createMatch(seed, { player: 'Big Blue', opponent: 'Redbirds' });

function ready(direction: 1 | -1, play: PlayId = 'power', seed = 1986) {
  const g = createFootball(seed); g.homeOddDirection = direction; g.phase = 'play-call'; g.spot = 40; g.target = 50;
  for (const spot of [40, 80]) for (const down of [1, 3, 4]) for (const distance of [10, 1]) {
    g.spot = spot; g.down = down; g.target = Math.min(100, spot + distance);
    if (eligibleOffensivePlays(g).some(p => p.id === play)) { queueOffense(g, play); return g; }
  }
  throw new Error(`No legal test situation for ${play}`);
}
const near = (a: number, b: number, detail = '') => assert(Math.abs(a - b) < 1e-6, `${detail}: ${a} != ${b}`);
function mirrored(a: FootballGame, b: FootballGame) {
  assert.equal(a.phase, b.phase); assert.equal(a.rng, b.rng);
  near(a.clock, b.clock); near(a.spot, b.spot); assert.equal(a.down, b.down); near(a.target, b.target);
  assert.deepEqual(a.score, b.score);
  for (const [as, bs] of [[a.live?.athletes, b.live?.athletes], [a.special?.athletes, b.special?.athletes]] as const) {
    if (!as || !bs) continue;
    for (let i = 0; i < as.length; i++) {
      near(as[i]!.x + bs[i]!.x, 1200, `athlete ${i} X`); near(as[i]!.y, bs[i]!.y, `athlete ${i} Y`);
      near(as[i]!.vx + bs[i]!.vx, 0);
    }
  }
  for (const [p, q] of [[a.live?.flight, b.live?.flight], [a.live?.loose, b.live?.loose],
    [a.special?.ball, b.special?.ball], [a.tackleScene?.carrier, b.tackleScene?.carrier]] as const)
    if (p && q) { near(p.x + q.x, 1200); near(p.y, q.y); }
}
test('team end assignments alternate every quarter and yardage stays offense-relative', () => {
  const g = createFootball(86);
  for (const q of [1, 2, 3, 4]) {
    g.quarter = q; assert.equal(attackDirection(g, 'home'), q % 2 ? 1 : -1);
    assert.equal(attackDirection(g, 'away'), q % 2 ? -1 : 1);
    assert.equal(yardX(g, 70, 'home') + yardX(g, 70, 'away'), 1200);
    near((yardX(g, 80, 'home') - yardX(g, 70, 'home')) * attackDirection(g, 'home'), 100);
  }
});
test('camera look-ahead is exactly symmetric without changing viewport scale', () => {
  for (const [width, scale, landscape] of [[320, 1, false], [1100, 3.4, true], [390, 3, false]] as const)
    for (const focus of [80, 220, 600, 980, 1120]) {
      const right = footballCameraX(focus, width, scale, landscape, 1);
      const left = footballCameraX(1200 - focus, width, scale, landscape, -1);
      near(right + left, Math.max(0, 1200 - width / scale));
    }
});
test('all fifteen plays mirror REAL formations, live trajectories, sacks, scoring and outcomes', () => {
  for (const id of Object.keys(PLAYBOOK) as PlayId[]) for (const seed of [1986, 54321]) {
    const a = ready(1, id, seed), b = ready(-1, id, seed);
    mirrored(a, b);
    assert.equal(canForwardPass(a.live!), canForwardPass(b.live!));
    snapFootball(a); snapFootball(b);
    for (let n = 0; n < 1700 && a.phase === 'live'; n++) {
      const l = a.live!;
      const input = { direction: (n % 240 < 120 ? 1 : -1) as 1 | -1,
        action: l.mode === 'dropback' && l.time >= PLAYBOOK[id].develop + .25 ||
          l.mode === 'kick' && Math.abs(l.kickMeter - .5) < .06 };
      stepFootball(a, input); stepFootball(b, input);
      if (n % 20 === 0 || a.phase !== 'live') mirrored(a, b);
    }
    assert.notEqual(a.phase, 'live'); mirrored(a, b);
    assert.equal(a.playResult?.text, b.playResult?.text);
  }
});
test('quarter switches preserve opponent-30 position, down, distance, scores and game-long timeouts', () => {
  for (const quarter of [1, 3]) {
    const g = createFootball(86); g.phase = 'play-dead'; g.quarter = quarter; g.spot = 70; g.down = 3; g.target = 76;
    g.clock = 0; g.quarterPending = true; g.timeouts.home = 1; g.score.home = 14;
    advanceFootball(g);
    assert.equal(g.quarter, quarter + 1); assert.equal(g.spot, 70); assert.equal(g.down, 3); assert.equal(g.target, 76);
    assert.equal(g.score.home, 14); assert.equal(g.timeouts.home, 1); assert.equal(g.clock, 120);
    assert(g.sideSwitch); assert(!g.playClockRunning); assert.equal(yardX(g, g.spot), 400);
    advanceFootballPresentation(g, .849); assert(g.sideSwitch);
    advanceFootballPresentation(g, .001); assert(!g.sideSwitch); assert.equal(g.playClock, 15);
    queueOffense(g, 'power'); assert.equal(g.fieldFrame, -1);
  }
});
test('halftime reverses ends again and retains the established toss-winner kickoff', () => {
  const g = createFootball(86); g.quarter = 2; g.phase = 'halftime'; g.secondHalfReceiver = 'home';
  g.timeouts = { home: 0, away: 1 }; advanceFootball(g);
  assert.equal(g.quarter, 3); assert.equal(attackDirection(g, 'home'), 1);
  assert.equal(g.kickReceiver, 'home'); assert.deepEqual(g.timeouts, { home: 0, away: 1 }); assert(g.sideSwitch);
});
test('full, squib and onside kicks mirror physical flight, recovery and returns with equal outcomes', () => {
  for (const kind of ['full', 'squib', 'onside'] as const) {
    const a = createFootball(8642), b = createFootball(8642); b.homeOddDirection = -1;
    for (const g of [a, b]) { g.phase = 'kickoff-choice'; g.kickReceiver = 'home'; chooseKick(g, kind); }
    for (let n = 0; n < 1800 && a.phase === 'kickoff'; n++) {
      const direction = a.returnAttempt ? inFootballFrame(a, () => kickWitnessDirection(a.returnAttempt!)) : 0;
      stepFootball(a, { direction }); stepFootball(b, { direction });
      if (n % 20 === 0 || a.phase !== 'kickoff') mirrored(a, b);
    }
    assert.notEqual(a.phase, 'kickoff'); mirrored(a, b);
  }
});
test('interception catch/return reverses actual motion from either offensive direction', () => {
  for (const direction of [1, -1] as const) {
    const g = ready(direction, 'slant'); snapFootball(g);
    inFootballFrame(g, () => {
      const l = g.live!, d = l.athletes.find(a => a.role === 'DB')!;
      for (const a of l.athletes) { a.engaged = 100; a.y = 140; }
      d.x = 700; d.y = 96;
      l.flight = { x: 700, y: 96, z: 4, fromX: 450, fromY: 96, toX: 700, toY: 96,
        duration: 1, age: .9, receiver: 3, accuracy: .5 };
      intercept(l, d);
    });
    for (let n = 0; n < 26; n++) stepFootball(g);
    const x = g.live!.athletes[g.live!.carrier]!.x;
    for (let n = 0; n < 10; n++) stepFootball(g);
    assert((g.live!.athletes[g.live!.carrier]!.x - x) * direction < 0);
    assert.equal(g.possession, 'away');
  }
});
test('diagrams keep forward depth and primary/read identities but reverse stadium sides after switching ends', () => {
  const a = createFootball(86), b = createFootball(86); b.homeOddDirection = -1;
  for (const id of Object.keys(PLAYBOOK) as PlayId[]) {
    const right = diagramForPlay(a, id), left = diagramForPlay(b, id);
    for (let i = 0; i < right.length; i++) {
      assert.equal(right[i]!.id, left[i]!.id); assert.equal(right[i]!.primary, left[i]!.primary);
      for (let j = 0; j < right[i]!.points.length; j++) {
        near(right[i]!.points[j]!.x + left[i]!.points[j]!.x, 192);
        near(right[i]!.points[j]!.y, left[i]!.points[j]!.y);
      }
    }
  }
});
test('kickoff launch/top speed gain is four percent, UP/DOWN and moves/punts/scrimmage stay unchanged', () => {
  const faster = createKickAttempt(86, 1), previous = structuredClone(faster); delete previous.kickoffBoost;
  for (const a of [faster, previous]) { a.phase = 'returning'; a.player = { x: 300, y: 96 }; a.returnTime = 1; }
  const old = stepKickMoves(previous, 1, KR.dt, {}), next = stepKickMoves(faster, 1, KR.dt, {});
  near((next.player.x - 300) / (old.player.x - 300), 1.04); near(old.player.y, next.player.y);
  const moveOld = stepKickMoves(previous, 0, KR.dt, { juke: true }), moveNew = stepKickMoves(faster, 0, KR.dt, { juke: true });
  assert.deepEqual(moveNew.player, moveOld.player);
  assert.equal(ready(1).live!.movement.kickoffBoost, undefined);
});
test('leftward live saves retain physical coordinates/frame and resume deterministically', () => {
  const store = new Map<string, string>(), original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
  try {
    const g = ready(-1, 'post'); snapFootball(g); for (let i = 0; i < 60; i++) stepFootball(g);
    assert(isFootballGame(g)); assert(saveFootball('direction-test', g));
    const resumed = loadFootball('direction-test')!;
    assert.equal(JSON.stringify(resumed), JSON.stringify(g));
    for (let i = 0; i < 120; i++) { stepFootball(g); stepFootball(resumed); }
    assert.equal(JSON.stringify(resumed), JSON.stringify(g));
  } finally { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original }); }
});
