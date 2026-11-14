import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const WIDTH = 256;
const HEIGHT = 160;
const UNIVERSAL = '#000000';
const COLORS = {
  [UNIVERSAL]: [0, 0, 0],
  '#1412a7': [20, 18, 167],
  '#155fd9': [21, 95, 217],
  '#ffffff': [255, 255, 255],
  '#0b4800': [11, 72, 0],
  '#388700': [56, 135, 0],
  '#adadad': [173, 173, 173],
  '#666666': [102, 102, 102],
  '#ea9e22': [234, 158, 34],
  '#b53120': [181, 49, 32],
};
const PALETTES = [
  [UNIVERSAL, '#1412a7', '#155fd9', '#ffffff'],
  [UNIVERSAL, '#0b4800', '#388700', '#adadad'],
  [UNIVERSAL, '#0b4800', '#ffffff', '#b53120'],
  [UNIVERSAL, '#666666', '#adadad', '#ea9e22'],
];
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/platform/assets/kick-return-nes.png');
const pixels = Array.from({ length: WIDTH * HEIGHT }, () => UNIVERSAL);

function paletteAt(x, y) {
  const tileColumn = Math.floor(x / 16);
  const tileRow = Math.floor(y / 16);
  if (tileRow <= 2) return 0;
  if (tileRow <= 4) return 3;
  if (tileColumn >= 6 && tileColumn <= 10 && tileRow >= 5) return 2;
  return 1;
}

function put(x, y, color) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const permitted = PALETTES[paletteAt(x, y)];
  if (!permitted.includes(color)) {
    throw new Error(`Color ${color} is outside the local palette at ${x},${y}`);
  }
  pixels[y * WIDTH + x] = color;
}

function rect(x, y, width, height, color) {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) put(px, py, color);
  }
}

function drawStands() {
  rect(0, 48, WIDTH, 32, '#666666');
  rect(0, 48, WIDTH, 3, '#adadad');
  rect(0, 76, WIDTH, 4, '#ea9e22');
  for (let row = 0; row < 3; row++) {
    const y = 53 + row * 7;
    for (let x = 4 + (row % 2) * 4; x < WIDTH - 5; x += 12) {
      const color = ((x / 12 + row) % 5 === 0) ? '#ea9e22'
        : ((x / 12 + row) % 3 === 0) ? '#adadad' : '#666666';
      rect(x, y, 5, 3, color);
      rect(x + 1, y + 3, 3, 2, '#666666');
    }
  }
  rect(104, 53, 48, 16, '#000000');
  rect(108, 56, 40, 2, '#ea9e22');
  rect(112, 61, 8, 4, '#adadad');
  rect(124, 61, 8, 4, '#adadad');
  rect(136, 61, 8, 4, '#ea9e22');
}

function drawSky() {
  rect(0, 0, WIDTH, 48, '#1412a7');
  const stars = [
    [16, 10], [43, 25], [69, 12], [184, 13], [223, 27], [239, 8],
    [30, 38], [80, 35], [178, 39], [212, 8], [153, 22], [8, 29],
  ];
  for (const [x, y] of stars) rect(x, y, 2, 2, '#155fd9');
  rect(0, 44, WIDTH, 4, '#155fd9');
}

function drawField() {
  rect(0, 80, WIDTH, 80, '#0b4800');
  for (let y = 80; y < 160; y += 16) {
    const stripe = (y / 16) % 2 === 0 ? '#388700' : '#0b4800';
    for (let x = 0; x < WIDTH; x += 16) {
      const localStripe = PALETTES[paletteAt(x, y)].includes(stripe) ? stripe : '#0b4800';
      rect(x, y, 16, 16, localStripe);
    }
  }
  for (const y of [94, 126, 158]) {
    for (let x = 0; x < WIDTH; x++) {
      put(x, y, PALETTES[paletteAt(x, y)].includes('#ffffff') ? '#ffffff' : '#adadad');
    }
  }
  for (const x of [28, 44, 60, 76, 92, 164, 180, 196, 212, 228]) {
    for (const y of [102, 118, 134, 150]) {
      const stripe = PALETTES[paletteAt(x, y)].includes('#ffffff') ? '#ffffff' : '#adadad';
      rect(x, y, 2, 3, stripe);
    }
  }
  rect(12, 83, 2, 74, '#adadad');
  rect(242, 83, 2, 74, '#adadad');
}

