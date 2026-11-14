import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url));
const manifest = JSON.parse(read('public/manifest.webmanifest').toString());

function checkOpaqueIcon(path: string, size: number) {
  const png = read(path);
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
  assert.equal(png[25], 2, 'icons must have opaque RGB corners for the system mask');
}

test('install icons and Apple touch icons resolve to correctly sized opaque artwork', () => {
  assert.equal(manifest.id, './', 'changing artwork must not create a different installed app');
  assert.equal(manifest.start_url, './');
  for (const icon of manifest.icons) {
    checkOpaqueIcon(`public/${icon.src}`, Number(icon.sizes.split('x')[0]));
  }
  const html = read('index.html').toString();
  for (const match of html.matchAll(/<link rel="(?:apple-touch-icon|icon)"[^>]*sizes="(\d+)x\d+" href="%BASE_URL%([^"]+)"/g)) {
    checkOpaqueIcon(`public/${match[2]}`, Number(match[1]));
  }
  assert.match(html, /apple-touch-icon" sizes="180x180"/);
  assert.match(html, /apple-touch-icon" sizes="120x120"/);
  checkOpaqueIcon('branding/app-store-icon-1024.png', 1024);
  checkOpaqueIcon('branding/official-app-icon.png', 1024);
});
