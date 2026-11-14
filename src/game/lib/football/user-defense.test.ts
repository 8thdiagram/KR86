import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { stepDefense } from './pursuit';
import { DEFENSE_IDS, type Defense, type PlayId } from './types';
import { controlledDefenderId, prepareUserDefense, userDefenseTarget } from './user-defense';
import { diagramForDefense } from './diagrams';
import { manAssignment } from './coverage';
import { eligiblePassDefenders, PASS_DEFENSE, resolvePassDefense } from './pass-defense';
import { startNearestDive } from './defensive-action';
import { isFootballGame } from './storage';

function fixture(defense: Defense = 'pass', play: PlayId = 'post') {
  const g = createFootball(86);
  g.phase = 'live'; g.possession = 'away'; g.spot = 40;
  g.live = startField(g, play, defense);
  g.live.time = 1;
  g.live.target = 100;
  g.live.penetration!.roll = .999;
  return g;
}
const selected = (g: ReturnType<typeof fixture>) => g.live!.athletes.find(a => a.id === controlledDefenderId(g.live!))!;
const defenders = (g: ReturnType<typeof fixture>) => g.live!.athletes.filter(a => a.side === 'defense');
function isolate(g: ReturnType<typeof fixture>) {
  for (const a of g.live!.athletes) if (a.side === 'offense' && a.role !== 'QB') {
    a.x = 1000; a.y = 30; a.engaged = 0;
  }
  for (const d of defenders(g)) { d.x = 950; d.y = 160; d.engaged = 0; }
}

test('every defensive call chooses one appropriate existing defender, identically on diagrams and every offensive play', () => {
  for (const call of DEFENSE_IDS) {
    let identity: number | undefined;
    for (const play of ['post', 'flood', 'verticals', 'power', 'speed-option'] as const) {
      const g = fixture(call, play), d = selected(g);
      assert.equal(d.side, 'defense');
      assert.equal(d.role, call === 'man' || call === 'prevent' ? 'DB' : 'LB');
      identity ??= d.id;
      assert.equal(d.id, identity, 'selection cannot inspect the hidden offensive call');
      const diagram = diagramForDefense(g, call).filter(r => r.controlled);
      assert.equal(diagram.length, 1); assert.equal(diagram[0]!.id, d.id);
      assert.equal(g.live!.athletes.length, 14);
      for (const a of defenders(g)) { a.x += 100; a.y -= 20; }
      assert.equal(controlledDefenderId(g.live!), d.id, 'movement never auto-switches identity');
    }
  }
});

