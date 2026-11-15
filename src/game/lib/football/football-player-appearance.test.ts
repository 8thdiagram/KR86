import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFootballPlayer } from '../../components/football-player-art';
import { helmetColor, positionKit, uniformKit, type FootballKit } from '../../components/football-art';
import { drawPixelEnlarged, PLAYER_ART_SCALE } from '../../components/football-pixel-scale';
import { kickFootballArt } from '../../components/kick-return-renderer';

function canvas() {
  const paints: { color: string; x: number; y: number; w: number; h: number }[] = [];
  const pixels = new Map<string, string>();
  const ctx = new Proxy({ fillStyle: '', fillRect(x: number, y: number, w: number, h: number) {
    paints.push({ color: this.fillStyle, x, y, w, h });
    for (let px = x; px < x + w; px += .5) for (let py = y; py < y + h; py += .5)
      pixels.set(`${px},${py}`, this.fillStyle);
  } }, {
    get: (target, key) => Reflect.has(target, key) ? Reflect.get(target, key) : () => {},
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, paints, pixels };
}

test('player-art scale is modestly reduced and keeps the foot anchor fixed', () => {
  assert.equal(PLAYER_ART_SCALE, 1.035, 'about eight percent smaller than the prior 1.125 art scale');
  const { ctx, paints } = canvas();
  drawPixelEnlarged(ctx, 50, 40, (target, x, y) => {
    target.fillStyle = '#234567';
    target.fillRect(x - 20, y - 20, 14, 26);
    target.fillRect(x, y + 6, 1, 1);
  }, 6);
  const body = paints[0]!;
  const foot = paints[1]!;
  assert.equal(foot.x, 50);
  assert.equal(foot.y, 46, 'the anchor at y + 6 does not move');
  assert(body.w < 16 && body.h <= 27, 'the scaled silhouette stays compact around that anchor');
});

test('upright facemasks use shell-color rails around a real skin opening', () => {
  const kit: FootballKit = positionKit(uniformKit({ body: '#cb353d', trim: '#f3eee3' }, 1), 'WR');
  const { ctx, paints, pixels } = canvas();
  drawFootballPlayer(ctx, 100, 100, kit);
  const skin = paints.find(p => p.color === kit.skin && p.y < 91);
  assert(skin, 'a small skin opening is visible');
  assert(skin.w <= 2 && skin.h <= 2, 'face opening remains a single compact pixel');
  assert.equal(pixels.get(`${skin.x},${skin.y}`), kit.skin, 'skin is not covered by a dark panel');
  const shell = helmetColor(kit);
  assert(paints.some(p => p.color === shell && p.y < skin.y && p.w >= 3), 'brow rail frames the opening');
  assert(paints.filter(p => p.color === shell && p.x < skin.x && p.y >= skin.y && p.y <= skin.y + 1).length,
    'one cheek rail sits to the left of the face');
  assert(paints.filter(p => p.color === shell && p.x >= skin.x + skin.w && p.y >= skin.y && p.y <= skin.y + 1).length,
    'a separated cheek rail sits to the right of the face');
  assert(paints.some(p => p.color === shell && p.y === skin.y + skin.h && p.w >= 3), 'chin rail remains distinct');
});

test('prone facemasks keep the shell-colored cage and exposed skin slot', () => {
  const kit = positionKit(uniformKit({ body: '#cb353d', trim: '#f3eee3' }, -1), 'WR');
  for (const angle of [0, Math.PI / 2]) {
    const { ctx, paints, pixels } = canvas();
    kickFootballArt.prone(ctx, 100, 100, kit, angle, 0);
    assert(paints.some(p => p.color === kit.skin), `prone face stays visible at ${angle}`);
    assert(paints.filter(p => p.color === helmetColor(kit)).length >= 5,
      `prone shell and separated cage rails remain legible at ${angle}`);
    const face = paints.find(p => p.color === kit.skin)!;
    assert.notEqual(pixels.get(`${face.x},${face.y}`), '#10213a', `no dark face panel covers skin at ${angle}`);
  }
});

test('upright cages project beyond the shell with an open field-colored gap', () => {
  for (const dir of [-1, 1] as const) {
    const kit = uniformKit({ body: '#cb353d', trim: '#f3eee3' }, dir);
    const { ctx, pixels } = canvas();
    drawFootballPlayer(ctx, 100, 100, kit);
    const gapX = dir > 0 ? 104 : 95;
    assert.equal(pixels.get(`${gapX},90.5`), undefined, 'turf can show through the open cage');
    assert.equal(pixels.get(`${gapX},90`), kit.trim, 'brow reaches beyond shell');
    assert.equal(pixels.get(`${gapX},91.5`), kit.trim, 'lower bar reaches beyond shell');
  }
});
