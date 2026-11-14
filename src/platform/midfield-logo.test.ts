import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball } from '../game/lib/football/engine';
import { drawRegularSeasonMidfield, hasRegularSeasonLogo } from './midfield-logo';

test('midfield logo appears only in Franchise regular-season games', () => {
  const g = createFootball(42, { player: 'Big Blue', opponent: 'Redbirds' });
  assert.equal(hasRegularSeasonLogo(g), false);
  g.franchise = { gameId: 'regular', awards: {} } as NonNullable<typeof g.franchise>;
  assert.equal(hasRegularSeasonLogo(g), true);
  g.franchise.playoff = { season: 1, year: 1986, round: 0 };
  assert.equal(hasRegularSeasonLogo(g), false);
});

test('transparent logo draws centered on the fifty-yard line without changing game state', () => {
  const g = createFootball(42, { player: 'Big Blue', opponent: 'Redbirds' });
  g.franchise = { gameId: 'regular', awards: {} } as NonNullable<typeof g.franchise>;
  const before = structuredClone(g), calls: unknown[][] = [];
  const ctx = {
    save() {}, restore() {}, imageSmoothingEnabled: true,
    drawImage(...args: unknown[]) { calls.push(args); },
  } as unknown as CanvasRenderingContext2D;
  const image = { complete: true, naturalWidth: 200, naturalHeight: 200 } as HTMLImageElement;
  drawRegularSeasonMidfield(ctx, g, image);
  assert.deepEqual(calls, [[image, 570, 66, 60, 60]]);
  assert.deepEqual(g, before);
  calls.length = 0;
  g.franchise.playoff = { season: 1, year: 1986, round: 1 };
  drawRegularSeasonMidfield(ctx, g, image);
  assert.equal(calls.length, 0);
  delete g.franchise;
  drawRegularSeasonMidfield(ctx, g, image);
  assert.equal(calls.length, 0);
});
