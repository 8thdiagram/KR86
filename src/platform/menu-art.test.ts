import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('menu uses the exact KR ’86 frame from the existing intro', () => {
  const title = fs.readFileSync(new URL('./TitleExperience.tsx', import.meta.url), 'utf8');
  assert.match(title, /import menuIntro from '\.\/assets\/menu-intro\.png'/);
  assert.match(title, /<img src=\{menuIntro\}/);
  assert.doesNotMatch(title, /kick-return-nes\.png|menu-gameplay\.png|<TitleWordmark/);
  const file = new URL('./assets/menu-intro.png', import.meta.url);
  const png = fs.readFileSync(file);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  // An unfiltered, uncropped native frame; its own KR and ’86 need no text overlay.
  assert.equal(png.readUInt32BE(16), 192);
  assert.equal(png.readUInt32BE(20), 192);
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', file.pathname,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  // The original 4.5-second frame is now 0.5 seconds into the shortened clip.
  const intro = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i',
    new URL('./assets/kick-return-intro.mp4', import.meta.url).pathname,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  assert.deepEqual(pixels, intro, 'menu artwork is the actual intro screenshot, not a recreation');
});

test('menu preserves an accessible title without covering the intro logo or duplicating the year', () => {
  const title = fs.readFileSync(new URL('./TitleExperience.tsx', import.meta.url), 'utf8');
  assert.match(title, /<h1>KICK RETURN ’86<\/h1>/);
  assert.match(title, /alt="[^"]*KR lettering[^"]*’86 lettering/);
  assert.doesNotMatch(title, /className="kr-art-year"|<TitleWordmark/);
  const css = fs.readFileSync(new URL('./retro-theme.css', import.meta.url), 'utf8');
  assert.match(css, /\.kr-art\s*\{[^}]*aspect-ratio:\s*1(?:\s*\/\s*1)?\s*;/);
  assert.match(css, /\.kr-art img\s*\{[^}]*object-fit:\s*contain;[^}]*image-rendering:\s*pixelated/);
  assert.match(css, /object-fit:\s*contain/);
});
