import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { LINE_RUSH, lineRushRoll, stepLineRush } from './line-rush';
import { stepPenetration } from './penetration';

function setup(seed = 42) {
  const g = createFootball(seed, { player: 'Big Blue', opponent: 'Redbirds' });
  g.phase = 'live';
  g.live = startField(g, 'post', 'pass');
  return g;
}

test('each DL gets one 20% chance at three seconds, never before', () => {
  const g = setup(), l = g.live!;
  l.time = 2.999;
  stepLineRush(g);
  assert.equal(l.lineRush, undefined);
  l.time = 3;
  stepLineRush(g);
  const expected = l.athletes.filter(d => d.role === 'DL' && lineRushRoll(g, l, d.id) < .2).map(d => d.id);
  assert.deepEqual(l.lineRush!.winners.map(w => w.defender), expected);
  const result = structuredClone(l.lineRush);
  l.time = 12;
  stepLineRush(g);
  assert.deepEqual(l.lineRush, result);
  assert.deepEqual(LINE_RUSH, { delay: 3, chance: .2 });
});

test('independent rolls allow zero, one, two, or all three linemen to win', () => {
  const counts = [0, 0, 0], combinations = new Set<number>();
  const samples = 5000;
  for (let seed = 1; seed <= samples; seed++) {
    const g = setup(seed), l = g.live!;
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

test('saved continuation retains misses and wins without rerolling', () => {
  const g = setup();
  g.live!.time = 3;
  stepLineRush(g);
  const saved = JSON.parse(JSON.stringify(g));
  for (const game of [g, saved]) { game.live!.time = 4; stepLineRush(game); }
  assert.deepEqual(saved.live.lineRush, g.live!.lineRush);
});

test('no new breakout after a pass, on runs, or after crossing the line', () => {
  for (const scenario of ['flight', 'run', 'crossed'] as const) {
    const g = setup(), l = g.live!;
    l.time = 4;
    if (scenario === 'flight') l.mode = 'flight';
    if (scenario === 'run') { l.play = 'power'; l.mode = 'run'; }
    if (scenario === 'crossed') l.crossedLos = true;
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
