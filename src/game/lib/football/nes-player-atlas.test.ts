import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from './engine';
import { startField } from './field';
import { KICK_TEAMS } from '../kick-return-teams';
import { positionKit, uniformKit, UNIFORM, playerSkin } from '../../components/football-art';
import {
  drawFootballPlayer, drawFootballProne, getFootballPlayerGrip,
} from '../../components/football-player-art';
import { footballAthletePose } from '../../components/football-player-state';
import { movementStep } from '../../components/football-sprites';
import { selectFootballPlayerConceptFrame } from '../../components/football-player-concepts';
import {
  applyEliteCPosition, ELITE_C_ARMS, ELITE_C_DIRECTIONAL_TOPS, ELITE_C_GAME_ARMS,
  ELITE_C_RUN_LEGS, stripEliteCBakedArmOverhang, type EliteCPosition,
} from '../../components/football-player-sheets';
import {
  selectFootballPlayerFrame, footballPlayerPalette, PLAYER_RUN_PHASES, PLAYER_ACTIONS,
  PLAYER_FRAME_WIDTH, PLAYER_FRAME_HEIGHT, PLAYER_FRAME_SCALE, refineFootballHelmetWidth,
  getCachedFootballPlayerFrameCount,
  type FootballPlayerFrame,
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
  const composeTopAndArms = (arms: readonly string[], cleanedBody: boolean) => {
    const grid = Array.from({ length: 22 }, () => Array<string>(16).fill('.'));
    const stamp = (source: readonly string[], atY = 0) => source.forEach((line, y) => {
      [...line].forEach((glyph, x) => {
        if (glyph !== '.') grid[atY + y]![x] = glyph;
      });
    });
    stamp(cleanedBody
      ? stripEliteCBakedArmOverhang(ELITE_C_DIRECTIONAL_TOPS[view])
      : ELITE_C_DIRECTIONAL_TOPS[view]);
    stamp(ELITE_C_RUN_LEGS[phase]!, 13);
    stamp(arms);
    const composed = grid.map(row => row.join(''));
    applyEliteCPosition(composed, position);
    return composed.map(row => [...row]);
  };
  const legacyGrid = composeTopAndArms(legacy, false);
  const gameplayGrid = composeTopAndArms(gameplay, true);
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
function bakedArmPixelMask(view: 0 | 1 | 2) {
  const source = ELITE_C_DIRECTIONAL_TOPS[view];
  const raw = [...source, ...Array.from({ length: 22 - source.length }, () => '................')];
  const cleaned = stripEliteCBakedArmOverhang(raw);
  const mask = new Set<string>();
  raw.forEach((row, y) => [...row].forEach((glyph, x) => {
    if (glyph === cleaned[y]![x]) return;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
      mask.add(`${x * 2 + dx},${y * 2 + dy}`);
  }));
  return mask;
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

test('directional run frames change both articulated legs and the opposing arm pump', () => {
  for (const role of ['RB', 'QB']) for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const frames = Array.from({ length: 6 }, (_, phase) =>
      selectFootballPlayerFrame('run', view, phase, false, role));
    const legSignatures = frames.map(frame => JSON.stringify(
      frame.runs.filter(run => (run.color === 'W' || run.color === 'w') && run.row >= 26),
    ));
    const armSignature = (frame: FootballPlayerFrame) => JSON.stringify(
      frame.runs.filter(run => run.row >= 16 && run.row < 26),
    );
    assert.equal(new Set(legSignatures).size, 6, `${role}/${view}: all six lower-body poses visibly step`);
    assert.notEqual(armSignature(frames[0]!), armSignature(frames[3]!),
      `${role}/${view}: arm pump reverses with the stride`);
  }
});

test('moving action legs use independent cadence without changing action arms or stationary baseline', () => {
  const movingActions = ['hold', 'throw', 'handoff', 'catch', 'block', 'break'] as const;
  for (const action of movingActions) {
    const planted = selectFootballPlayerFrame(action, 2, 3, true, 'QB');
    assert.strictEqual(selectFootballPlayerFrame(action, 2, 3, true, 'QB', undefined), planted,
      `${action}: omitted cadence preserves the stationary baseline`);
    const moving = Array.from({ length: 6 }, (_, cadence) =>
      selectFootballPlayerFrame(action, 2, 3, true, 'QB', cadence));
    assert.equal(new Set(moving.map(frame => JSON.stringify(
      frame.runs.filter(run => (run.color === 'W' || run.color === 'w') && run.row >= 26),
    ))).size, 6, `${action}: moving cadence drives six leg frames`);
    assert(moving.every(frame => frame.phase === 3), `${action}: upper-body action phase is unchanged`);
    assert(moving.every(frame => frame.grip?.x === planted.grip?.x && frame.grip?.y === planted.grip?.y),
      `${action}: cadence does not move the possession anchor`);
    const arms = moving.map(frame => JSON.stringify(frame.runs.filter(run => run.row >= 16 && run.row < 26)));
    assert.equal(new Set(arms).size, 1, `${action}: cadence does not alter action arms`);
  }
  const equivalent = selectFootballPlayerFrame('throw', 2, 3, false, 'QB', 1);
  assert.strictEqual(selectFootballPlayerFrame('throw', 2, 3, false, 'QB', 7), equivalent,
    'locomotion phase keys wrap to the same six canonical cache frames');
  const beforeInvalid = getCachedFootballPlayerFrameCount();
  assert.strictEqual(selectFootballPlayerFrame('throw', 2, 3, false, 'QB', Number.NaN),
    selectFootballPlayerFrame('throw', 2, 3, false, 'QB'));
  assert.equal(getCachedFootballPlayerFrameCount(), beforeInvalid + 1,
    'non-finite cadence does not create an unbounded or invalid phase key');
  for (const excluded of ['idle', 'stance', 'snap', 'jump', 'kick', 'fall', 'dive', 'ground'] as const) {
    assert.strictEqual(
      selectFootballPlayerFrame(excluded, 2, 3, false, 'QB', 2),
      selectFootballPlayerFrame(excluded, 2, 3, false, 'QB'),
      `${excluded}: excluded from the independent ground locomotion override`,
    );
  }
});

test('reach and guard arms have no distal black or colored marker across directional actions', () => {
  const reachRow = ELITE_C_GAME_ARMS.reach[8]!;
  assert.equal(reachRow.slice(11), '.....',
    'every distal arm-tip cell is empty; there is no black or recolored marker');
  assert.equal(ELITE_C_GAME_ARMS.guard[9]!.slice(11), '.....',
    'idle/holding guards must not retain the same double-ink gun tip on the next row');
  for (const action of ['catch', 'handoff', 'break'] as const) for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const phase = action === 'break' ? 0 : 2;
    const frame = selectFootballPlayerFrame(action, view, phase, false, 'QB');
    assert(connectedShare(frame) >= .95, `${action}/${view}: removing the tip preserves the connected athlete`);
    assert(frame.runs.some(run => run.color === 'J'), `${action}/${view}: the sleeve remains visible`);
    assert(frame.runs.some(run => run.color === 'S'), `${action}/${view}: the hand/skin remains visible`);
  }
  for (const action of ['run', 'hold'] as const) for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const frame = selectFootballPlayerFrame(action, view, 2, true, 'RB');
    assert(connectedShare(frame) >= .95, `${action}/${view}: moving/holding poses stay coherent`);
    assert(frame.runs.some(run => run.color === 'B'), `${action}/${view}: ball identity and grip remain intact`);
  }
});

