import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { LINE_RUSH, lineRushRoll, stepLineRush, lineRushTarget } from './line-rush';
import { stepPenetration } from './penetration';
import { isFootballGame } from './storage';

function setup(seed = 42) {
  const g = createFootball(seed, { player: 'Big Blue', opponent: 'Redbirds' });
  g.phase = 'live';
  g.live = startField(g, 'post', 'pass');
  return g;
}

test('each blocked DL gets one 20% check per whole second, starting at three', () => {
  const g = setup(), l = g.live!;
  l.athletes.filter(d => d.role === 'DL').forEach(d => { d.engaged = 100; });
  l.time = 2.999;
  stepLineRush(g);
  assert.equal(l.lineRush, undefined);
  l.time = 3;
  stepLineRush(g);
  const expected = l.athletes.filter(d => d.role === 'DL' && lineRushRoll(g, l, d.id) < .2).map(d => d.id);
  assert.deepEqual(l.lineRush!.winners.map(w => w.defender), expected);
  const result = structuredClone(l.lineRush);
  l.time = 3.999;
  stepLineRush(g);
  assert.deepEqual(l.lineRush, result);
  assert.deepEqual(LINE_RUSH, { delay: 3, chance: .2 });
});

test('independent rolls allow zero, one, two, or all three linemen to win', () => {
  const counts = [0, 0, 0], combinations = new Set<number>();
  const samples = 5000;
  for (let seed = 1; seed <= samples; seed++) {
    const g = setup(seed), l = g.live!;
    l.athletes.filter(d => d.role === 'DL').forEach(d => { d.engaged = 100; });
    l.time = 3;
    stepLineRush(g);
    const defenders = l.athletes.filter(d => d.role === 'DL');
    let mask = 0;
    defenders.forEach((d, i) => {
      if (l.lineRush!.winners.some(w => w.defender === d.id)) { counts[i]++; mask |= 1 << i; }
    });
    combinations.add(mask);
  }
  assert.equal(combinations.size, 8);
  for (const count of counts) assert(Math.abs(count / samples - .2) < .025, `${count}/${samples}`);
});

test('saved continuation retains misses, wins, and the whole-second schedule', () => {
  const g = setup();
  g.live!.time = 3;
  stepLineRush(g);
  const saved = JSON.parse(JSON.stringify(g));
  for (const game of [g, saved]) { game.live!.time = 4; stepLineRush(game); }
  assert.deepEqual(saved.live.lineRush, g.live!.lineRush);
  assert.equal(saved.live.lineRush.lastCheck, 4);
});

test('no new breakout after a pass, on runs, or after crossing the line', () => {
  for (const scenario of ['flight', 'run', 'crossed', 'dead'] as const) {
    const g = setup(), l = g.live!;
    l.time = 4;
    if (scenario === 'flight') l.mode = 'flight';
    if (scenario === 'run') { l.play = 'power'; l.mode = 'run'; }
    if (scenario === 'crossed') l.crossedLos = true;
    if (scenario === 'dead') g.phase = 'play-dead';
    stepLineRush(g);
    assert.equal(l.lineRush, undefined);
  }
});

test('old group ticket cannot create an early DL breakout on a pass', () => {
  const g = setup(), l = g.live!;
  l.penetration!.roll = 0;
  l.time = 1;
  stepPenetration(g);
  assert.equal(l.penetration!.event, undefined);
  assert.equal(l.lineRush, undefined);
});

test('winning linemen can physically reach the quarterback and produce a sack', () => {
  const g = setup(), l = g.live!;
  // Isolate line pressure from the linebacker and secondary.
  l.athletes.filter(d => d.side === 'defense' && d.role !== 'DL').forEach(d => { d.y = 1000; d.engaged = 100; });
  const dl = l.athletes.find(d => d.role === 'DL')!;
  l.time = 3;
  l.lineRush = { checked: true, winners: [{ defender: dl.id, escapeY: 30, cleared: true }] };
  dl.engaged = 0;
  const qb = l.athletes[5]!;
  dl.x = qb.x + 20; dl.y = qb.y;
  let result;
  for (let i = 0; i < 180 && !result; i++) result = stepField(g, {}, 1 / 60);
  assert.equal(result?.reason, 'sack');
});

test('a breakout from the actual formation beats protection without teleporting', () => {
  let g = setup();
  for (let seed = 1; seed < 100; seed++) {
    g = setup(seed);
    if (g.live!.athletes.some(d => d.role === 'DL' && lineRushRoll(g, g.live!, d.id) < .2)) break;
  }
  const l = g.live!;
  l.athletes.filter(d => d.side === 'defense' && d.role !== 'DL').forEach(d => { d.engaged = 100; });
  let result;
  for (let i = 0; i < 720 && !result; i++) {
    const previous = l.athletes.map(a => ({ x: a.x, y: a.y }));
    result = stepField(g, {}, 1 / 60);
    for (const d of l.athletes.filter(a => a.role === 'DL')) {
      assert(Math.hypot(d.x - previous[d.id].x, d.y - previous[d.id].y) < 3);
    }
    if (l.time < 3) assert.equal(l.lineRush, undefined);
  }
  assert(l.lineRush?.winners.length);
  assert.equal(result?.reason, 'sack');
  assert(l.time > 3);
});