test('without user input, original defensive movement, random stream and assignments remain identical', () => {
  for (const call of DEFENSE_IDS) {
    const plain = fixture(call), controlled = structuredClone(plain);
    for (let i = 0; i < 90; i++) {
      plain.live!.time += 1 / 60; controlled.live!.time += 1 / 60;
      prepareUserDefense(controlled, {});
      stepDefense(plain, 1 / 60); stepDefense(controlled, 1 / 60);
      assert.deepEqual(controlled, plain);
    }
  }
});
test('CPU defense ignores every new input; original offense and its random outcomes are unchanged', () => {
  const base = fixture(), controlled = structuredClone(base);
  base.possession = controlled.possession = 'home';
  base.live!.offense = controlled.live!.offense = 'home';
  for (let i = 0; i < 120; i++) {
    const a = stepField(base, {}, 1 / 60);
    const b = stepField(controlled, { defenseHold: true, defenseDirection: i % 2 ? 1 : -1 }, 1 / 60);
    assert.deepEqual(a, b); assert.deepEqual(base, controlled);
    if (a) break;
  }
});
test('steering affects only the selected athlete on the same frame, respects existing acceleration, and works while holding', () => {
  for (const hold of [false, true]) {
    const base = fixture(), controlled = structuredClone(base);
    prepareUserDefense(controlled, { defenseDirection: 1, defenseHold: hold });
    stepDefense(base, 1 / 60); stepDefense(controlled, 1 / 60);
    const id = controlledDefenderId(base.live!);
    for (const original of base.live!.athletes) {
      const changed = controlled.live!.athletes.find(a => a.id === original.id)!;
      if (original.id !== id) assert.deepEqual(changed, original);
    }
    const d = selected(controlled), original = selected(base);
    assert(d.vy > original.vy, 'arrows retain meaningful steering influence during a hold');
    assert(Math.hypot(d.x - d.startX, d.y - d.startY) < 2, 'no teleport or extra movement step');
    assert(Math.hypot(d.vx, d.vy) < 12, 'existing turn/acceleration cap applies from rest');
  }
});
test('linebacker tracks the actual QB, handoff recipient and scrambling QB; arrows override pursuit angle', () => {
  const g = fixture(), l = g.live!, d = selected(g);
  for (const mode of ['dropback', 'handoff', 'run', 'scramble'] as const) {
    l.mode = mode; l.carrier = mode === 'run' ? 6 : 5;
    const carrier = l.athletes[l.carrier]!;
    carrier.x = 440; carrier.y = 80; carrier.vx = 10; carrier.vy = 0;
    prepareUserDefense(g, { defenseHold: true });
    const target = userDefenseTarget(g, d, { x: 800, y: 130 })!;
    assert.equal(target.x, 441.8); assert.equal(target.y, 80);
    prepareUserDefense(g, { defenseHold: true, defenseDirection: 1 });
    assert(userDefenseTarget(g, d, { x: 800, y: 130 })!.y > d.y);
  }
});
test('release resumes the original dynamically updated assignment without moving or rewriting it', () => {
  for (const call of ['pass', 'man', 'prevent', 'blitz', 'contain'] as const) {
    const g = fixture(call), l = g.live!, d = selected(g);
    const before = structuredClone(d), assignment = manAssignment(l, d)?.id;
    prepareUserDefense(g, { defenseHold: true, defenseDirection: 1 });
    assert(userDefenseTarget(g, d, { x: 700, y: 110 }));
    prepareUserDefense(g, {});
    assert.equal(userDefenseTarget(g, d, { x: 710, y: 115 }), undefined);
    assert.deepEqual(d, before, 'intentions never mutate athletes, assignments or cached AI pursuit');
    assert.equal(manAssignment(l, d)?.id, assignment);
    const resumed = structuredClone(g);
    stepDefense(g, 1 / 60); stepDefense(resumed, 1 / 60);
    assert.deepEqual(g, resumed, 'AI resumes smoothly from current physical position');
  }
});
test('DB coverage can be directed toward another visible threat without reading offensive highlighted progression', () => {
  const g = fixture('man'), l = g.live!, d = selected(g);
  const assigned = manAssignment(l, d)!;
  l.athletes[4]!.x = 750; l.athletes[4]!.y = 80;
  l.athletes[6]!.x = 1000; l.athletes[6]!.y = 160;
  prepareUserDefense(g, { defenseDirection: 1 });
  const target = userDefenseTarget(g, d, { x: assigned.x, y: assigned.y })!;
  assert.equal(target.x, 754);
  const clone = structuredClone(g);
  clone.live!.lockedReceiver = 6; clone.live!.holdingPass = true;
  prepareUserDefense(clone, { defenseDirection: 1 });
  assert.deepEqual(userDefenseTarget(clone, selected(clone), { x: assigned.x, y: assigned.y }), target);
  prepareUserDefense(g, { defenseHold: true });
  assert.equal(userDefenseTarget(g, d, { x: assigned.x, y: assigned.y })!.x, 750,
    'hold keeps closing on the user-directed threat until all controls are released');
});
test('held DB reacts only to an actual released ball after existing reaction time', () => {
  const g = fixture('man'), l = g.live!, d = selected(g);
  const original = { x: 650, y: 30 };
  l.mode = 'flight';
  l.flight = { x: 450, y: 80, z: 1, fromX: 400, fromY: 80, toX: 800, toY: 80,
    age: 0, duration: 1, receiver: 3, accuracy: 1, type: 'normal' };
  prepareUserDefense(g, { defenseHold: true });
  const before = userDefenseTarget(g, d, original);
  l.flight.age = PASS_DEFENSE.reactionSeconds;
  const after = userDefenseTarget(g, d, original)!;
  assert.notDeepEqual(before, after);
  assert.equal(after.x, 520);
});
test('quick ACTION still dives with the nearest eligible DL at a QB, even though a distant LB is selected', () => {
  const g = fixture(), l = g.live!;
  isolate(g);
  const qb = l.athletes[5]!;
  qb.x = 460; qb.y = 96;
  const dl = l.athletes[7]!;
  dl.x = 495; dl.y = 96;
  const expected = startNearestDive(structuredClone(defenders(g)), qb, l.time)!.id;
  stepField(g, { action: true }, 1 / 60);
  assert.equal(dl.id, expected); assert(dl.dive);
  assert.notEqual(dl.id, controlledDefenderId(l)); assert.equal(selected(g).dive, undefined);
});
test('a held selected defender automatically attempts a legal dive once and respects cooldown/recovery', () => {
  const g = fixture(), l = g.live!;
  isolate(g);
  const qb = l.athletes[5]!, d = selected(g);
  qb.x = 460; qb.y = 96; d.x = 490; d.y = 110;
  stepField(g, { defenseHold: true }, 1 / 60);
  assert(d.dive); assert.equal(d.defensiveAttempt?.kind, 'tackle');
  const attempt = d.defensiveAttempt!.at;
  for (let i = 0; i < 5; i++) stepField(g, { defenseHold: true }, 1 / 60);
  assert.equal(d.defensiveAttempt!.at, attempt, 'a hold does not replant a dive every frame');
  assert.equal(g.stats.away.sacks, 0, 'an attempt alone never awards a sack');
});
test('actual contact, not holding ACTION at a distance, creates automatic sacks and runner tackles', () => {
  for (const mode of ['dropback', 'scramble', 'run'] as const) {
    for (const distance of [0, 200]) {
      const g = fixture(), l = g.live!;
      isolate(g);
      l.mode = mode; l.carrier = mode === 'run' ? 6 : 5;
      const runner = l.athletes[l.carrier]!, d = selected(g);
      runner.x = l.movement.player.x = 450; runner.y = l.movement.player.y = 96;
      d.x = runner.x + distance; d.y = runner.y;
      // A legitimately completed prior dive can tackle now; don't reset its animation.
      d.dive = { phase: 'airborne', elapsed: .1, vx: 0, vy: 0, angle: 0 };
      const result = stepField(g, { defenseHold: true }, 1 / 60);
      assert.equal(result?.reason, distance ? undefined : mode === 'run' ? 'tackle' : 'sack', `${mode}/${distance}`);
    }
  }
});
test('sustained pursuit physically closes on a QB and attempts a sack without another press', () => {
  const g = fixture(), l = g.live!;
  isolate(g);
  const qb = l.athletes[5]!, d = selected(g);
  qb.x = 460; qb.y = 96; d.x = 560; d.y = 96;
  let result;
  for (let i = 0; i < 500 && !result; i++) {
    const before = { x: d.x, y: d.y };
    result = stepField(g, { defenseHold: true }, 1 / 60);
    assert(Math.hypot(d.x - before.x, d.y - before.y) < 3, 'bounded travel, including the existing dive');
  }
  assert(d.defensiveAttempt, 'holding automatically used the existing close-range action');
  assert.equal(result?.reason, 'sack');
});
test('pass taps still choose the original nearest eligible defender; holds use the highlighted one with identical eligibility', () => {
  for (const hold of [false, true]) {
    const g = fixture('man'), l = g.live!;
    isolate(g); l.mode = 'flight';
    l.flight = { x: 580, y: 96, z: 1, fromX: 400, fromY: 96, toX: 600, toY: 96,
      duration: 1, age: .9, receiver: 3, accuracy: 1, type: 'normal' };
    const d = selected(g), closer = l.athletes[12]!;
    d.x = 610; d.y = 96; closer.x = 600; closer.y = 96;
    const nearest = eligiblePassDefenders(g)[0]!.d.id;
    stepField(g, hold ? { defenseHold: true } : { action: true }, 1 / 60);
    const diving = defenders(g).filter(a => a.defensiveAttempt?.kind === 'intercept');
    assert.equal(diving.length, 1);
    assert.equal(diving[0]!.id, hold ? d.id : nearest);
    assert.equal(l.flight?.attempted?.length, 1);
  }
});
test('holding cannot create interceptions outside range or bypass pass-defense probabilities and actual ball contact', () => {
  let picks = 0, breakups = 0, misses = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const g = fixture('man'), l = g.live!;
    isolate(g); l.mode = 'flight';
    const d = selected(g); d.x = 610; d.y = 96;
    l.flight = { x: 580, y: 96, z: 1, fromX: 400, fromY: 96, toX: 600, toY: 96,
      duration: 1, age: .9, receiver: 3, accuracy: 1, type: 'normal' };
    stepField(g, { defenseHold: true }, 1 / 60);
    assert(d.dive);
    d.dive.phase = 'airborne'; d.x = l.flight!.x; d.y = l.flight!.y;
    g.rng = seed * 617;
    const outcome = resolvePassDefense(g, l.flight!.x - 3, l.flight!.y);
    if (outcome === 'interception') picks++; else if (outcome === 'breakup') breakups++; else misses++;
  }
  assert(picks > 0 && breakups > 0 && misses > 0, `${picks} interceptions, ${breakups} breakups, ${misses} misses`);
  const g = fixture('man'), l = g.live!;
  isolate(g); l.mode = 'flight';
  l.flight = { x: 580, y: 96, z: 1, fromX: 400, fromY: 96, toX: 600, toY: 96,
    duration: 1, age: .8, receiver: 3, accuracy: 1 };
  stepField(g, { defenseHold: true }, 1 / 60);
  assert.equal(selected(g).dive, undefined);
});
test('transient control state never enters Franchise save payloads and valid existing matches still load', () => {
  const g = fixture(), before = JSON.stringify(g);
  prepareUserDefense(g, { defenseHold: true, defenseDirection: 1 });
  userDefenseTarget(g, selected(g), { x: 400, y: 100 });
  assert.equal(JSON.stringify(g), before);
  assert(isFootballGame(JSON.parse(before)));
});
