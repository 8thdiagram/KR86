import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, stepFootball, QUARTER_SECONDS, PLAY_CLOCK_SECONDS, FULL_GAME_SPEED } from './engine';
import { startField, stepField } from './field';
import { canDefensiveAction, defensiveActionKind, startNearestDive } from './defensive-action';
import { attemptPassDefense, eligiblePassDefenders, PASS_DEFENSE } from './pass-defense';
import { createFootballControls } from './controls';
import { EXECUTION, primaryPlayer, skillExecution, runApproach } from './execution';
import { progression } from './passing';
import { diagramForPlay } from './diagrams';
import { loadFootball, saveFootball, isFootballGame } from './storage';

function flight(seed = 617, side: 'home' | 'away' = 'away', gap = 0) {
  const g = createFootball(seed, { player: 'Big Blue', opponent: 'Redbirds' });
  g.possession = side; g.phase = 'live'; g.live = startField(g, 'slant', 'pass');
  const l = g.live!;
  l.mode = 'flight'; l.time = 1.2;
  for (const a of l.athletes) { a.x = 900; a.y = 30; }
  const receiver = l.athletes[3]!;
  receiver.x = 650; receiver.y = 96; receiver.startX = 570; receiver.startY = 65;
  const d = l.athletes[11]!; d.x = 650; d.y = 96 + gap; d.engaged = 0;
  l.flight = { type: 'normal', x: 627.5, y: 96, z: 13, fromX: 500, fromY: 96, toX: 650,
    toY: 96, age: .68, duration: .8, receiver: 3, accuracy: .80, attempted: [], contested: [] };
  return g;
}
test('two-minute regulation constants leave real play clock and world pace independent', () => {
  assert.equal(QUARTER_SECONDS, 120); assert.equal(PLAY_CLOCK_SECONDS, 15); assert.equal(FULL_GAME_SPEED, .82);
  const g = createFootball(86);
  assert.equal(g.clock, 120);
});
test('context priority routes one gesture to pass or loose ball, without steering or evasion', () => {
  const g = flight(), l = g.live!, c = createFootballControls();
  assert(canDefensiveAction(g)); assert.equal(defensiveActionKind(g), 'intercept');
  c.enter('test', 'juke', 0, g); const sample = c.sample(0);
  assert(sample.action); assert(!sample.passPress && !sample.passRelease && !sample.juke);
  c.release('test', 500); assert(!c.sample(500).action);
  l.mode = 'loose'; l.loose = { x: 650, y: 96, time: 0 };
  assert.equal(defensiveActionKind(g), 'recover');
  l.mode = 'run'; l.flight = undefined;
  assert.equal(defensiveActionKind(g), 'tackle');
});
test('nearest eligible excludes engaged, distant and recovering defenders; no teleports or repeated launch', () => {
  const g = flight(), l = g.live!, d = l.athletes[11]!;
  const closer = l.athletes[12]!; closer.x = 650; closer.y = 96; closer.engaged = 10;
  d.x = 654;
  const from = { x: d.x, y: d.y };
  assert.equal(attemptPassDefense(g)?.id, d.id);
  assert.deepEqual({ x: d.x, y: d.y }, from);
  assert.equal(attemptPassDefense(g), undefined);
  assert.equal(l.flight!.attempted!.length, 1);
  const tooFar = flight(); tooFar.live!.athletes[11]!.x = 730;
  assert.equal(attemptPassDefense(tooFar), undefined);
  assert.equal(startNearestDive([{ id: 1, x: 500, y: 96 }], { x: 700, y: 96 }), undefined);
});
test('no ACTION means no human defensive interception, even with a defender at the catch point', () => {
  for (let seed = 1; seed <= 180; seed++) {
    const g = flight(seed * 617);
    for (let i = 0; i < 15 && g.live!.mode === 'flight'; i++) stepField(g, {}, 1 / 60);
    assert.notEqual(g.live!.mode, 'return');
    assert(!g.live!.athletes.some(a => a.defensiveAttempt?.kind === 'intercept'));
  }
});
test('actual ACTION attempts can intercept, break up, miss or allow catches; interceptions are a minority', () => {
  let interceptions = 0, breakups = 0, catches = 0, misses = 0, attempts = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const g = flight(seed * 617, 'away'), l = g.live!;
    if (seed % 3 === 0) { l.flight!.age = .745; l.flight!.x = 639.6875; }
    const d = attemptPassDefense(g)!;
    assert(d); attempts++;
    for (let i = 0; i < 35 && l.mode === 'flight'; i++) {
      const result = stepField(g, {}, 1 / 60);
      if (result) { if (result.detail?.includes('BREAKUP')) breakups++; break; }
    }
    if (l.mode === 'return') {
      interceptions++; assert(l.interception); assert(l.flight);
      for (let i = 0; i < 40 && l.flight; i++) stepField(g, {}, 1 / 60);
      assert.equal(g.possession, 'home'); assert.equal(l.flight, undefined);
    }
    if (l.passCaught) catches++;
    if (!d.defensiveAttempt?.resolved && l.mode !== 'return') misses++;
  }
  assert(interceptions > 0 && breakups > 0 && catches > 0 && misses > 0,
    JSON.stringify({ interceptions, breakups, catches, misses }));
  assert(interceptions / attempts < .15, JSON.stringify({ interceptions, attempts }));
  assert(PASS_DEFENSE.interceptionChance < .1);
});
test('normal-pass midfield defenders are ineligible; flat bullets admit a reachable path defender', () => {
  const g = flight(), l = g.live!, f = l.flight!, d = l.athletes[11]!;
  Object.assign(f, { age: .2, duration: .8, fromX: 500, toX: 700, x: 550 });
  d.x = 575;
  assert.equal(eligiblePassDefenders(g).length, 0);
  f.type = 'bullet';
  assert.equal(eligiblePassDefenders(g)[0]?.d.id, d.id);
  f.age = .01;
  assert.equal(eligiblePassDefenders(g).length, 0, 'reaction window is not instantaneous');
});
test('CPU defense visibly commits under the same physical pass rules without human input', () => {
  let dives = 0, interceptions = 0, breakups = 0;
  for (let seed = 1; seed <= 160; seed++) {
    const g = flight(seed * 617, 'home'), l = g.live!;
    for (let i = 0; i < 35 && l.mode === 'flight'; i++) {
      const result = stepField(g, {}, 1 / 60);
      if (l.athletes.some(a => a.defensiveAttempt?.kind === 'intercept')) dives++;
      if (result) { if (result.detail?.includes('BREAKUP')) breakups++; break; }
    }
    if (l.mode === 'return') interceptions++;
  }
  assert(dives > 0 && interceptions > 0 && breakups > 0, JSON.stringify({ dives, interceptions, breakups }));
});
test('CPU running defense can commit a visible tackle dive while ordinary contact remains active', () => {
  let dives = 0, tackles = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const g = flight(seed * 617, 'home'), l = g.live!;
    l.flight = undefined; l.mode = 'run'; l.carrier = 6; l.time = 2;
    const runner = l.athletes[6]!; runner.x = 500; runner.y = 96;
    l.movement.player = { x: 500, y: 96 };
    const defender = l.athletes[11]!; defender.x = 535; defender.y = 112;
    for (let i = 0; i < 60 && g.phase === 'live'; i++) {
      stepFootball(g);
      if (defender.dive) dives++;
    }
    if (g.tackleSounds) tackles++;
  }
  assert(dives > 0 && tackles > 0, JSON.stringify({ dives, tackles }));
});
test('pass breakup visibly redirects the actual ball to ground and resumes deterministically', () => {
  let observed = false;
  for (let seed = 1; seed <= 80 && !observed; seed++) {
    const g = flight(seed * 617);
    attemptPassDefense(g);
    for (let i = 0; i < 15 && !g.live!.flight?.deflected; i++) stepField(g, {}, 1 / 60);
    const f = g.live!.flight;
    if (!f?.deflected) continue;
    observed = true;
    assert(!canDefensiveAction(g));
    assert(isFootballGame(JSON.parse(JSON.stringify(g))));
    const copy = JSON.parse(JSON.stringify(g));
    const x = f.x;
    for (let i = 0; i < 18; i++) {
      const a = stepField(g, {}, 1 / 60), b = stepField(copy, {}, 1 / 60);
      assert.deepEqual(a, b); if (a) break;
    }
    assert(f.x > x); assert(Math.abs(f.z) < 1e-9); assert.deepEqual(g, copy);
  }
  assert(observed);
});
test('ACTION loose-ball dives never override locked nearest-player recovery; far presses do nothing', () => {
  for (const winner of ['offense', 'defense'] as const) for (const action of [false, true]) {
    const g = flight(), l = g.live!;
    l.mode = 'loose'; l.flight = undefined;
    for (const a of l.athletes) { a.x = 300; a.y = 30; }
    const nearest = l.athletes.find(a => a.side === winner)!;
    nearest.x = 600; nearest.y = 96;
    const defender = l.athletes[11]!; defender.x = winner === 'defense' ? 610 : 625; defender.y = 96;
    l.loose = { x: 600, y: 96, time: 0 };
    stepFootball(g, { action });
    const locked = l.loose.recoverer;
    if (action) assert(l.athletes.some(a => a.defensiveAttempt?.kind === 'recover'));
    for (let i = 0; i < 50 && g.phase === 'live' && l.mode === 'loose'; i++) stepFootball(g);
    assert.equal(locked, nearest.id); assert.equal(g.possession, winner === 'defense' ? 'home' : 'away');
  }
  const g = flight(), l = g.live!; l.mode = 'loose';
  l.loose = { x: 600, y: 96, time: 0, recoverer: 3 }; l.athletes[11]!.x = 900;
  stepField(g, { action: true }, 1 / 60);
  assert(!l.athletes.some(a => a.defensiveAttempt?.kind === 'recover'));
});
test('modest execution gains are symmetric, temporary and match the diagram primary', () => {
  for (const side of ['home', 'away'] as const) for (const id of ['power', 'sweep', 'counter', 'draw', 'sneak', 'slant', 'screen', 'out', 'cross', 'post', 'verticals', 'play-action'] as const) {
    const g = createFootball(86); g.possession = side; g.spot = 40;
    const l = startField(g, id, 'pass'), primary = primaryPlayer(l);
    assert.equal(diagramForPlay(g, id).find(r => r.primary)!.id, primary);
    const gain = skillExecution(l, l.athletes[primary]!);
    assert(gain > EXECUTION.skillSpeed && gain < 1.06);
    l.time = 8;
    assert.equal(skillExecution(l, l.athletes[primary]!), EXECUTION.skillSpeed);
    if (id === 'slant') assert.notEqual(progression({ ...l, time: 1.6 }).receiver, primary);
  }
});
test('running assignments distinguish sweep edge, counter misdirection and draw delay', () => {
  const g = createFootball(86); g.spot = 40;
  const sweep = startField(g, 'sweep', 'pass');
  assert(runApproach(sweep).y > 140);
  const counter = startField(g, 'counter', 'blitz');
  assert(runApproach(counter).y > 120);
  counter.time = .5; assert(runApproach(counter).y < 96);
  const ordinaryCounter = startField(g, 'counter', 'pass');
  assert.notDeepEqual(runApproach(ordinaryCounter), runApproach(startField(g, 'power', 'pass')));
  ordinaryCounter.time = .5;
  assert.deepEqual(runApproach(ordinaryCounter), runApproach(counter));
  const draw = startField(g, 'draw', 'blitz');
  const early = runApproach(draw); draw.time = .6;
  assert(runApproach(draw).x > early.x + 15);
});
test('historical three-minute saves preserve quarter progress fraction and never rescale twice', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v),
  } });
  try {
    const g = flight(); delete g.quarterSeconds; g.clock = 90;
    assert(isFootballGame(g)); assert(saveFootball('refinements-test', g));
    const loaded = loadFootball('refinements-test')!;
    assert.equal(loaded.clock, 60); assert.deepEqual(loaded.live, g.live);
    assert(saveFootball('refinements-test', loaded)); assert.equal(loadFootball('refinements-test')!.clock, 60);
    const d = attemptPassDefense(loaded); assert(d);
    assert(isFootballGame(JSON.parse(JSON.stringify(loaded))));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
