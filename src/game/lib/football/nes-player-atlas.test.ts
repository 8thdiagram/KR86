import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField } from './field';
import { KICK_TEAMS } from '../kick-return-teams';
import { positionKit, uniformKit, UNIFORM, playerSkin } from '../../components/football-art';
import { drawFootballPlayer, drawFootballProne } from '../../components/football-player-art';
import { footballAthletePose } from '../../components/football-player-state';
import { movementStep } from '../../components/football-sprites';
import { selectFootballPlayerConceptFrame } from '../../components/football-player-concepts';
import {
  applyEliteCPosition, ELITE_C_ARMS, ELITE_C_DIRECTIONAL_TOPS, ELITE_C_GAME_ARMS,
  ELITE_C_RUN_LEGS, type EliteCPosition,
} from '../../components/football-player-sheets';
import {
  selectFootballPlayerFrame, footballPlayerPalette, PLAYER_RUN_PHASES, PLAYER_ACTIONS,
  PLAYER_FRAME_WIDTH, PLAYER_FRAME_HEIGHT, refineFootballHelmetWidth, type FootballPlayerFrame,
} from '../../components/football-player-frames';

function pixels(frame: FootballPlayerFrame) {
  const out = new Map<string, string>();
  for (const r of frame.runs) for (let x = r.x; x < r.x + r.length; x++) out.set(`${x},${r.row}`, r.color);
  return out;
}
function conceptAfterHelmetRefinement(frame: FootballPlayerFrame) {
  const raster = Array.from({ length: PLAYER_FRAME_HEIGHT }, () => Array<string>(PLAYER_FRAME_WIDTH).fill('.'));
  for (const run of frame.runs)
    for (let x = run.x; x < run.x + run.length; x++) raster[run.row]![x] = run.color;
  refineFootballHelmetWidth(raster);
  const runs: { row: number; x: number; length: number; color: string }[] = [];
  raster.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = row[x]!;
      if (color === '.') { x++; continue; }
      const start = x++;
      while (x < row.length && row[x] === color) x++;
      runs.push({ row: y, x: start, length: x - start, color });
    }
  });
  return runs;
}
function connectedShare(frame: FootballPlayerFrame) {
  const remaining = new Set(pixels(frame).keys()), total = remaining.size;
  let largest = 0;
  while (remaining.size) {
    const first = remaining.values().next().value!, pending = [first]; remaining.delete(first);
    let count = 0;
    while (pending.length) {
      const [x, y] = pending.pop()!.split(',').map(Number); count++;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const next = `${x! + dx},${y! + dy}`;
        if (remaining.delete(next)) pending.push(next);
      }
    }
    largest = Math.max(largest, count);
  }
  return largest / total;
}
function gameplayArmPixelMask(
  view: 0 | 1 | 2, phase: number, position: EliteCPosition,
  legacy: readonly string[], gameplay: readonly string[],
) {
  const composeTopAndArms = (arms: readonly string[]) => {
    const grid = Array.from({ length: 22 }, () => Array<string>(16).fill('.'));
    const stamp = (source: readonly string[], atY = 0) => source.forEach((line, y) => {
      [...line].forEach((glyph, x) => {
        if (glyph !== '.') grid[atY + y]![x] = glyph;
      });
    });
    stamp(ELITE_C_DIRECTIONAL_TOPS[view]);
    stamp(ELITE_C_RUN_LEGS[phase]!, 13);
    stamp(arms);
    const composed = grid.map(row => row.join(''));
    applyEliteCPosition(composed, position);
    return composed.map(row => [...row]);
  };
  const legacyGrid = composeTopAndArms(legacy);
  const gameplayGrid = composeTopAndArms(gameplay);
  const armPixels = new Set<string>();
  legacyGrid.forEach((row, y) => [...row].forEach((glyph, x) => {
    if (glyph === gameplayGrid[y]![x]) return;
    // This is the exact arm-layer delta plus only pad pixels that the existing
    // position pass derives from those contours; no whole-row torso masking.
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
      armPixels.add(`${x * 2 + dx},${y * 2 + dy}`);
  }));
  return armPixels;
}
function outsideGameplayArmPixels(
  runs: readonly { row: number; x: number; length: number; color: string }[],
  armPixels: ReadonlySet<string>,
) {
  const kept: [string, string][] = [];
  for (const run of runs) for (let x = run.x; x < run.x + run.length; x++) {
    if (!armPixels.has(`${x},${run.row}`)) kept.push([`${x},${run.row}`, run.color]);
  }
  return kept.sort(([a], [b]) => a.localeCompare(b));
}
function canvas() {
  const rects: { c: string; x: number; y: number; w: number; h: number }[] = [];
  const target = {
    fillStyle: '', imageSmoothingEnabled: true,
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ c: this.fillStyle, x, y, w, h }); },
    rotate() { assert.fail('football athletes use raster poses, not flat rotations'); },
    scale() { assert.fail('anatomy must not be stretched'); },
  };
  return { ctx: target as unknown as CanvasRenderingContext2D, rects, target };
}

