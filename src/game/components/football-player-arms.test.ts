import test from 'node:test';
import assert from 'node:assert/strict';
import { KICK_TEAMS } from '../lib/kick-return-teams';
import { createFootball } from '../lib/football/engine';
import { startField } from '../lib/football/field';
import { footballAthletePose } from './football-player-state';
import { drawFootballPlayer } from './football-player-art';
import { positionKit, uniformKit } from './football-art';
import {
  FOOTBALL_PLAYER_FRAME_CATALOG,
  getCachedFootballPlayerFrameCount,
  selectFootballPlayerFrame,
  type FootballPlayerFrame,
} from './football-player-frames';

function armPixels(frame: FootballPlayerFrame) {
  const pixels = new Map<string, string>();
  for (const run of frame.runs) for (let x = run.x; x < run.x + run.length; x++) {
    if (run.row < 16 || run.row > 25 || (x >= 14 && x < 18)) continue;
    pixels.set(`${x},${run.row}`, run.color);
  }
  return pixels;
}
const signature = (frame: FootballPlayerFrame) => JSON.stringify([...armPixels(frame)]);
const hasHandOnEachSide = (frame: FootballPlayerFrame) => {
  const pixels = armPixels(frame);
  return ['left', 'right'].every(side => [...pixels].some(([point, color]) => {
    const x = Number(point.split(',')[0]);
    return color === 'S' && (side === 'left' ? x < 16 : x >= 16);
  }));
};

test('run arms counter-pump in two steady, opposing bent silhouettes with both hands readable', () => {
  const phases = Array.from({ length: 6 }, (_, phase) =>
    selectFootballPlayerFrame('run', 0, phase, false, 'RB'));
  assert(phases.every(hasHandOnEachSide), 'each pose keeps both skin-tone hands visible outside the torso');
  assert.equal(signature(phases[0]!), signature(phases[1]!));
  assert.equal(signature(phases[1]!), signature(phases[2]!));
  assert.equal(signature(phases[3]!), signature(phases[4]!));
  assert.equal(signature(phases[4]!), signature(phases[5]!));
  assert.notEqual(signature(phases[0]!), signature(phases[3]!), 'opposite stride has the opposite arm pump');

  const carrying = selectFootballPlayerFrame('run', 0, 1, true, 'RB');
  assert(carrying.runs.some(run => run.color === 'B'), 'one authored football remains secured in the hand');
  assert(carrying.grip);
  assert(carrying.runs.some(run => run.color === 'G'), 'the gripping hand is visibly attached to the football');
  assert([...armPixels(carrying)].some(([point, color]) => Number(point.split(',')[0]) < 16 && color === 'S'),
    'the free arm remains visible while the carrier secures the ball');
});

test('throw phases draw back, drive forward, release, and follow through without changing the body or legs', () => {
  const throws = Array.from({ length: 6 }, (_, phase) =>
    selectFootballPlayerFrame('throw', 0, phase, false, 'QB'));
  const arms = throws.map(signature);
  assert.notEqual(arms[0], arms[1], 'wind-up moves from guard into draw-back');
  assert.notEqual(arms[1], arms[2], 'draw-back transitions into the forward drive');
  assert.notEqual(arms[2], arms[3], 'release extends beyond the forward drive');
  assert.notEqual(arms[3], arms[4], 'follow-through has its own silhouette');
  assert.equal(arms[0], arms[5], 'the last pose settles back to guard');
  assert(!throws[3]!.runs.some(run => ['B', 'b', 'L', 'G', 'O'].includes(run.color)),
    'release art does not draw a second football after possession changes');
  assert(throws.slice(0, 5).every(hasHandOnEachSide), 'both arms remain distinct through the throwing sequence');
  assert(selectFootballPlayerFrame('throw', 0, 1, true, 'QB').runs.some(run => run.color === 'B'),
    'the football stays with the quarterback during draw-back');
});

test('real QB pose integration keeps .59 pre-release and selects release only at .60', () => {
  const live = startField(createFootball(86), 'slant', 'pass');
  const qb = live.athletes.find(athlete => athlete.role === 'QB')!;
  live.snapAge = .5;
  live.mode = 'dropback';
  live.holdingPass = true;
  live.holdStarted = .72;
  live.time = 1;
  const flags = { snapping: false, ball: true, engaged: false, facing: 1 as const, direction: 1 as const };
  const kit = positionKit(uniformKit(KICK_TEAMS[0]!, 1), 'QB');
  const ctx = {
    fillStyle: '', imageSmoothingEnabled: true,
    fillRect() {},
  } as unknown as CanvasRenderingContext2D;
  const drawPose = (pose: ReturnType<typeof footballAthletePose>) =>
    drawFootballPlayer(ctx, 0, 0, kit, pose);

  const held = footballAthletePose(live, qb, flags);
  assert.equal(held.progress, .59);
  assert.equal(held.ball, true);
  const heldFrame = drawPose(held);
  assert.equal(heldFrame.phase, 2, '.59 remains in the loaded, pre-release arm pose');
  assert(heldFrame.runs.some(run => run.color === 'B'));

  live.flight = { x: qb.x, y: qb.y, z: 1, fromX: qb.x, fromY: qb.y,
    toX: qb.x + 100, toY: qb.y, age: 0, duration: .8, receiver: 0, accuracy: 1 };
  const released = footballAthletePose(live, qb, { ...flags, ball: false });
  assert.equal(released.progress, .6);
  assert.equal(released.ball, false);
  const releaseFrame = drawPose(released);
  assert.equal(releaseFrame.phase, 3, '.60 selects the forward release frame at the actual flight boundary');
  assert(!releaseFrame.runs.some(run => ['B', 'b', 'L', 'G', 'O'].includes(run.color)));

  live.flight.age = .1;
  const followThrough = drawPose(footballAthletePose(live, qb, { ...flags, ball: false }));
  assert.equal(followThrough.phase, 4);
  live.flight.age = .18;
  const recovery = drawPose(footballAthletePose(live, qb, { ...flags, ball: false }));
  assert.equal(recovery.phase, 5);
});

test('catch, contact and breakthrough use bent reaches rather than permanent straight-arm poses', () => {
  const catchPose = selectFootballPlayerFrame('catch', 0, 2, false, 'WR');
  const contactPose = selectFootballPlayerFrame('block', 0, 1, false, 'OL');
  const breakthrough = selectFootballPlayerFrame('break', 0, 1, false, 'RB');
  for (const frame of [catchPose, contactPose, breakthrough]) {
    assert(hasHandOnEachSide(frame), `${frame.action} keeps two separated hands in its action pose`);
  }
  assert.notEqual(signature(catchPose), signature(contactPose));
  assert.notEqual(signature(contactPose), signature(breakthrough));
});

test('frame catalog normalizes phase keys so render cache growth stays finite', () => {
  const before = getCachedFootballPlayerFrameCount();
  const first = FOOTBALL_PLAYER_FRAME_CATALOG['0:run:1000000:0:standard'];
  const afterFirst = getCachedFootballPlayerFrameCount();
  const equivalent = FOOTBALL_PLAYER_FRAME_CATALOG['0:run:1000008:0:standard'];
  assert(first);
  assert.strictEqual(first, equivalent);
  assert(afterFirst >= before);
  assert.equal(getCachedFootballPlayerFrameCount(), afterFirst, 'equivalent phases reuse the same finite cache key');
  assert.equal(FOOTBALL_PLAYER_FRAME_CATALOG['0:run:NaN:0:standard'], undefined);
});
