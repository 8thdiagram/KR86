/** Derive low-resolution worn field paint; preserve the supplied lettering asset. */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const original = 'src/platform/assets/midfield-86.png';
const png = fs.readFileSync(original), width = 64;
const height = Math.round(width * png.readUInt32BE(20) / png.readUInt32BE(16));
const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', original, '-vf', `scale=${width}:${height}:flags=neighbor`,
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1e6 });
if (decoded.status !== 0) throw Error(decoded.stderr.toString());
const pixels = decoded.stdout;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * 4, hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  if (pixels[i + 3] < 128 || hash % 59 === 0) { pixels[i + 3] = 0; continue; }
  pixels[i] = 193 + hash % 15;
  pixels[i + 1] = 27 + hash % 9;
  pixels[i + 2] = 20 + hash % 7;
  pixels[i + 3] = hash % 17 === 0 ? 112 : 180 + hash % 19;
}
const output = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba',
  '-video_size', `${width}x${height}`, '-i', '-', '-frames:v', '1', 'src/platform/assets/midfield-86-turf.png'],
  { input: pixels });
if (output.status !== 0) throw Error(output.stderr.toString());
console.log(`Created ${width}×${height} deterministic worn paint; original logo unchanged.`);
