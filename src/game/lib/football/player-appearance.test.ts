import test from 'node:test';
import assert from 'node:assert/strict';
import { helmetColor, UNIFORM, playerSkin, positionKit, positionSkin, specialSkinPosition, SKIN_TONES, uniformKit, type SkinPosition } from '../../components/football-art';
import { slim } from '../../components/football-sprites';
import { kickFootballArt } from '../../components/kick-return-renderer';
import { drawTackle, tackleSkinPosition } from '../../components/football-tackle';
import { drawFootball } from '../../components/football-renderer';
import { createFootball } from './engine';
import { startField } from './field';
import { beginTackle } from './tackle-scene';
import { fieldGoalSequence } from './special-teams';
import { KICK_TEAMS } from '../kick-return-teams';

const positions: SkinPosition[] = ['QB', 'OL', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB', 'K', 'H', 'KR'];
test('primary jerseys and secondary helmets preserve each actual team palette in both directions', () => {
  for (const team of KICK_TEAMS) for (const dir of [-1, 1] as const) {
    const before = JSON.stringify(team), kit = uniformKit(team, dir);
    assert.equal(kit.body, team.body, 'the primary remains the jersey and field palette');
    assert.equal(helmetColor(kit), team.trim, 'the real secondary color is the helmet identity');
    assert.equal(JSON.stringify(team), before, 'uniform policy never rewrites a stored team');
  }
  assert.equal(helmetColor(uniformKit({ body: '#123456' }, 1)), '#123456',
    'a palette without a secondary retains its explicitly supported primary fallback');
});
function canvas() {
  const paints: { color: string; x: number; y: number; w: number; h: number }[] = [];
  const pixels = new Map<string, string>();
  const target = { fillStyle: '', globalAlpha: 1, fillRect(x: number, y: number, w: number, h: number) {
    paints.push({ color: this.fillStyle, x, y, w, h });
    for (let i = 0; i < w; i += .5) for (let j = 0; j < h; j += .5)
      pixels.set(`${x + i},${y + j}`, this.fillStyle);
  } };
  const ctx = new Proxy(target, { get: (t, k) => Reflect.has(t, k) ? Reflect.get(t, k) : () => {} }) as unknown as CanvasRenderingContext2D;
  return { ctx, paints, pixels };
}

test('cosmetic skin palette varies by position without randomness, team, or facing changes', () => {
  assert.equal(new Set(positions.map(positionSkin)).size, 5);
  for (const position of positions) for (const team of KICK_TEAMS) for (const dir of [-1, 1] as const) {
    const base = uniformKit(team, dir), before = structuredClone(base);
    const kit = positionKit(base, position);
    assert.equal(playerSkin(kit), positionSkin(position));
    assert.deepEqual(base, before);
    assert.deepEqual(positionKit(kit, position), kit);
    assert(SKIN_TONES.includes(kit.skin as typeof SKIN_TONES[number]));
  }
});

test('front and quarter helmets expose only a small one-row face slot above a white mask', () => {
  for (const dir of [-1, 1] as const) for (const position of positions)
    for (const view of [undefined, 0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const kit = positionKit(uniformKit(KICK_TEAMS[0]!, dir), position);
      const { ctx, paints, pixels } = canvas();
      slim(ctx, 100, 100, kit, { view });
      const faces = paints.filter(p => p.color === kit.skin && p.y < 91);
      if (view === 4 || view === 8) assert.equal(faces.length, 0, 'rear helmets never grow a face');
      else {
        assert.equal(faces.length, 1);
        const face = faces[0]!;
        assert(face.w <= 2 && face.h <= 2, 'one native pixel, sharply enlarged with the existing artwork');
        assert.equal(pixels.get(`${face.x},${face.y}`), kit.skin, 'face slot is not accidentally painted over');
        assert(paints.some(p => p.color === UNIFORM.facemask && p.y === face.y + face.h && p.h <= 2 && p.w >= 3),
          'visible white cage rail sits immediately below the face');
      }
      const wrong = SKIN_TONES.filter(color => color !== kit.skin);
      assert(!paints.some(p => wrong.includes(p.color as typeof SKIN_TONES[number])), 'face and hands share one tone');
    }
});

test('Classic, move and prone artwork use the same position tone without changing the kit', () => {
  for (const position of positions) {
    const kit = positionKit(uniformKit(KICK_TEAMS[0]!, 1), position), before = JSON.stringify(kit);
    for (const draw of [
      (ctx: CanvasRenderingContext2D) => kickFootballArt.sprite(ctx, 100, 100, kit, .5, true),
      (ctx: CanvasRenderingContext2D) => kickFootballArt.prone(ctx, 100, 100, kit, 0, 0, 0, true),
      (ctx: CanvasRenderingContext2D) => kickFootballArt.prone(ctx, 100, 100, kit, Math.PI / 2, 0, 0, true),
    ]) {
      const { ctx, paints } = canvas(); draw(ctx);
      assert(paints.some(p => p.color === kit.skin));
      assert(!paints.some(p => p.color === '#e0a370'), 'no fixed athlete face or hand tone');
      assert.equal(JSON.stringify(kit), before);
    }
  }
});

test('visible face slots and white facemasks never contain a black face panel', () => {
  const team = { body: '#cb353d', trim: '#f3eee3' };
  for (const dir of [-1, 1] as const) for (const view of [undefined, 0, 1, 2, 3, 5, 6, 7] as const) {
    const kit = positionKit(uniformKit(team, dir), 'WR');
    for (const classic of [false, true]) {
      const { ctx, paints, pixels } = canvas();
      if (classic) kickFootballArt.sprite(ctx, 100, 100, kit, 0, false, 0, 0, view);
      else slim(ctx, 100, 100, kit, { view });
      const face = paints.find(p => p.color === kit.skin && p.y < 91)!;
      assert(face, 'face remains a small, visible position-specific skin slot');
      for (let x = face.x - .5; x < face.x + face.w + .5; x += .5)
        for (let y = face.y; y < face.y + face.h + .5; y += .5)
          assert.notEqual(pixels.get(`${x},${y}`), '#10213a', `no black visor or cage at view ${view}/${dir}/${classic}`);
      assert(paints.some(p => p.color === UNIFORM.facemask && p.y === face.y + face.h && p.w >= 3),
        'the facemask rail stays white regardless of helmet color');
    }
  }
});

test('roster position tones persist through contact, grounded tackles, and special-team duties', () => {
  const g = createFootball(86);
  g.phase = 'live'; g.live = startField(g, 'post', 'pass');
  const qb = g.live.athletes.find(a => a.role === 'QB')!;
  const dl = g.live.athletes.find(a => a.role === 'DL')!;
  beginTackle(g, qb, dl, 'home', 'scrimmage');
  assert.equal(tackleSkinPosition(g, g.tackleScene!.carrier), 'QB');
  assert.equal(tackleSkinPosition(g, g.tackleScene!.defender), 'DL');
  for (const phase of ['impact', 'fall', 'ground'] as const) {
    g.tackleScene!.phase = phase; g.tackleScene!.elapsed = .12;
    const before = JSON.stringify(g), a = canvas();
    drawTackle(a.ctx, g, uniformKit(KICK_TEAMS[0]!, 1), uniformKit(KICK_TEAMS[1]!, -1));
    assert(a.paints.some(p => p.color === positionSkin('QB')));
    assert(a.paints.some(p => p.color === positionSkin('DL')));
    assert.equal(JSON.stringify(g), before);
  }
  const sp = fieldGoalSequence(g), kicker = sp.athletes.find(a => a.id === sp.kicker)!;
  const holder = sp.athletes.find(a => a.id === sp.returner)!;
  assert.equal(specialSkinPosition(sp, kicker), 'K');
  assert.equal(specialSkinPosition(sp, holder), 'H');
  g.tackleScene = undefined; g.special = sp;
  const before = JSON.stringify(g), a = canvas();
  drawFootball(a.ctx, g, { width: 393, height: 500 }, 0);
  assert(a.paints.some(p => p.color === positionSkin('K')), 'Kick View kicker uses the shared position tone');
  assert(a.paints.some(p => p.color === positionSkin('H')), 'Kick View holder uses the shared position tone');
  assert.equal(JSON.stringify(g), before);
});