test('production body cleanup removes only outboard baked arms and preserves chest and shoulder rows', () => {
  for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const source = ELITE_C_DIRECTIONAL_TOPS[view];
    const cleaned = stripEliteCBakedArmOverhang(source);
    assert.equal(cleaned[8], source[8], `view ${view}: shoulder-pad row remains exact`);
    for (let y = 9; y <= 12; y++) for (let x = 0; x < 16; x++) {
      if (x >= 5 && x <= 10) assert.equal(cleaned[y]![x], source[y]![x], `view ${view}: chest ${x}/${y} stays exact`);
      else assert.equal(cleaned[y]![x], '.', `view ${view}: baked arm pixel ${x}/${y} is removed`);
    }
  }
});

test('actual standing, hold, and moving composites contain no distal baked barrel pixels', () => {
  for (const action of ['idle', 'stance', 'hold', 'run'] as const) for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const frame = selectFootballPlayerFrame(action, view, 0, action === 'hold' || action === 'run', 'QB');
    const composed = pixels(frame);
    // These are the exact far-out native pixels in the reported row-18..21
    // composite. The body base must not leave either dark or jersey-colored
    // arm tips there after layering the current action arms.
    for (let y = 18; y <= 21; y++) for (const x of [...Array(4).keys(), ...Array.from({ length: 4 }, (_, i) => 28 + i)]) {
      assert.notEqual(composed.get(`${x},${y}`), 'K', `${action}/${view}: no distal black barrel at ${x},${y}`);
      assert.notEqual(composed.get(`${x},${y}`), 'J', `${action}/${view}: no recolored barrel at ${x},${y}`);
    }
    assert(connectedShare(frame) >= .95, `${action}/${view}: cleaned composite remains connected`);
  }
});

