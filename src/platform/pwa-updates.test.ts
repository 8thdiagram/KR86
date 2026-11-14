import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateMonitor, type UpdateRegistration } from './pwa-updates';

class Worker extends EventTarget {
  state: ServiceWorkerState = 'installing';
  change(state: ServiceWorkerState) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
class Registration extends EventTarget implements UpdateRegistration {
  active: Worker | null = new Worker();
  waiting: Worker | null = null;
  installing: Worker | null = null;
  updates = 0;
  action = async () => {};
  async update() { this.updates++; await this.action(); }
  found(worker: Worker) { this.installing = worker; this.dispatchEvent(new Event('updatefound')); }
}
function setup() {
  let online = true;
  const monitor = createUpdateMonitor(() => {}, () => online);
  const registration = new Registration();
  monitor.attach(registration);
  return { monitor, registration, offline() { online = false; } };
}

test('manual update check explicitly contacts the registration and reports no newer update', async () => {
  const { monitor, registration } = setup();
  await monitor.check();
  assert.equal(registration.updates, 1);
  assert.match(monitor.getSnapshot().status, /No newer update/);
  assert.equal(monitor.getSnapshot().checking, false);
});
test('a failed newer download is visible even with a working installed game', async () => {
  const { monitor, registration } = setup();
  const worker = new Worker();
  registration.action = async () => { registration.found(worker); };
  await monitor.check();
  assert.equal(monitor.getSnapshot().checking, true);
  worker.change('redundant');
  assert.match(monitor.getSnapshot().status, /Update download failed/);
  monitor.refresh();
  assert.match(monitor.getSnapshot().status, /Update download failed/);
  assert.equal(monitor.getSnapshot().checking, false);
  registration.installing = null;
  registration.action = async () => {};
  await monitor.check();
  assert.match(monitor.getSnapshot().status, /No newer update/);
});
test('installed state is rechecked after waiting registration becomes visible', async () => {
  const { monitor, registration } = setup();
  const worker = new Worker();
  registration.found(worker);
  worker.change('installed');
  registration.installing = null;
  registration.waiting = worker;
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(monitor.getSnapshot().updateReady, true);
  assert.equal(monitor.getSnapshot().checking, false);
});
test('waiting updates are discovered immediately when returning to the menu', () => {
  const { monitor, registration } = setup();
  registration.waiting = new Worker();
  monitor.refresh();
  assert.equal(monitor.getSnapshot().updateReady, true);
});
test('offline checks and network errors are explicit and never claim the app is current', async () => {
  const { monitor, registration, offline } = setup();
  registration.action = async () => { throw new Error('network'); };
  await monitor.check();
  assert.match(monitor.getSnapshot().status, /Could not check/);
  offline();
  await monitor.check();
  assert.match(monitor.getSnapshot().status, /You are offline/);
  assert.equal(registration.updates, 1);
});
test('a newly active worker offers a user-approved reload rather than silently leaving old artwork', () => {
  const { monitor } = setup();
  monitor.activated();
  assert.equal(monitor.getSnapshot().updateReady, true);
  assert.match(monitor.getSnapshot().status, /Update ready/);
});
test('initial installation failures are distinguished from update failures', () => {
  const { monitor, registration } = setup();
  registration.active = null;
  const worker = new Worker();
  registration.found(worker);
  worker.change('redundant');
  assert.match(monitor.getSnapshot().status, /Offline download failed/);
});
