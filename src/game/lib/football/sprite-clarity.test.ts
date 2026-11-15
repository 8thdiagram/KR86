import test from 'node:test';
import assert from 'node:assert/strict';
import { helmetColor, UNIFORM, uniformKit } from '../../components/football-art';
import { slim } from '../../components/football-sprites';
import { drawTackle } from '../../components/football-tackle';
import { drawKickReturn, kickFootballArt } from '../../components/kick-return-renderer';
import { KICK_TEAMS } from '../kick-return-teams';
import { createKickAttempt } from '../kick-return-engine';
import { createFootball } from './engine';
import { beginTackle } from './tackle-scene';

function canvas() {
  const paints: { color: string; x: number; y: number; w: number; h: number }[] = [];
  const target = { fillStyle: '', fillRect(x: number, y: number, w: number, h: number) {
    paints.push({ color: this.fillStyle, x, y, w, h });
  } };
  const ctx = new Proxy(target, { get: (t, k) => Reflect.has(t, k) ? Reflect.get(t, k) : () => {} }) as unknown as CanvasRenderingContext2D;
  return { ctx, paints };
}

test('uniforms use bright white pants and clean secondary helmet shells in every facing', () => {
  for (const channel of [1, 3, 5]) {
    assert(parseInt(UNIFORM.pants.slice(channel, channel + 2), 16) >= 245);
    assert(parseInt(UNIFORM.pantsShade.slice(channel, channel + 2), 16) >= 210);
  }
  for (const dir of [-1, 1] as const) for (const team of KICK_TEAMS) {
    const kit = uniformKit(team, dir);
    for (const view of [undefined, 0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const a = canvas();
      slim(a.ctx, 100, 100, kit, { view, step: 0 });
      const shell = a.paints.filter(p => p.y < 96 && p.color === helmetColor(kit));
      assert(shell.reduce((area, p) => area + p.w * p.h, 0) >= 8,
        `${team.name}/${dir}/${view}: a substantial secondary helmet built from crisp raster rows`);
      assert(a.paints.some(p => p.color === UNIFORM.pants), 'white pants remain visible');
    }
  }
});

test('downed sprites have no surrounding shadow bars or detached tackle accents', () => {
  const kit = uniformKit(KICK_TEAMS[0]!, 1);
  for (const angle of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    const { ctx, paints } = canvas();
    kickFootballArt.prone(ctx, 100, 100, kit, angle, 0);
    assert(paints.filter(p => p.color.startsWith('rgba(')).every(p =>
      p.y >= 100 && p.h <= 1 && p.w <= 16), 'only compact turf-contact pixels, never surrounding lines or impact rays');
    assert(paints.some(p => p.color === UNIFORM.pants));
  }
  const g = createFootball(86);
  beginTackle(g, { id: 11, x: 100, y: 100, vx: 24 }, { id: 3, x: 106, y: 98, vx: -18 }, 'home', 'scrimmage');
  for (const [phase, elapsed] of [['impact', 0], ['fall', .23], ['ground', 0]] as const) {
    g.tackleScene!.phase = phase; g.tackleScene!.elapsed = elapsed;
    const { ctx, paints } = canvas(), before = JSON.stringify(g);
    drawTackle(ctx, g, uniformKit(KICK_TEAMS[0]!, 1), uniformKit(KICK_TEAMS[1]!, -1));
    assert(!paints.some(p => ['#b5ae74', '#f1e6d0', 'rgba(241,230,208,.85)'].includes(p.color)));
    assert.equal(JSON.stringify(g), before);
  }
  const attempt = createKickAttempt(86, 1);
  attempt.phase = 'tackled';
  const { ctx, paints } = canvas(), before = JSON.stringify(attempt);
  drawKickReturn(ctx, attempt, .3, false, { width: 320, height: 192 });
  assert(!paints.some(p => p.w === 2 && p.h === 160), 'no full-field line through the downed runner');
  assert.equal(JSON.stringify(attempt), before);
});
