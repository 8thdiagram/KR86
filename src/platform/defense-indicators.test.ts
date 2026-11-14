import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
test('defensive diagrams and live field share one defensive-only selection helper', () => {
  const diagrams = read('../game/lib/football/diagrams.ts');
  const preplay = read('../game/components/football-preplay.tsx');
  const renderer = read('../game/components/football-renderer.ts');
  assert.match(diagrams, /controlledDefenderId\(l\)/);
  assert.match(preplay, /r\.controlled && <circle cx=\{s\.x\} cy=\{s\.y\} r="9" className="fbp-controlled"/);
  assert.match(renderer, /controlledDefenderId\(live\)/);
  assert.match(renderer, /ctx\.arc\(a\.x, a\.y, 8\.5/);
  assert.match(renderer, /ctx\.strokeStyle = '#f0443e'/);
  assert.match(read('../game/components/football-preplay.css'), /\.fbp-controlled\{fill:none;stroke:#f0443e/);
  assert.match(preplay, /const SIZE = 6/);
  assert.match(preplay, /const SIZE = 4/);
});
test('existing touch arrows are enabled for live human defense without adding controls', () => {
  const component = read('../game/components/football-game.tsx');
  assert.match(component, /disabled=\{!controlsActive && !userDefenseActive\}/);
  assert.match(component, /if \(!controlsActive && !userDefenseActive && !\(control === 'juke' && defenseActive\)\)/);
  assert.match(component, /setPointerCapture\(e.pointerId\)/);
  assert.match(component, /onPointerCancel=\{e => release\(e, true\)\}/);
});