test('shared athlete scale reduces art by five percent while retaining the ground anchor', () => {
  assert.equal(PLAYER_FRAME_SCALE, 0.475);
  const kit = uniformKit(KICK_TEAMS[0]!, 1);
  const { ctx, rects } = canvas();
  drawFootballPlayer(ctx, 100, 100, kit, {
    action: 'hold', ball: true, locomotionStep: 2,
  } as Parameters<typeof drawFootballPlayer>[4] & { locomotionStep: number });
  assert(rects.length > 0);
  assert(rects.every(rect => [rect.x, rect.y, rect.w, rect.h].every(n => Number.isInteger(n * 2))
    && rect.w > 0 && rect.h === .5),
    'the smaller body, ball and possession pixels share sharp half-world-pixel edges');
  assert.equal(Math.max(...rects.map(rect => rect.y + rect.h)), 105,
    'symmetric edge quantization keeps the cleat anchor exactly on the existing turf baseline');
  const grip = getFootballPlayerGrip('hold', 0, 0, true, 1, 'QB');
  const mirroredGrip = getFootballPlayerGrip('hold', 0, 0, true, -1, 'QB');
  assert(grip && mirroredGrip);
  assert.equal(grip.x, 24 * PLAYER_FRAME_SCALE);
  assert.equal(grip.y, 24 * PLAYER_FRAME_SCALE);
  assert.equal(mirroredGrip.x, 8 * PLAYER_FRAME_SCALE, 'directional grip mirrors at the same shared scale');
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
    assert(rects.every(r => [r.x, r.y, r.w, r.h].every(n =>
      Math.abs(n * 40 - Math.round(n * 40)) < 1e-7)),
      'the shared 0.475 scale lands on the atlas 1/40-unit pixel grid');
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
    const idleArmMask = gameplayArmPixelMask(
      view, 0, role, ELITE_C_ARMS.guard, ELITE_C_GAME_ARMS.guard,
    );
    const bakedMask = bakedArmPixelMask(view);
    const idleAllowedMask = new Set([...idleArmMask, ...bakedMask]);
    assert.deepEqual(
      outsideGameplayArmPixels(selectFootballPlayerFrame('idle', view, 0, false, role).runs, idleAllowedMask),
      outsideGameplayArmPixels(conceptAfterHelmetRefinement(plantedConcept), idleAllowedMask),
      'idle differs only by the exact gameplay guard, removed baked arm overhang, and helmet trim',
    );
    for (let phase = 0; phase < 6; phase++) {
      const runConcept = selectFootballPlayerConceptFrame('C', 'run', role, view, phase);
      const legacyArms = ELITE_C_ARMS[phase % 2 ? 'pumpB' : 'pumpA'];
      const gameplayArms = ELITE_C_GAME_ARMS[phase < 3 ? 'pumpA' : 'pumpB'];
      const armMask = gameplayArmPixelMask(view, phase, role, legacyArms, gameplayArms);
      const allowedMask = new Set([...armMask, ...bakedMask]);
      const maskedCoreTorso = [...armMask].filter(point => {
        const [x, y] = point.split(',').map(Number);
        return x! >= 8 && x! < 24 && y! >= 16 && y! < 28;
      }).length;
      assert(maskedCoreTorso < 112, 'changed arm/pad pixels leave more than 80 center-torso pixels exact');
      assert.deepEqual(
        outsideGameplayArmPixels(selectFootballPlayerFrame('run', view, phase, false, role).runs, allowedMask),
        outsideGameplayArmPixels(conceptAfterHelmetRefinement(runConcept), allowedMask),
      `${role}/${view}/${phase}: production only differs by gameplay arms, exact baked-arm removal, and helmet trim`);
    }
  }
});
