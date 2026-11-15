import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('landscape expansion reclaims cabinet gutters, not device safe areas or portrait space', () => {
  const css = fs.readFileSync(new URL('./retro-theme.css', import.meta.url), 'utf8');
  const expansion = css.slice(css.indexOf('/* Landscape field expansion:'));
  assert.match(expansion, /@container gm \(min-aspect-ratio:3\/2\)/);
  assert.match(expansion, /--fb-rail: clamp\(72px, 9cqw, 96px\)/);
  assert.match(expansion, /--kr-rail: clamp\(76px, 9cqw, 92px\)/);
  assert.match(expansion, /padding: 0 1px 1px/);
  assert.doesNotMatch(expansion, /\.gm-content|safe-area-inset|transform:|zoom:/);
});
