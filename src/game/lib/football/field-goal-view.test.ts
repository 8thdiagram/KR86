import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, stepFootball } from './engine';
import { startField } from './field';
import { fieldGoalDistance } from './playbook';
import { fieldGoalSequence, stepSpecialTeams } from './special-teams';
import { fieldGoalHeight, fieldGoalMeterAccuracy, fieldGoalMeterSpeed, fieldGoalWindow, FIELD_GOAL, kickGeometry } from './field-goal-geometry';
import { drawFootball } from '../../components/football-renderer';
import { fieldGoalFrame, fieldGoalSample, fieldGoalVerdictVisible, projectFieldGoal } from '../../components/football-field-goal';
import { kickMatchupTeams } from '../kick-return-teams';
import { isFootballGame } from './storage';
import { FIELD_GOAL_FLIGHT_SCALE } from './celebration-timing';
import { FIELD_GOAL_PADDING_COLORS } from '../../components/football-field-goal-padding';
import { effectiveKickControl } from './franchise-upgrades';

function kick(accuracy: number | undefined = undefined, distance = 35, hash = 96, side: 'home' | 'away' = 'home') {
  const g = createFootball(1986);
  g.spot = 117 - distance; g.possession = side; g.phase = 'live';
  // Isolate the original geometry at an EFFECTIVE 55-yard range. K power
  // and accuracy bonuses have their own explicit legendary regression tests.
  g.profiles[side].kickMax = 55 / 1.1;
  g.live = startField(g, 'field-goal', 'run');
  g.live.athletes[6]!.y = hash;
  g.live.kickAccuracy = accuracy; g.special = fieldGoalSequence(g);
  g.special.blockChecked = true; // Existing block tests exercise blocked attempts.
  return g;
}
function context() {
  const labels: { text: string; x: number; y: number }[] = [];
  const rects: { color: string; x: number; y: number; w: number; h: number }[] = [];
  const target = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ color: this.fillStyle, x, y, w, h });
    },
    fillText(text: string, x: number, y: number) { labels.push({ text, x, y }); },
  };
  const ctx = new Proxy(target, { get: (t, k) => Reflect.has(t, k) ? Reflect.get(t, k) : () => {} }) as unknown as CanvasRenderingContext2D;
  return { ctx, labels, rects };
}
test('legal CPU timing thresholds and RNG are identical to the original distance/rating lottery', () => {
  for (const distance of [20, 35, 49, 55]) for (const max of [49, 52, 55]) {
    if (distance > max) continue;
    for (let i = 0; i <= 500; i++) {
      const g = kick(undefined, distance, 96, 'away'); g.profiles.away.kickMax = max;
      g.live!.kickAccuracy = i / 500; const rng = g.rng;
      g.special = fieldGoalSequence(g);
      assert.equal(g.special.good, Math.abs(i / 500 - .5) <= fieldGoalWindow(g));
      assert.equal(g.rng, rng);
    }
  }
});
test('ordinary plays retain the dead-ball lane for a subsequent field goal and existing saves remain compatible', () => {
  const g = createFootball(1986);
  g.phase = 'live'; g.spot = 80; g.live = startField(g, 'power', 'run');
  g.live.mode = 'run'; g.live.carrier = 6; g.live.time = 1;
  const carrier = g.live.athletes[6]!;
  carrier.x = 900; carrier.y = 168;
  g.live.movement.player = { x: carrier.x, y: carrier.y };
  for (const defender of g.live.athletes.filter(a => a.side === 'defense')) defender.x = 1100;
  stepFootball(g, {}, 1 / 60);
  assert.equal(g.fieldGoalSpotY, 168);
  const restored = JSON.parse(JSON.stringify(g));
  assert(isFootballGame(restored));
  restored.live = startField(restored, 'field-goal', 'run');
  assert.equal(fieldGoalSequence(restored).fromY, 168, 'new formation must not reset the retained kick origin');
  const old = createFootball(86);
  assert(isFootballGame(old));
  old.live = startField(old, 'field-goal', 'run');
  assert.equal(fieldGoalSequence(old).fromY, 96, 'older saves still use the original center when no lane was recorded');
});
test('20 through 60 yard posts and timing windows shrink continuously at every viewport', () => {
  for (const [width, height] of [[131, 192], [393, 500], [852, 270]]) {
    const widths: number[] = [], windows: number[] = [];
    for (const distance of [20, 25, 30, 35, 40, 45, 50, 55, 60]) {
      const g = kick(undefined, distance), s = g.special!, f = fieldGoalFrame(width!, height!, s);
      const left = projectFieldGoal({ y: 76, z: 10, depth: 1 }, f);
      const right = projectFieldGoal({ y: 116, z: 10, depth: 1 }, f);
      const geo = kickGeometry(s.fromX, s.fromY);
      widths.push(right.x - left.x); windows.push(geo.half * 2);
      assert(Math.abs(right.x - left.x - f.focal * FIELD_GOAL.sensor * geo.half * 2) < 1e-9);
      assert(left.y > 42 / f.scale, 'crossbar clears the real landscape HUD');
      const top = projectFieldGoal({ y: 76, z: FIELD_GOAL.top, depth: 1 }, f);
      assert(top.y > 45 / f.scale, 'entire upright clears the HUD');
      assert.equal(geo.range, Math.abs(s.toX - s.fromX), 'use real launch point, not announced distance plus snap/end zone again');
    }
    for (let i = 1; i < widths.length; i++) {
      assert(widths[i - 1]! > widths[i]!);
      assert(windows[i - 1]! > windows[i]!);
    }
    assert(widths[0]! / widths.at(-1)! > 2.5);
    assert(windows[0]! > .38, '20-yard opening spans a generous portion of the stable aiming track');
    assert(windows.at(-1)! < .2, '60-yard opening spans less than a fifth');
  }
});
test('human meter speed progresses smoothly and remains controllable without changing CPU lottery', () => {
  assert.equal(fieldGoalMeterSpeed(20), .65);
  assert.equal(fieldGoalMeterSpeed(60), 1.35);
  for (let distance = 20; distance < 60; distance++) {
    assert(Math.abs(fieldGoalMeterSpeed(distance + 1) - fieldGoalMeterSpeed(distance) - .0175) < 1e-10);
  }
});
test('close camera follows the real high arc without hiding the ball or changing horizontal aim', () => {
  for (const distance of [20, 25, 30, 35, 40, 45, 50, 55, 60]) {
    for (const [width, height] of [[393, 500], [852, 270]]) {
      const g = kick(.5, distance), s = g.special!;
      const aim = fieldGoalFrame(width!, height!, s);
      for (let step = 0; step <= 100; step++) {
        const t = step / 100;
        s.stage = 'flight'; s.ball = { x: s.fromX + (s.toX - s.fromX) * t,
          y: s.fromY + (s.toY - s.fromY) * t, z: fieldGoalHeight(g, t) };
        const frame = fieldGoalFrame(width!, height!, s);
        const p = projectFieldGoal(fieldGoalSample(s), frame);
        assert(p.y * frame.scale >= 49, 'ball clears the scoreboard throughout the real arc');
        assert(p.y < 192, 'ball remains above the screen bottom');
        assert.equal(frame.focal, aim.focal, 'no zoom or horizontal aim change during flight');
      }
    }
  }
});
test('crowd seats remain anchored to the field through camera follow instead of generating extra fans', () => {
  for (const [width, height] of [[393, 500], [852, 270]]) {
    const g = kick(.5, 20), s = g.special!;
    const base = fieldGoalFrame(width!, height!, s);
    const initial = context(); drawFootball(initial.ctx, g, { width, height }, 0);
    const seats = (rects: typeof initial.rects) => rects.filter(r => r.color === '#10131b' && r.w === 4 && r.h === 3 &&
      r.y >= 37 && r.y < base.stadiumHorizon);
    const initialSeats = seats(initial.rects);
    assert(initialSeats.length > 0);
    let followed = false;
    for (const t of [.15, .35, .55, .75, 1]) {
      s.stage = 'flight'; s.ball = { x: s.fromX + (s.toX - s.fromX) * t, y: s.toY, z: fieldGoalHeight(g, t) };
      const f = fieldGoalFrame(width!, height!, s);
      const drawing = context(), moves: number[][] = [];
      drawing.ctx.translate = (x, y) => { moves.push([x, y]); };
      const before = JSON.stringify(g);
      drawFootball(drawing.ctx, g, { width, height }, 0);
      assert.deepEqual(seats(drawing.rects), initialSeats, 'the exact same fans occupy the same seats');
      assert.deepEqual(moves[0], [0, f.cameraLift], 'stadium moves in world space by precisely the field camera offset');
      assert.equal(f.stadiumHorizon, base.stadiumHorizon);
      const goal = projectFieldGoal({ y: 96, z: 0, depth: 1 }, f);
      const initialGoal = projectFieldGoal({ y: 96, z: 0, depth: 1 }, base);
      assert(Math.abs(goal.y - initialGoal.y - f.cameraLift) < 1e-8);
      assert.equal(JSON.stringify(g), before);
      if (f.cameraLift > 0) followed = true;
    }
    assert(followed, 'test includes a high kick that actually activates camera follow');
  }
});
test('projected perimeter padding appears below the seating bowl without altering kick state', () => {
  for (const distance of [20, 35, 55]) for (const [width, height] of [[393, 500], [852, 270]]) {
    const g = kick(undefined, distance), before = JSON.stringify(g), { ctx, rects } = context();
    drawFootball(ctx, g, { width, height }, 0);
    for (const color of Object.values(FIELD_GOAL_PADDING_COLORS))
      assert(rects.some(r => r.color === color), 'pad faces, seams and highlights are rendered');
    const pixels = rects.filter(r => Object.values(FIELD_GOAL_PADDING_COLORS).includes(r.color as typeof FIELD_GOAL_PADDING_COLORS.face));
    assert(pixels.every(r => [r.x, r.y, r.w, r.h].every(Number.isInteger)), 'padding uses crisp integer raster edges');
    assert.equal(JSON.stringify(g), before);
  }
});
test('human slider, left/right hashes, actual trajectory and scoring use the same opening', () => {
  for (const distance of [20, 25, 30, 35, 40, 45, 50, 55, 60]) for (const hash of [65, 96, 127])
    for (const normalized of [-1.2, -.8, 0, .8, 1.2]) {
      const g = kick(undefined, distance, hash), s = g.special!;
      const geo = kickGeometry(s.fromX, s.fromY);
      const meter = geo.center + normalized * geo.half;
      if (meter < 0 || meter > 1) continue; // A pointer cannot leave its fixed track.
      s.stage = 'hold';
      // Place the real sinusoidal meter precisely at the selected sample.
      const speed = fieldGoalMeterSpeed(distance) * effectiveKickControl(g,g.possession);
      const dt = 1e-8;
      g.live!.time = Math.asin((meter - .5) * 2) / (speed * Math.PI * 2) - dt;
      stepSpecialTeams(g, { action: true }, dt);
      assert.equal(s.stage, 'approach');
      assert(Math.abs(s.toY - (96 + normalized * 20)) < 1e-7);
      assert.equal(s.good, Math.abs(normalized) < 1 && distance <= 55);
      const f = fieldGoalFrame(393, 500, s);
      const ball = projectFieldGoal({ y: s.toY, z: fieldGoalHeight(g, 1), depth: 1 }, f);
      const indicator = f.center + (meter - .5) * f.focal * FIELD_GOAL.sensor;
      assert(Math.abs(ball.x - indicator) < 1e-7, 'stopped pointer is the ball crossing x');
      assert.equal(s.fromY, hash, 'holder/hash is never recentered');
      assert.equal(s.athletes[5]!.y, hash + 12);
    }
});
test('a centered but out-of-range historical attempt falls below the actual crossbar', () => {
  const g = kick(.5, 55); g.profiles.home.kickMax = 50 / 1.1;
  g.special = fieldGoalSequence(g); g.special.blockChecked = true;
  const s = g.special!;
  assert.equal(s.good, false);
  s.stage = 'flight'; s.stageAge = s.duration * FIELD_GOAL_FLIGHT_SCALE - .01;
  stepSpecialTeams(g, {}, .01);
  assert.equal(s.stage, 'resolved');
  assert(s.ball.z < FIELD_GOAL.crossbar);
  const f = fieldGoalFrame(852, 270, s), ball = projectFieldGoal(fieldGoalSample(s), f);
  const bar = projectFieldGoal({ y: 96, z: 10, depth: 1 }, f);
  assert(ball.y > bar.y);
});
test('plane crossings match made, wide-left, wide-right and weak outcomes in both saved field directions', () => {
  for (const accuracy of [0, .5, 1]) for (const direction of [1, -1]) {
    const g = kick(accuracy), s = g.special!;
    if (direction === -1) { s.fromX = 1200 - s.fromX; s.toX = 1200 - s.toX; }
    s.stage = 'resolved'; s.ball = { x: s.toX, y: s.toY, z: 23 };
    const f = fieldGoalFrame(393, 500, s), sample = fieldGoalSample(s), p = projectFieldGoal(sample, f);
    const left = projectFieldGoal({ y: 76, z: 10, depth: 1 }, f);
    const right = projectFieldGoal({ y: 116, z: 10, depth: 1 }, f);
    assert.equal(sample.depth, 1);
    if (s.good) assert(p.x > left.x && p.x < right.x && p.y < left.y);
    else assert(accuracy < .5 ? p.x < left.x : p.x > right.x);
  }
});
test('actual human and CPU attempts resolve once, with unchanged snap/approach/flight durations and delayed verdict', () => {
  for (const side of ['home', 'away'] as const) {
    const g = kick(undefined, 35, 96, side), s = g.special!;
    stepSpecialTeams(g, {}, .28); assert.equal(s.stage, 'hold');
    const rng = g.rng;
    if (side === 'home') {
      const geo = kickGeometry(s.fromX, s.fromY);
      assert.equal(fieldGoalMeterAccuracy(g, s, geo.center), .5);
      g.live!.time = -.01; stepSpecialTeams(g, { action: true }, .01);
      assert.equal(g.rng, rng, 'human timing does not add a random miss');
    } else stepSpecialTeams(g, {}, .81);
    assert.equal(s.stage, 'approach');
    stepSpecialTeams(g, {}, .34); assert.equal(s.stage, 'flight');
    let frames = 0;
    while (s.stage !== 'resolved' && frames++ < 200) {
      assert.equal(fieldGoalVerdictVisible(s), false);
      stepSpecialTeams(g, {}, 1 / 60);
    }
    assert.equal(s.stage, 'resolved'); assert.equal(s.ball.x, s.toX);
    assert.equal(g.kickSounds, 1);
    assert.equal(fieldGoalVerdictVisible(s), false);
    stepSpecialTeams(g, {}, .2);
    assert(fieldGoalSample(s).depth > 1); assert.equal(fieldGoalVerdictVisible(s), false);
    stepSpecialTeams(g, {}, .07); assert.equal(fieldGoalVerdictVisible(s), true);
    assert.equal(stepSpecialTeams(g, {}, .17), undefined);
    assert.equal(stepSpecialTeams(g, {}, .02)?.kind, s.good ? 'good' : 'miss');
  }
});
test('camera covers pre-snap through verdict, green meter edges equal projected posts, crowd uses both teams, rendering is pure', () => {
  for (const [width, height] of [[393, 500], [852, 270]]) {
    const g = kick(), s = g.special!;
    const f = fieldGoalFrame(width!, height!, s);
    for (const stage of ['snap', 'hold', 'approach', 'flight', 'resolved'] as const) {
      s.stage = stage;
      const before = JSON.stringify(g), { ctx, rects, labels } = context();
      drawFootball(ctx, g, { width, height }, 0);
      assert.equal(rects[0]?.color, '#081323');
      assert.equal(JSON.stringify(g), before);
      const teams = kickMatchupTeams(g.teams);
      const shirts = rects.filter(r => r.w === 4 && r.h === 3 && r.y < f.horizon);
      for (const team of [teams.player, teams.opponent]) {
        assert(shirts.some(r => r.color === team.body || r.color === team.trim), 'crowd contains each actual team');
      }
      const zone = rects.find(r => r.color === '#58b867');
      if (stage === 'hold') {
        assert(zone);
        const left = projectFieldGoal({ y: 76, z: 10, depth: 1 }, f);
        const right = projectFieldGoal({ y: 116, z: 10, depth: 1 }, f);
        assert(Math.abs(zone.x - Math.round(left.x * f.scale)) <= 1);
        assert(Math.abs(zone.w - (right.x - left.x) * f.scale) < 1e-7);
        assert(labels.some(l => l.text === 'ACTION: KICK'));
        assert(labels.every(l => l.y > 40 && l.y < height!));
      } else assert.equal(zone, undefined);
      assert(!labels.some(l => l.text === 'GOOD' || l.text === 'NO GOOD'));
    }
    s.stage = 'resolved'; s.good = true; s.stageAge = .27;
    const { ctx, labels } = context(); drawFootball(ctx, g, { width, height }, 0);
    assert(labels.some(l => l.text === 'GOOD'));
    const copy = { ...g, special: undefined, phase: 'pre-snap' as const };
    const c = context(); drawFootball(c.ctx, copy, { width, height }, 0);
    assert.equal(c.rects[0]?.color, '#081323');
  }
});
test('engine awards three points once only after the real flight and verdict hold', () => {
  for (const distance of [20, 25, 30, 35, 40, 45, 50, 55, 60]) for (const accuracy of [0, .5, 1]) {
    const g = kick(accuracy, distance), s = g.special!;
    let frames = 0;
    while (g.special === s && frames++ < 400) {
      if (s.stage !== 'resolved' || s.stageAge < .44) assert.equal(g.score.home, 0);
      stepFootball(g, {}, 1 / 60);
    }
    assert.equal(g.score.home, accuracy === .5 && distance <= 55 ? 3 : 0);
    assert.equal(g.stats.home.fieldGoals, accuracy === .5 && distance <= 55 ? 1 : 0);
    assert.equal(fieldGoalDistance(g) >= 0, true);
  }
});
