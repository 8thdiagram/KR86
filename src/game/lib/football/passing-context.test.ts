import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createFootball } from './engine';
import { startField, stepField, routePoint } from './field';
import { throwAccuracy } from './passing-accuracy';
import { releasePass, highlightedReceiver, PASS_HOLD_MS, QB_SCRAMBLE_MS } from './passing';
import { passProjection } from './passing-safety';
import { reflectPhysicalState } from './direction';
import { emptyAwards } from './league-ratings';
import { upgradedPassingBaseline } from './franchise-upgrades';
import { finishAuditPass } from '../../../scripts/football-receiving-audit';
import type { Defense, PassType, PlayId } from './types';

function fixture(play: PlayId = 'slant', time = .8, defense: Defense = 'pass', open = true) {
  const g = createFootball(1234, { player: 'Big Blue', opponent: 'Redbirds' });
  // Keep this delivery/context fixture's original baseline profiles and
  // secondary while isolating it from the new individual roster bonuses.
  g.teams = { player:'Crows', opponent:'Bulls' };
  g.phase = 'live'; g.spot = 40; g.clutchActive = false;
  g.live = startField(g, play, defense);
  g.live.penetration!.roll = .999;
  if (open) for (const d of g.live.athletes.filter(a => a.side === 'defense'))
    Object.assign(d, { x: 1100, y: 28, engaged: 100 });
  while (g.live.time < time) stepField(g, {}, 1 / 120);
  return g;
}
test('1/2/8: approaching a real route cut changes delivery stability; stable motion recovers after the cut', () => {
  const snapshots = [.28, .8].map(time => {
    const g = fixture('slant', time);
    return throwAccuracy(g, g.live!.athletes[3]!, 'normal');
  });
  assert(snapshots[1]!.stability > snapshots[0]!.stability);
  assert(snapshots[1]!.accuracy > snapshots[0]!.accuracy);
});
test('3/4: pass suitability uses its actual travel horizon, never an unconditional type bonus', () => {
  const g = fixture('out', .6), a = g.live!.athletes[3]!;
  const lob = throwAccuracy(g, a, 'normal'), bullet = throwAccuracy(g, a, 'bullet');
  assert.notEqual(lob.projection.duration, bullet.projection.duration);
  assert.notEqual(lob.stability, bullet.stability, 'the approaching out cut affects different arrival times');
  // A straight, stable route gives the same delivery rating to either pass type.
  g.live!.play = 'verticals'; g.live!.time = 1;
  const p = routePoint(g.live!, a), future = routePoint({ ...g.live!, time: 1.01 }, a);
  a.vx = (future.x - p.x) / .01; a.vy = (future.y - p.y) / .01;
  assert(Math.abs(throwAccuracy(g, a, 'normal').accuracy - throwAccuracy(g, a, 'bullet').accuracy) < 1e-10);
});
test('5/6/7: accuracy only changes physical placement; reception and defensive outcome rules remain separate', () => {
  const g = fixture('post', 2), a = g.live!.athletes[3]!;
  const open = throwAccuracy(g, a, 'normal');
  const d = g.live!.athletes[11]!;
  d.x = a.x; d.y = a.y; d.engaged = 0;
  assert.deepEqual(throwAccuracy(g, a, 'normal'), open, 'no second separation penalty on delivery');
  const pressure = structuredClone(g); pressure.live!.pressure = 1;
  assert(throwAccuracy(pressure, pressure.live!.athletes[3]!, 'normal').accuracy < open.accuracy);
});
test('9: a stable late route has no blanket elapsed-time accuracy decay', () => {
  const g = fixture('verticals', 1), l = g.live!, a = l.athletes[3]!;
  const p = routePoint(l, a), later = routePoint({ ...l, time: l.time + .01 }, a);
  a.vx = (later.x - p.x) / .01; a.vy = (later.y - p.y) / .01;
  const early = throwAccuracy(g, a, 'bullet');
  l.time += .8;
  const late = throwAccuracy(g, a, 'bullet');
  assert(Math.abs(early.accuracy - late.accuracy) < 1e-10);
});
test('10: accuracy refinement never overrides any active highlighted receiver', () => {
  for (const time of [.5, 1.2, 1.85]) for (const type of ['normal', 'bullet'] as const) {
    const g = fixture('slant', time), receiver = highlightedReceiver(g.live!);
    g.live!.pressure = 1.5; g.profiles.home.qb = .4;
    releasePass(g, type);
    assert.equal(g.live!.flight!.receiver, receiver);
  }
});
test('11/12: intelligent selection does not bypass delivery uncertainty or make scrambling automatically accurate', () => {
  const g = fixture('post', 4), l = g.live!;
  l.mode = 'scramble'; l.scrambled = true;
  l.athletes[5]!.vx = 65; l.athletes[5]!.vy = 25; g.profiles.home.qb = .5;
  releasePass(g);
  const f = l.flight!;
  assert(f.accuracy < .94);
  assert(Math.hypot(f.toX - f.aimX!, f.toY - f.aimY!) > 0);
  assert.equal(PASS_HOLD_MS, 220); assert.equal(QB_SCRAMBLE_MS, 1000);
});
test('13: stronger QB ratings reduce matched-seed placement error without changing the target or pass speed', () => {
  let weaker = 0, stronger = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const base = fixture('post', 2), a = base.live!.athletes[3]!;
    a.x = 850; a.vx = 60; a.vy = 0;
    const weak = structuredClone(base), strong = structuredClone(base);
    weak.rng = strong.rng = seed * 617;
    weak.profiles.home.qb = .45; strong.profiles.home.qb = .9;
    releasePass(weak, 'bullet'); releasePass(strong, 'bullet');
    const wf = weak.live!.flight!, sf = strong.live!.flight!;
    assert.equal(wf.receiver, sf.receiver); assert.equal(wf.duration, sf.duration);
    weaker += Math.hypot(wf.toX - wf.aimX!, wf.toY - wf.aimY!);
    stronger += Math.hypot(sf.toX - sf.aimX!, sf.toY - sf.aimY!);
  }
  assert(stronger < weaker * .8);
});
test('14/15: original additive QB MVP baseline and clutch enhancement are applied exactly once', () => {
  for (const clutch of [false, true]) for (const count of [0, 1, 3]) {
    const g = fixture('post', 2);
    g.clutchActive = clutch;
    g.franchise = { gameId: 'accuracy-unit', awards: { ...emptyAwards(), QB1: count }, opponentAwards: emptyAwards() };
    const a = g.live!.athletes[3]!, l = g.live!, qb = l.athletes[5]!;
    const got = throwAccuracy(g, a, 'normal');
    const distance = Math.hypot(a.x - qb.x, a.y - qb.y);
    const expected = Math.max(.12, Math.min(.94,
      upgradedPassingBaseline(g, .30 + g.profiles.home.qb * .43) + got.stability * .15 +
      l.advantage * .18 - l.pressure * .14 - Math.max(0, distance - 200) / 2500 -
      Math.min(.05, Math.abs(qb.vy) / 1200)));
    assert(Math.abs(expected - got.accuracy) < 1e-12);
  }
});
test('16: equivalent CPU and human snapshots use identical accuracy, scatter, trajectory and random draws', () => {
  for (const type of ['normal', 'bullet'] as const) {
    const human = fixture(), cpu = structuredClone(human);
    cpu.teams = {player:human.teams.opponent,opponent:human.teams.player};
    cpu.possession = 'away'; cpu.live!.offense = 'away'; cpu.profiles.away = structuredClone(human.profiles.home);
    assert.deepEqual(throwAccuracy(human, human.live!.athletes[3]!, type),
      throwAccuracy(cpu, cpu.live!.athletes[3]!, type));
    releasePass(human, type); releasePass(cpu, type, 3);
    assert.deepEqual(human.live!.flight, cpu.live!.flight);
  }
});
test('18: projection and route/movement state stay unchanged; evaluating a throw is read-only and bounded', () => {
  const g = fixture('flood', 1.3), a = g.live!.athletes[3]!, before = structuredClone(g);
  const start = performance.now();
  for (let i = 0; i < 10000; i++) {
    const result = throwAccuracy(g, a, i % 2 ? 'normal' : 'bullet');
    assert(result.accuracy >= .12 && result.accuracy <= .94);
    assert(result.spreadX >= 0 && result.spreadX <= 405);
  }
  const elapsedMs = performance.now() - start;
  console.log('THROW-CONTEXT PERFORMANCE', JSON.stringify({ estimates: 10000, elapsedMs }));
  assert(elapsedMs < 2500);
  assert.deepEqual(g, before);
  assert.deepEqual(throwAccuracy(g, a, 'bullet').projection, passProjection(g.live!, a, 'bullet'));
});
test('18: launch-aim metadata mirrors with the actual ball and survives a round trip', () => {
  const g = fixture(); releasePass(g);
  const f = g.live!.flight!, before = structuredClone(f);
  reflectPhysicalState(f);
  assert.equal(f.aimX, 1200 - before.aimX!);
  reflectPhysicalState(f);
  assert(Math.abs(f.aimX! - before.aimX!) < 1e-9);
});
test('controlled gameplay rewards a quick slant bullet before man coverage closes; a lob gives the defender more time', () => {
  const measure = (time: number, type: PassType) => {
    let catches = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const g = createFootball(seed * 617, { player: 'Big Blue', opponent: 'Redbirds' });
      g.teams = {player:'Crows',opponent:'Bulls'}; // Original, unboosted delivery calibration.
      g.phase = 'live'; g.spot = 40; g.clutchActive = false; g.live = startField(g, 'slant', 'man');
      while (g.live.time < time) assert(!stepField(g, {}, 1 / 60));
      releasePass(g, type);
      catches += Number(finishAuditPass(g, 1 / 60).outcome === 'catch');
    }
    return catches;
  };
  const quickBullet = measure(.2, 'bullet'), slowLob = measure(.2, 'normal'), closedWindow = measure(.4, 'bullet');
  console.log('MATCHED SLANT OPPORTUNITIES', JSON.stringify({ samples: 200, quickBullet, slowLob, closedWindow }));
  assert(quickBullet > slowLob + 30); assert(quickBullet > closedWindow + 50);
});
