/** Quantize the existing silent composition to a 192px NES-inspired fixed palette.
 * The browser enlarges these native low-resolution pixels with nearest sampling. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const target = 'src/platform/assets/kick-return-intro.mp4', input = process.argv[2] ?? target;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-pixel-intro-'));
const palette = [
  '#000000','#081020','#002a88','#1412a7','#155fd9','#64b0ff','#c0dfff','#ffffff',
  '#202048','#4e4e8e','#9898d4','#d8d8f8','#666666','#adadad','#0b4800','#388700',
  '#4fb000','#b8f818','#00564a','#00a580','#83eec9','#b53120','#f87858','#fca044',
  '#fce0a8','#850000','#d82800','#ff7878','#4f1900','#a85c00','#f0bc3c','#fff0a0',
];
function run(args, input) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { input });
  if (r.status !== 0) throw Error(r.stderr.toString());
}
try {
  const rgb = Buffer.from(Array.from({ length: 256 }, (_, i) =>
    palette[i % palette.length].slice(1).match(/../g).map(h => parseInt(h, 16))).flat());
  run(['-f','rawvideo','-pixel_format','rgb24','-video_size','256x1','-i','-','-frames:v','1',`${work}/palette.png`], rgb);
  run(['-i',input,'-i',`${work}/palette.png`,'-filter_complex',
    '[0:v]scale=192:192:flags=neighbor,setsar=1[small];[small][1:v]paletteuse=dither=none[v]',
    '-map','[v]','-an','-c:v','libx264','-profile:v','high','-crf','18','-pix_fmt','yuv420p',
    '-movflags','+faststart',`${work}/intro.mp4`]);
  fs.copyFileSync(`${work}/intro.mp4`, target);
  console.log('Created silent 192px-internal, fixed-32-color intro; original timing and square framing preserved.');
} finally { fs.rmSync(work, { recursive: true, force: true }); }
