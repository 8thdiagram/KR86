import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Plugin } from 'vite';

/** Precache only this game's immutable release files, never API/authentication responses. */
export function offlineBuild(): Plugin {
  let output = '';
  let base = '/';
  return {
    name: 'kick-return-offline-release',
    configResolved(config) { output = path.resolve(config.root, config.build.outDir); base = config.base; },
    closeBundle() {
      const files: string[] = [];
      function walk(dir: string, prefix = '') {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const relative = prefix + entry.name;
          if (entry.isDirectory()) walk(path.join(dir, entry.name), relative + '/');
          else if (/^(assets\/|icons\/|index\.html$|manifest\.webmanifest$|robots\.txt$)/.test(relative)) files.push(relative);
        }
      }
      walk(output);
      files.sort();
      const hash = crypto.createHash('sha256');
      for (const file of files) hash.update(file).update(fs.readFileSync(path.join(output, file)));
      const version = hash.digest('hex').slice(0, 20);
      const script = `
const PREFIX = 'kick-return-86:' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIX + ${JSON.stringify(version)};
const URLS = ${JSON.stringify(files.map(f => base + f))};
const START = ${JSON.stringify(base + 'index.html')};
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await Promise.all(URLS.map(async url => {
        const response = await fetch(new Request(url, {cache:'reload', credentials:'same-origin'}));
        if (!response.ok || response.redirected) throw new Error('Game asset unavailable: ' + url);
        const type = response.headers.get('content-type') || '';
        if (url.endsWith('.js') && !/javascript/.test(type) || /\\.(png|webp|woff2|ttf|mp3|mp4)$/.test(url) && /text\\/html/.test(type))
          throw new Error('Not a game asset: ' + url);
        await cache.put(url, response);
      }));
    } catch (error) { await caches.delete(CACHE); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'APPLY_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (request.mode === 'navigate') {
    // The game has one document; a cached launch must never depend on a new network request.
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(START)) || fetch(request)));
  } else if (URLS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
  }
});
`;
      fs.writeFileSync(path.join(output, 'sw.js'), script);
      console.info(`Offline release ${version}: ${files.length} game files precached.`);
    },
  };
}
