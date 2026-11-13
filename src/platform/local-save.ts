import { useSyncExternalStore } from 'react';
import type { Franchise } from '../game/lib/football/franchise';
import type { FootballGame } from '../game/lib/football/types';
import { isFranchise } from '../game/lib/football/franchise-validation';
import { isFootballGame } from '../game/lib/football/storage';
import { isKickReturnProgress, type KickReturnProgress } from '../game/lib/kick-return-engine';

export type SaveData = {
  franchise: Franchise | null;
  fullGame: FootballGame | null;
  classic: { seed: number; progress?: KickReturnProgress };
  settings: { classicSound: boolean; footballSound: boolean };
};
export type SaveRecord = { format: 'kick-return-86-device'; version: 1; revision: number; data: SaveData };
export const JOURNAL_KEY = 'kick-return-86:device-journal:v1';
export const DATABASE_NAME = 'kick-return-86-device';
let db: IDBDatabase | undefined;
let record: SaveRecord;
let pending = 0;
let chain: Promise<void> = Promise.resolve();
let initialization: Promise<void> | undefined;
let error = '';
let loaded = false;
let importing = false;
const listeners = new Set<() => void>();
let status = { loaded, pending, error, revision: 0 };
function notify() {
  status = { loaded, pending, error, revision: record?.revision ?? 0 };
  listeners.forEach(fn => fn());
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useSaveStatus = () => useSyncExternalStore(subscribe, () => status);
export function validSaveData(v: unknown): v is SaveData {
  if (!v || typeof v !== 'object') return false;
  const d = v as SaveData;
  return (d.franchise === null || isFranchise(d.franchise)) &&
    (d.fullGame === null || isFootballGame(d.fullGame)) &&
    !!d.classic && Number.isSafeInteger(d.classic.seed) && d.classic.seed >= 0 && d.classic.seed < 2 ** 31 &&
    (d.classic.progress === undefined || isKickReturnProgress(d.classic.progress)) &&
    !!d.settings && typeof d.settings.classicSound === 'boolean' && typeof d.settings.footballSound === 'boolean';
}
export function validSaveRecord(v: unknown): v is SaveRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as SaveRecord;
  return r.format === 'kick-return-86-device' && r.version === 1 &&
    Number.isSafeInteger(r.revision) && r.revision >= 0 && validSaveData(r.data);
}
function blank(): SaveRecord {
  return { format: 'kick-return-86-device', version: 1, revision: 0, data: {
    franchise: null, fullGame: null, classic: { seed: Math.floor(Math.random() * 2 ** 31) },
    settings: { classicSound: true, footballSound: true },
  } };
}
function readJournal(): SaveRecord | undefined {
  const raw = localStorage.getItem(JOURNAL_KEY);
  if (!raw) return undefined;
  const value: unknown = JSON.parse(raw);
  if (!validSaveRecord(value)) throw new Error('The device save journal is unreadable. It has not been replaced. Import a valid backup to recover.');
  return value;
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('saves'); };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); error = 'Another version opened this save. Close the other game window and reopen this one.'; notify(); };
      resolve(request.result);
    };
    request.onerror = () => reject(new Error('Device storage could not open. Allow website storage or use a normal Safari window.'));
    request.onblocked = () => reject(new Error('Close the other Kick Return ’86 window, then reload to open device storage.'));
  });
}
function readDatabase(): Promise<SaveRecord | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db!.transaction('saves', 'readonly');
    const request = tx.objectStore('saves').get('current');
    request.onsuccess = () => {
      const value: unknown = request.result;
      if (value !== undefined && !validSaveRecord(value)) reject(new Error('The saved game is unreadable. It has not been replaced. Export a backup before recovery.'));
      else resolve(value as SaveRecord | undefined);
    };
    tx.onerror = () => reject(new Error('Device storage could not read your saved progress.'));
  });
}
function storeDatabase(next: SaveRecord, expectedRevision: number, previous?: SaveRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db!.transaction('saves', 'readwrite');
    const store = tx.objectStore('saves');
    const request = store.get('current');
    let conflict = false;
    request.onsuccess = () => {
      const stored = request.result as SaveRecord | undefined;
      if ((stored?.revision ?? 0) !== expectedRevision) { conflict = true; tx.abort(); return; }
      if (previous) store.put(previous, 'before-last-import');
      store.put(next, 'current');
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new Error(conflict
      ? 'Another game window changed this save. Export your progress, close the other window, then reload. Nothing was overwritten in the database.'
      : 'Device storage could not finish saving. Keep this window open, export a backup and free some device storage.'));
  });
}
export function initializeSaves(): Promise<void> {
  return initialization ??= (async () => {
    try {
      db = await openDatabase();
      const disk = await readDatabase(), journal = readJournal();
      record = journal && (!disk || journal.revision >= disk.revision) ? journal : disk ?? blank();
      // A synchronous, isolated write-ahead journal covers app termination while IndexedDB is finishing.
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(record));
      await storeDatabase(record, disk?.revision ?? 0);
      loaded = true;
      window.addEventListener('storage', event => {
        if (event.key === JOURNAL_KEY && event.newValue !== JSON.stringify(record)) {
          error = 'Progress changed in another window. Export your progress and reload before continuing. Use one game window at a time.';
          notify();
        }
      });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Device storage is unavailable. Existing progress has not been replaced.';
      throw e;
    } finally { notify(); }
  })();
}
export function readSlot<K extends keyof SaveData>(slot: K): SaveData[K] {
  if (!loaded) throw new Error('Device saves are not ready yet.');
  return structuredClone(record.data[slot]);
}
export function currentSave(): SaveRecord {
  if (!loaded) throw new Error('Device saves are not ready yet.');
  return structuredClone(record);
}
function commitData(data: SaveData, previous?: SaveRecord): boolean {
  if (!loaded || error || !validSaveData(data)) return false;
  try {
    const journal = readJournal();
    if (journal && journal.revision !== record.revision) throw new Error('Another window changed your progress. Export a backup and reload before continuing.');
    const before = record;
    const next: SaveRecord = { ...record, revision: record.revision + 1, data: structuredClone(data) };
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(next)); // If quota is exhausted, do not advance the game.
    record = next; pending++;
    chain = chain.then(() => storeDatabase(next, before.revision, previous)).catch(e => {
      error = e instanceof Error ? e.message : 'Device saving failed. Export a backup before closing.';
      throw e;
    }).finally(() => { pending--; notify(); });
    void chain.catch(() => undefined);
    notify();
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : 'The save journal is full. Export a backup and free device storage.';
    notify(); return false;
  }
}
export function writeSlot<K extends keyof SaveData>(slot: K, value: SaveData[K]): boolean {
  if (!loaded || importing) return false;
  return commitData({ ...record.data, [slot]: value });
}
export function readSound(mode: 'classic' | 'football'): boolean {
  return readSlot('settings')[mode === 'classic' ? 'classicSound' : 'footballSound'];
}
export function writeSound(mode: 'classic' | 'football', value: boolean): boolean {
  return writeSlot('settings', { ...readSlot('settings'), [mode === 'classic' ? 'classicSound' : 'footballSound']: value });
}
export async function flushSaves(): Promise<void> { await chain; if (error) throw new Error(error); }
export async function replaceSaveData(data: SaveData): Promise<void> {
  if (!validSaveData(data)) throw new Error('This backup contains an invalid game. Your progress has not been changed.');
  await flushSaves();
  const previous = currentSave();
  importing = true;
  try {
    if (!commitData(data, previous)) throw new Error(error || 'The backup could not be saved. Your progress has not been changed.');
    await flushSaves();
    window.dispatchEvent(new Event('kick-return-save-imported'));
  } catch (e) {
    // An aborted import transaction must not replace the working journal either.
    record = previous;
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(previous)); } catch { /* Show the original storage failure; never delete a save. */ }
    notify(); throw e;
  } finally { importing = false; }
}
