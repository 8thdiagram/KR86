import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url));

test('intro runner clip removes four seconds while preserving native pixels, silent H.264 and the opening mark', () => {
  const video = read('./assets/kick-return-intro.mp4');
  const entry = video.lastIndexOf(Buffer.from('avc1')), header = video.indexOf(Buffer.from('mvhd'));
  assert(entry > 0 && header > 0);
  assert.equal(video.readUInt16BE(entry + 28), 192);
  assert.equal(video.readUInt16BE(entry + 30), 192);
  assert.equal(video.readUInt32BE(header + 20) / video.readUInt32BE(header + 16), 1.75);
  // H.264 preroll stays encoded for lossless seeking but is not displayed.
  assert.equal(video.readUInt32BE(video.indexOf(Buffer.from('stsz')) + 12), 138);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames',
    '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,start_time',
    '-of', 'json', new URL('./assets/kick-return-intro.mp4', import.meta.url).pathname], { encoding: 'utf8' }));
  assert.equal(probe.streams[0].nb_read_frames, '42');
  assert.equal(Number(probe.streams[0].start_time), 0);
  const title = read('./TitleExperience.tsx').toString();
  assert.match(title, /setStage\('mark'\)/);
  assert.match(title, /}, 650\)/);
  assert.equal(video.includes(Buffer.from('soun')), false, 'no embedded video soundtrack or hut');
  const processor = read('../../scripts/pixelate-intro.mjs').toString();
  assert.equal([...processor.matchAll(/#[0-9a-f]{6}/g)].length, 32);
  assert.match(processor, /flags=neighbor/); assert.match(processor, /paletteuse=dither=none/);
});

test('intro and its menu still retain aspect-fit nearest-pixel presentation', () => {
  const css = read('./retro-theme.css').toString();
  const film = css.match(/\.kr-film \{([^}]+)\}/)![1]!;
  assert.match(film, /width: 100%/); assert.match(film, /height: 100%/);
  assert.match(film, /border: 0/); assert.match(film, /box-shadow: none/);
  assert.match(css, /\.kr-film-video \{[^}]*object-fit: contain;[^}]*image-rendering: pixelated/);
  assert.match(css, /\.kr-art \{[^}]*aspect-ratio: 1(?: \/ 1)?;/);
  assert.match(read('./TitleExperience.tsx').toString(), /src=\{menuIntro\}/);
  assert.doesNotMatch(read('./TitleExperience.tsx').toString(), /<TitleWordmark/);
});

// Small, test-only decoder for the non-interlaced RGBA PNG artwork.
function rgba(data: Buffer) {
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  assert.equal(data[24], 8); assert.equal(data[25], 6); assert.equal(data[28], 0);
  const chunks: Buffer[] = [];
  for (let p = 8; p < data.length;) {
    const n = data.readUInt32BE(p);
    if (data.toString('ascii', p + 4, p + 8) === 'IDAT') chunks.push(data.subarray(p + 8, p + 8 + n));
    p += n + 12;
  }
  const packed = inflateSync(Buffer.concat(chunks)), pixels = Buffer.alloc(width * height * 4), stride = width * 4;
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = packed[p++]!;
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= 4 ? pixels[i - 4]! : 0, b = y ? pixels[i - stride]! : 0;
      const c = y && x >= 4 ? pixels[i - stride - 4]! : 0, q = a + b - c;
      const paeth = Math.abs(q - a) <= Math.abs(q - b) && Math.abs(q - a) <= Math.abs(q - c) ? a
        : Math.abs(q - b) <= Math.abs(q - c) ? b : c;
      const predict = [0, a, b, Math.floor((a + b) / 2), paeth][filter]!;
      pixels[i] = (packed[p++]! + predict) & 255;
    }
  }
  return { width, height, pixels };
}
test('title lettering is an authored hard-pixel raster with a binary outline and no antialiased edges', () => {
  const { width, height, pixels } = rgba(read('./assets/title-wordmark.png'));
  assert.equal(width, 512); assert.equal(height, 192);
  const colors = new Set<string>();
  let transparent = 0, opaque = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3]!;
    assert(alpha === 0 || alpha === 255, 'no smooth/partially transparent edge pixels');
    if (!alpha) transparent++; else { opaque++; colors.add(pixels.subarray(i, i + 3).toString('hex')); }
  }
  assert(transparent > width * height / 4 && opaque > width * height / 4);
  assert(colors.size <= 8);
  for (const color of ['ffffff', '071326', 'aab7c6', '748399']) assert(colors.has(color));
  const author = read('./scripts/render-title-wordmark.mjs').toString();
  assert.match(author, /const glyphs =/);
  assert.match(author, /shearCells = \[2, 2, 1, 1, 1, 0, 0, 0, 0\]/);
  assert.doesNotMatch(author, /fillText|strokeText|createLinearGradient|fontFamily/);
});
test('turf version preserves the supplied silhouette with restrained missing pixels, varied faded alpha and no new lettering', () => {
  const original = rgba(read('./assets/midfield-86.png')), turf = rgba(read('./assets/midfield-86-turf.png'));
  assert.equal(turf.width, 64);
  assert(Math.abs(turf.width / turf.height - original.width / original.height) < .02);
  let sourcePaint = 0, missing = 0, misplaced = 0, painted = 0;
  const alpha = new Set<number>();
  for (let y = 0; y < turf.height; y++) for (let x = 0; x < turf.width; x++) {
    const i = (y * turf.width + x) * 4;
    const ox = Math.min(original.width - 1, Math.floor((x + .5) * original.width / turf.width));
    const oy = Math.min(original.height - 1, Math.floor((y + .5) * original.height / turf.height));
    const source = original.pixels[(oy * original.width + ox) * 4 + 3]! >= 128;
    if (source) { sourcePaint++; if (!turf.pixels[i + 3]) missing++; }
    if (!turf.pixels[i + 3]) continue;
    painted++; if (!source) misplaced++;
    alpha.add(turf.pixels[i + 3]!);
    assert(turf.pixels[i]! > turf.pixels[i + 1]! * 4, 'retains the red brand paint');
  }
  assert(misplaced / painted < .01, 'retains original letter geometry rather than redrawing it');
  assert(missing / sourcePaint > .005 && missing / sourcePaint < .08, 'sparse wear, not destroyed lettering');
  assert(alpha.size > 10 && Math.max(...alpha) < 210, 'faded, slightly uneven paint rather than an opaque overlay');
});