test('the replacement atlas contains bounded immutable connected frames for every football action and build', () => {
  assert.equal(PLAYER_FRAME_WIDTH, 32); assert.equal(PLAYER_FRAME_HEIGHT, 44);
  for (const role of ['QB', 'RB', 'OL', 'LB', 'DB', 'K', 'H']) {
    for (const action of PLAYER_ACTIONS) for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
      for (const phase of [0, 2, 5]) {
        const frame = selectFootballPlayerFrame(action, view, phase, true, role);
        assert(Object.isFrozen(frame) && Object.isFrozen(frame.runs));
        assert(frame.runs.length > 20 && frame.runs.length < 400, 'bounded authored raster complexity');
        assert.strictEqual(frame, selectFootballPlayerFrame(action, view, phase, true, role), 'reuse cached immutable art');
        for (const r of frame.runs)
          assert(r.row >= 0 && r.row < 44 && r.x >= 0 && r.length > 0 && r.x + r.length <= 32);
        assert(connectedShare(frame) >= .95, `${role}/${action}/${view}/${phase}: connected athlete with no detached limbs`);
      }
    }
  }
});

test('six distinct running phases retain substantial thigh and calf clusters in every direction', () => {
  assert.equal(PLAYER_RUN_PHASES.length, 6);
  for (const role of ['RB', 'OL', 'LB', 'DB']) for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const frames = new Set<string>();
    for (let phase = 0; phase < 6; phase++) {
      const frame = selectFootballPlayerFrame('run', view, phase, false, role);
      frames.add(JSON.stringify(frame.runs));
      const legs = frame.runs.filter(r => (r.color === 'W' || r.color === 'w') && r.row >= 30);
      assert(legs.reduce((n, r) => n + r.length, 0) >= 24, 'visible trouser masses, not single-pixel sticks');
      assert(legs.some(r => r.length >= 4), 'thigh/calf contours have actual pixel-cluster width');
    }
    assert.equal(frames.size, 6, `${role}/${view}: six actual poses, not duplicate labels`);
  }
});

test('all team palettes retain primary jerseys, secondary shells, white equipment and stable role skin', () => {
  for (const team of KICK_TEAMS) for (const role of ['QB', 'OL', 'RB', 'WR', 'DL', 'DB', 'K'] as const) {
    const kit = positionKit(uniformKit(team, 1), role), before = JSON.stringify(kit);
    const p = footballPlayerPalette(kit);
    assert.equal(p.J, team.body); assert.equal(p.M, team.trim);
    assert.equal(p.W, UNIFORM.pants); assert.equal(p.F, UNIFORM.facemask);
    assert.equal(p.S, playerSkin(kit));
    assert.notEqual(p.j, p.J); // Discrete shadow, not a smooth gradient.
    const { ctx, target, rects } = canvas();
    drawFootballPlayer(ctx, 100, 100, kit, { action: 'run', step: 1, ball: true });
    assert(target.imageSmoothingEnabled, 'restore caller smoothing after crisp raster painting');
    assert(rects.every(r => [r.x, r.y, r.w, r.h].every(n => Number.isInteger(n * 2))));
    assert.equal(JSON.stringify(kit), before);
  }
});

test('the football stays in the same authored hand through strides, spins and the actual release boundary', () => {
  for (const action of ['run', 'throw', 'catch', 'dive', 'ground'] as const)
    for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) for (let phase = 0; phase < 6; phase++) {
      const held = selectFootballPlayerFrame(action, view, phase, true, 'RB');
      const empty = selectFootballPlayerFrame(action, view, phase, false, 'RB');
      assert(held.grip, 'held ball has a pose-specific grip anchor');
      assert(held.runs.some(r => r.color === 'B'), 'the ball cannot disappear before gameplay releases it');
      assert(!empty.runs.some(r => ['B', 'b', 'L', 'G', 'O'].includes(r.color)), 'no fake ball after release');
    }
});

