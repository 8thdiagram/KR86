/** Update state is separate from saves. Nothing here clears storage or reloads a page. */
export type UpdateWorker = Pick<ServiceWorker, 'state' | 'addEventListener'>;
export type UpdateRegistration = {
  active: UpdateWorker | null;
  installing: UpdateWorker | null;
  waiting: UpdateWorker | null;
  addEventListener: ServiceWorkerRegistration['addEventListener'];
  update(): Promise<unknown>;
};

export function createUpdateMonitor(notify: () => void, online: () => boolean) {
  let registration: UpdateRegistration | undefined;
  let failure = '';
  let activatedUpdate = false;
  let snapshot = { status: 'Preparing offline play…', updateReady: false, checking: false };
  const watched = new WeakSet<UpdateWorker>();
  function publish(status: string, checking = false) {
    snapshot = { status, checking, updateReady: !!registration?.waiting || activatedUpdate };
    notify();
  }
  function inspect() {
    if (failure) publish(failure);
    else if (registration?.waiting || activatedUpdate) publish('Update ready. Apply it from the menu when you are ready.');
    else if (registration?.installing) publish('Downloading game files. Keep this page open while online…', true);
    else if (registration?.active) publish(online() ? 'Ready for offline play on this device.' : 'Offline · ready to play.');
  }
  function watch(worker: UpdateWorker | null) {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'redundant') {
        failure = registration?.active
          ? 'Update download failed. Your installed game and saves are unchanged. Check for updates to retry.'
          : 'Offline download failed. Connect to the internet and check for updates to retry.';
        inspect();
      } else {
        inspect();
        // Safari may expose registration.waiting only after the installed event finishes.
        if (worker.state === 'installed') setTimeout(inspect, 0);
      }
    });
  }
  return {
    getSnapshot: () => snapshot,
    report: (message: string) => { failure = message; publish(message); },
    attach(next: UpdateRegistration) {
      registration = next;
      next.addEventListener('updatefound', () => {
        failure = '';
        watch(next.installing);
        inspect();
      });
      watch(next.installing);
      inspect();
    },
    refresh: inspect,
    activated() { activatedUpdate = true; failure = ''; inspect(); },
    async check() {
      if (snapshot.checking) return;
      if (!online()) { failure = 'You are offline. Connect to the internet to check for updates. Saved progress is unchanged.'; inspect(); return; }
      if (!registration) return;
      failure = '';
      publish('Checking for updates…', true);
      try {
        await registration.update();
        watch(registration.installing);
        if (failure) inspect();
        else if (!registration.installing && !registration.waiting && !activatedUpdate) {
          publish('No newer update found. Your installed game is ready for offline play.');
        } else inspect();
      } catch {
        failure = 'Could not check for updates. Your installed game and saves are unchanged. Try again when connected.';
        inspect();
      }
    },
  };
}
