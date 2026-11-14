import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { kickoffSequence, stepSpecialTeams } from './special-teams';
import { isUserDefensivePlay, isUserKickoffCoverage } from './user-defense';
import { KR, createKickAttempt, stepKickAttempt } from '../kick-return-engine';
import { openFieldGain } from './athleticism';

function fixture() {
  const g = createFootball(86); g.phase = 'kickoff'; g.kickReceiver = 'away';
  const s = g.special = kickoffSequence(g, 'full');
  s.stage = 'recovery'; s.stageAge = .32; s.recovery = s.returner;
  s.recoveryFrom = { x: s.toX, y: s.toY }; s.ball = { x: s.toX, y: s.toY, z: 0 };
  stepSpecialTeams(g, {}, KR.dt);
  assert.equal(s.stage, 'return'); assert(isUserKickoffCoverage(g));
  return g;
}
test('kickoff coverage selects the existing kicker only after the kick, and never on human receiving or punts', () => {
  const g = fixture(), s = g.special!, start = structuredClone(s.athletes[s.kicker]!);
  assert(isUserDefensivePlay(g)); assert.deepEqual(s.athletes[s.kicker], start);
  s.stage = 'flight'; g.returnAttempt = undefined; assert(isUserKickoffCoverage(g));
  s.stage = 'approach'; assert.equal(isUserKickoffCoverage(g), false);
  s.stage = 'return'; s.kind = 'punt'; assert.equal(isUserKickoffCoverage(g), false);
  s.kind = 'full'; s.kicking = 'away'; s.receiver = 'home'; assert.equal(isUserKickoffCoverage(g), false);
});
test('kicker strafing responds immediately at legitimate speed and changes no other player first-frame movement', () => {
  for (const direction of [-1, 1] as const) {
    const a = fixture(), b = structuredClone(a), id = a.special!.kicker;
    for (const g of [a, b]) {
      const d = g.returnAttempt!.defenders.find(d => d.id === id)!;
      d.x = 900; d.y = 96;
      d.motion = { vx: 0, vy: 0, targetX: 600, targetY: direction < 0 ? 168 : 24, reactionLeft: 100, stride: 0, facing: -1 };
      g.special!.athletes[id]!.x = d.x; g.special!.athletes[id]!.y = d.y;
    }
    const beforeKicker = structuredClone(b.returnAttempt!.defenders.find(d => d.id === id)!);
    const gain = openFieldGain(beforeKicker, [b.returnAttempt!.player], KR.dt, !beforeKicker.dive);
    stepSpecialTeams(a, {}, KR.dt); stepSpecialTeams(b, { defenseDirection: direction }, KR.dt);
    const d = b.returnAttempt!.defenders.find(d => d.id === id)!;
    assert.equal(d.x, 900); assert((d.y - 96) * direction > 0);
    assert(Math.abs(d.y - 96) <= d.lateralSpeed * gain * KR.dt + 1e-9);
    assert.equal(d.motion!.vy, direction * d.lateralSpeed * gain);
    assert.equal(d.motion!.reactionLeft, 0);
    for (const other of a.returnAttempt!.defenders) if (other.id !== id)
      assert.deepEqual(b.returnAttempt!.defenders.find(d => d.id === other.id), other);
    const before = { x: d.x, y: d.y };
    stepSpecialTeams(b, {}, KR.dt);
    const released = b.returnAttempt!.defenders.find(d => d.id === id)!;
    assert(released.motion!.reactionLeft > 0); assert.notEqual(released.motion!.targetX, 600);
    assert(Math.hypot(released.x - before.x, released.y - before.y) < 3);
  }
});
test('kickoff ACTION still selects the nearest eligible teammate, not the highlighted kicker', () => {
  const g = fixture(), a = g.returnAttempt!, s = g.special!;
  for (const d of a.defenders) { d.x = 1000; d.y = 160; }
  const nearest = a.defenders.find(d => d.id !== s.kicker)!;
  nearest.x = a.player.x + 35; nearest.y = a.player.y;
  stepSpecialTeams(g, { action: true, defenseDirection: 1 }, KR.dt);
  assert(g.returnAttempt!.defenders.find(d => d.id === nearest.id)!.dive);
  assert.equal(g.returnAttempt!.defenders.find(d => d.id === s.kicker)!.dive, undefined);
});
test('kicker retains automatic contact tackling while manually strafing', () => {
  const g = fixture(), a = g.returnAttempt!, s = g.special!;
  for (const d of a.defenders) { d.x = 1000; d.y = 160; }
  const kicker = a.defenders.find(d => d.id === s.kicker)!;
  kicker.x = a.player.x; kicker.y = a.player.y;
  stepSpecialTeams(g, { defenseDirection: 1 }, KR.dt);
  assert.equal(g.returnAttempt!.phase, 'tackled');
});
test('kickoff flight strafing changes only kicker movement, not trajectory, personnel or initial positions', () => {
  const a = fixture(); a.special!.stage = 'flight'; a.special!.stageAge = .4; a.returnAttempt = undefined;
  const b = structuredClone(a), id = a.special!.kicker, y = b.special!.athletes[id]!.y;
  stepSpecialTeams(a, {}, KR.dt); stepSpecialTeams(b, { defenseDirection: -1 }, KR.dt);
  assert.deepEqual(b.special!.ball, a.special!.ball);
  assert(b.special!.athletes[id]!.y < y);
  for (const player of a.special!.athletes) {
    if (player.id !== id) assert.deepEqual(b.special!.athletes[player.id], player);
    else assert.equal(b.special!.athletes[id]!.startY, player.startY);
  }
});
test('Classic and receiving-side return physics remain byte-identical with no coverage input', () => {
  for (const seed of [1, 86, 1988]) {
    let a = createKickAttempt(seed, 1), b = structuredClone(a);
    for (let frame = 0; frame < 240; frame++) {
      const direction = frame % 80 < 40 ? -1 : 1;
      a = stepKickAttempt(a, direction); b = stepKickAttempt(b, direction, KR.dt, {}, undefined, undefined);
      assert.deepEqual(b, a);
    }
  }
});
