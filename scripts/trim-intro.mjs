/** Cut the runner clip's first four seconds without re-encoding its pixels.
 * MP4's edit list keeps required H.264 decode preroll out of visible playback.
 * The separate opening '86 display, intro effects and menu art are untouched. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const input = process.argv[2];
if (!input) throw new Error('Supply the untrimmed runner video as the first argument.');
const target = process.argv[3] ?? 'src/platform/assets/kick-return-intro.mp4';
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames',
  '-show_entries', 'format=duration:stream=codec_type,nb_read_frames,width,height,profile',
  '-of', 'json', file], { encoding: 'utf8' }));
const before = probe(input);
assert(Number(before.format.duration) > 4, 'Input is too short or has already been trimmed.');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-trim-intro-'));
try {
  const output = path.join(work, 'intro.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '4', '-i', input,
    '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', output]);
  const after = probe(output);
  assert(Math.abs(Number(after.format.duration) - (Number(before.format.duration) - 4)) < .001);
  const hashes = args => execFileSync('ffmpeg', ['-v', 'error', ...args,
    '-f', 'framemd5', 'pipe:1'], { encoding: 'utf8' }).split('\n').filter(line => !line.startsWith('#')).join('\n');
  assert.equal(hashes(['-i', output]), hashes(['-ss', '4', '-i', input]),
    'Every retained decoded frame must be unchanged.');
  fs.copyFileSync(output, target);
  console.log(`Intro runner clip: ${before.format.duration}s -> ${after.format.duration}s; ` +
    `${after.streams[0].nb_read_frames} visible frames. Opening '86 and audio unchanged.`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
