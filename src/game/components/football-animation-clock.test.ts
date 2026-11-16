import test from 'node:test';
import assert from 'node:assert/strict';
import { footballStridePeriod, updateFootballAnimation } from './football-animation-clock';
import { createKickAttempt, stepKickAttempt } from '../lib/kick-return-engine';
import { interpolateKickAttempt } from '../lib/kick-return-presentation';
import { drawKickReturn } from './kick-return-renderer';
import { refineFootballHelmetWidth } from './football-player-frames';

function sample(now: number, x: number, y = 0, vx = 20, vy = 0, facing: 1 | -1 = 1) {
  return { now, x, y, vx, vy, facing };
}

test('Classic retains its stride clock across immutable simulation and interpolated render snapshots', () => {
  const canvas = { width: 320, height: 192 };
  const target = { canvas, fillStyle: '', imageSmoothingEnabled: false, fillRect() {} };
  const ctx = new Proxy(target, { get: (t, k) => Reflect.has(t, k) ? Reflect.get(t, k) : () => undefined }) as unknown as CanvasRenderingContext2D;
  let attempt = createKickAttempt(86, 1);
  attempt.phase = 'returning'; attempt.time = 2; attempt.player = { x: 300, y: 96 };
  for (let frame = 0; frame < 45; frame++) {
    const previous = attempt;
    attempt = stepKickAttempt(attempt, 0, 1 / 60);
    drawKickReturn(ctx, interpolateKickAttempt(previous, attempt, .5), 0, false, { width: 320, height: 192 });
  }
  const cadence = updateFootballAnimation(canvas, 'carrier', {
    now: Math.max(attempt.time, 1.4 + attempt.returnTime), x: attempt.player.x, y: attempt.player.y,
    vx: 0, vy: 0, facing: 1,
  });
  assert(cadence.moving, 'new render snapshots cannot reset the player to a stationary first frame');
  assert(cadence.phase > .05, 'the renderer actually advanced the stable canvas-owned stride clock');
});

test('integrated cadence keeps the four-pose cycle between .56 and .68 seconds', () => {
  assert(Math.abs(footballStridePeriod(18) - (.68 - .12 * (15.5 / 57.5))) < 1e-12);
  assert(Math.abs(footballStridePeriod(60) - .56) < 1e-12);
  assert(Math.abs(footballStridePeriod(2) - .68) < 1e-12);
  assert(footballStridePeriod(8) > footballStridePeriod(18));
  assert(footballStridePeriod(90) >= .56);

  const owner = {};
  let frame = updateFootballAnimation(owner, 'athlete', sample(0, 0));
  assert.equal(frame.phase, 0);
  for (let n = 1; n <= 6; n++)
    frame = updateFootballAnimation(owner, 'athlete', sample(n / 10, n * 2));
  assert(frame.phase > .7 && frame.phase < 1,
    `expected a stable phase near the end of the 0.6s stride cycle, got ${frame.phase}`);
  assert(Math.floor(frame.phase * 4) >= 1, 'the four authored running poses are traversed');
});

test('velocity changes integrate smoothly and repeated renders at one clock are idempotent', () => {
  const owner = {};
  let frame = updateFootballAnimation(owner, 'carrier', sample(0, 0));
  const observations = [
    sample(.05, 1), sample(.10, 2), sample(.15, 2.6), sample(.20, 3.6),
    sample(.25, 4.4), sample(.30, 5.4), sample(.35, 6.1), sample(.40, 7.1),
  ];
  const phases: number[] = [];
  for (const next of observations) {
    frame = updateFootballAnimation(owner, 'carrier', next);
    phases.push(frame.phase);
  }
  const repeated = updateFootballAnimation(owner, 'carrier', observations.at(-1)!);
  assert.deepEqual(repeated, frame);
  assert.deepEqual(phases, [...phases].sort((a, b) => a - b), 'phase never jumps backward during speed changes');
  assert(phases.at(-1)! > phases[0]!);
});

test('stationary athletes plant, direction changes preserve cadence, and rewinds reset safely', () => {
  const owner = {};
  updateFootballAnimation(owner, 12, sample(0, 0));
  let frame = updateFootballAnimation(owner, 12, sample(.08, 1.6));
  const phaseBeforeTurn = frame.phase;
  frame = updateFootballAnimation(owner, 12, sample(.16, 3.2, 0, -20, 0, -1));
  assert(frame.phase >= phaseBeforeTurn, 'a turn changes facing, not stride phase');
  assert.equal(frame.facing, 1, 'facing uses a short direction hysteresis');

  for (let n = 1; n <= 4; n++)
    frame = updateFootballAnimation(owner, 12, sample(.16 + n * .05, 3.2));
  assert.equal(frame.moving, false, 'no displacement settles into a planted pose');
  const plantedPhase = frame.phase;
  frame = updateFootballAnimation(owner, 12, sample(.5, 3.2));
  assert.equal(frame.phase, plantedPhase, 'planted phase does not drift');

  frame = updateFootballAnimation(owner, 12, sample(.1, 0));
  assert.equal(frame.phase, 0, 'clock rewind begins a fresh render-only cycle');
  assert.equal(frame.moving, false);
});

test('helmet refinement trims one native contour pixel and leaves markings, mask, and body intact', () => {
  const pixels = Array.from({ length: 16 }, () => Array<string>(32).fill('.'));
  pixels[2]!.splice(8, 12, ...'KMMMMMMMMMMK');
  pixels[3]!.splice(8, 12, ...'KMMMMMMMMMMK');
  pixels[4]!.splice(8, 12, ...'KMMTMMMMMMMK');
  pixels[5]!.splice(8, 12, ...'KKFFFFKK....'.split(''));
  for (let y = 8; y < 16; y++) pixels[y]!.fill(y % 2 ? 'J' : 'W');
  const bodyBefore = pixels.slice(8).map(row => [...row]);

  refineFootballHelmetWidth(pixels);

  assert.deepEqual(pixels.slice(8), bodyBefore, 'torso and legs remain byte-for-byte unchanged');
  assert.equal(pixels[2]!.filter(glyph => glyph === 'M').length, 10, 'helmet shading remains');
  assert.equal(pixels[4]!.filter(glyph => glyph === 'T').length, 1, 'helmet stripe remains');
  assert.equal(pixels[5]!.filter(glyph => glyph === 'F').length, 4, 'facemask pixels remain');
  assert.equal(pixels[2]!.filter(glyph => glyph === 'K').length, 1, 'shell width loses one pixel');
  assert.equal(pixels[3]!.filter(glyph => glyph === 'K').length, 1, 'alternating trim keeps the shell centered');
});

test('faster travel stays on the same deliberate four-pose cadence without frame twitching', () => {
  const owner = {};
  let phase = updateFootballAnimation(owner, 'runner', sample(0, 0)).phase;
  let prior = phase;
  for (let n = 1; n <= 60; n++) {
    phase = updateFootballAnimation(owner, 'runner', sample(n / 60, n * 1.1)).phase;
    const delta = (phase - prior + 1) % 1;
    assert(delta > 0, 'a moving runner advances through the stride');
    assert(delta < .055, `one display frame cannot jump across poses (${delta})`);
    prior = phase;
  }
  assert(phase > .35, 'the deliberate four-pose stride continues at faster travel speeds');
});