function drawCarrier() {
  // Broad silhouette: helmet, bent arms, jersey, stride, and a ball tucked into the cradle.
  rect(112, 101, 35, 32, '#b53120');
  rect(106, 105, 16, 9, '#b53120');
  rect(99, 111, 19, 7, '#ffffff');
  rect(141, 104, 17, 10, '#b53120');
  rect(147, 110, 14, 8, '#ffffff');
  rect(128, 80, 29, 9, '#ffffff');
  rect(123, 85, 34, 12, '#ffffff');
  rect(133, 80, 4, 9, '#b53120');
  rect(145, 90, 13, 12, '#ffffff');
  rect(145, 92, 13, 3, '#000000');
  rect(154, 94, 3, 2, '#000000');
  // Correct block numerals: 3 then 2, with the requested 2 glyph rows.
  rect(115, 109, 17, 12, '#b53120');
  const number32 = ['1110111', '0010001', '1110111', '0010100', '1110111'];
  for (let y = 0; y < number32.length; y++) {
    for (let x = 0; x < number32[y].length; x++) {
      if (number32[y][x] === '1') rect(116 + x * 2, 110 + y * 2, 2, 2, '#ffffff');
    }
  }
  // Red-and-white ball sits in the near arm's cradle instead of floating away.
  rect(151, 101, 17, 14, '#000000');
  rect(154, 99, 11, 18, '#000000');
  rect(153, 103, 13, 10, '#b53120');
  rect(156, 101, 7, 14, '#b53120');
  rect(158, 105, 2, 6, '#ffffff');
  for (const y of [105, 108, 111]) rect(157, y, 4, 1, '#ffffff');
  rect(146, 111, 12, 8, '#ffffff');
  rect(140, 128, 13, 13, '#ffffff');
  rect(113, 131, 33, 11, '#ffffff');
  rect(108, 139, 12, 9, '#b53120');
  rect(140, 139, 13, 12, '#b53120');
  rect(101, 147, 22, 7, '#000000');
  rect(144, 151, 23, 7, '#000000');
}

function encodeCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type);
  const body = Buffer.concat([typeBytes, data]);
  const result = Buffer.alloc(body.length + 8);
  result.writeUInt32BE(data.length, 0);
  body.copy(result, 4);
  result.writeUInt32BE(encodeCrc32(body), body.length + 4);
  return result;
}

function encodePng() {
  const rows = Buffer.alloc(HEIGHT * (1 + WIDTH * 4));
  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * (1 + WIDTH * 4);
    rows[rowStart] = 0;
    for (let x = 0; x < WIDTH; x++) {
      const color = COLORS[pixels[y * WIDTH + x]];
      const offset = rowStart + 1 + x * 4;
      rows[offset] = color[0];
      rows[offset + 1] = color[1];
      rows[offset + 2] = color[2];
      rows[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function checkTiles() {
  const unique = new Set();
  const usedColors = new Set();
  for (const color of pixels) usedColors.add(color);
  for (let y = 0; y < HEIGHT; y += 8) {
    for (let x = 0; x < WIDTH; x += 8) {
      const palette = PALETTES[paletteAt(x, y)];
      const pattern = [];
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const color = pixels[(y + py) * WIDTH + x + px];
          if (!palette.includes(color)) throw new Error(`Tile palette violation at ${x},${y}`);
          pattern.push(palette.indexOf(color));
        }
      }
      unique.add(pattern.join(''));
    }
  }
  if (unique.size > 256) throw new Error(`Too many unique 2bpp tiles: ${unique.size}`);
  if (usedColors.size > 13) throw new Error(`Too many colors: ${usedColors.size}`);
  return { tileCount: unique.size, colorCount: usedColors.size };
}

drawSky();
drawStands();
drawField();
drawCarrier();
const metrics = checkTiles();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, encodePng());
console.log(`Wrote ${outputPath} (${WIDTH}x${HEIGHT}); ${metrics.colorCount} colors; ${metrics.tileCount} unique local-palette tiles.`);
