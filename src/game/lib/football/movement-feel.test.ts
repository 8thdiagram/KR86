import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, chooseOffense, snapFootball } from './engine';
import { footballAthletePose } from '../../components/football-player-state';
import { drawFootballPlayer } from '../../components/football-player-art';
import { updateFootballAnimation } from '../../components/football-animation-clock';
import { airBall } from '../../components/football-sprites';
import { BALL_ART } from '../../components/football-ball-art';

test('position-only movement animates feet and chooses a real strafing direction on both axes', () => {
  for (const [vx, vy] of [[40, 0], [-40, 0], [0, 40], [0, -40], [30, 30], [-30, -30]]) {
    const owner = {}, phases = new Set<number>();
    let frame;
    for (let n = 0; n <= 60; n++) {
      frame = updateFootballAnimation(owner, 'athlete', {
        now: n / 60, x: 500 + vx! * n / 60, y: 96 + vy! * n / 60,
        vx: 0, vy: 0, facing: 1,
      });
      if (frame.moving) phases.add(Math.floor(frame.phase * 4));
    }
    assert(phases.size >= 3, `${vx},${vy}: four deliberate poses are traversed`);
    if (vx === 0) {
      assert.equal(frame!.shuffling, true);
      assert.equal(frame!.view, vy! > 0 ? 0 : 4, 'actual lateral travel selects a directional body');
    }
    if (vx! < -8) assert.equal(frame!.facing, -1);
  }
});

test('real QB hold and charged-throw poses keep stepping legs in either strafe direction on both teams', () => {
  const ctx = { fillRect() {}, imageSmoothingEnabled: false } as unknown as CanvasRenderingContext2D;
  for (const offense of ['home', 'away'] as const) for (const vy of [-40, 40]) {
    for (const charging of [false, true]) {
      const g = createFootball(86); g.phase = 'play-call';
      chooseOffense(g, 'post'); snapFootball(g);
      const live = g.live!, qb = live.athletes.find(a => a.role === 'QB')!;
      live.offense = offense; live.mode = 'dropback'; live.target = 20;
      live.snapAge = 1; live.holdingPass = charging; live.holdStarted = 0;
      const phases = new Set<number>(), legs = new Set<string>();
      for (let n = 0; n <= 60; n++) {
        live.time = n / 60; qb.x = 500; qb.y = 96 + vy * n / 60; qb.vx = 0; qb.vy = vy;
        const before = JSON.stringify(live);
        const pose = footballAthletePose(live, qb, {
          snapping: false, ball: true, engaged: false, facing: 1, direction: 1,
        });
        assert.equal(pose.action, charging ? 'throw' : 'hold');
        assert.equal(pose.ball, true, 'movement must not release the ball');
        const frame = drawFootballPlayer(ctx, qb.x, qb.y, { body: '#d21f34', trim: '#eeeeee', dir: 1 }, pose);
        if (pose.locomotionStep !== undefined) {
          phases.add(pose.locomotionStep);
          assert.equal(pose.locomotionGait, 'strafe', 'pure up/down movement explicitly selects the strafe gait');
          assert.equal(frame.locomotionPhase, pose.locomotionStep, 'the actual painter consumes QB locomotion');
          assert.equal(frame.locomotionGait, 'strafe', 'the painter selects the strafe atlas rather than inferring from view');
          legs.add(JSON.stringify(frame.runs.filter(run => run.row >= 28)));
        }
        assert.equal(JSON.stringify(live), before, 'rendering never changes quarterback physics or throw timing');
      }
      assert(phases.size >= 3 && legs.size >= 3, `${offense}/${vy}/${charging}: distinct stepping legs`);
      for (let n = 61; n <= 80; n++) {
        live.time = n / 60; qb.vx = qb.vy = 0;
        const planted = footballAthletePose(live, qb, {
          snapping: false, ball: true, engaged: false, facing: 1, direction: 1,
        });
        if (n === 80) {
          assert.equal(planted.locomotionStep, undefined, 'stationary QB plants his feet');
          assert.equal(planted.locomotionGait, undefined, 'stationary pose does not retain a moving gait');
        }
      }
    }
  }
});

test('actual pass painter shows readable lace rotation over successive frames without wobbling the compact ball', () => {
  const seams = new Set<string>(), sizes = new Set<string>();
  const palette = new Set(Object.values(BALL_ART));
  for (let frame = 0; frame < 4; frame++) {
    const paints: { color: string; x: number; y: number; w: number; h: number }[] = [];
    const ctx = { fillStyle: '', fillRect(x: number, y: number, w: number, h: number) {
      paints.push({ color: this.fillStyle, x, y, w, h });
    } } as unknown as CanvasRenderingContext2D;
    airBall(ctx, 100, 100, 10, frame / 60, false);
    seams.add(JSON.stringify(paints.filter(p => p.color === BALL_ART.stripe)));
    const ball = paints.filter(p => palette.has(p.color as typeof BALL_ART.leather));
    const left = Math.min(...ball.map(p => p.x)), right = Math.max(...ball.map(p => p.x + p.w));
    const top = Math.min(...ball.map(p => p.y)), bottom = Math.max(...ball.map(p => p.y + p.h));
    sizes.add(JSON.stringify([left, right, top, bottom]));
    assert.equal(right - left, 7, 'shorter seven-pixel football');
    assert.equal(bottom - top, 5, 'compact football height');
  }
  assert.equal(sizes.size, 1, 'spiral detail moves, not the center or silhouette');
  assert(seams.size >= 3, 'visible white lace movement even within a short pass');
});
