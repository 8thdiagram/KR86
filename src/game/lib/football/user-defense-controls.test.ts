import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField } from './field';
import { createFootballControls } from './controls';
import { DEFENSE_HOLD_MS } from './user-defense';

function fixture() {
  const g = createFootball(86);
  g.phase = 'live'; g.possession = 'away'; g.live = startField(g, 'post', 'pass');
  return g;
}
test('defensive tap is responsive on release, never fires on initial press or repeats', () => {
  for (const duration of [1, 60, 130, 199]) {
    const c = createFootballControls(), g = fixture();
    c.enter('action', 'juke', 0, g);
    assert.equal(c.sample(0).action, false);
    c.release('action', duration);
    assert.equal(c.sample(duration).action, true);
    assert.equal(c.sample(duration + 1).action, false);
    assert.equal(c.sample(duration + 1).defenseHold, false);
  }
});
test('200 ms sustained ACTION starts pursuit without an initial dive or release tap', () => {
  const c = createFootballControls(), g = fixture();
  assert.equal(DEFENSE_HOLD_MS, 200);
  c.enter('action', 'juke', 100, g);
  assert.equal(c.sample(299).defenseHold, false);
  assert.equal(c.sample(300).defenseHold, true);
  for (let time = 300; time < 900; time += 16) assert.equal(c.sample(time).action, false);
  c.release('action', 900);
  assert.equal(c.sample(900).action, false);
  assert.equal(c.sample(900).defenseHold, false);
});
test('a hold released between frames, cancellation, sliding away and clear never become taps', () => {
  for (const kind of ['late', 'cancel', 'slide', 'clear']) {
    const c = createFootballControls(), g = fixture();
    c.enter('pointer:1', 'juke', 0, g);
    if (kind === 'slide') c.enter('pointer:1', 'up', 250, g);
    if (kind === 'clear') c.clear();
    c.release('pointer:1', 250, kind === 'cancel');
    assert.equal(c.sample(250).action, false, kind);
    assert.equal(c.sample(250).defenseHold, false, kind);
  }
});
test('two-finger arrows work with and without ACTION and release immediately restores AI intentions', () => {
  const c = createFootballControls(), g = fixture();
  c.enter('up', 'up', 0, g);
  assert.equal(c.sample(1).defenseDirection, -1);
  c.enter('action', 'juke', 20, g);
  assert.equal(c.sample(225).defenseHold, true);
  assert.equal(c.sample(225).defenseDirection, -1);
  c.release('up', 230);
  assert.equal(c.sample(230).defenseDirection, 0, 'no legacy steering-tap latch after a real release');
  assert.equal(c.sample(230).defenseHold, true);
  c.enter('down', 'down', 240, g);
  c.release('action', 250);
  assert.equal(c.sample(250).defenseDirection, 1);
  assert.equal(c.sample(250).action, false);
  c.release('down', 260);
  assert.equal(c.sample(260).defenseDirection, 0);
});
test('accessible directional clicks have a finite pulse; other phases retain their existing controls', () => {
  const c = createFootballControls(), g = fixture();
  c.tapDirection(1, 0);
  assert.equal(c.sample(0).defenseDirection, 1);
  assert.equal(c.sample(160).defenseDirection, 0);
  g.live!.mode = 'return'; g.live!.offense = 'home';
  c.enter('return-action', 'juke', 200, g);
  assert.equal(c.sample(200).action, true, 'return defense keeps its original press action');
  assert.equal(c.sample(500).defenseHold, false);
});
test('sliding a captured arrow finger onto ACTION does not leave an orphaned steering press', () => {
  const c = createFootballControls(), g = fixture();
  c.enter('finger', 'up', 0, g);
  c.enter('finger', 'juke', 10, g);
  assert.equal(c.sample(220).defenseHold, true);
  assert.equal(c.sample(220).direction, 0);
  assert.equal(c.sample(220).defenseDirection, 0);
  c.release('finger', 250);
  assert.equal(c.sample(250).direction, 0);
  assert.equal(c.sample(250).action, false);
});
