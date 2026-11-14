import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField } from './field';
import { fieldGoalDistance } from './playbook';
import { fieldGoalSequence, stepSpecialTeams } from './special-teams';
import { drawFootball } from '../../components/football-renderer';
import { fieldGoalFrame, fieldGoalSample, fieldGoalVerdictVisible, GOAL_VIEW, projectFieldGoal } from '../../components/football-field-goal';

function kick(accuracy: number, spot = 80) {
  const g = createFootball(1986);
  g.spot = spot; g.phase = 'live'; g.live = startField(g, 'field-goal', 'run');
  g.live.kickAccuracy = accuracy; g.special = fieldGoalSequence(g);
  g.special.blockChecked = true; // Isolate the flight; existing block tests cover blocked attempts.
  return g;
}
test('field-goal accuracy outcomes and RNG remain identical across the original timing window', () => {
  for (const spot of [40, 60, 80, 98]) for (let i = 0; i <= 500; i++) {
    const accuracy = i / 500, g = kick(accuracy, spot), distance = fieldGoalDistance(g);
    const window = Math.max(.025, Math.min(.26, .26 - Math.max(0, distance - 20) /
      Math.max(1, g.profiles[g.possession].kickMax - 20) * .235));
    assert.equal(g.special!.good, Math.abs(accuracy - .5) <= window);
    const rng = g.rng, before = JSON.stringify(g);
    projectFieldGoal({ y: g.special!.toY, z: 23, depth: 1 }, fieldGoalFrame(131, 192));
    assert.equal(g.rng, rng); assert.equal(JSON.stringify(g), before);
  }
});
test('every good full football clears the opening, every modeled wide miss visibly misses, in both directions and orientations', () => {
  for (const [width, height] of [[106, 192], [131, 192], [390, 320], [691, 392], [844, 192]])
    for (const direction of [1, -1]) for (const spot of [50, 80, 98]) for (let i = 0; i <= 100; i++) {
      const g = kick(i / 100, spot), s = g.special!, f = fieldGoalFrame(width!, height!);
      s.stage = 'resolved'; s.stageAge = 0;
      s.ball = { x: s.toX, y: s.toY, z: 23 };
      if (direction === -1) { s.fromX = 1200 - s.fromX; s.toX = 1200 - s.toX; s.ball.x = 1200 - s.ball.x; }
      const sample = fieldGoalSample(s), p = projectFieldGoal(sample, f);
      assert.equal(sample.depth, 1, 'ball reaches the actual goalpost plane');
      if (s.good) {
        assert(p.x - 4 > f.center - f.half + 2, 'whole ball clears left upright');
        assert(p.x + 4 < f.center + f.half, 'whole ball clears right upright');
        assert(p.y + 4 < f.ground - GOAL_VIEW.crossbar, 'whole ball above crossbar');
        assert(p.y - 4 > f.ground - GOAL_VIEW.top, 'within the visible upright height');
      } else {
        assert(s.toY < 96 ? p.x + 4 < f.center - f.half : p.x - 4 > f.center + f.half + 2,
          'miss direction follows the actual kick aim, never a post-result visual nudge');
      }
    }
});
test('real kicks reach and continue beyond the plane before their verdict, without changing engine transition timing', () => {
  for (const accuracy of [0, .5, 1]) {
    const g = kick(accuracy), s = g.special!;
    let count = 0;
    while (s.stage !== 'resolved' && count++ < 300) {
      assert.equal(fieldGoalVerdictVisible(s), false, 'no premature result during approach or flight');
      const before = JSON.stringify(s.ball);
      fieldGoalSample(s); assert.equal(JSON.stringify(s.ball), before);
      assert.equal(stepSpecialTeams(g, {}, 1 / 60), undefined);
    }
    assert.equal(s.stage, 'resolved'); assert.equal(s.ball.x, s.toX);
    assert.equal(fieldGoalSample(s).depth, 1); assert.equal(fieldGoalVerdictVisible(s), false);
    assert.equal(stepSpecialTeams(g, {}, .2), undefined);
    assert(fieldGoalSample(s).depth > 1); assert.equal(fieldGoalVerdictVisible(s), false);
    assert.equal(stepSpecialTeams(g, {}, .07), undefined);
    assert.equal(fieldGoalVerdictVisible(s), true);
    assert.equal(stepSpecialTeams(g, {}, .17), undefined);
    assert.equal(stepSpecialTeams(g, {}, .02)?.kind, s.good ? 'good' : 'miss');
  }
});
test('field-goal rendering is read-only and withholds GOOD/NO GOOD until after the visible crossing', () => {
  for (const accuracy of [0, .5, 1]) {
    const g = kick(accuracy), s = g.special!, labels: string[] = [];
    const ctx = new Proxy({ fillText(text: string) { labels.push(text); } },
      { get: (t, k) => Reflect.has(t, k) ? Reflect.get(t, k) : () => {} }) as unknown as CanvasRenderingContext2D;
    for (const age of [0, .1, .25, .27, .4]) {
      s.stage = 'resolved'; s.stageAge = age; s.ball = { x: s.toX, y: s.toY, z: 23 };
      const before = JSON.stringify(g); labels.length = 0;
      drawFootball(ctx, g, { width: 131, height: 192 }, age);
      assert.equal(JSON.stringify(g), before);
      assert.deepEqual(labels, age < .26 ? [] : [s.good ? 'GOOD' : 'NO GOOD']);
    }
  }
});
test('original kick follow-through and blocking animation window remain visible before the goal-view cut', () => {
  const g = kick(.5), s = g.special!;
  s.stage = 'flight'; s.ball = { x: s.fromX, y: s.fromY, z: 0 };
  const colors: string[] = [];
  const ctx = new Proxy({ fillStyle: '', fillRect() { colors.push(this.fillStyle); } },
    { get: (t, k) => Reflect.has(t, k) ? Reflect.get(t, k) : () => {} }) as unknown as CanvasRenderingContext2D;
  for (const age of [0, .1, .219, .22, .3]) {
    s.stageAge = age; colors.length = 0;
    drawFootball(ctx, g, { width: 131, height: 192 }, age);
    assert.equal(colors[0], age < .22 ? '#277a37' : '#081633');
  }
});
