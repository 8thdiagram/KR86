import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (name: string) => fs.readFileSync(new URL(name, import.meta.url), 'utf8');

test('one decorative body-level overlay covers both the app shell and portaled game', () => {
  const app = source('../App.tsx');
  assert.equal((app.match(/<CrtOverlay\s*\/>/g) ?? []).length, 1);
  const component = source('./CrtOverlay.tsx');
  assert.match(component, /createPortal\(/);
  assert.match(component, /document\.body/);
  assert.match(component, /aria-hidden="true"/);
  assert.doesNotMatch(component, /tabIndex|onClick|onPointer|requestAnimationFrame|setInterval/);
  const css = source('./crt-overlay.css');
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /inset:\s*0/);
  assert.match(css, /pointer-events:\s*none/);
  assert(Number(css.match(/z-index:\s*(\d+)/)?.[1]) > 10000, 'Must cover the body-portaled game.');
});

test('TV treatment stays faint and static, with no double video scanlines', () => {
  const css = source('./crt-overlay.css');
  assert.match(css, /radial-gradient/);
  assert.match(css, /repeating-linear-gradient/);
  const alphas = [...css.matchAll(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\s*\)/g)]
    .map(match => Number(match[1]));
  assert.equal(alphas.length, 4);
  assert(alphas.slice(0, 2).every(alpha => alpha <= .01), 'the added warmth must remain barely perceptible');
  assert(alphas.every(alpha => alpha > 0 && alpha <= .08), 'Individual effects must remain subtle.');
  assert.doesNotMatch(css, /animation:|filter:|backdrop-filter:|mix-blend-mode:|transform:/);
  assert.match(source('./retro-theme.css'), /\.kr-film-scan\s*\{\s*display:\s*none/);
});

test('accessibility preferences can remove the decorative overlay', () => {
  const css = source('./crt-overlay.css');
  for (const preference of ['forced-colors: active', 'prefers-contrast: more', 'prefers-reduced-transparency: reduce'])
    assert(css.includes(preference), preference);
  assert.match(css, /@media[\s\S]*\.kr-crt-overlay\s*\{\s*display:\s*none/);
});
