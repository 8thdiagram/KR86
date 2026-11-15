import test from 'node:test';
import assert from 'node:assert/strict';
import { slim, turnSprite, type BodyView } from '../game/components/football-sprites';
import { kickFootballArt } from '../game/components/kick-return-renderer';
import { drawTackle } from '../game/components/football-tackle';
import { uniformKit, BALL_ART } from '../game/components/football-art';
import { createKickAttempt } from '../game/lib/kick-return-engine';
import { createFootball } from '../game/lib/football/engine';
import { beginTackle } from '../game/lib/football/tackle-scene';

const team = { body: '#b33a2a', trim: '#e6c34a' };
function canvas() {
  const pixels = new Map<string, string>();
  const calls: unknown[][] = [];
  let offset = [0, 0];
  const stack: number[][] = [];
  const target = {
    fillStyle: '',
    save() { stack.push([...offset]); },
    restore() { offset = stack.pop()!; },
    translate(x: number, y: number) {
      assert(Number.isInteger(x) && Number.isInteger(y), 'player offsets stay on the pixel grid');
      offset = [offset[0]! + x, offset[1]! + y];
    },
    rotate() { assert.fail('player anatomy must use authored poses, not canvas rotation'); },
    scale() { assert.fail('player anatomy must not be squeezed or stretched'); },
    createLinearGradient() { assert.fail('player shading must use solid pixels'); },
    fillRect(x: number, y: number, w: number, h: number) {
      assert([x, y, w, h].every(n => Number.isInteger(n * 2)), 'every player rectangle uses whole doubled-resolution pixels');
      x += offset[0]!; y += offset[1]!;
      calls.push([this.fillStyle, x, y, w, h]);
      if (this.fillStyle.startsWith('rgba')) return; // Exclude the subtle turf shadow.
      for (let u = x; u < x + w; u += .5) for (let v = y; v < y + h; v += .5)
        pixels.set(`${u},${v}`, this.fillStyle);
    },
  };
  const ctx = new Proxy(target, {
    get: (t, key) => Reflect.has(t, key) ? Reflect.get(t, key) : () => {},
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, pixels, calls };
}

test('all five body views use distinct pixel anatomy and keep team identity', () => {
  for (const dir of [-1, 1] as const) {
    const signatures = new Set<string>();
    for (const view of [0, 1, 2, 3, 4] as BodyView[]) {
      const { ctx, pixels, calls } = canvas();
      turnSprite(ctx, 100, 100, uniformKit(team, dir), view, { step: 0 });
      signatures.add(JSON.stringify([...pixels]));
      for (const color of [team.body, team.trim])
        assert([...pixels.values()].includes(color), `view ${view} retains ${color}`);
      assert(calls.length < 400, 'cached raster row runs keep the more substantial artwork bounded for mobile');
      const points = [...pixels.keys()].map(k => k.split(',').map(Number));
      assert(Math.max(...points.map(p => p[0]!)) - Math.min(...points.map(p => p[0]!)) <= 18);
      assert(Math.max(...points.map(p => p[1]!)) - Math.min(...points.map(p => p[1]!)) <= 25);
    }
    assert.equal(signatures.size, 5, 'front, quarter, side, rear-quarter and back are distinct');
  }
});

test('standing, moving and spinning players stay crisp without changing move state', () => {
  const a = createKickAttempt(86, 1);
  a.phase = 'returning';
  for (const dir of [-1, 1] as const) for (let i = 0; i < 12; i++) {
    const { ctx } = canvas(), kit = uniformKit(team, dir);
    slim(ctx, 100.2, 100.7, kit, { step: i / 3, ball: true });
    kickFootballArt.sprite(ctx, 100.2, 100.7, kit, i / 3, true);
    a.moves = { ...a.moves!, active: { kind: 'spin', side: dir, elapsed: i * .3 / 12 } };
    const before = JSON.stringify(a);
    assert(kickFootballArt.moveSprite(ctx, 100, 100, kit, i / 60, a));
    assert.equal(JSON.stringify(a), before);
  }
});

test('horizontal ground anatomy mirrors correctly and remains connected in both directions', () => {
  const silhouettes: Set<string>[] = [];
  for (const dir of [1, -1] as const) {
    const { ctx, pixels } = canvas();
    kickFootballArt.prone(ctx, 0, 0, uniformKit(team, dir), dir === 1 ? 0 : Math.PI, 0);
    const points = new Set(pixels.keys());
    silhouettes.push(points);
    const remaining = new Set(points), component: string[] = [];
    const groups: number[] = [];
    while (remaining.size) {
      const first = remaining.values().next().value!;
      remaining.delete(first); component.push(first);
      let size = 0;
      while (component.length) {
        const [x, y] = component.pop()!.split(',').map(Number); size++;
        for (let dx = -.5; dx <= .5; dx += .5) for (let dy = -.5; dy <= .5; dy += .5) {
          const key = `${x! + dx},${y! + dy}`;
          if (remaining.delete(key)) component.push(key);
        }
      }
      groups.push(size);
    }
    assert(Math.max(...groups) >= points.size * .9, 'helmet, pads and limbs must join the body');
  }
  const mirrored = [...silhouettes[0]!].map(k => {
    const [x, y] = k.split(',').map(Number); return `${-x! - .5},${y}`;
  });
  assert.deepEqual(new Set(mirrored), silhouettes[1], 'left-facing pose mirrors rectangle widths too');
});

test('tackle frames preserve the held ball and never rotate an upright cutout', () => {
  const g = createFootball(86);
  beginTackle(g, { id: 0, x: 100, y: 100, vx: 30 },
    { id: 7, x: 104, y: 104 }, 'home', 'scrimmage');
  for (const [phase, elapsed] of [['impact', 0], ['fall', .04], ['fall', .13], ['fall', .22], ['ground', 0]] as const) {
    g.tackleScene!.phase = phase; g.tackleScene!.elapsed = elapsed;
    const { ctx, pixels } = canvas(), before = JSON.stringify(g);
    drawTackle(ctx, g, team, { body: '#2867b0', trim: '#faf8ef' });
    assert.equal(JSON.stringify(g), before, 'rendering cannot change collision outcomes or timing');
    assert([...pixels.values()].some(c => [BALL_ART.leather, BALL_ART.highlight, BALL_ART.shade].includes(c as never)),
      `${phase}/${elapsed}: ball remains visible and secured during the tackle`);
  }
});
