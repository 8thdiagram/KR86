import assert from 'node:assert/strict';
import test from 'node:test';
import { selectFootballPlayerFrame } from './football-player-frames';
import { CARRIER_BODY_WIDTH, PLAYER_RASTER_SCALE } from '../lib/player-dimensions';

function bounds(frame: ReturnType<typeof selectFootballPlayerFrame>) {
  const left = Math.min(...frame.runs.map(run => run.x));
  const right = Math.max(...frame.runs.map(run => run.x + run.length));
  const top = Math.min(...frame.runs.map(run => run.row));
  const bottom = Math.max(...frame.runs.map(run => run.row + 1));
  return { width: right - left, height: bottom - top };
}

function glyphBounds(frame: ReturnType<typeof selectFootballPlayerFrame>, glyph: string) {
  const metrics = colorMetrics(frame, [glyph]);
  return { x: (metrics.left + metrics.right) / 2, y: (metrics.top + metrics.bottom) / 2 };
}

function colorMetrics(frame: ReturnType<typeof selectFootballPlayerFrame>, colors: readonly string[]) {
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
  };
}

test('shared player scale and carrier width remain in sync at the modest reduction', () => {
  assert.equal(PLAYER_RASTER_SCALE, 0.45);
  assert.equal(CARRIER_BODY_WIDTH, 10.8);
});

test('prone silhouettes preserve their authored horizontal, vertical and diagonal directions', () => {
  for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const standingFrame = selectFootballPlayerFrame('stance', view, 0, false, 'DL');
    const standing = bounds(standingFrame);
    const standingLength = Math.max(standing.width, standing.height);
    const standingHelmet = colorMetrics(standingFrame, ['M', 'm', 'T']);
    const launch = selectFootballPlayerFrame('dive', view, 0, false, 'DL');
    const actionFrames = [
      selectFootballPlayerFrame('dive', view, 3, false, 'DL'), // airborne
      selectFootballPlayerFrame('fall', view, 5, false, 'DL'), // impact
      selectFootballPlayerFrame('ground', view, 5, false, 'DL'), // down
      selectFootballPlayerFrame('fall', view, 2, false, 'DL'), // recovery
    ];

    for (const frame of actionFrames) {
      const silhouette = bounds(frame);
      const horizontal = view === 0 || view === 4;
      const vertical = view === 2 || view === 6;
      const bodyLength = horizontal ? silhouette.width
        : vertical ? silhouette.height
          : Math.hypot(silhouette.width, silhouette.height);
      assert(bodyLength >= standingLength * 0.78,
        `${view}/${frame.action} should preserve full-body length along its authored direction`);
      assert(bodyLength <= standingLength * 1.12,
        `${view}/${frame.action} should stay within the shared player scale`);

      const aspect = silhouette.width / silhouette.height;
      if (horizontal) assert(aspect >= 1.12 && aspect <= 1.45,
        `${view}/${frame.action} should remain broad and horizontal, got ${aspect.toFixed(2)}`);
      else if (vertical) assert(aspect <= 0.8 && aspect >= 0.52,
        `${view}/${frame.action} should remain a narrow vertical body, got ${aspect.toFixed(2)}`);
      else assert(aspect >= 0.78 && aspect <= 1.08,
        `${view}/${frame.action} should retain balanced diagonal anatomy, got ${aspect.toFixed(2)}`);

      const pixelArea = frame.runs.reduce((sum, run) => sum + run.length, 0);
      const areaRatio = pixelArea / standingFrame.runs.reduce((sum, run) => sum + run.length, 0);
      assert(areaRatio >= 0.78 && areaRatio <= 1.15,
        `${view}/${frame.action} body pixel area should remain comparable to standing, got ${areaRatio.toFixed(2)}`);

      const helmet = colorMetrics(frame, ['M', 'm', 'T']);
      assert(helmet.width >= standingHelmet.width * 0.82,
        `${view}/${frame.action} helmet width should match the standing head`);
      assert(helmet.height >= standingHelmet.height * 0.7,
        `${view}/${frame.action} helmet height should match the standing head`);
      const helmetAreaRatio = helmet.area / standingHelmet.area;
      assert(helmetAreaRatio >= 0.7 && helmetAreaRatio <= 1.3,
        `${view}/${frame.action} helmet pixel area should match standing, got ${helmetAreaRatio.toFixed(2)}`);

      const poseArea = frame.runs.reduce((sum, run) => sum + run.length, 0);
      const launchArea = launch.runs.reduce((sum, run) => sum + run.length, 0);
      assert(poseArea / launchArea >= 0.78,
        `${view}/${frame.action} should not lose full-body pixel volume from launch`);
    }
  }
});

test('held football stays registered to the same prone hand through dive and recovery sheets', () => {
  for (const view of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const frames = [
      selectFootballPlayerFrame('dive', view, 3, true, 'DL'),
      selectFootballPlayerFrame('fall', view, 5, true, 'DL'),
      selectFootballPlayerFrame('ground', view, 5, true, 'DL'),
    ];
    const reference = frames[0]!;
    const ball = glyphBounds(reference, 'B');
    const hand = glyphBounds(reference, 'G');
    for (const frame of frames.slice(1)) {
      assert.deepEqual(glyphBounds(frame, 'B'), ball, `${view}/${frame.action}: ball position`);
      assert.deepEqual(glyphBounds(frame, 'G'), hand, `${view}/${frame.action}: hand position`);
      assert.deepEqual(frame.grip, reference.grip, `${view}/${frame.action}: shared grip anchor`);
    }
  }
});
