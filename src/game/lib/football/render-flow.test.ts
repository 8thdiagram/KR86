import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, chooseOffense, snapFootball } from './engine';
import { releasePass } from './passing';
import { captureFootballRender, withFootballRenderInterpolation } from './render-interpolation';
import { stepRenderCamera } from './render-camera';
import { footballFlightPixels, BALL_ART } from '../../components/football-ball-art';
import { drawCachedFootballPitch } from '../../components/football-pitch-cache';
import { broadcastFieldContext, projectBroadcastPoint } from '../../components/football-broadcast';
import { footballAthletePose } from '../../components/football-player-state';

test('passes and their flight clock share continuous fractional render samples without altering physics', () => {
  const g = createFootball(86); g.phase = 'play-call'; chooseOffense(g, 'post'); snapFootball(g);
  g.live!.time = .6; g.live!.snapAge = .6; releasePass(g, 'normal');
  const f = g.live!.flight; assert(f);
  const x = f.x, y = f.y, z = f.z, age = f.age, previous = captureFootballRender(g);
  f.x += 8; f.y += 2; f.z += 4; f.age += 1 / 60;
  const authoritative = JSON.stringify(g);
  for (const alpha of [0, .25, .5, .75, 1]) {
    withFootballRenderInterpolation(g, previous, alpha, () => {
      assert.equal(g.live!.flight, f);
      assert.equal(f.x, x + 8 * alpha); assert.equal(f.y, y + 2 * alpha);
      assert.equal(f.z, z + 4 * alpha); assert.equal(f.age, age + alpha / 60);
    });
    assert.equal(JSON.stringify(g), authoritative);
  }
});

test('a replaced special-team ball interpolates the visible object and restores its identity and arc', () => {
  const g = createFootball(86); g.phase = 'kickoff';
  g.special = { kind: 'full', stage: 'flight', age: 1, stageAge: .5, receiver: 'home', kicking: 'away',
    fromX: 1000, fromY: 96, toX: 500, toY: 100, ball: { x: 900, y: 97, z: 30 },
    duration: 2, athletes: [], kicker: 0, returner: 1 };
  const old = g.special.ball, previous = captureFootballRender(g);
  const current = g.special.ball = { x: 892, y: 98, z: 34 };
  const authoritative = JSON.stringify(g);
  withFootballRenderInterpolation(g, previous, .5, () => {
    assert.equal(g.special!.ball, current);
    assert.deepEqual(current, { x: 896, y: 97.5, z: 32 });
    assert.deepEqual(old, { x: 900, y: 97, z: 30 });
  });
  assert.equal(JSON.stringify(g), authoritative);
});

test('CPU quarterbacks visibly draw back before their existing read deadline without changing that deadline', () => {
  const g = createFootball(86); g.phase = 'play-call'; chooseOffense(g, 'post'); snapFootball(g);
  const live = g.live!, qb = live.athletes.find(a => a.role === 'QB')!;
  live.offense = 'away'; live.mode = 'dropback'; live.target = 1; live.time = .9;
  const flags = { snapping: false, ball: true, engaged: false, facing: 1 as const, direction: 1 as const };
  const before = JSON.stringify(live), pose = footballAthletePose(live, qb, flags);
  assert.equal(pose.action, 'throw'); assert.equal(pose.ball, true);
  assert(pose.progress! > .18 && pose.progress! < .59);
  assert.equal(JSON.stringify(live), before, 'the wind-up is presentation only');
});

test('diving motion interpolates within a phase but never rewinds a new contact phase', () => {
  const g = createFootball(86); g.phase = 'play-call'; chooseOffense(g, 'post'); snapFootball(g);
  const actor = g.live!.athletes[3]!;
  actor.dive = { phase: 'windup', elapsed: .02 } as typeof actor.dive;
  const previous = captureFootballRender(g); actor.dive!.elapsed = .04;
  withFootballRenderInterpolation(g, previous, .5, () => assert.equal(actor.dive!.elapsed, .03));
  assert.equal(actor.dive!.elapsed, .04);
  actor.dive!.phase = 'airborne'; actor.dive!.elapsed = 0;
  withFootballRenderInterpolation(g, previous, .5, () => assert.equal(actor.dive!.elapsed, 0));
});

test('carrier animation clocks share visual time and are not double-blended when return state is aliased', () => {
  const g = createFootball(86); g.phase = 'play-call'; chooseOffense(g, 'post'); snapFootball(g);
  const movement = g.live!.movement; g.returnAttempt = movement;
  movement.time = 0; movement.returnTime = 0;
  const previous = captureFootballRender(g);
  movement.time = .02; movement.returnTime = .02;
  withFootballRenderInterpolation(g, previous, .5, () => {
    assert.equal(movement.time, .01); assert.equal(movement.returnTime, .01);
  });
  assert.equal(movement.time, .02); assert.equal(movement.returnTime, .02);
});

