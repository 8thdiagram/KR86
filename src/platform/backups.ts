import { currentSave, flushSaves, replaceSaveData, validSaveData, type SaveData } from './local-save';
type Backup = { format: 'kick-return-86-backup'; version: 1; exportedAt: string; data: SaveData };
function validBackup(value: unknown): value is Backup {
  if (!value || typeof value !== 'object') return false;
  const b = value as Backup;
  return b.format === 'kick-return-86-backup' && b.version === 1 &&
    typeof b.exportedAt === 'string' && Number.isFinite(Date.parse(b.exportedAt)) && validSaveData(b.data);
}
export async function exportBackup(): Promise<Blob> {
  // Even when the database mirror fails, export the last journaled progress for recovery.
  const backup: Backup = { format: 'kick-return-86-backup', version: 1, exportedAt: new Date().toISOString(), data: currentSave().data };
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}
export async function readBackup(file: File): Promise<{ summary: string; payload: unknown }> {
  if (file.size > 32 * 1024 * 1024) throw new Error('This file exceeds the 32 MB backup limit. Your current progress is unchanged.');
  let value: unknown;
  try { value = JSON.parse(await file.text()); } catch { throw new Error('This is not a readable JSON backup. Your current progress is unchanged.'); }
  if (!validBackup(value)) throw new Error('This is not a valid Kick Return ’86 standalone backup, or it contains damaged progress. Nothing was changed.');
  const f = value.data.franchise;
  const summary = `${f ? `${f.team} · Season ${f.season}` : 'No Franchise'} · ${value.data.fullGame ? 'Full Game saved' : 'No Full Game'} · ${new Date(value.exportedAt).toLocaleString()}`;
  return { summary, payload: value };
}
export async function importBackup(payload: unknown): Promise<void> {
  if (!validBackup(payload)) throw new Error('Invalid backup. Your current progress is unchanged.');
  await flushSaves();
  await replaceSaveData(payload.data);
}
