import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField } from './field';
import { createFootballControls } from './controls';
function fixture() {
  const g = createFootball(86);
  g.phase = 'live'; g.possession = 'away'; g.live = startField(g, 'post', 'pass');
  return g;
}
test('defensive ACTION fires on press, not release, regardless of hold duration', () => {
  for (const duration of [1, 60, 199, 200, 1000, 5000]) {
    const c = createFootballControls(), g = fixture();
    c.enter('action', 'juke', 0, g);
    assert.equal(c.sample(0, false).action, true, 'drawing cannot consume the command');
    assert.equal(c.sample(0).action, true);
    assert.equal(c.sample(duration).action, false);
    assert.equal(c.sample(duration).defenseDirection, 0);
    assert(!('defenseHold' in c.sample(duration)));
    c.release('action', duration);
    assert.equal(c.sample(duration).action, false);
  }
});
test('held/repeated ACTION never retriggers, redirects, or synthesizes a release action', () => {
  const c = createFootballControls(), g = fixture();
  c.enter('key', 'juke', 0, g); assert(c.sample(0).action);
  for (let t = 10; t < 2000; t += 10) {
    c.enter('key', 'juke', t, g);
    const input = c.sample(t);
    assert.equal(input.action, false); assert.equal(input.defenseDirection, 0);
  }
  c.release('key', 2000); assert.equal(c.sample(2000).action, false);
  c.enter('key', 'juke', 2010, g); assert(c.sample(2010).action);
});
test('two-finger arrow ownership is independent of ACTION and ends immediately on release', () => {
  const c = createFootballControls(), g = fixture();
  for (let cycle = 0; cycle < 30; cycle++) {
    const t = cycle * 1000;
    c.enter('action', 'juke', t, g); assert(c.sample(t).action);
    c.enter('up', 'up', t + 10, g); assert.equal(c.sample(t + 10).defenseDirection, -1);
    c.enter('down', 'down', t + 20, g); assert.equal(c.sample(t + 20).defenseDirection, 1);
    c.release('down', t + 30); assert.equal(c.sample(t + 30).defenseDirection, -1);
    c.release('up', t + 40);
    const held = c.sample(t + 200);
    assert.equal(held.defenseDirection, 0); assert.equal(held.action, false);
    c.release('action', t + 400); assert.equal(c.sample(t + 400).action, false);
  }
});
test('cancellation, blur/clear, and captured-finger sliding leave no stuck strafe', () => {
  for (const end of ['cancel', 'clear', 'slide']) {
    const c = createFootballControls(), g = fixture();
    c.enter('finger', 'up', 0, g); assert.equal(c.sample(1).defenseDirection, -1);
    if (end === 'slide') {
      c.enter('finger', 'juke', 20, g); assert(c.sample(20).action);
      assert.equal(c.sample(21).defenseDirection, 0);
    } else if (end === 'clear') c.clear();
    c.release('finger', 40, end === 'cancel');
    const input = c.sample(50);
    assert.equal(input.defenseDirection, 0); assert.equal(input.direction, 0); assert.equal(input.action, false);
  }
});
test('accessible directional clicks remain finite and kickoff/turnover ACTION stays immediate', () => {
  const c = createFootballControls(), g = fixture();
  c.tapDirection(1, 0); assert.equal(c.sample(0).defenseDirection, 1);
  assert.equal(c.sample(160).defenseDirection, 0);
  g.live!.mode = 'return'; g.live!.offense = 'home';
  c.enter('return-action', 'juke', 200, g); assert(c.sample(200).action);
  assert.equal(c.sample(600).action, false);
});
