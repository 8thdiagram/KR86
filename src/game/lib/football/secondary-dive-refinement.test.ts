import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField } from './field';
import { stepDefense } from './pursuit';
import { zoneTarget, manAssignment } from './coverage';
import { DEFENSIVE_DIVE_SPEED, startNearestDive } from './defensive-action';
import { DIVE, stepCommittedDive } from '../kick-return-dive';
import { isKickContact, type KickDefender } from '../kick-return-engine';
import type { Defense } from './types';

function game(defense: Defense = 'pass') {
  const g = createFootball(86);
  g.phase = 'live'; g.possession = 'home'; g.spot = 40;
  g.live = startField(g, 'post', defense); g.live.time = 2;
  return g;
}

test('deep zone backs prioritize a vertical threat over a nearer shallow receiver', () => {
  for (const call of ['pass', 'prevent', 'contain'] as const) {
    const l = game(call).live!, d = l.athletes.filter(a => a.role === 'DB')[1]!;
    const shallow = l.athletes[6]!, deep = l.athletes[3]!;
    Object.assign(shallow, { x: 550, y: d.startY, vx: 0, vy: 0 });
    Object.assign(deep, { x: 710, y: d.startY + 30, vx: 70, vy: -5 });
    const target = zoneTarget(l, d);
    assert.equal(target.threat?.id, deep.id);
    assert(target.x >= deep.x + 30, 'retain depth ahead of an observed vertical release');
  }
});

test('deep zones react to a visible throw but never the hidden target selection', () => {
  const l = game().live!, backs = l.athletes.filter(a => a.role === 'DB');
  const safety = backs[1]!;
  const before = zoneTarget(l, safety);
  l.target = 4;
  assert.deepEqual(zoneTarget(l, safety), before);
  l.flight = { x: 650, y: 96, z: 12, fromX: 470, fromY: 96,
    toX: 780, toY: safety.y, duration: 1, age: .5, receiver: 3, accuracy: 1, type: 'normal' };
  const target = zoneTarget(l, safety);
  assert(target.x >= 780 && target.x <= 802);
  assert(Math.abs(target.y - l.flight.toY) <= 16);
});

test('man assignments remain unique while DBs retain a cushion against vertical releases', () => {
  for (const possession of ['home', 'away'] as const) {
    const g = game('man'); g.possession = possession;
    const l = g.live!, backs = l.athletes.filter(a => a.role === 'DB');
    const receivers = backs.map(d => manAssignment(l, d)).filter(a => a !== undefined);
    assert.equal(new Set(receivers.map(a => a.id)).size, receivers.length);
    for (const r of receivers) Object.assign(r, { x: 650, vx: 70, vy: 0 });
    stepDefense(g, 1 / 60);
    for (const d of backs) {
      if (manAssignment(l, d)) {
        assert.equal(d.pursuit?.role, 'cover');
        assert(d.pursuit!.x > 670, 'do not aim behind a receiver running deep');
      } else {
        assert.equal(d.pursuit?.role, 'deep', 'the unassigned safety keeps deep support');
        assert(d.pursuit!.x > 680, 'spare safety tracks the developing deep threat instead of staying at the snap depth');
      }
    }
  }
});

test('open-field backs keep goal-side pursuit leverage, then close within tackle range', () => {
  const g = game(), l = g.live!;
  l.mode = 'run'; l.carrier = 6; l.carrierCrossedLos = true;
  const runner = l.athletes[6]!;
  Object.assign(runner, { x: 650, y: 60, vx: 55, vy: 20 });
  const back = l.athletes.filter(a => a.role === 'DB')[1]!;
  Object.assign(back, { x: 735, y: 130, vx: 0, vy: 0, engaged: 0 });
  stepDefense(g, 1 / 60);
  assert.equal(back.pursuit!.role, 'tackle');
  assert(back.pursuit!.x >= runner.x + 18);
  assert(back.pursuit!.y > runner.y, 'lead the observed lateral motion');
  Object.assign(back, { x: 666, y: 68, vx: 0, vy: 0, pursuit: undefined });
  runner.vx = runner.vy = 0;
  l.time += .1;
  stepDefense(g, 1 / 60);
  assert(Math.abs(back.pursuit!.x - runner.x) < 1, 'release the cushion near contact');
});

function contactDuringDive(x: number, y: number, vx: number, vy: number, legacy: boolean) {
  let d: KickDefender = { id: 1, x, y, homeX: x, minY: 24, maxY: 168,
    speed: 0, lateralSpeed: 0, active: true };
  const runner = { x: 500, y: 96, vx, vy };
  if (legacy) {
    const reachable = [.24, .34, .46].some(t => Math.hypot(500 + vx * t - x, 96 + vy * t - y) <= 130 * (t - .18) + 15);
    if (!reachable) return false;
    const dx = 500 + vx * .38 - x, dy = 96 + vy * .38 - y, n = Math.max(.001, Math.hypot(dx, dy));
    d.dive = { phase: 'windup', elapsed: 0, vx: dx / n * 130, vy: dy / n * 130, angle: Math.atan2(dy, dx) };
  } else if (!startNearestDive([d], runner)) return false;
  for (let i = 1; i <= 120; i++) {
    d = stepCommittedDive(d, 1 / 240);
    const time = i / 240;
    if (d.dive?.phase === 'airborne' &&
      isKickContact({ x: 500 + vx * time, y: Math.max(24, Math.min(168, 96 + vy * time)) }, d)) return true;
  }
  return false;
}

test('reachable moving-runner dives land more real contacts than fixed-time legacy launches', () => {
  let oldContacts = 0, newContacts = 0;
  for (const x of [475, 500, 525, 545]) for (const y of [68, 96, 124])
    for (const vx of [0, 60, 90]) for (const vy of [-30, 0, 30]) {
      if (Math.hypot(x - 500, y - 96) > 60) continue;
      oldContacts += Number(contactDuringDive(x, y, vx, vy, true));
      newContacts += Number(contactDuringDive(x, y, vx, vy, false));
    }
  assert(newContacts > oldContacts, `${newContacts} physical contacts should improve on ${oldContacts}`);
});

test('a dive stays bounded and committed, with ordinary recovery and no guaranteed contact', () => {
  const d: KickDefender = { id: 1, x: 540, y: 96, homeX: 540,
    minY: 24, maxY: 168, speed: 0, lateralSpeed: 0, active: true };
  assert(startNearestDive([d], { x: 500, y: 96, vx: 60, vy: 0 }));
  assert(Math.hypot(d.dive!.vx, d.dive!.vy) <= DEFENSIVE_DIVE_SPEED);
  const launch = { ...d.dive! };
  let next = d, contact = false;
  for (let i = 1; i <= 120; i++) {
    next = stepCommittedDive(next, 1 / 240, true);
    // A sharp post-launch cut can still defeat a committed tackle.
    const runner = { x: 500 - 80 * i / 240, y: 96 + 80 * i / 240 };
    contact ||= next.dive?.phase === 'airborne' && isKickContact(runner, next);
  }
  assert(!contact);
  assert.equal(next.dive!.angle, launch.angle);
  assert.equal(next.dive!.vx, launch.vx);
  assert.equal(next.dive!.phase, 'grounded');
  assert.equal(DIVE.windup, .18); assert.equal(DIVE.flight, .28);
});
