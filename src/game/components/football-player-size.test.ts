import assert from 'node:assert/strict';
import test from 'node:test';
import {
  footballPlayerGrip,
  paintFootballPlayerFrame,
  selectFootballPlayerFrame,
  PLAYER_FRAME_SCALE,
} from './football-player-frames';
import { CARRIER_BODY_WIDTH, PLAYER_RASTER_SCALE } from '../lib/player-dimensions';

type Frame = ReturnType<typeof selectFootballPlayerFrame>;
function bounds(frame: Frame) {
  const left = Math.min(...frame.runs.map(run => run.x));
  const right = Math.max(...frame.runs.map(run => run.x + run.length));
  const top = Math.min(...frame.runs.map(run => run.row));
  const bottom = Math.max(...frame.runs.map(run => run.row + 1));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function colorMetrics(frame: Frame, colors: readonly string[]) {
  const runs = frame.runs.filter(run => colors.includes(run.color));
  assert(runs.length, `expected authored ${colors.join('/')} pixels`);
  const left = Math.min(...runs.map(run => run.x));
  const right = Math.max(...runs.map(run => run.x + run.length));
  const top = Math.min(...runs.map(run => run.row));
  const bottom = Math.max(...runs.map(run => run.row + 1));
  return {
    left, right, top, bottom,
    width: right - left,
    height: bottom - top,
    area: runs.reduce((sum, run) => sum + run.length, 0),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function coloredPixels(frame: Frame, colors: readonly string[]) {
  const pixels = new Set<string>();
  for (const run of frame.runs) {
    if (!colors.includes(run.color)) continue;
    for (let x = run.x; x < run.x + run.length; x++) pixels.add(`${x},${run.row}`);
  }
  return pixels;
}

function touches(first: ReadonlySet<string>, second: ReadonlySet<string>) {
  for (const pixel of first) {
    const [x, y] = pixel.split(',').map(Number);
    if (second.has(`${x - 1},${y}`) || second.has(`${x + 1},${y}`)
      || second.has(`${x},${y - 1}`) || second.has(`${x},${y + 1}`)) return true;
  }
  return false;
}

function silhouetteLength(frame: Frame, view: number) {
  const shape = bounds(frame);
  if (view === 0 || view === 4) return shape.width;
  if (view === 2 || view === 6) return shape.height;
  return Math.hypot(shape.width, shape.height);
}

function paintedPixels(frame: Frame, direction: 1 | -1, x: number, y: number) {
  const rects: Array<{ color: string; x: number; y: number; width: number; height: number }> = [];
  const ctx = {
    fillStyle: '',
    imageSmoothingEnabled: true,
    fillRect(left: number, top: number, width: number, height: number) {
      rects.push({ color: this.fillStyle, x: left, y: top, width, height });
    },
  } as unknown as CanvasRenderingContext2D;
  paintFootballPlayerFrame(ctx, frame, x, y, {
    body: '#9b263f', trim: '#ead8a5', dir: direction,
  } as Parameters<typeof paintFootballPlayerFrame>[4], 0, direction);
  return rects;
}

const footprintKey = (rect: { color: string; x: number; y: number; width: number; height: number }) =>
  [rect.color, rect.x.toFixed(3), rect.y.toFixed(3), rect.width.toFixed(3), rect.height.toFixed(3)].join(':');

test('shared player scale and carrier width remain unchanged', () => {
  assert.equal(PLAYER_RASTER_SCALE, 0.45);
  assert.equal(PLAYER_FRAME_SCALE, 0.45);
  assert.equal(CARRIER_BODY_WIDTH, 10.8);
});

test('full-sized prone anatomy survives launch, airborne, impact, ground and recovery in every direction', () => {
  for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const standing = selectFootballPlayerFrame('stance', view, 0, false, 'DL');
    const standingBounds = bounds(standing);
    const standingLength = Math.max(standingBounds.width, standingBounds.height);
    const standingArea = standing.runs.reduce((sum, run) => sum + run.length, 0);
    const standingHelmet = colorMetrics(standing, ['M', 'm', 'T']);
    const stages = [
      { label: 'launch', frame: selectFootballPlayerFrame('dive', view, 0, false, 'DL'), prone: false },
      { label: 'airborne', frame: selectFootballPlayerFrame('dive', view, 3, false, 'DL'), prone: true },
      { label: 'impact', frame: selectFootballPlayerFrame('fall', view, 5, false, 'DL'), prone: true },
      { label: 'ground', frame: selectFootballPlayerFrame('ground', view, 5, false, 'DL'), prone: true },
      { label: 'recovery', frame: selectFootballPlayerFrame('fall', view, 2, false, 'DL'), prone: true },
    ];

    for (const { label, frame, prone } of stages) {
      const shape = bounds(frame);
      const length = prone
        ? silhouetteLength(frame, view)
        : Math.max(shape.width, shape.height);
      const area = frame.runs.reduce((sum, run) => sum + run.length, 0);
      const helmet = colorMetrics(frame, ['M', 'm', 'T']);
      assert(length >= standingLength * (prone ? 0.9 : 0.92),
        `${view}/${label}: full-body axis is ${length}px versus upright ${standingLength}px`);
      const diagonal = view !== 0 && view !== 2 && view !== 4 && view !== 6;
      assert(length <= standingLength * (prone && diagonal ? 1.22 : 1.16),
        `${view}/${label}: body should retain natural directional foreshortening`);
      assert(area >= standingArea * (prone ? 0.9 : 0.85),
        `${view}/${label}: body volume ${area}/${standingArea} regressed toward the old shrink`);
      assert(area <= standingArea * 1.4,
        `${view}/${label}: body volume should remain recognizably the same athlete`);
      assert(helmet.width >= standingHelmet.width * 0.82,
        `${view}/${label}: helmet shell width must not shrink`);
      assert(helmet.height >= standingHelmet.height * 0.7,
        `${view}/${label}: helmet shell height must not shrink`);
      assert(helmet.area / standingHelmet.area >= 0.7 && helmet.area / standingHelmet.area <= 1.3,
        `${view}/${label}: helmet mask, stripe and shading retain their authored scale`);

      if (!prone) continue;
      const aspect = shape.width / shape.height;
      if (view === 0 || view === 4) assert(aspect >= 1.15 && aspect <= 1.45,
        `${view}/${label}: horizontally extended anatomy, got ${aspect.toFixed(2)}`);
      else if (view === 2 || view === 6) assert(aspect <= 0.8 && aspect >= 0.52,
        `${view}/${label}: end-on anatomy remains upright and narrow, got ${aspect.toFixed(2)}`);
      else assert(aspect >= 0.72 && aspect <= 1.12,
        `${view}/${label}: diagonal anatomy keeps balanced foreshortening, got ${aspect.toFixed(2)}`);

      const torso = colorMetrics(frame, ['J', 'j']);
      const pants = colorMetrics(frame, ['W', 'w']);
      assert(torso.area >= 36 && Math.max(torso.width, torso.height) >= 10,
        `${view}/${label}: torso must read as a full-length uniformed body`);
      assert(pants.area >= 24 && Math.max(pants.width, pants.height) >= 8,
        `${view}/${label}: legs and pants must retain adult-athlete proportions`);
    }
  }
});

test('football and hand grip stay registered through every carry stage and mirror direction', () => {
  const stages = [
    ['dive', 0], // launch
    ['dive', 3], // airborne
    ['fall', 5], // impact
    ['ground', 5],
    ['fall', 2], // recovery
  ] as const;
  for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    for (const [action, phase] of stages) {
      const frame = selectFootballPlayerFrame(action, view, phase, true, 'DL');
      const ball = colorMetrics(frame, ['O', 'B', 'b', 'L']);
      const hand = colorMetrics(frame, ['G']);
      assert(frame.grip, `${view}/${action}/${phase}: possession has a grip anchor`);
      if (action === 'dive' && phase < 2)
        assert.deepEqual(frame.grip, { x: 24, y: 24 }, 'upright launch possession retains its established grip');
      assert(frame.grip.x >= ball.left && frame.grip.x < ball.right
        && frame.grip.y >= ball.top && frame.grip.y < ball.bottom,
      `${view}/${action}/${phase}: grip anchor remains inside the authored football`);
      if (action !== 'dive' || phase >= 2) {
        assert(
          Math.min(Math.abs(hand.centerX - ball.left), Math.abs(hand.centerX - ball.right)) <= 2,
          `${view}/${action}/${phase}: prone hand contacts the football edge`,
        );
      }
      assert.deepEqual(
        footballPlayerGrip(frame, -1),
        { x: ((frame.anchorX ?? 16) * 2 - frame.grip.x) * PLAYER_FRAME_SCALE, y: frame.grip.y * PLAYER_FRAME_SCALE },
        `${view}/${action}/${phase}: mirrored grip uses the frame's true anchor`,
      );
    }
  }
});

test('horizontal prone possession mirrors as a complete frame and stays tucked to the torso', () => {
  const stages = [
    ['dive', 3],
    ['fall', 5],
    ['ground', 5],
    ['fall', 2],
  ] as const;
  for (const [action, phase] of stages) {
    const right = selectFootballPlayerFrame(action, 0, phase, true, 'DL');
    const left = selectFootballPlayerFrame(action, 4, phase, true, 'DL');
    assert.equal(right.width, 44);
    assert.equal(left.width, 44);
    const reflectedRuns = right.runs.map(run => [
      run.row, right.width - run.x - run.length, run.length, run.color,
    ].join(':')).sort();
    assert.deepEqual(
      left.runs.map(run => [run.row, run.x, run.length, run.color].join(':')).sort(),
      reflectedRuns,
      `${action}/${phase}: entire ball-bearing body reflects across the wide frame`,
    );
    assert(right.grip && left.grip);
    assert.equal(left.grip.x, right.width - right.grip.x, `${action}/${phase}: grip reflects with the ball`);
    assert.equal(left.grip.y, right.grip.y, `${action}/${phase}: grip keeps the same vertical registration`);

    for (const frame of [right, left]) {
      const ball = coloredPixels(frame, ['O', 'B', 'b', 'L']);
      const hand = coloredPixels(frame, ['G']);
      const uniform = coloredPixels(frame, ['J', 'j', 'W', 'w']);
      assert(touches(ball, hand), `${action}/${phase}: hand touches the football`);
      assert(touches(ball, uniform), `${action}/${phase}: ball remains tucked against the uniformed torso`);
    }
  }
});

test('painted left/right poses mirror exactly around their anchor at varied world positions', () => {
  for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    for (const frame of [
      selectFootballPlayerFrame('dive', view, 3, true, 'DL'),
      selectFootballPlayerFrame('ground', view, 5, true, 'DL'),
    ]) {
      for (const x of [-47, 0, 193]) {
        const right = paintedPixels(frame, 1, x, 31);
        const left = paintedPixels(frame, -1, x, 31);
        const expectedMirror = right.map(rect => footprintKey({
          ...rect,
          x: 2 * x - rect.x - rect.width,
        })).sort();
        assert.deepEqual(
          left.map(footprintKey).sort(),
          expectedMirror,
          `${view}/${frame.action}: mirrored sprite footprint at x=${x}`,
        );
      }
    }
  }
});
