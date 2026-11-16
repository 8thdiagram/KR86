import test from 'node:test';
import assert from 'node:assert/strict';
import { UNIFORM } from './football-art';
import {
  footballPlayerPalette, paintFootballPlayerFrame, PLAYER_FRAME_SCALE, selectFootballPlayerFrame,
} from './football-player-frames';
import { CARRIER_BODY_WIDTH } from '../lib/player-dimensions';

const roles = ['QB', 'RB', 'OL', 'LB', 'DB', 'DL', 'KR', 'WR', 'K'] as const;
const locomotionActions = [
  'idle', 'stance', 'run', 'hold', 'snap', 'handoff', 'throw', 'catch',
  'block', 'break', 'backpedal', 'jump', 'kick', 'kneel',
] as const;

function glyphPixels(frame: ReturnType<typeof selectFootballPlayerFrame>, glyph: string) {
  return frame.runs.filter(run => run.color === glyph)
    .flatMap(run => Array.from({ length: run.length }, (_, offset) => ({
      x: run.x + offset, y: run.row,
    })));
}

function horizontalGroups(
  frame: ReturnType<typeof selectFootballPlayerFrame>, row: number, outline = false,
) {
  const colors = outline ? ['K', 'W', 'w'] : ['W', 'w'];
  const pixels = frame.runs.filter(run => run.row === row && colors.includes(run.color))
    .flatMap(run => Array.from({ length: run.length }, (_, offset) => run.x + offset))
    .sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const x of pixels) {
    const current = groups.at(-1);
    if (!current || x > current.at(-1)! + 1) groups.push([x]);
    else if (x !== current.at(-1)) current.push(x);
  }
  return groups;
}

