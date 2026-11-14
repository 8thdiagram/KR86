import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('menu illustration fits NES raster, attribute palettes and background tile limits', () => {
  const title = fs.readFileSync(new URL('./TitleExperience.tsx', import.meta.url), 'utf8');
  const file = [...title.matchAll(/from ['"]\.\/assets\/([^'"]+\.png)['"]/g)]
    .map(match => match[1]!).find(name => name !== 'midfield-86.png');
  assert(file, 'Menu must use a purpose-drawn pixel PNG, not the previous high-resolution artwork.');
  const path = new URL(`./assets/${file}`, import.meta.url);
  const png = fs.readFileSync(path), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(width, 256);
  assert(height <= 240 && height % 16 === 0, 'Use whole NES attribute blocks.');
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', path.pathname,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const colorAt = (x: number, y: number) => {
    const offset = (y * width + x) * 3;
    return pixels.readUIntBE(offset, 3);
  };
  const allColors = new Set<number>(), blocks: Set<number>[] = [];
  for (let y = 0; y < height; y += 16) for (let x = 0; x < width; x += 16) {
    const block = new Set<number>();
    for (let dy = 0; dy < 16; dy++) for (let dx = 0; dx < 16; dx++) {
      const color = colorAt(x + dx, y + dy);
      block.add(color); allColors.add(color);
    }
    assert(block.size <= 4, `Attribute block ${x},${y} uses ${block.size} colors, beyond NES background limits.`);
    blocks.push(block);
  }
  assert(allColors.size <= 13, 'Four background palettes share one universal color.');

  // Solve the four-subpalette assignment from decoded pixels, not generator metadata.
  let palettes: number[][] | undefined;
  for (const background of allColors) {
    const requirements = blocks.map(block => [...block].filter(c => c !== background));
    if (requirements.some(colors => colors.length > 3)) continue;
    const others = [...allColors].filter(c => c !== background).sort((a, b) => a - b);
    const candidates: { colors: number[]; covers: bigint }[] = [];
    const triples: number[][] = [];
    if (others.length <= 3) triples.push(others);
    else for (let a = 0; a < others.length; a++) for (let b = a + 1; b < others.length; b++)
      for (let c = b + 1; c < others.length; c++) triples.push([others[a]!, others[b]!, others[c]!]);
    for (const colors of triples) {
      let covers = 0n;
      requirements.forEach((need, i) => {
        if (need.every(c => colors.includes(c))) covers |= 1n << BigInt(i);
      });
      if (covers) candidates.push({ colors, covers });
    }
    const memo = new Set<string>();
    const search = (remaining: bigint, chosen: number[][]): number[][] | undefined => {
      if (!remaining) return chosen;
      if (chosen.length >= 4) return undefined;
      const key = `${remaining}:${chosen.length}`;
      if (memo.has(key)) return undefined;
      memo.add(key);
      let options: typeof candidates | undefined;
      for (let i = 0; i < requirements.length; i++) if (remaining & 1n << BigInt(i)) {
        const matches = candidates.filter(p => p.covers & 1n << BigInt(i));
        if (!options || matches.length < options.length) options = matches;
        if (options.length <= 1) break;
      }
      for (const candidate of options ?? []) {
        const answer = search(remaining & ~candidate.covers, [...chosen, [background, ...candidate.colors]]);
        if (answer) return answer;
      }
      return undefined;
    };
    palettes = search((1n << BigInt(blocks.length)) - 1n, []);
    if (palettes) break;
  }
  assert(palettes, 'Pixels must fit four shared-background NES attribute palettes.');
  const patterns = new Set<string>();
  for (let y = 0; y < height; y += 8) for (let x = 0; x < width; x += 8) {
    const block = blocks[Math.floor(y / 16) * (width / 16) + Math.floor(x / 16)]!;
    const palette = palettes.find(p => [...block].every(c => p.includes(c)))!;
    let pattern = '';
    for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++)
      pattern += palette.indexOf(colorAt(x + dx, y + dy));
    patterns.add(pattern);
  }
  assert(patterns.size <= 256, `${patterns.size} unique background tiles exceed a single 256-tile CHR bank.`);
  console.log(`NES menu audit: ${width}×${height}, ${allColors.size} colors, ${palettes.length} palettes, ${patterns.size} unique tiles.`);
});
