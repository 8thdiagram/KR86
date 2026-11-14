import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('football movement arrows use centered CSS triangles without changing button semantics', () => {
  const theme = read('./retro-theme.css');
  const football = read('../game/components/football-game.tsx');
  const classic = read('../game/components/kick-return-game.tsx');

  assert.match(theme, /\.ga-scope \.fb-game \.fb-arrow::before/);
  assert.match(theme, /\.ga-scope \.kr-game \.kr-arrow::before/);
  assert.match(theme, /clip-path:\s*polygon\(50% 0, 0 100%, 100% 100%\)/);
  assert.match(theme, /clip-path:\s*polygon\(0 0, 100% 0, 50% 100%\)/);
  assert.match(theme, /\.ga-scope \.fb-game \.fb-steer \.fb-pad,\s*\.ga-scope \.kr-game \.kr-steering \.kr-direction\s*\{\s*display:\s*grid;\s*place-items:\s*center;/);

  for (const source of [football, classic]) {
    assert.match(source, /aria-label=\{[^}]*'Move up'[^}]*'Move down'/);
  }
  assert.match(football, /onPointerDown=\{e => press\(d < 0 \? 'up' : 'down', e\)\}/);
  assert.match(classic, /onPointerDown=\{e => press\(direction < 0 \? 'up' : 'down', e\)\}/);
});
