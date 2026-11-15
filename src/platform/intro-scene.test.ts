import test from 'node:test';
import assert from 'node:assert/strict';
import { INTRO, introPose } from '../../scripts/lib/intro-scene.ts';
import { renderIntroFrame } from '../../scripts/lib/intro-art.ts';
import { C } from '../../scripts/lib/intro-pixels.ts';

test('kick descends into the receiving hands before the football is secured', () => {
  for (let f = 0; f < 36; f++) {
    const p = introPose(f);
    assert.equal(p.held, false);
    assert.equal(p.arms, 'reach');
    assert(introPose(f + 1).ballY >= p.ballY);
  }
  const catchPose = introPose(36);
  assert.equal(catchPose.phase, 'catch');
  assert.equal(catchPose.arms, 'reach');
  assert.equal(catchPose.ballX, catchPose.runnerX + 26);
  assert.equal(catchPose.ballY, catchPose.runnerY - 8);
  assert(catchPose.held);
});

test('catch gathers in place before acceleration and keeps the football continuously', () => {
  for (let f = 36; f < INTRO.frames; f++) {
    const p = introPose(f), previous = introPose(f - 1);
    assert(p.held);
    assert(Math.hypot(p.ballX - previous.ballX, p.ballY - previous.ballY) <= 5, `ball jump at ${f}`);
    if (f < 44) assert.equal(p.runnerX, 76, 'gather before taking off');
    else {
      assert.equal(p.ballX, p.runnerX + 13);
      assert.equal(p.ballY, p.runnerY - 1);
    }
  }
  assert(introPose(72).runnerX - introPose(58).runnerX > introPose(58).runnerX - introPose(44).runnerX);
});

test('planted cut changes lanes and leaves the committed defender behind', () => {
  const plant = introPose(72), escape = introPose(91);
  assert.equal(plant.arms, 'cut');
  assert(plant.defenderX > plant.runnerX);
  assert(escape.runnerY < plant.runnerY);
  assert(escape.runnerX > escape.defenderX);
  assert(escape.defenderY > escape.runnerY);
});

test('authored frames use only the small pixel palette and resolve to a stable menu poster', () => {
  const palette = new Set(Object.values(C).map(hex => parseInt(hex.slice(1), 16)));
  assert(palette.size <= 32);
  for (const f of [0, 35, 36, 40, 70, 85, 108]) {
    const pixels = renderIntroFrame(f);
    assert.equal(pixels.length, INTRO.width * INTRO.height * 3);
    for (let i = 0; i < pixels.length; i += 3) {
      assert(palette.has((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!));
    }
  }
  assert.equal(introPose(108).title, 1);
  assert.equal(introPose(108).arms, 'still');
  assert.deepEqual(renderIntroFrame(108), renderIntroFrame(137), 'no skating during the final held title');
});
