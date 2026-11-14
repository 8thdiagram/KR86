import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('menu uses the real gameplay capture rather than the former illustration', () => {
  const title = fs.readFileSync(new URL('./TitleExperience.tsx', import.meta.url), 'utf8');
  assert.match(title, /import menuGameplay from '\.\/assets\/menu-gameplay\.png'/);
  assert.match(title, /<img src=\{menuGameplay\}/);
  assert.doesNotMatch(title, /kick-return-nes\.png/);
  const file = new URL('./assets/menu-gameplay.png', import.meta.url);
  const png = fs.readFileSync(file);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  // An unfiltered, native-pixel crop of a live Classic kickoff return.
  assert.equal(png.readUInt32BE(16), 304);
  assert.equal(png.readUInt32BE(20), 190);
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', file.pathname,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  assert.equal(pixels.length, 304 * 190 * 3);
  assert(new Set(pixels).size > 20, 'Gameplay capture must contain visible field and sprite detail.');
});

test('menu retains the large Kick Return title and labels the lower-right year', () => {
  const title = fs.readFileSync(new URL('./TitleExperience.tsx', import.meta.url), 'utf8');
  assert.match(title, /<TitleWordmark \/>/);
  const wordmark = fs.readFileSync(new URL('./TitleWordmark.tsx', import.meta.url), 'utf8');
  assert.match(wordmark, /<h1[\s\S]*KICK RETURN/);
  assert.match(wordmark, /title-wordmark\.png/);
  assert.match(title, /className="kr-art-year" aria-label="1986">’86</);
  const css = fs.readFileSync(new URL('./retro-theme.css', import.meta.url), 'utf8');
  const year = css.match(/\.kr-art-year\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(year, /position:\s*absolute/);
  assert.match(year, /right:\s*7px/);
  assert.match(year, /bottom:\s*7px/);
  assert.match(css, /object-fit:\s*contain/);
});
