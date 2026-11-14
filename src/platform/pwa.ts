import { useEffect, useSyncExternalStore } from 'react';
import { createUpdateMonitor } from './pwa-updates';
let registration: ServiceWorkerRegistration | undefined;
let startup: Promise<void> | undefined;
let requestedUpdate = false;
let watchingController = false;
let menuMounts = 0;
const listeners = new Set<() => void>();
const monitor = createUpdateMonitor(() => {
  snapshot = { ...monitor.getSnapshot(), applyUpdate, checkForUpdates };
  listeners.forEach(fn => fn());
}, () => navigator.onLine);
let snapshot = { ...monitor.getSnapshot(), applyUpdate, checkForUpdates };
function applyUpdate() {
  // Offered only from the main menu. Never reload an active football game.
  if (registration?.waiting) {
    requestedUpdate = true;
    registration.waiting.postMessage({ type: 'APPLY_UPDATE' });
  } else if (monitor.getSnapshot().updateReady) window.location.reload();
}
async function checkForUpdates() {
  await start();
  await monitor.check();
}
async function register() {
  if (!import.meta.env.PROD) { monitor.report('Offline caching is available in the release build.'); return; }
  if (!('serviceWorker' in navigator)) { monitor.report('Offline caching is unavailable in this browser. Online play still works.'); return; }
  try {
    registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' });
    monitor.attach(registration);
    void navigator.storage?.persist?.().catch(() => false); // iOS may decline; backups remain necessary.
  } catch {
    startup = undefined;
    monitor.report('Offline download unavailable. You can play online; check for updates to retry.');
  }
}
function start() {
  if (!watchingController) {
    watchingController = true;
    let controlled = !!navigator.serviceWorker?.controller;
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      if (requestedUpdate && menuMounts > 0) window.location.reload();
      else if (controlled || requestedUpdate) monitor.activated();
      else monitor.refresh();
      requestedUpdate = false;
      controlled = true;
    });
  }
  if (!startup) startup = register();
  return startup;
}
export function usePwaStatus() {
  useEffect(() => {
    menuMounts++;
    void start();
    const refresh = () => { if (document.visibilityState === 'visible') monitor.refresh(); };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    monitor.refresh();
    return () => {
      menuMounts--;
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => snapshot);
}
