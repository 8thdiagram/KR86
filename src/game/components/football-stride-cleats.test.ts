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
      const expectedSoleRows = action === 'jump' ? [38, 39] : [40, 41];
      const soleInk = glyphPixels(frame, 'K').filter(pixel =>
        pixel.y >= expectedSoleRows[0]! && pixel.y <= expectedSoleRows[1]!);
      assert(soleInk.length > 0, `${role} ${action} view ${view} retains its authored shoe contour`);
      assert(soleInk.every(pixel => pixel.y >= expectedSoleRows[0]! && pixel.y <= expectedSoleRows[1]!),
        `${role} ${action} shoe pixels retain the authored foot anchor${action === 'jump' ? ' while raised' : ''}`);
      const sockPixels = glyphPixels(frame, 'W');
      assert(sockPixels.some(sock => soleInk.some(sole =>
        Math.abs(sock.x - sole.x) <= 2 && sock.y >= 36 && sock.y < sole.y)),
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

test('six authored stride poses visibly alternate their shoe positions in all travel directions', () => {
  for (let view = 0; view < 9; view++) {
    const centers = Array.from({ length: 6 }, (_, phase) => {
      const cleats = glyphPixels(
        selectFootballPlayerFrame('run', view as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, phase, false, 'RB'),
        'K',
      ).filter(pixel => pixel.y === 40 || pixel.y === 41);
      assert(cleats.length > 0, `direction ${view}, phase ${phase} has visible shoe material`);
      return cleats.reduce((sum, pixel) => sum + pixel.x, 0) / cleats.length;
    });
    assert(new Set(centers.map(center => center.toFixed(2))).size >= 4,
      `direction ${view} cycles through distinct alternating foot placements`);
  }
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
      .filter(run => run.row >= 16 && run.row < 28 && ['J', 'j', 'H', 'K'].includes(run.color))
      .flatMap(run => [run.x, run.x + run.length - 1]);
    maximum = Math.max(maximum, Math.max(...extents) - Math.min(...extents) + 1);
  }
  assert.equal(maximum, 24, 'widest upright jersey/shoulder glyph span is 24 authored atlas pixels');
  assert.equal(maximum * PLAYER_FRAME_SCALE, CARRIER_BODY_WIDTH,
    'the nominal 0.45-scale width matches the existing carrier body width');
});