test('cumulative breakout probabilities match independent repeated 20% checks through eight seconds', () => {
  const samples = 10000, totals = Array.from({ length: 6 }, () => [0, 0, 0]);
  for (let seed = 1; seed <= samples; seed++) {
    const g = setup(seed), l = g.live!;
    const defenders = l.athletes.filter(d => d.role === 'DL');
    defenders.forEach(d => { d.engaged = 100; });
    for (let second = 3; second <= 8; second++) {
      l.time = second;
      stepLineRush(g);
      defenders.forEach((d, i) => {
        if (l.lineRush!.winners.some(w => w.defender === d.id)) totals[second - 3][i]++;
      });
    }
  }
  totals.forEach((counts, i) => {
    const expected = 1 - .8 ** (i + 1);
    for (const count of counts) assert(Math.abs(count / samples - expected) < .02,
      `second ${i + 3}: ${count / samples}, expected ${expected}`);
  });
});

test('all still-blocked linemen keep checking at nine seconds and beyond; winners never duplicate', () => {
  const g = setup(), l = g.live!;
  l.athletes.filter(d => d.role === 'DL').forEach(d => { d.engaged = 100; });
  for (let second = 3; second <= 30; second++) {
    l.time = second;
    stepLineRush(g);
    const expected = l.athletes.filter(d => d.role === 'DL' &&
      Array.from({ length: second - 2 }, (_, i) => i + 3).some(s => lineRushRoll(g, l, d.id, s) < .2));
    assert.deepEqual(l.lineRush!.winners.map(w => w.defender).sort(), expected.map(d => d.id).sort());
    assert.equal(l.lineRush!.lastCheck, second);
  }
  assert.equal(l.lineRush!.winners.length, 3);
});

test('skipped frames do not lose scheduled checks or add per-frame rolls', () => {
  const a = setup(), b = structuredClone(a);
  for (const g of [a, b]) g.live!.athletes.filter(d => d.role === 'DL').forEach(d => { d.engaged = 100; });
  for (let second = 3; second <= 8; second++) { a.live!.time = second; stepLineRush(a); }
  b.live!.time = 8;
  stepLineRush(b);
  assert.deepEqual(b.live!.lineRush, a.live!.lineRush);
  const state = structuredClone(b.live!.lineRush);
  for (let i = 0; i < 60; i++) stepLineRush(b);
  assert.deepEqual(b.live!.lineRush, state);
});

test('unblocked linemen receive no manufactured wins and both possessions use the identical rule', () => {
  for (const possession of ['home', 'away'] as const) {
    const g = setup(), l = g.live!;
    g.possession = possession;
    const defenders = l.athletes.filter(d => d.role === 'DL');
    defenders.forEach(d => { d.x -= 200; d.engaged = 0; });
    l.time = 8;
    stepLineRush(g);
    assert.deepEqual(l.lineRush!.winners, []);
    defenders.forEach(d => { d.engaged = 100; });
    l.time = 9;
    stepLineRush(g);
    assert.deepEqual(l.lineRush!.winners.map(w => w.defender),
      defenders.filter(d => lineRushRoll(g, l, d.id, 9) < .2).map(d => d.id));
  }
});

test('release ends QB pursuit and a defender touching the QB cannot sack after release', () => {
  const g = setup(), l = g.live!, d = l.athletes.find(a => a.role === 'DL')!;
  l.time = 3;
  l.lineRush = { checked: true, lastCheck: 3, winners: [{ defender: d.id, escapeY: 30, cleared: true }] };
  assert.deepEqual(lineRushTarget(l, d), { x: l.athletes[5].x, y: l.athletes[5].y });
  l.mode = 'flight';
  assert.equal(lineRushTarget(l, d), undefined);
  const qb = l.athletes[5];
  d.x = qb.x; d.y = qb.y; d.engaged = 0;
  assert.notEqual(stepField(g, {}, 1 / 60)?.reason, 'sack');
  assert.equal(l.lineRush.lastCheck, 3);
});

test('legacy pressure tickets cannot give DL extra chances and blitz LB mechanics remain active', () => {
  for (const defense of ['pass', 'blitz', 'run-blitz', 'contain'] as const) {
    const g = setup(), l = g.live!;
    l.defense = defense; l.penetration!.roll = 0;
    l.athletes.filter(d => d.role === 'DL').forEach(d => { d.engaged = 100; });
    l.time = 3;
    stepPenetration(g);
    if (l.penetration!.event) assert.equal(l.athletes[l.penetration!.event!.defender].role, 'LB');
    assert.equal(l.lineRush!.lastCheck, 3);
    if (defense === 'blitz') assert.equal(l.penetration!.event?.kind, 'blitz');
  }
});

test('save validation accepts repeated-check and legacy states but rejects invalid schedules', () => {
  const g = setup(), l = g.live!;
  l.time = 4;
  stepLineRush(g);
  assert(isFootballGame(g));
  const saved = JSON.parse(JSON.stringify(g));
  assert(isFootballGame(saved));
  delete saved.live.lineRush.lastCheck;
  assert(isFootballGame(saved));
  stepLineRush(saved);
  assert.equal(saved.live.lineRush.lastCheck, 4);
  for (const bad of [2, 4.5, 5, -1, NaN]) {
    l.lineRush!.lastCheck = bad;
    assert.equal(isFootballGame(g), false);
  }
});
