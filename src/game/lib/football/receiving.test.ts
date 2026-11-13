import test from 'node:test';
import assert from 'node:assert/strict';
import { finishAuditPass, launchAuditPass, receivingFixture, type AuditCase } from '../../../scripts/football-receiving-audit';
import { highlightedReceiver, progression, releasePass } from './passing';
import { resolveReception } from './receiving';
import { stepField } from './field';
import { kickSeed } from '../kick-return-engine';

function sample(scenario: AuditCase, n: number, dt = 1 / 120) {
  const counts: Record<string, number> = {};
  for (let seed = 1; seed <= n; seed++) {
    const { g } = launchAuditPass(seed, scenario), r = finishAuditPass(g, dt);
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    assert.notEqual(r.outcome, 'unresolved');
  }
  return counts;
}
for (const scenario of ['open-lob', 'open-bullet', 'moving-lob', 'moving-bullet'] as const) {
  test(`A/B/C: ${scenario} catches at least 90% of 1000 actual delivered passes, without guaranteeing catches`, () => {
    const counts = sample(scenario, 1000);
    assert((counts.catch ?? 0) >= 900 && (counts.catch ?? 0) <= 975, JSON.stringify(counts));
    assert((counts.drop ?? 0) > 0); assert.equal(counts['uncatchable'] ?? 0, 0);
    assert.equal(counts['accuracy-miss'] ?? 0, 0);
    assert.equal(counts.breakup ?? 0, 0); assert.equal(counts.interception ?? 0, 0);
  });
}
test('D/E: physical coverage lowers completions, but an unreachable defender does not invent a breakup or drop penalty', () => {
  const open = sample('moving-lob', 500), nearby = sample('nearby-unable-to-reach', 500);
  assert.deepEqual(nearby, open);
  for (const scenario of ['moderate-coverage', 'heavy-coverage'] as const) {
    const counts = sample(scenario, 500);
    assert((counts.catch ?? 0) < open.catch! - 50, JSON.stringify(counts));
    assert((counts.breakup ?? 0) > 0); assert((counts.interception ?? 0) > 0);
  }
});
test('F: progression expiry in flight never changes the intended receiver or cancels catches', () => {
  let catches = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const { g, f, receiverAtRelease } = launchAuditPass(seed, 'progression-expires');
    assert.equal(f.receiver, receiverAtRelease);
    assert.equal(progression(g.live!).index, 0);
    const result = finishAuditPass(g);
    assert.equal(result.receiver, receiverAtRelease); assert(progression(g.live!).index > 0);
    catches += Number(result.outcome === 'catch');
  }
  assert(catches >= 180);
});
test('G: deliberate post-scramble throws use the normal reliable receiving pipeline', () => {
  const counts = sample('post-scramble', 500);
  assert(counts.catch! >= 450); assert(counts.drop! > 0);
});
test('H: four consecutive open-passing failures are rare in 1000 independent seeded four-pass groups', () => {
  let fourFailures = 0, totalDrops = 0;
  for (let group = 0; group < 1000; group++) {
    let drops = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { g } = launchAuditPass(group * 4 + attempt + 1, 'moving-lob');
      g.rng = kickSeed(`receiving-four:${group}:${attempt}`);
      const result = finishAuditPass(g);
      assert(['catch', 'drop'].includes(result.outcome));
      drops += Number(result.outcome === 'drop');
    }
    totalDrops += drops; fourFailures += Number(drops === 4);
  }
  console.log('FOUR-PASS GROUPS', JSON.stringify({ groups: 1000, fourFailures, totalDrops, passes: 4000 }));
  assert(fourFailures <= 2); assert(totalDrops > 0 && totalDrops < 400);
});
test('delivery misses and unreachable targets are not called receiver drops', () => {
  assert.equal(sample('inaccurate', 50)['accuracy-miss'], 50);
  assert.equal(sample('unreachable', 50).uncatchable, 50);
});
test('bullet arrivals cannot tunnel past the clamped endpoint at 30, 60 or 120 Hz', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const counts = sample('moving-bullet', 300, dt);
    assert(counts.catch! >= 270, JSON.stringify({ dt, counts }));
    assert.deepEqual(Object.keys(counts).sort(), ['catch', 'drop']);
  }
});
test('ordinary receiver ratings remain distinct after separating delivery accuracy from securing the ball', () => {
  const weak = sample('weak-receiver', 1000), strong = sample('strong-receiver', 1000);
  assert(weak.catch! >= 880); assert(strong.catch! > weak.catch! + 30); assert(strong.drop! > 0);
});
test('the receiver skill check does not reroll QB accuracy on a physically delivered ball', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const { g } = launchAuditPass(seed, 'open-lob'), other = structuredClone(g);
    g.live!.flight!.accuracy = .12; other.live!.flight!.accuracy = .94;
    assert.deepEqual(finishAuditPass(g), { ...finishAuditPass(other), accuracy: .12 });
  }
});
test('the physical catch radius is consistent across legacy and current clutch metadata; impossible catches stay impossible', () => {
  for (const clutch of [undefined, false, true]) {
    const g = receivingFixture(1);
    g.clutchActive = clutch;
    g.live!.time = .8; releasePass(g);
    const f = g.live!.flight!, a = g.live!.athletes[f.receiver]!;
    f.x = f.toX; f.y = f.toY; a.x = f.x + 50; a.y = f.y;
    assert.equal(resolveReception(g), 'UNCATCHABLE THROW');
  }
});
test('catch outcome survives a serialized flight and still uses the original intended target', () => {
  const { g, f } = launchAuditPass(36, 'moving-lob');
  for (let i = 0; i < 10; i++) stepField(g, {}, 1 / 120);
  const resumed = JSON.parse(JSON.stringify(g));
  assert.equal(resumed.live.flight.receiver, f.receiver);
  assert.deepEqual(finishAuditPass(g), finishAuditPass(resumed));
});
test('ordinary targeting and launch coordinates remain independent of receiving resolution', () => {
  const g = receivingFixture(20), l = g.live!;
  l.time = 1.2; const intended = highlightedReceiver(l);
  releasePass(g, 'bullet');
  assert.equal(l.flight!.receiver, intended);
  assert(l.flight!.aimX !== undefined && l.flight!.aimY !== undefined);
});
