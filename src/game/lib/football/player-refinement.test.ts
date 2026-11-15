import test from 'node:test';
import assert from 'node:assert/strict';
import { createKickAttempt } from '../kick-return-engine';
import { stepKickMoves } from '../kick-return-moves';
import { stepOpenFieldCoverage } from '../kick-open-field';
import { PLAYER_MOVEMENT_SCALE, playerSpeed } from '../player-pace';
import { createFootball, chooseOffense, snapFootball, stepFootball } from './engine';
import { captureFootballRender, withFootballRenderInterpolation } from './render-interpolation';

test('locomotion gains exactly ten percent without flattening ratings or move versions', () => {
  assert.equal(PLAYER_MOVEMENT_SCALE, 1.1);
  for (const difficulty of ['normal', 'hard'] as const) for (const version of [undefined, 1, 2] as const) {
    const a = createKickAttempt(86, 1);
    a.difficulty = difficulty; a.phase = 'returning'; a.player = { x: 500, y: 96 };
    a.kickoffBoost = 1.08;
    a.moves = version === undefined ? undefined : { ...a.moves!, version, active: undefined, backward: false };
    const before = JSON.stringify(a), next = stepKickMoves(a, 1, 1 / 60, {});
    assert(Math.abs((next.player.x - 500) * 60 - (difficulty === 'hard' ? 73 : 57) * 1.08 * 1.1) < 1e-8);
    assert(Math.abs((next.player.y - 96) * 60 - (difficulty === 'hard' ? 86 : 78) * 1.1) < 1e-8);
    assert.equal(JSON.stringify(a), before, 'no save-schema or rating mutation');
  }
  assert.equal(playerSpeed(80) / playerSpeed(40), 2);
});

test('both fast and slow coverage defenders receive one proportional boost, never a double boost', () => {
  for (const rated of [40, 60]) {
    const a = createKickAttempt(86, 1);
    a.player = { x: 200, y: 96 }; a.defenders = [];
    let d = { ...createKickAttempt(86, 1).defenders[0]!, id: 1, x: 1000, y: 96,
      minY: 24, maxY: 168, speed: rated, lateralSpeed: rated, active: true, motion: undefined };
    for (let frame = 0; frame < 60; frame++) d = stepOpenFieldCoverage(a, d, 1 / 60) as typeof d;
    assert(Math.abs(Math.abs(d.motion!.vx) / rated - 1.1) < 1e-8);
    assert.equal(d.speed, rated, 'the stored rating is unchanged');
  }
});

function match() {
  const g = createFootball(86); g.phase = 'play-call';
  chooseOffense(g, 'post'); snapFootball(g);
  return g;
}
test('increased running pace does not accelerate game time, pass reads or pressure clocks', () => {
  const g = match(), clock = g.clock, time = g.live!.time;
  for (let i = 0; i < 10; i++) stepFootball(g, {}, 1 / 60);
  assert(Math.abs(g.live!.time - time - 10 / 60) < 1e-8);
  assert(Math.abs(clock - g.clock - 10 / 60) < 1e-8);
});

test('fractional rendering preserves actor identities and restores all authoritative state', () => {
  const g = match(), actor = g.live!.athletes[3]!, before = captureFootballRender(g), x = actor.x;
  actor.x += 4; g.live!.time += .02;
  const authoritative = JSON.stringify(g), identity = g.live;
  withFootballRenderInterpolation(g, before, .25, () => {
    assert.equal(g.live, identity); assert.equal(g.live!.athletes[3], actor);
    assert.equal(actor.x, x + 1);
  });
  assert.equal(JSON.stringify(g), authoritative);
  assert.throws(() => withFootballRenderInterpolation(g, before, .5, () => { throw Error('paint failure'); }));
  assert.equal(JSON.stringify(g), authoritative, 'restoration also runs after a rendering error');
});

test('new actions and tackle contact are never interpolated across incompatible poses', () => {
  const g = match(), before = captureFootballRender(g), actor = g.live!.athletes[3]!;
  actor.x += 4; g.live!.mode = 'scramble';
  const expected = actor.x;
  withFootballRenderInterpolation(g, before, 0, () => assert.equal(actor.x, expected));
});
