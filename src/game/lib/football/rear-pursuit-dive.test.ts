import test from 'node:test';
import assert from 'node:assert/strict';
import { canTackle, startNearestDive } from './defensive-action';
import { DIVE, stepCommittedDive } from '../kick-return-dive';
import { isKickContact, type KickDefender } from '../kick-return-engine';
import { createFootballControls } from './controls';
import { createFootball, stepFootball } from './engine';
import { startField } from './field';
import { isFootballGame } from './storage';

const defender = (x: number, y = 96): KickDefender => ({
  id: 1, x, y, homeX: x, minY: 24, maxY: 168, speed: 70, lateralSpeed: 55, active: true,
});

test('rear pursuit launches on the tap without a stationary plant, in either direction', () => {
  let contacts = 0, total = 0;
  for (const direction of [-1, 1]) for (const speed of [55, 73, 90])
    for (const gap of [12, 18, 24]) for (const lane of [-6, 0, 6]) {
      let d = defender(600 - direction * gap, 96 + lane);
      const runner = { x: 600, y: 96, vx: direction * speed, vy: 0 };
      assert.equal(startNearestDive([d], runner), d);
      assert.equal(d.dive!.phase, 'airborne');
      assert(Math.hypot(d.dive!.vx, d.dive!.vy) <= DIVE.speed);
      const initial = d.x;
      let contact = false;
      for (let i = 0; i < 18; i++) {
        runner.x += runner.vx / 60;
        d = stepCommittedDive(d, 1 / 60, true);
        if (i === 0) assert((d.x - initial) * direction > 0);
        contact ||= canTackle(d) && isKickContact(runner, d);
      }
      total++; if (contact) contacts++;
    }
  assert.equal(contacts, total, 'straight reachable runners are caught by actual contact');
});

test('committed rear dives can miss a cut and cannot home, relaunch or tackle while grounded', () => {
  let d = defender(576), runner = { x: 600, y: 96, vx: 73, vy: 0 };
  startNearestDive([d], runner);
  const committed = { ...d.dive! };
  let hit = false;
  for (let i = 0; i < 18; i++) {
    runner.x += 73 / 60; runner.y += 140 / 60;
    assert.equal(startNearestDive([d], runner), undefined);
    d = stepCommittedDive(d, 1 / 60, true);
    hit ||= canTackle(d) && isKickContact(runner, d);
    assert.equal(d.dive!.vx, committed.vx);
    assert.equal(d.dive!.vy, committed.vy);
  }
  assert(!hit);
  assert.equal(d.dive!.phase, 'grounded');
  assert(!canTackle(d));
});

test('rear launches respect range and blocks, but an unrelated committed dive cannot veto the chaser', () => {
  const d = defender(580), unrelated = defender(900);
  unrelated.id = 2;
  unrelated.dive = { phase: 'airborne', elapsed: 0, vx: 100, vy: 0, angle: 0 };
  const runner = { x: 600, y: 96, vx: 73, vy: 0 };
  assert.equal(startNearestDive([unrelated, d], runner), d);
  const blocked = { ...defender(580), engaged: 5 };
  assert.equal(startNearestDive([blocked], runner, 2), undefined);
  assert.equal(startNearestDive([defender(500)], runner), undefined);
  assert.equal(startNearestDive([defender(580)], { ...runner, vx: 250 }), undefined);
  const held = defender(588);
  startNearestDive([held], runner, 2, held.id);
  assert.equal(held.dive?.phase, 'windup', 'held retreat retains its original plant timing');
});

test('real quick-tap controls immediately launch a rear dive and preserve saved-game validity', () => {
  for (const possession of ['home', 'away'] as const) {
    const g = createFootball(86);
    g.homeOddDirection = possession === 'home' ? 1 : -1;
    g.possession = possession; g.phase = 'live';
    const l = g.live = startField(g, 'power', 'prevent');
    l.mode = 'run'; l.carrier = 6; l.time = 2; l.snapAge = .18;
    const runner = l.athletes[6]!;
    Object.assign(runner, { x: 650, y: 96, vx: 73, vy: 0 });
    l.movement.player = { x: 650, y: 96 };
    for (const a of l.athletes.filter(a => a.side === 'defense'))
      Object.assign(a, { x: 300, y: 30, engaged: 0, vx: 0, vy: 0 });
    const chaser = l.athletes.find(a => a.side === 'defense')!;
    Object.assign(chaser, { x: 630, y: 96, vx: 73, vy: 0 });
    const controls = createFootballControls();
    if (possession === 'away') {
      controls.enter('tap', 'juke', 0, g); controls.release('tap', 65);
    }
    // Both sides share the same physical launch; human taps use the real gesture route.
    if (possession === 'home') startNearestDive([chaser], runner, l.time);
    else stepFootball(g, controls.sample(65));
    assert.equal(chaser.dive?.phase, 'airborne');
    assert(chaser.x >= 630);
    assert(isFootballGame(JSON.parse(JSON.stringify(g))));
  }
});
