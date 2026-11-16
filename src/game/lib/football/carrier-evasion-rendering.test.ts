import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_ART, UNIFORM, uniformKit } from '../../components/football-art';
import { kickFootballArt, drawKickReturn } from '../../components/kick-return-renderer';
import { drawFootball } from '../../components/football-renderer';
import { createKickAttempt } from '../kick-return-engine';
import { kickMatchupTeams } from '../kick-return-teams';
import { EVADE } from '../carrier-evasion';
import { createFootball } from './engine';
import { startField } from './field';

function drawing() {
  const paints: { color: string; x: number; y: number; w: number; h: number }[] = [];
  const target = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      paints.push({ color: String(this.fillStyle), x, y, w, h });
    },
  };
  const ctx = new Proxy(target, {
    get: (object, key) => Reflect.has(object, key) ? Reflect.get(object, key) : () => {},
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, paints };
}

function evasiveAttempt(kind: 'spin' | 'boost', side: -1 | 0 | 1, elapsed: number) {
  const attempt = createKickAttempt(86, 1);
  attempt.phase = 'returning';
  attempt.player = { x: 100, y: 100 };
  attempt.moves = {
    ...attempt.moves!,
    active: { kind, side, elapsed, evasive: true, ...(kind === 'spin' ? { duration: EVADE.spin } : {}) },
  } as unknown as NonNullable<typeof attempt.moves>;
  return attempt;
}

test('a halted carrier keeps animated running legs without forward displacement', () => {
  const a = evasiveAttempt('boost', 0, 0);
  a.moves!.active = undefined; a.moves!.hesitating = true;
  const kit = uniformKit({ body: '#b42635', trim: '#d9e2f0' }, 1);
  const first = drawing(), second = drawing();
  a.returnTime = 1;
  assert(kickFootballArt.moveSprite(first.ctx, 100, 100, kit, 0, a));
  a.returnTime = 1.2;
  assert(kickFootballArt.moveSprite(second.ctx, 100, 100, kit, 0, a));
  assert.notDeepEqual(first.paints, second.paints);
  assert.deepEqual(a.player, { x: 100, y: 100 });
});

test('evasive spin completes a directional orbit, returns to its first facing and keeps the ball tucked', () => {
  const kit = uniformKit({ body: '#b42635', trim: '#d9e2f0' }, 1);
  for (const side of [-1, 1] as const) {
    const frames = Array.from({ length: 9 }, drawing);
    const signatures: string[] = [];
    const atStart = evasiveAttempt('spin', side, 0);
    for (let index = 0; index < frames.length; index++) {
      const move = evasiveAttempt('spin', side, EVADE.spin * index / (frames.length - 1));
      const before = JSON.stringify(move);
      assert(kickFootballArt.moveSprite(frames[index]!.ctx, 100, 100, kit, 1, move));
      assert.equal(JSON.stringify(move), before, 'rendering does not mutate the move or carrier');
      signatures.push(JSON.stringify(frames[index]!.paints));
    }
    assert.equal(new Set(signatures.slice(0, -1)).size, 8, 'each directional turn segment has its own authored silhouette');
    assert.equal(signatures[0], signatures.at(-1), 'the final pose restores its exact original facing and planted stance');
    assert.notEqual(signatures[4], signatures[0], 'the athlete passes through the back-facing midpoint');
    for (const frame of frames) {
      assert(frame.paints.some(p => p.color === BALL_ART.leather), 'the football stays in the carried sprite');
      assert(frame.paints.some(p => p.color === UNIFORM.pants), 'white football pants remain visible');
      assert(frame.paints.some(p => p.color === kit.body), 'the approved team jersey remains unchanged');
    }
  }
});

test('boost has distinct coordinated stride frames and draws in the complete Classic composite', () => {
  const kit = uniformKit({ body: '#b42635', trim: '#d9e2f0' }, 1);
  const early = drawing();
  const late = drawing();
  const attempt = evasiveAttempt('boost', 0, .08);
  assert(kickFootballArt.moveSprite(early.ctx, 100, 100, kit, 1.1, attempt));
  const beforeLate = JSON.stringify(attempt);
  attempt.moves!.active = { kind: 'boost', side: 0, elapsed: .3, evasive: true } as never;
  const expectedLate = JSON.stringify(attempt);
  assert(kickFootballArt.moveSprite(late.ctx, 100, 100, kit, 2.1, attempt));
  assert.notDeepEqual(early.paints, late.paints, 'boost advances through visibly different, faster stride poses');
  assert.equal(JSON.stringify(attempt), expectedLate, 'the renderer does not mutate boost elapsed time or its move record');
  assert.notEqual(beforeLate, expectedLate, 'test samples represent distinct simulation times');
  assert(early.paints.some(p => p.color === BALL_ART.leather));
  assert(late.paints.some(p => p.color === BALL_ART.leather));

  const compositeAttempt = evasiveAttempt('boost', 0, .2);
  const compositeKit = uniformKit(kickMatchupTeams(compositeAttempt.teams).player, 1);
  const composite = drawing();
  const gameBefore = JSON.stringify(compositeAttempt);
  drawKickReturn(composite.ctx, compositeAttempt, 0);
  assert(composite.paints.some(p => p.color === BALL_ART.leather), 'full kick-return composition paints the held football');
  assert(composite.paints.some(p => p.color === compositeKit.body), 'full composition paints the unchanged carrier uniform');
  assert.equal(JSON.stringify(compositeAttempt), gameBefore, 'the full renderer does not change game state');
});

test('Full Game presents an evasive QB scramble only while he is the ball carrier', () => {
  const g = createFootball(86);
  g.phase = 'live';
  g.live = startField(g, 'draw', 'pass');
  g.live.mode = 'scramble';
  g.live.carrier = 5;
  g.live.time = 1;
  g.live.holdingPass = false;
  g.live.movement.moves = {
    ...g.live.movement.moves!,
    active: { kind: 'spin', side: -1, elapsed: EVADE.spin * .42, evasive: true, duration: EVADE.spin },
  } as unknown as NonNullable<typeof g.live.movement.moves>;
  const before = JSON.stringify(g);
  const frame = drawing();
  drawFootball(frame.ctx, g, { width: 400, height: 192, landscape: true }, 1);
  assert(frame.paints.some(p => p.color === BALL_ART.leather), 'the QB keeps the ball during a scramble spin');
  assert(frame.paints.some(p => p.color === UNIFORM.pants), 'the QB retains the authored uniform and white pants');
  assert.equal(JSON.stringify(g), before, 'Full Game presentation does not mutate football gameplay state');
});
