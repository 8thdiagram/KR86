import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('Super Cup menu theme is a local, complete 48-second stereo console cue', () => {
  const file = new URL('./assets/super-cup-menu.mp3', import.meta.url);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_type,codec_name,sample_rate,channels', '-of', 'json', file.pathname], {encoding:'utf8'}));
  assert(Number(probe.format.duration) >= 47.5 && Number(probe.format.duration) <= 48.5);
  assert.equal(probe.streams.length, 1);
  assert.equal(probe.streams[0].codec_type, 'audio');
  assert.equal(probe.streams[0].codec_name, 'mp3');
  assert.equal(probe.streams[0].channels, 2);
  assert.equal(Number(probe.streams[0].sample_rate), 32000);
  assert(fs.statSync(file).size < 900_000, 'compact enough for the offline shell');
});

test('new theme uses the cancellable single-play menu lifecycle, not startup audio', () => {
  const source = fs.readFileSync(new URL('./retro-audio.ts', import.meta.url), 'utf8');
  assert.match(source, /new URL\('\.\/assets\/super-cup-menu\.mp3', import\.meta\.url\)/);
  assert.match(source, /source\.loop = false/);
  assert.match(source, /gain\.gain\.value = \.3/);
  const intro = source.slice(source.indexOf('export function playIntroSound'), source.indexOf('export function startMenuMusic'));
  assert.doesNotMatch(intro, /loadAudio|menuBuffer|startMenuMusic/);
});
