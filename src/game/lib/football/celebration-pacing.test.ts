import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFootball, advanceFootballPresentation, createFootball, stepFootball } from './engine';
import { beginPlayResult, resultVisible, RESULT_SECONDS } from './play-result';
import { FIELD_GOAL_FLIGHT_SCALE, TD_DIM_SECONDS, TD_SECONDS } from './celebration-timing';
import { fieldGoalSequence } from './special-teams';
import { startField } from './field';
import { touchdownArt } from '../../components/football-touchdown-art';
import { TACKLE_TIMING } from './tackle-scene';
import { isFootballGame } from './storage';

test('touchdown uses .4 seconds dim plus two bright seconds without advancing either clock or duplicating points', () => {
  const g = createFootball(86);
  g.phase = 'play-dead'; g.nextPhase = 'play-call'; g.clock = 45; g.score.home = 7;
  g.playClockRunning = false;
  beginPlayResult(g, 'TOUCHDOWN — HOME +7');
  const clock = g.clock, playClock = g.playClock;
  assert.equal(g.playResult!.remaining, TD_SECONDS);
  assert(isFootballGame(JSON.parse(JSON.stringify(g))), 'new touchdown countdown remains save-compatible');
  assert(resultVisible(g));
  advanceFootball(g); assert(g.playResult, 'ACTION cannot skip the sign');
  advanceFootballPresentation(g, TD_DIM_SECONDS - .001);
  assert.equal(touchdownArt(TD_SECONDS - g.playResult!.remaining), touchdownArt(0));
  advanceFootballPresentation(g, .002);
  assert.equal(touchdownArt(TD_SECONDS - g.playResult!.remaining), touchdownArt(1));
  advanceFootballPresentation(g, 1.99);
  assert(g.playResult, 'bright display remains through nearly two seconds');
  assert.equal(g.clock, clock); assert.equal(g.playClock, playClock); assert.equal(g.score.home, 7);
  advanceFootballPresentation(g, .02);
  assert.equal(g.playResult, undefined); assert.equal(g.score.home, 7);
  beginPlayResult(g, 'GAIN OF 4 YARDS');
  assert.equal(g.playResult!.remaining, RESULT_SECONDS, 'other result durations stay unchanged');
  g.playResult!.remaining = TD_SECONDS;
  assert.equal(isFootballGame(g), false, 'ordinary result validation remains strict');
});

test('touchdown hold starts after an existing tackle and its ordinary downed-player pause', () => {
  const g = createFootball(86);
  g.phase = 'play-dead'; g.nextPhase = 'play-call';
  beginPlayResult(g, 'TOUCHDOWN!');
  // A historical saved scene may still contain a completed tackle presentation.
  g.tackleScene = { phase: 'ground', elapsed: 0, holdRemaining: TACKLE_TIMING.groundHold } as NonNullable<typeof g.tackleScene>;
  assert.equal(resultVisible(g), false);
  advanceFootballPresentation(g, TACKLE_TIMING.groundHold);
  assert.equal(g.tackleScene, undefined);
  assert.equal(g.playResult!.remaining, TD_SECONDS);
  assert(resultVisible(g));
  advanceFootballPresentation(g, TD_SECONDS - .01); assert(g.playResult);
  advanceFootballPresentation(g, .02); assert.equal(g.playResult, undefined);
});

test('field-goal flight is 20 percent longer but charges the original flight time to the game clock', () => {
  for (const side of ['home', 'away'] as const) {
    const g = createFootball(86);
    g.spot = 82; g.possession = side; g.phase = 'live'; g.clock = 100;
    g.live = startField(g, 'field-goal', 'run'); g.live.kickAccuracy = .5;
    g.special = fieldGoalSequence(g); const s = g.special;
    s.blockChecked = true; s.stage = 'flight';
    let frames = 0;
    while (s.stage === 'flight' && frames++ < 300) stepFootball(g, {}, 1 / 60);
    assert.equal(s.stage, 'resolved');
    const wall = (frames - 1) / 60;
    assert(Math.abs(wall - s.duration * FIELD_GOAL_FLIGHT_SCALE) < 1 / 30);
    assert(Math.abs((100 - g.clock) - s.duration) < 1 / 60);
    assert.equal(g.score[side], 0, 'verdict and points wait for visible crossing');
    while (g.special === s && frames++ < 400) stepFootball(g, {}, 1 / 60);
    assert.equal(g.score[side], 3);
  }
});
