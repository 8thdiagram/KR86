import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { initializeSaves, currentSave, readSlot, writeSlot, flushSaves, JOURNAL_KEY, DATABASE_NAME } from './local-save';
import { exportBackup, readBackup, importBackup } from './backups';
import { createFranchise, startFranchiseGame } from '../game/lib/football/franchise';
import { KICK_TEAMS } from '../game/lib/kick-return-teams';

class MemoryStorage {
  private values = new Map<string, string>();
  fail = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.fail) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}
const storage = new MemoryStorage();
Object.assign(globalThis, { indexedDB, localStorage: storage, window: new EventTarget() });
storage.setItem('trytry:football-franchise:existing-account:v1', '{"protected":true}');
async function stored() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DATABASE_NAME, 1);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction('saves').objectStore('saves').get('current');
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}
test('independent saves, IndexedDB durability and safe backup import', async t => {
  await initializeSaves();
  await t.test('initialization never reads, changes or removes trytry progress', () => {
    assert.equal(readSlot('franchise'), null);
    assert.equal(storage.getItem('trytry:football-franchise:existing-account:v1'), '{"protected":true}');
    assert.equal(currentSave().revision, 0);
  });
  await t.test('the synchronous journal preserves a complete franchise before the asynchronous checkpoint completes', async () => {
    const franchise = startFranchiseGame(createFranchise(KICK_TEAMS[0]!.name, 84642));
    assert(writeSlot('franchise', franchise));
    assert.deepEqual(JSON.parse(storage.getItem(JOURNAL_KEY)!).data.franchise, JSON.parse(JSON.stringify(franchise)));
    await flushSaves();
    assert.deepEqual((await stored() as ReturnType<typeof currentSave>).data.franchise, JSON.parse(JSON.stringify(franchise)));
  });
  await t.test('Full Game and Classic slots are independent from Franchise', async () => {
    const f = readSlot('franchise')!;
    assert(writeSlot('fullGame', f.active!.game));
    assert(writeSlot('settings', { classicSound: false, footballSound: true }));
    await flushSaves();
    assert.equal(readSlot('franchise')!.team, f.team);
    assert.equal(readSlot('settings').classicSound, false);
    assert.equal(readSlot('classic').progress, undefined);
  });
  let backup: Blob;
  let payload: unknown;
  await t.test('export includes every standalone save slot and no trytry data', async () => {
    backup = await exportBackup();
    const raw = await backup.text();
    assert(!raw.includes('existing-account'));
    const decoded = await readBackup(new File([backup], 'backup.json'));
    assert(decoded.summary.includes(KICK_TEAMS[0]!.name));
    payload = decoded.payload;
  });
  await t.test('malformed, foreign and structurally damaged imports cannot change progress', async () => {
    const before = currentSave();
    for (const text of ['{', '{}', '{"format":"trytry"}', JSON.stringify({ format: 'kick-return-86-backup', version: 1, exportedAt: new Date().toISOString(), data: { franchise: { team: 'INVALID' } } })]) {
      await assert.rejects(readBackup(new File([text], 'broken.json')));
    }
    await assert.rejects(importBackup({}));
    assert.deepEqual(currentSave(), before);
    assert.deepEqual(await stored(), JSON.parse(JSON.stringify(before)));
  });
  await t.test('a valid restore atomically restores Franchise, Full Game, Classic and settings', async () => {
    assert(writeSlot('settings', { classicSound: true, footballSound: false }));
    await flushSaves();
    await importBackup(payload);
    assert.deepEqual(currentSave().data, JSON.parse(await backup.text()).data);
    assert.deepEqual((await stored() as ReturnType<typeof currentSave>).data, currentSave().data);
    assert.equal(storage.getItem('trytry:football-franchise:existing-account:v1'), '{"protected":true}');
  });
  await t.test('quota failure never advances or replaces the last valid checkpoint', async () => {
    const before = currentSave();
    storage.fail = true;
    assert.equal(writeSlot('settings', { classicSound: true, footballSound: true }), false);
    assert.deepEqual(currentSave(), before);
    assert.deepEqual(await stored(), JSON.parse(JSON.stringify(before)));
    storage.fail = false;
    assert.deepEqual(JSON.parse(await (await exportBackup()).text()).data, before.data, 'export remains available when saving is blocked');
  });
});
