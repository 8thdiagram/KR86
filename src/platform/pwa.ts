import { useEffect, useSyncExternalStore } from 'react';
let status = import.meta.env.PROD ? 'Preparing offline play…' : 'Offline caching is available in the release build.';
let registration: ServiceWorkerRegistration | undefined;
let started = false;
let updateReady = false;
let requestedUpdate = false;
let snapshot = { status, updateReady, applyUpdate };
const listeners = new Set<() => void>();
function publish(value: string) {
  status = value;
  snapshot = { status, updateReady, applyUpdate };
  listeners.forEach(fn => fn());
}
function applyUpdate() {
  // Offered only from the main menu. Never reload an active football game.
  requestedUpdate = true;
  registration?.waiting?.postMessage({ type: 'APPLY_UPDATE' });
}
async function start() {
  if (started || !import.meta.env.PROD) return;
  started = true;
  if (!('serviceWorker' in navigator)) { publish('Offline caching is unavailable in this browser. Online play still works.'); return; }
  const onlineStatus = () => {
    if (registration?.active) publish(navigator.onLine ? 'Ready for offline play on this device.' : 'Offline · ready to play.');
  };
  window.addEventListener('online', onlineStatus);
  window.addEventListener('offline', onlineStatus);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (requestedUpdate) window.location.reload();
    else onlineStatus();
  });
  try {
    registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' });
    const inspect = () => {
      updateReady = !!registration?.waiting && !!registration?.active;
      if (updateReady) publish('Update downloaded. Apply it from the menu when you are ready.');
      else if (registration?.active) onlineStatus();
    };
    inspect();
    registration.addEventListener('updatefound', () => {
      const worker = registration?.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' || worker.state === 'activated') inspect();
        if (worker.state === 'redundant' && !registration?.active) publish('Offline download failed. Reopen while online to retry.');
      });
    });
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'activated' || installing.state === 'installed') inspect();
      if (installing.state === 'redundant' && !registration?.active) publish('Offline download failed. Reopen while online to retry.');
    });
    void navigator.storage?.persist?.().catch(() => false); // iOS may decline; backups remain necessary.
  } catch { publish('Offline download unavailable. You can play online; reopen while online to retry.'); }
}
export function usePwaStatus() {
  useEffect(() => { void start(); }, []);
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => snapshot);
}