function cleatComponents(frame: ReturnType<typeof selectFootballPlayerFrame>) {
  const remaining = new Set(glyphPixels(frame, 'C')
    .filter(pixel => pixel.y >= 38 && pixel.y <= 41)
    .map(pixel => `${pixel.x},${pixel.y}`));
  const components: { minX: number; maxX: number; minY: number; maxY: number; size: number }[] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as string;
    remaining.delete(first);
    const queue = [first], pixels: { x: number; y: number }[] = [];
    while (queue.length) {
      const point = queue.pop()!;
      const [x, y] = point.split(',').map(Number) as [number, number];
      pixels.push({ x, y });
      for (const neighbor of [`${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`]) {
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
    components.push({
      minX: Math.min(...pixels.map(pixel => pixel.x)),
      maxX: Math.max(...pixels.map(pixel => pixel.x)),
      minY: Math.min(...pixels.map(pixel => pixel.y)),
      maxY: Math.max(...pixels.map(pixel => pixel.y)),
      size: pixels.length,
    });
  }
  return components;
}

test('black cleats stay attached to every locomotion footprint across views, roles, and kit colors', () => {
  const kits = [
    { body: '#c84035', trim: '#f1c64a', dir: 1 as const },
    { body: '#367b65', trim: '#d5dce2', dir: -1 as const },
    { body: '#e0d7bd', trim: '#44556e', dir: 1 as const },
  ];
  for (const kit of kits) {
    const palette = footballPlayerPalette(kit);
    assert.equal(palette.C, '#101214', 'shoe fill is black independent of team colors');
    assert.equal(palette.K, UNIFORM.ink, 'cleat work does not recolor all outlines');
    assert.equal(palette.W, UNIFORM.pants, 'white pants and socks remain unchanged');
    assert.equal(palette.J, kit.body);
    assert.equal(palette.M, kit.trim);
  }
  const renderKit = kits[0]!;

  for (const role of roles) for (let view = 0; view < 9; view++) {
    for (const action of locomotionActions) {
      const frame = selectFootballPlayerFrame(action, view as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, 2, false, role);
      const expectedSoleRows = action === 'jump' ? [38, 39]
        : action === 'run' || action === 'backpedal' ? [38, 41] : [40, 41];
      const soleInk = [...glyphPixels(frame, 'K'), ...glyphPixels(frame, 'C')].filter(pixel =>
        pixel.y >= expectedSoleRows[0]! && pixel.y <= expectedSoleRows[1]!);
      assert(soleInk.length > 0, `${role} ${action} view ${view} retains its authored shoe contour`);
      assert(soleInk.every(pixel => pixel.y >= expectedSoleRows[0]! && pixel.y <= expectedSoleRows[1]!),
        `${role} ${action} shoe pixels retain the authored foot anchor${action === 'jump' ? ' while raised' : ''}`);
      const sockPixels = glyphPixels(frame, 'W');
      assert(sockPixels.some(sock => soleInk.some(sole =>
        Math.abs(sock.x - sole.x) <= 2 && sock.y >= 32 && sock.y < sole.y)),
       `${role} ${action} cleats remain joined to white lower-leg/sock pixels`);
      const painted: { color: unknown; y: number; h: number }[] = [];
      const target = {
        imageSmoothingEnabled: false,
        fillStyle: '',
        fillRect(_x: number, y: number, _w: number, h: number) {
          painted.push({ color: this.fillStyle, y, h });
        },
      };
      paintFootballPlayerFrame(target as unknown as CanvasRenderingContext2D, frame, 0, 0, renderKit);
      assert(painted.some(rect => rect.color === '#101214'),
        `${role} ${action} renders only the shoe region with the dedicated black-cleat palette`);
      assert(painted.some(rect => rect.color === UNIFORM.ink),
        `${role} ${action} preserves the original outline ink away from footwear`);
    }
  }
});

test('eight authored stride poses visibly alternate their shoe positions in all travel directions', () => {
  for (let view = 0; view < 9; view++) {
      const centers = Array.from({ length: 8 }, (_, phase) => {
      const cleats = glyphPixels(
        selectFootballPlayerFrame('run', view as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, phase, false, 'RB'),
        'C',
      ).filter(pixel => pixel.y >= 38 && pixel.y <= 41);
      assert(cleats.length > 0, `direction ${view}, phase ${phase} has visible shoe material`);
      return [
        (cleats.reduce((sum, pixel) => sum + pixel.x, 0) / cleats.length).toFixed(2),
        (cleats.reduce((sum, pixel) => sum + pixel.y, 0) / cleats.length).toFixed(2),
      ].join(':');
    });
    assert(new Set(centers).size >= 4,
      `direction ${view} cycles through distinct alternating foot placements`);
  }
});

test('frame 1 and frame 4 exchange the lead leg, knee bend, and raised trailing heel', () => {
  const leftLead = selectFootballPlayerFrame('run', 0, 0, false, 'RB');
  const rightLead = selectFootballPlayerFrame('run', 0, 3, false, 'RB');
  assert.notEqual(
    JSON.stringify(leftLead.runs.filter(run => run.row >= 26)),
    JSON.stringify(rightLead.runs.filter(run => run.row >= 26)),
    'opposite leading strides are separately authored raster poses',
  );
  const leftShoes = cleatComponents(leftLead).sort((a, b) => a.minX - b.minX);
  const rightShoes = cleatComponents(rightLead).sort((a, b) => a.minX - b.minX);
  assert.equal(leftShoes.length, 2);
  assert.equal(rightShoes.length, 2);
  assert(leftShoes[0]!.minY > leftShoes[1]!.minY,
    'left lead plants ahead while the right rear cleat lifts');
  assert(rightShoes[0]!.minY < rightShoes[1]!.minY,
    'mirrored right lead lifts the left rear cleat');
});

test('run, lateral strafe, and backpedal selectors expose eight distinct balanced legs', () => {
  for (const [action, view] of [
    ['run', 0], ['run', 4], ['run', 1], ['run', 3], ['run', 5], ['run', 7],
    ['run', 2], ['run', 6], ['backpedal', 0], ['backpedal', 4],
  ] as const) {
    const frames = Array.from({ length: 8 }, (_, phase) =>
      selectFootballPlayerFrame(action, view, phase, false, 'RB'));
    const lowerSignature = (frame: typeof frames[number]) =>
      JSON.stringify(frame.runs.filter(run => run.row >= 26));
    assert.equal(new Set(frames.map(lowerSignature)).size, 8,
      `${action} view ${view} has eight explicitly authored poses`);

    for (const [phase, frame] of frames.entries()) {
      const twoThighs = Array.from({ length: 6 }, (_, offset) => horizontalGroups(frame, 26 + offset)
        .filter(group => group.length >= 6))
        .some(groups => groups.length === 2 && groups[1]![0]! - groups[0]!.at(-1)! >= 2);
      assert(twoThighs, `${action} ${view}/${phase} has two substantial, separate thigh masses`);
      const twoCalves = [32, 33, 34, 35, 36, 37].map(row => horizontalGroups(frame, row)
        .filter(group => group.length >= 4))
        .some(groups => groups.length === 2 && groups[1]![0]! - groups[0]!.at(-1)! >= 2);
      assert(twoCalves, `${action} ${view}/${phase} keeps two substantial calves distinct`);
      const shoes = cleatComponents(frame);
      assert.equal(shoes.length, 2, `${action} ${view}/${phase} has two separate cleat silhouettes`);
      assert(shoes.every(shoe => shoe.maxX - shoe.minX + 1 >= 6 && shoe.size >= 12),
        `${action} ${view}/${phase} cleats have a substantial toe/heel footprint`);
    }
  }
});

test('explicit strafe gait selects lateral art independent of body orientation', () => {
  for (const view of [0, 4] as const) {
    const signatures = Array.from({ length: 8 }, (_, phase) => JSON.stringify(
      selectFootballPlayerFrame('hold', view, phase, true, 'RB', phase, 'strafe')
        .runs.filter(run => run.row >= 26),
    ));
    assert.equal(new Set(signatures).size, 8, `pure vertical view ${view} animates all eight strafe poses`);
    const running = selectFootballPlayerFrame('hold', view, 0, true, 'RB', 0, 'run');
    const strafe = selectFootballPlayerFrame('hold', view, 0, true, 'RB', 0, 'strafe');
    assert.notStrictEqual(running, strafe, 'frame cache keeps run and strafe gait variants separate');
    assert.notDeepEqual(
      running.runs.filter(run => run.row >= 26),
      strafe.runs.filter(run => run.row >= 26),
      'explicit strafe gait selects its own authored atlas family independent of facing',
    );
  }
  const standingA = selectFootballPlayerFrame('idle', 2, 0, false, 'RB');
  const standingB = selectFootballPlayerFrame('idle', 2, 0, false, 'RB');
  assert.strictEqual(standingA, standingB, 'a planted stance stays stable instead of twitching');
});

test('prone, dive, ground, kick, and kneel poses retain black footwear on authored feet', () => {
  const kits = [
    { body: '#c84035', trim: '#f1c64a', dir: 1 as const },
    { body: '#367b65', trim: '#d5dce2', dir: -1 as const },
    { body: '#e0d7bd', trim: '#44556e', dir: 1 as const },
  ];
  for (const kit of kits) assert.equal(footballPlayerPalette(kit).C, '#101214');

  for (const role of roles) for (let view = 0; view < 9; view++) {
    for (const action of ['dive', 'fall', 'ground'] as const) for (const phase of [2, 5]) {
      const frame = selectFootballPlayerFrame(action, view as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
        phase, true, role);
      const shoes = glyphPixels(frame, 'C');
      const socksAndPants = glyphPixels(frame, 'W');
      assert(shoes.length > 0, `${role} ${action} phase ${phase} view ${view} has authored black cleats`);
      assert(socksAndPants.length > 0, `${role} ${action} keeps white pants/sock pixels`);
      assert(shoes.some(shoe => socksAndPants.some(white =>
        Math.abs(shoe.x - white.x) <= 4 && Math.abs(shoe.y - white.y) <= 4)),
      `${role} ${action} cleats remain attached to the white lower-leg silhouette`);
      assert(glyphPixels(frame, 'K').length > 0, 'shoe material leaves the surrounding ink outline intact');
    }

    for (const action of ['kick', 'kneel'] as const) for (let phase = 0; phase < 6; phase++) {
      const frame = selectFootballPlayerFrame(action, view as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
        phase, false, role);
      const painted: { color: unknown }[] = [];
      const target = {
        imageSmoothingEnabled: false,
        fillStyle: '',
        fillRect() { painted.push({ color: this.fillStyle }); },
      };
      paintFootballPlayerFrame(target as unknown as CanvasRenderingContext2D, frame, 0, 0, kits[0]!);
      assert(painted.some(rect => rect.color === '#101214'),
        `${role} ${action} phase ${phase} keeps visible footwear black`);
    }
  }
});

test('upright jersey and shoulder glyph span documents the carrier body-width fit', () => {
  let maximum = 0;
  for (const role of roles) for (let view = 0; view < 9; view++) {
    const frame = selectFootballPlayerFrame('run', view as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, 0, false, role);
    const extents = frame.runs
      .filter(run => run.row >= 16 && run.row < 26 && ['J', 'j', 'H', 'K'].includes(run.color))
      .flatMap(run => [run.x, run.x + run.length - 1]);
    maximum = Math.max(maximum, Math.max(...extents) - Math.min(...extents) + 1);
  }
  assert.equal(maximum, 24, 'widest upright jersey/shoulder glyph span is 24 authored atlas pixels');
  assert.equal(maximum * PLAYER_FRAME_SCALE, CARRIER_BODY_WIDTH,
    'the nominal 0.45-scale width matches the existing carrier body width');
});
