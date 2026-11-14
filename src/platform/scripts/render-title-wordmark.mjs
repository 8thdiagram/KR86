import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../assets/title-wordmark.png');
const width = 512;
const height = 192;
const rgba = Buffer.alloc(width * height * 4);

const glyphs = {
  K: [
    '11000110',
    '11001100',
    '11011000',
    '11110000',
    '11110000',
    '11011000',
    '11001100',
    '11000110',
    '11000011',
  ],
  I: [
    '11111111',
    '00111100',
    '00111100',
    '00111100',
    '00111100',
    '00111100',
    '00111100',
    '00111100',
    '11111111',
  ],
  C: [
    '00111111',
    '01111111',
    '11100000',
    '11000000',
    '11000000',
    '11000000',
    '11100000',
    '01111111',
    '00111111',
  ],
  R: [
    '11111100',
    '11111110',
    '11000111',
    '11000111',
    '11111110',
    '11111100',
    '11011100',
    '11001110',
    '11000111',
  ],
  E: [
    '11111111',
    '11111111',
    '11000000',
    '11111100',
    '11111100',
    '11000000',
    '11000000',
    '11111111',
    '11111111',
  ],
  T: [
    '11111111',
    '11111111',
    '00111100',
    '00111100',
    '00111100',
    '00111100',
    '00111100',
    '00111100',
    '00111100',
  ],
  U: [
    '11000011',
    '11000011',
    '11000011',
    '11000011',
    '11000011',
    '11000011',
    '11100111',
    '01111110',
    '00111100',
  ],
  N: [
    '11000011',
    '11100011',
    '11110011',
    '11011011',
    '11001111',
    '11000111',
    '11000011',
    '11000011',
    '11000011',
  ],
};

const bands = [
  '#ffffff',
  '#ffffff',
  '#aebdce',
  '#ffffff',
  '#dce9f5',
  '#4da6ec',
  '#3476b9',
  '#dce9f5',
  '#ffffff',
];
const colors = {
  outline: '#071326',
  nearShadow: '#aab7c6',
  farShadow: '#748399',
};

function rgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
    255,
  ];
}

function paintRect(x, y, w, h, color) {
  const [red, green, blue, alpha] = rgb(color);
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(width, x + w);
  const bottom = Math.min(height, y + h);
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const index = (py * width + px) * 4;
      rgba[index] = red;
      rgba[index + 1] = green;
      rgba[index + 2] = blue;
      rgba[index + 3] = alpha;
    }
  }
}

function makeWordCells(word, cell, y) {
  const gap = cell;
  const advance = 8 * cell + gap;
  const shearCells = [2, 2, 1, 1, 1, 0, 0, 0, 0];
  const nominalWidth = word.length * advance - gap + 2 * cell;
  const startX = Math.floor((width - nominalWidth) / 2);
  const cells = [];

  [...word].forEach((letter, letterIndex) => {
    const matrix = glyphs[letter];
    matrix.forEach((row, rowIndex) => {
      const italicOffset = shearCells[rowIndex] * cell;
      [...row].forEach((bit, colIndex) => {
        if (bit !== '1') return;
        cells.push({
          x: startX + letterIndex * advance + colIndex * cell + italicOffset,
          y: y + rowIndex * cell,
          cell,
          row: rowIndex,
        });
      });
    });
  });
  return cells;
}

function drawWord(word, cell, y) {
  const cells = makeWordCells(word, cell, y);

  // Two hard-edged, one-pixel-stepped extrusions create the original gray depth.
  for (const pixel of cells) {
    paintRect(pixel.x + 2 * cell, pixel.y + 2 * cell, cell, cell, colors.farShadow);
  }
  for (const pixel of cells) {
    paintRect(pixel.x + cell, pixel.y + cell, cell, cell, colors.nearShadow);
  }

  // A fixed integer-pixel outline stays bold without a font stroke or blur.
  for (const pixel of cells) {
    paintRect(pixel.x - 2, pixel.y - 2, cell + 4, cell + 4, colors.outline);
  }
  for (const pixel of cells) {
    paintRect(pixel.x, pixel.y, cell, cell, bands[pixel.row]);
  }
}

drawWord('KICK', 9, 9);
drawWord('RETURN', 7, 112);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
}

const scanlines = Buffer.alloc(height * (width * 4 + 1));
for (let y = 0; y < height; y += 1) {
  const offset = y * (width * 4 + 1);
  scanlines[offset] = 0;
  rgba.copy(scanlines, offset + 1, y * width * 4, (y + 1) * width * 4);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
header[10] = 0;
header[11] = 0;
header[12] = 0;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, png);
console.log(`Rendered ${width}x${height} transparent wordmark: ${output}`);
