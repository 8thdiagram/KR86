import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('all football entries share square controls constrained to their rails', () => {
  const css = fs.readFileSync(new URL('./retro-theme.css', import.meta.url), 'utf8');
  const fit = css.slice(css.indexOf('/* Shared control fit'));
  assert.match(fit, /:is\(\.kr-primary, \.kr-direction, \.fb-pad, \.fb-go, \.fb-tool\)/);
  assert.match(fit, /min-width: 0/);
  assert.match(fit, /max-width: 100%/);
  assert.match(fit, /border-radius: 0 !important/);
  assert.match(fit, /\.kr-main-actions \.kr-primary\s*\{\s*width: 100%;\s*padding: 4px/);
});

test('Classic next-down button has compact landscape copy and full accessible name', () => {
  const source = fs.readFileSync(new URL('../game/components/kick-return-game.tsx', import.meta.url), 'utf8');
  assert.match(source, /aria-label=\{primaryAction\?\.label\}/);
  assert.match(source, /className="kr-action-full"/);
  assert.match(source, /className="kr-action-compact" aria-hidden="true"/);
  assert.match(source, /\['ST', 'ND', 'RD', 'TH'\]/);
});
