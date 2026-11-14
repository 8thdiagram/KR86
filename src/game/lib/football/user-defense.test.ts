import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField, stepField } from './field';
import { stepDefense } from './pursuit';
import { DEFENSE_IDS, type Defense, type PlayId } from './types';
import { consumeDefenseRelease, controlledDefenderId, prepareUserDefense, userDefenseTarget, userDefenseVelocity } from './user-defense';
import { diagramForDefense } from './diagrams';
import { manAssignment } from './coverage';
import { eligiblePassDefenders, resolvePassDefense } from './pass-defense';
import { startNearestDive } from './defensive-action';
import { isFootballGame } from './storage';
function fixture(defense: Defense = 'pass', play: PlayId = 'post') {
  const g = createFootball(86);
  g.phase = 'live'; g.possession = 'away'; g.spot = 40;
  g.live = startField(g, play, defense); g.live.time = 1; g.live.target = 100;
  g.live.penetration!.roll = .999;
  return g;
}
const selected = (g: ReturnType<typeof fixture>) => g.live!.athletes.find(a => a.id === controlledDefenderId(g.live!))!;
const defenders = (g: ReturnType<typeof fixture>) => g.live!.athletes.filter(a => a.side === 'defense');
function isolate(g: ReturnType<typeof fixture>) {
  for (const a of g.live!.athletes) if (a.side === 'offense' && a.role !== 'QB') { a.x = 1000; a.y = 30; a.engaged = 0; }
  for (const d of defenders(g)) { d.x = 950; d.y = 160; d.engaged = 0; }
}
test('every defensive call and offensive play selects the same existing middle linebacker without diagram targets', () => {
  let identity: number | undefined;
  for (const call of DEFENSE_IDS) for (const play of ['post', 'flood', 'verticals', 'power', 'speed-option'] as const) {
    const g = fixture(call, play), d = selected(g);
    assert.equal(d.role, 'LB'); identity ??= d.id; assert.equal(d.id, identity);
    assert(diagramForDefense(g, call).every(r => !('controlled' in r)));
    assert.equal(g.live!.athletes.length, 14);
    for (const a of defenders(g)) { a.x += 100; a.y -= 20; }
    assert.equal(controlledDefenderId(g.live!), d.id);
  }
});
test('missing-LB fallback uses central existing personnel and never moves a formation', () => {
  const g = fixture('prevent'), l = g.live!;
  l.athletes = l.athletes.filter(a => a.role !== 'LB');
  const central = l.athletes.filter(a => a.side === 'defense' && a.role === 'DB')
    .sort((a, b) => Math.abs(a.startY - 96) - Math.abs(b.startY - 96) || a.id - b.id)[0]!;
  const before = JSON.stringify(l);
  assert.equal(controlledDefenderId(l), central.id); assert.equal(JSON.stringify(l), before);
});
test('no-input AI, ACTION-held movement, random stream and assignments remain identical', () => {
  for (const call of DEFENSE_IDS) {
    const plain = fixture(call), controlled = structuredClone(plain);
    for (let i = 0; i < 90; i++) {
      plain.live!.time += 1 / 60; controlled.live!.time += 1 / 60;
      prepareUserDefense(controlled, { action: i === 0 });
      stepDefense(plain, 1 / 60); stepDefense(controlled, 1 / 60);
      assert.deepEqual(controlled, plain);
    }
  }
});
test('CPU defense ignores strafing input and original offensive outcomes remain identical', () => {
  const a = fixture(), b = structuredClone(a);
  a.possession = b.possession = 'home'; a.live!.offense = b.live!.offense = 'home';
  for (let i = 0; i < 120; i++) {
    const first = stepField(a, {}, 1 / 60), second = stepField(b, { defenseDirection: i % 2 ? 1 : -1 }, 1 / 60);
    assert.deepEqual(first, second); assert.deepEqual(a, b); if (first) break;
  }
});
test('strafing changes only the selected movement vector with immediate legitimate lateral speed', () => {
  const a = fixture(), b = structuredClone(a), id = controlledDefenderId(a.live!);
  prepareUserDefense(b, { defenseDirection: 1 });
  stepDefense(a, 1 / 60); stepDefense(b, 1 / 60);
  for (const original of a.live!.athletes) if (original.id !== id)
    assert.deepEqual(b.live!.athletes.find(a => a.id === original.id), original);
  const d = selected(b);
  assert(d.vy > selected(a).vy); assert(Math.hypot(d.x - d.startX, d.y - d.startY) < 2);
  assert.equal(d.vx, 0); assert(d.vy > 30 && d.vy < 100);
  const speed = d.vy;
  prepareUserDefense(b, { defenseDirection: -1 }); stepDefense(b, 1 / 60);
  assert.equal(d.vx, 0); assert.equal(d.vy, -speed, 'direction changes have no AI turn delay');
});
test('arrows override opposing coverage, avoidance and spacing without horizontal pursuit or assignment changes', () => {
  for (const call of DEFENSE_IDS) for (const direction of [-1, 1] as const) {
    const g = fixture(call), l = g.live!, d = selected(g);
    isolate(g); d.x = 700; d.y = 96; d.vx = d.vy = 0;
    const mate = defenders(g).find(a => a.id !== d.id)!; mate.x = 696; mate.y = 96 + direction * 5;
    d.pursuit = { x: 850, y: direction === 1 ? 25 : 167, until: 100, role: 'cover', seenX: 850, seenY: 25, seenVx: 0, seenVy: 0 };
    const block = l.athletes[0]!; block.x = 705; block.y = 96 + direction * 8;
    const assignment = structuredClone(d.pursuit);
    for (let frame = 0; frame < 15; frame++) {
      prepareUserDefense(g, { defenseDirection: direction, action: frame === 0 });
      stepDefense(g, 1 / 60); l.time += 1 / 60;
      assert.equal(d.x, 700); assert(d.vy * direction > 0);
    }
    assert.deepEqual(d.pursuit, assignment);
    assert.deepEqual(userDefenseVelocity(direction, 64), { x: 0, y: direction * 64 });
  }
});
test('ACTION alone has no manual target, while strafe release restores AI even if ACTION remains pressed', () => {
  const g = fixture('man'), d = selected(g), assignment = manAssignment(g.live!, d)?.id;
  prepareUserDefense(g, { action: true });
  assert.equal(userDefenseTarget(g, d), undefined);
  prepareUserDefense(g, { defenseDirection: -1, action: true }); assert(userDefenseTarget(g, d));
  prepareUserDefense(g, { action: true });
  assert.equal(userDefenseTarget(g, d), undefined); assert(consumeDefenseRelease(g, d));
  assert.equal(consumeDefenseRelease(g, d), false); assert.equal(manAssignment(g.live!, d)?.id, assignment);
});
test('release immediately re-reads the original receiver current location without teleporting', () => {
  const g = fixture('man'), l = g.live!, d = selected(g), receiver = manAssignment(l, d)!;
  d.x = 700; d.y = 110; d.vx = d.vy = 0;
  d.pursuit = { x: 620, y: 160, until: 100, role: 'cover', seenX: 616, seenY: 160, seenVx: 0, seenVy: 0 };
  prepareUserDefense(g, { defenseDirection: 1 }); stepDefense(g, 1 / 60);
  receiver.x = 830; receiver.y = 35; const before = { x: d.x, y: d.y };
  prepareUserDefense(g, {}); stepDefense(g, 1 / 60);
  assert.equal(manAssignment(l, d)!.id, receiver.id);
  assert.equal(d.pursuit.seenX, receiver.x); assert.equal(d.pursuit.seenY, receiver.y);
  assert(d.pursuit.y < before.y && d.pursuit.x > before.x); assert(Math.hypot(d.x - before.x, d.y - before.y) < 3);
});
test('arrows do not read QB/receiver progression, visible-ball position or hidden destinations', () => {
  const g = fixture('man'), l = g.live!, d = selected(g);
  prepareUserDefense(g, { defenseDirection: 1 });
  const target = userDefenseTarget(g, d);
  assert.deepEqual(target, { x: d.x, y: d.y + 42, direction: 1 });
  l.lockedReceiver = 6; l.athletes[6]!.x += 100; l.athletes[l.carrier]!.y -= 20;
  assert.deepEqual(userDefenseTarget(g, d), target);
});
test('original ACTION still uses the nearest eligible DL, not the distant highlighted LB', () => {
  for (const direction of [0, -1, 1] as const) {
    const g = fixture(), l = g.live!; isolate(g);
    const qb = l.athletes[5]!, dl = l.athletes[7]!;
    qb.x = 460; qb.y = 96; dl.x = 495; dl.y = 96;
    const expected = startNearestDive(structuredClone(defenders(g)), qb, l.time)!.id;
    stepField(g, { action: true, defenseDirection: direction }, 1 / 60);
    assert.equal(dl.id, expected); assert(dl.dive);
    assert.notEqual(dl.id, controlledDefenderId(l)); assert.equal(selected(g).dive, undefined);
  }
});
test('arrows never synthesize a dive or occupy the original ACTION cooldown', () => {
  const g = fixture(), l = g.live!, d = selected(g); isolate(g);
  l.athletes[5]!.x = 460; l.athletes[5]!.y = 96; d.x = 490; d.y = 110;
  for (let i = 0; i < 60; i++) {
    stepField(g, { defenseDirection: i % 2 ? 1 : -1 }, 1 / 60);
    assert.equal(d.dive, undefined); assert.equal(d.defensiveAttempt, undefined);
    assert.equal(l.defensiveActionAt, undefined);
  }
  const dl = l.athletes[7]!; dl.x = l.athletes[5]!.x + 35; dl.y = l.athletes[5]!.y;
  d.x = 700;
  stepField(g, { action: true, defenseDirection: 1 }, 1 / 60);
  assert(dl.dive); assert.equal(d.dive, undefined);
});
test('actual contact still creates automatic sacks and tackles without ACTION', () => {
  for (const diving of [false, true])
  for (const mode of ['dropback', 'scramble', 'run'] as const) for (const distance of [0, 200]) {
    const g = fixture(), l = g.live!; isolate(g); l.mode = mode; l.carrier = mode === 'run' ? 6 : 5;
    const runner = l.athletes[l.carrier]!, d = selected(g);
    runner.x = l.movement.player.x = 450; runner.y = l.movement.player.y = 96;
    d.x = runner.x + distance; d.y = runner.y;
    if (diving) d.dive = { phase: 'airborne', elapsed: .1, vx: 0, vy: 0, angle: 0 };
    assert.equal(stepField(g, { defenseDirection: 1 }, 1 / 60)?.reason, distance ? undefined : mode === 'run' ? 'tackle' : 'sack');
  }
});
test('pass ACTION selects nearest eligibility; arrows alone never force a highlighted-player attempt', () => {
  for (const action of [false, true]) {
    const g = fixture('man'), l = g.live!; isolate(g); l.mode = 'flight';
    l.flight = { x: 580, y: 96, z: 1, fromX: 400, fromY: 96, toX: 600, toY: 96, duration: 1, age: .9, receiver: 3, accuracy: 1, type: 'normal' };
    const d = selected(g), closer = l.athletes[12]!;
    d.x = 610; d.y = 96; closer.x = 600; closer.y = 96;
    const nearest = eligiblePassDefenders(g)[0]!.d.id;
    stepField(g, { action, defenseDirection: 1 }, 1 / 60);
    const diving = defenders(g).filter(a => a.defensiveAttempt?.kind === 'intercept');
    assert.equal(diving.length, action ? 1 : 0);
    if (action) assert.equal(diving[0]!.id, nearest);
    else assert.equal(l.defensiveActionAt, undefined);
  }
});
test('legitimate pass actions while strafing keep reaction delay, contact, probabilities and misses', () => {
  let picks = 0, breakups = 0, misses = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const g = fixture('man'), l = g.live!; isolate(g); l.mode = 'flight';
    const d = selected(g); d.x = 610; d.y = 96;
    l.flight = { x: 580, y: 96, z: 1, fromX: 400, fromY: 96, toX: 600, toY: 96, duration: 1, age: .9, receiver: 3, accuracy: 1, type: 'normal' };
    stepField(g, { action: true, defenseDirection: 1 }, 1 / 60); assert(d.dive);
    d.dive.phase = 'airborne'; d.x = l.flight!.x; d.y = l.flight!.y; g.rng = seed * 617;
    const outcome = resolvePassDefense(g, l.flight!.x - 3, l.flight!.y);
    if (outcome === 'interception') picks++; else if (outcome === 'breakup') breakups++; else misses++;
  }
  assert(picks > 0 && breakups > 0 && misses > 0);
  const g = fixture('man'), l = g.live!, d = selected(g); isolate(g); d.x = 590; d.y = 96; l.mode = 'flight';
  l.flight = { x: 580, y: 96, z: 1, fromX: 580, fromY: 96, toX: 800, toY: 96, duration: 1, age: 0, receiver: 3, accuracy: 1, type: 'normal' };
  stepField(g, { defenseDirection: 1 }, 1 / 60); assert.equal(d.dive, undefined);
});
test('repeated UP/DOWN/release cycles immediately restore assignment AI without a lingering manual or dive state', () => {
  const g = fixture('man'), l = g.live!, d = selected(g), receiver = manAssignment(l, d)!;
  isolate(g); d.x = 700; d.y = 96; d.vx = -30; d.vy = 20;
  receiver.x = 840; receiver.y = 40;
  for (let cycle = 0; cycle < 60; cycle++) {
    const direction = cycle % 2 ? 1 : -1;
    prepareUserDefense(g, { defenseDirection: direction });
    stepDefense(g, 1 / 60); l.time += 1 / 60;
    assert.equal(d.vx, 0); assert(d.vy * direction > 30);
    prepareUserDefense(g, { action: true });
    stepDefense(g, 1 / 60); l.time += 1 / 60;
    assert.equal(userDefenseTarget(g, d), undefined);
    assert(d.vx > 0, 'ordinary coverage steering must resume on the release frame');
    assert.equal(d.pursuit!.seenX, receiver.x);
    assert.equal(d.dive, undefined);
  }
});
test('early-snap arrows bypass only AI reaction slowdown without raising normal player top speed', () => {
  for (const direction of [-1, 1] as const) {
    const early = fixture(), normal = structuredClone(early);
    early.live!.time = .02; normal.live!.time = .5;
    for (const g of [early, normal]) {
      isolate(g); const d = selected(g); d.x = 700; d.y = 96;
      prepareUserDefense(g, { defenseDirection: direction }); stepDefense(g, 1 / 60);
    }
    assert.equal(selected(early).vy, selected(normal).vy);
    assert(selected(early).vy * direction > 30);
  }
});
test('ACTION has no fallback dive when no defender is eligible, with or without arrows', () => {
  for (const mode of ['dropback', 'flight'] as const) for (const direction of [0, -1, 1] as const) {
    const g = fixture(), l = g.live!; isolate(g); l.mode = mode;
    if (mode === 'flight')
      l.flight = { x: 580, y: 96, z: 1, fromX: 400, fromY: 96, toX: 600, toY: 96, duration: 1, age: .9, receiver: 3, accuracy: 1, type: 'normal' };
    stepField(g, { action: true, defenseDirection: direction }, 1 / 60);
    assert(defenders(g).every(d => !d.dive && !d.defensiveAttempt));
    assert.equal(l.defensiveActionAt, undefined);
  }
});
test('manual strafing preserves original blocking and committed dive recovery instead of resetting animations', () => {
  const g = fixture(), l = g.live!, d = selected(g); isolate(g);
  d.x = 700; d.y = 96; d.vx = d.vy = 0; d.engaged = l.time + .2;
  prepareUserDefense(g, { defenseDirection: 1 }); stepDefense(g, 1 / 60);
  assert.equal(d.y, 96, 'blocking remains physical');
  d.engaged = 0;
  d.dive = { phase: 'windup', elapsed: 0, vx: -130, vy: 0, angle: Math.PI };
  for (let frame = 0; frame < 150; frame++) {
    prepareUserDefense(g, { defenseDirection: frame < 5 ? 1 : 0 });
    stepDefense(g, 1 / 60); l.time += 1 / 60;
  }
  assert.equal(d.dive, undefined, 'normal animation must finish and recover');
  assert.equal(userDefenseTarget(g, d), undefined);
  assert(Math.hypot(d.vx, d.vy) > 0, 'original AI must move after recovery');
});
test('transient strafe intentions never enter valid Franchise save payloads', () => {
  const g = fixture(), before = JSON.stringify(g);
  prepareUserDefense(g, { defenseDirection: 1 }); userDefenseTarget(g, selected(g));
  assert.equal(JSON.stringify(g), before); assert(isFootballGame(JSON.parse(before)));
});
