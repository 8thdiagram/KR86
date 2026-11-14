/** Precise edge finishing only: preserve the supplied artwork and opaque app-icon corners. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const side = 1024;
const prefix = 'kick-return-stadium';
const original = execFileSync('ffmpeg', ['-v', 'error', '-i',
  'attached_assets/IMG_9683_1794698607444.jpeg',
  '-vf', `scale=${side}:${side}:flags=lanczos`,
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: side * side * 4 });

function edgeDistance(x, y) {
  // Continuous, iPhone-like corner contour, inset from the OS mask.
  const radius = side / 2;
  const nx = (x + .5 - radius) / radius, ny = (y + .5 - radius) / radius;
  const gradient = 5 * Math.hypot(nx ** 4, ny ** 4) / radius;
  return gradient ? (Math.abs(nx) ** 5 + Math.abs(ny) ** 5 - 1) / gradient : -radius;
}

function finish(input) {
  const output = Buffer.from(input);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const d = edgeDistance(x, y) * 512 / side, dx = x - side / 2, dy = y - side / 2;
    const light = .5 - .5 * (dx + dy) / Math.max(1, Math.hypot(dx, dy) * Math.SQRT2);
    const highlight = (.08 + .15 * light) * Math.max(0, 1 - Math.abs(d + 1.4) / .85);
    const shadow = .12 * Math.max(0, 1 - Math.abs(d + 2.8) / .8);
    for (let c = 0; c < 3; c++) {
      const i = (y * side + x) * 3 + c;
      const bevel = input[i] * (1 - highlight) + [220, 234, 255][c] * highlight;
      output[i] = Math.round(bevel * (1 - shadow));
    }
  }
  return output;
}

function encode(input, output, filters) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgb24',
    '-video_size', `${side}x${side}`, '-i', 'pipe:0', ...(filters ? ['-vf', filters] : []),
    '-frames:v', '1', output], { input });
}

const finished = finish(original);
encode(finished, 'branding/official-app-icon.png');
encode(finished, 'branding/app-store-icon-1024.png');
for (const size of [32, 120, 180, 192, 512]) {
  encode(finished, `public/icons/${prefix}-${size}.png`, `scale=${size}:${size}:flags=lanczos`);
}
const maskableBase = execFileSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo',
  '-pixel_format', 'rgb24', '-video_size', `${side}x${side}`, '-i', 'pipe:0',
  '-vf', `scale=${side * .75}:${side * .75}:flags=lanczos,pad=${side}:${side}:${side / 8}:${side / 8}:color=0x0b1d36`,
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: original, maxBuffer: side * side * 4 });
encode(finish(maskableBase), `public/icons/${prefix}-maskable-512.png`, 'scale=512:512:flags=lanczos');

// Preview the system's rounded mask without baking transparency into installed icons.
const preview = Buffer.alloc(side * side * 4);
for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
  const i = y * side + x;
  finished.copy(preview, i * 4, i * 3, i * 3 + 3);
  preview[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, .5 - edgeDistance(x, y))) * 255);
}
fs.mkdirSync('generated-artifacts', { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba',
  '-video_size', `${side}x${side}`, '-i', 'pipe:0', '-frames:v', '1',
  'generated-artifacts/kick-return-icon-edge-preview.png'], { input: preview });
console.log('Updated six opaque icons with a fine highlight and slight inset bevel.');