test('velocity-driven cadence plants stopped athletes and accelerates the same six-phase cycle without changing state', () => {
  assert.equal(movementStep(0, 0, 5), 0);
  assert.equal(movementStep(2, 1, 10), 0);
  assert(movementStep(60, 0, 1) > movementStep(20, 0, 1));
  const game = createFootball(86), live = startField(game, 'slant', 'pass');
  live.snapAge = .5; live.time = 1;
  const qb = live.athletes.find(a => a.role === 'QB')!;
  const flags = { snapping: false, ball: true, engaged: false, facing: 1 as const, direction: 1 as const };
  live.mode = 'dropback'; live.holdingPass = true; live.holdStarted = .9;
  let before = JSON.stringify(live);
  const windup = footballAthletePose(live, qb, flags);
  assert.equal(windup.action, 'throw'); assert(windup.progress! < .6); assert(windup.ball);
  assert.equal(JSON.stringify(live), before);
  live.flight = { x: qb.x, y: qb.y, z: 1, fromX: qb.x, fromY: qb.y,
    toX: qb.x + 100, toY: qb.y, age: .03, duration: .8, receiver: 0, accuracy: 1 };
  before = JSON.stringify(live);
  const release = footballAthletePose(live, qb, { ...flags, ball: false });
  assert.equal(release.action, 'throw'); assert(release.progress! >= .6); assert.equal(release.ball, false);
  assert.equal(JSON.stringify(live), before, 'visual follow-through cannot delay release or consume randomness');
});

test('prone orientations are raster-selected and preserve caller and team data', () => {
  const kit = positionKit(uniformKit(KICK_TEAMS[0]!, 1), 'DL'), before = JSON.stringify(kit);
  const signatures = new Set<string>();
  for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const { ctx, rects } = canvas();
    drawFootballProne(ctx, 100, 100, kit, { angle, lift: 2, ball: true });
    signatures.add(JSON.stringify(rects));
    assert.equal(JSON.stringify(kit), before);
  }
  assert.equal(signatures.size, 5, 'horizontal, vertical and diagonal anatomy differ without rotating a flat image');
});

test('the selected C concept is the actual production art rather than a comparison-only illustration', () => {
  for (const role of ['QB', 'RB', 'OL', 'LB', 'DB'] as const) for (const view of [0, 1, 2] as const) {
    const alternatives = ['A', 'B', 'C'].map(concept =>
      JSON.stringify(selectFootballPlayerConceptFrame(concept as 'A' | 'B' | 'C', 'planted', role, view, 0).runs));
    assert.equal(new Set(alternatives).size, 3, 'three genuinely different silhouettes');
    const plantedConcept = selectFootballPlayerConceptFrame('C', 'planted', role, view, 0);
    assert.deepEqual(selectFootballPlayerFrame('idle', view, 0, false, role).runs,
      conceptAfterHelmetRefinement(plantedConcept),
    'production differs from selected C only by the documented native-pixel helmet contour trim');
    for (let phase = 0; phase < 6; phase++) {
      const runConcept = selectFootballPlayerConceptFrame('C', 'run', role, view, phase);
      const legacyArms = ELITE_C_ARMS[phase % 2 ? 'pumpB' : 'pumpA'];
      const gameplayArms = ELITE_C_GAME_ARMS[phase < 3 ? 'pumpA' : 'pumpB'];
      const armMask = gameplayArmPixelMask(view, phase, role, legacyArms, gameplayArms);
      const maskedCoreTorso = [...armMask].filter(point => {
        const [x, y] = point.split(',').map(Number);
        return x! >= 8 && x! < 24 && y! >= 16 && y! < 28;
      }).length;
      assert(maskedCoreTorso < 112, 'changed arm/pad pixels leave more than 80 center-torso pixels exact');
      assert.deepEqual(
        outsideGameplayArmPixels(selectFootballPlayerFrame('run', view, phase, false, role).runs, armMask),
        outsideGameplayArmPixels(conceptAfterHelmetRefinement(runConcept), armMask),
      `${role}/${view}/${phase}: production retains the exact C pose apart from helmet contour trim`);
    }
  }
});