test('camera tracking is frame-rate independent at 30, 60 and 120 Hz and matches steady running speed', () => {
  const results: number[] = [];
  for (const hz of [30, 60, 120]) {
    let cam = stepRenderCamera(undefined, 300, 0, 220, 1200, 360);
    for (let i = 1; i <= hz * 2; i++)
      cam = stepRenderCamera(cam, 300 + 120 * i / hz, i * 1000 / hz, 220, 1200, 360 + 120 * i / hz);
    assert(Math.abs(cam.velocity - 120) < .001);
    assert(Math.abs(cam.x - 528) < .001, 'steady tracking keeps its predictable 12-world-unit cushion');
    results.push(cam.x);
  }
  assert(Math.max(...results) - Math.min(...results) < 1e-8);
});

test('camera ignores tiny resting corrections and eases a real reversal without velocity spikes', () => {
  let cam = stepRenderCamera(undefined, 400, 0, 240, 1200);
  for (let i = 1; i <= 60; i++) cam = stepRenderCamera(cam, 400 + (i % 2 ? .12 : -.12), i * 1000 / 60, 240, 1200);
  assert.equal(cam.x, 400);
  let maxStep = 0;
  for (let i = 1; i <= 120; i++) {
    const target = 400 + 140 * (i <= 60 ? i / 60 : 2 - i / 60);
    const next = stepRenderCamera(cam, target, 1000 + i * 1000 / 60, 240, 1200);
    maxStep = Math.max(maxStep, Math.abs(next.x - cam.x)); cam = next;
  }
  assert(maxStep <= 140 / 60 + .001);
});

test('football rotation has centered solid-pixel shading, bounded cels and no wide-to-tall hopping', () => {
  const palette = new Set(Object.values(BALL_ART)); const widths: number[] = [];
  for (let phase = 0; phase < 32; phase++) {
    const frame = footballFlightPixels(true, phase / 32);
    assert.equal(frame, footballFlightPixels(true, 1000 + phase / 32));
    assert(frame.every(p => Number.isInteger(p.x) && Number.isInteger(p.y) && p.width >= 1 && palette.has(p.color)));
    const min = Math.min(...frame.map(p => p.x)), max = Math.max(...frame.map(p => p.x + p.width - 1));
    assert.equal(min + max, 0); widths.push(max - min + 1);
  }
  assert(widths.every((w, i) => Math.abs(w - widths[(i + 1) % widths.length]!) <= 2));
});

test('native pitch paint is reused at full density and evicted instead of growing through seasons', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let created = 0, painted = 0; const surfaces: HTMLCanvasElement[] = [];
  const native = { imageSmoothingEnabled: true, setTransform: (...args: number[]) => assert.equal(args[0], 2) };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => {
    created++; return { width: 0, height: 0, getContext: () => native };
  } } });
  const ctx = { drawImage: (surface: HTMLCanvasElement) => surfaces.push(surface) } as unknown as CanvasRenderingContext2D;
  const paint = () => { painted++; };
  try {
    for (const key of ['flow-a', 'flow-a', 'flow-b', 'flow-a', 'flow-c', 'flow-a', 'flow-b'])
      assert(drawCachedFootballPitch(ctx, key, paint));
    assert.equal(created, 4); assert.equal(painted, 4);
    assert.equal(surfaces[0], surfaces[1]); assert.equal(surfaces[0], surfaces[5]);
    assert.equal(surfaces[0]!.width, 2400); assert.equal(surfaces[0]!.height, 384);
    assert.equal(native.imageSmoothingEnabled, false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete (globalThis as { document?: unknown }).document;
  }
});

test('affine crowd optimization retains the exact original pixels, including field boundary crossings', () => {
  const pixels = (rects: number[][]) => {
    const points = new Set<string>();
    for (const [x, y, w, h] of rects) for (let row = y!; row < y! + h!; row++)
      for (let col = x!; col < x! + w!; col++) points.add(`${col}:${row}`);
    return points;
  };
  for (const [x, y, w, h] of [[5, 0, 3, 8], [10, 174, 8, 10], [20, 14, 7, 10], [30, 40, 3, 90]]) {
    const actual: number[][] = [], expected: number[][] = [], view = { centerX: 50 };
    const raw = { getTransform: () => ({ a: 1, d: 1, e: 0, f: 0 }),
      fillRect: (...args: number[]) => actual.push(args) } as unknown as CanvasRenderingContext2D;
    broadcastFieldContext(raw, view).fillRect(x!, y!, w!, h!);
    const boundaries = [y!, ...[18, 174].filter(b => b > y! && b < y! + h!), y! + h!];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const a = projectBroadcastPoint(x!, boundaries[i]!, view), b = projectBroadcastPoint(x! + w!, boundaries[i]!, view);
      const c = projectBroadcastPoint(x!, boundaries[i + 1]!, view), d = projectBroadcastPoint(x! + w!, boundaries[i + 1]!, view);
      const y0 = Math.round(a.y), y1 = Math.round(c.y);
      for (let row = y0; row < y1; row++) {
        const t = (row + .5 - y0) / (y1 - y0), left = Math.round(a.x + (c.x - a.x) * t);
        const right = Math.round(b.x + (d.x - b.x) * t);
        if (right > left) expected.push([left, row, right - left, 1]);
      }
    }
    assert.deepEqual(pixels(actual), pixels(expected));
    if (y === 0 || y === 174) assert.equal(actual.length, 1);
  }
});
