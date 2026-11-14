import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
test('defensive diagrams and live field share one defensive-only selection helper', () => {
  const diagrams = read('../game/lib/football/diagrams.ts');
  const preplay = read('../game/components/football-preplay.tsx');
  const renderer = read('../game/components/football-renderer.ts');
  assert.match(diagrams, /controlledDefenderId\(l\)/);
  assert.match(preplay, /r\.controlled && <path transform=\{`translate\(\$\{s\.x\} \$\{s\.y\}\)`\}/);
  assert.match(renderer, /controlledDefenderId\(live\)/);
  assert.match(renderer, /playerTarget\(ctx, a\.x, a\.y, manualDefense \? FIRST : LACE\)/);
  assert.match(renderer, /playerTarget\(ctx, a\.x, a\.y, live\.holdingPass \? FIRST : LACE\)/);
  assert.doesNotMatch(renderer, /#f0443e/);
  assert.doesNotMatch(read('../game/components/football-preplay.css'), /#f0443e/);
  assert.match(preplay, /const SIZE = 6/);
  assert.match(preplay, /const SIZE = 4/);
});
test('defender highlight responds to ACTION before the hold threshold and to arrows without consuming input', () => {
  const component = read('../game/components/football-game.tsx');
  assert.match(component, /input\.current\.sample\(performance\.now\(\), false\)/);
  assert.match(component, /controls\.pressed\.juke \|\| controls\.defenseDirection/);
  assert.doesNotMatch(component, /red defender/);
});
test('landscape ACTION wrapper has square corners and does not clip the square button', () => {
  const css = read('./retro-theme.css');
  assert.match(css, /@container gm \(min-aspect-ratio:3\/2\)\s*\{\s*\.gm-screen \.gm-slot \.ga-scope \.fb-juke-col\s*\{\s*border-radius: 0;\s*overflow: visible;/);
});
test('existing touch arrows are enabled for live human defense without adding controls', () => {
  const component = read('../game/components/football-game.tsx');
  assert.match(component, /disabled=\{!controlsActive && !userDefenseActive\}/);
  assert.match(component, /if \(!controlsActive && !userDefenseActive && !\(control === 'juke' && defenseActive\)\)/);
  assert.match(component, /setPointerCapture\(e.pointerId\)/);
  assert.match(component, /onPointerCancel=\{e => release\(e, true\)\}/);
});
