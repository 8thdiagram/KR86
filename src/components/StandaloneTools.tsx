import { useEffect, useRef, useState } from 'react';
import { exportBackup, importBackup, readBackup } from '@/platform/backups';
import { usePwaStatus } from '@/platform/pwa';
import './StandaloneTools.css';

type Msg = { kind: 'ok' | 'err' | 'info'; text: string } | null;

function errText(e: unknown) {
  return e instanceof Error && e.message ? e.message : 'Something went wrong. Nothing was changed.';
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
}

export default function StandaloneTools() {
  const pwa = usePwaStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'export' | 'read' | 'import'>('');
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, setPending] = useState<{ summary: string; payload: unknown; name: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const installed = isStandalone();

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const on = () => setPortrait(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  async function doExport() {
    setBusy('export'); setMsg(null);
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kick-return-86-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setMsg({ kind: 'info', text: 'Backup file prepared. Check your Downloads (Files app on iPhone) to confirm it saved.' });
    } catch (e) { setMsg({ kind: 'err', text: `Export failed: ${errText(e)}` }); }
    finally { setBusy(''); }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy('read'); setMsg(null); setPending(null); setConfirmed(false);
    try {
      const r = await readBackup(f);
      setPending({ ...r, name: f.name });
    } catch (e) { setMsg({ kind: 'err', text: `That file cannot be imported: ${errText(e)}` }); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function doImport() {
    if (!pending || !confirmed) return;
    setBusy('import'); setMsg(null);
    try {
      await importBackup(pending.payload);
      setPending(null); setConfirmed(false);
      setMsg({ kind: 'ok', text: 'Backup restored to this device.' });
    } catch (e) { setMsg({ kind: 'err', text: `Import failed: ${errText(e)}` }); }
    finally { setBusy(''); }
  }

  return (
    <aside className="krt" aria-label="Device tools" data-testid="standalone-tools">
      <div className="krt-panel">
        <header className="krt-heading">
          <h2>SAVE &amp; INSTALL</h2>
          <span className="krt-status" data-testid="status-pwa">{pwa.status}{pwa.updateReady ? ' · update ready' : ''}</span>
        </header>
        <div className="krt-body">
          <div className="krt-sec">
            <h3>UPDATE</h3>
            <p>{pwa.updateReady
              ? 'A newer version is downloaded. Applying it reloads the game; saved progress stays on this device.'
              : 'Check for a newer version without deleting saves. Updates are applied only when you choose.'}</p>
            <div className="krt-row">
              <button type="button" className="krt-btn" onClick={() => void pwa.checkForUpdates()} disabled={pwa.checking} data-testid="button-check-update">{pwa.checking ? 'Checking / downloading…' : 'Check for updates'}</button>
              {pwa.updateReady && <button type="button" className="krt-btn krt-btn--go" onClick={pwa.applyUpdate} data-testid="button-apply-update">Apply update</button>}
            </div>
          </div>

          <div className="krt-sec">
            <h3>BACKUP</h3>
            <p>Progress is stored only in this browser. iOS can clear website data (for example after weeks unused or when storage is low), so export a backup regularly.</p>
            <div className="krt-row">
              <button type="button" className="krt-btn" onClick={doExport} disabled={!!busy} data-testid="button-export-backup">{busy === 'export' ? 'Exporting...' : 'Export backup'}</button>
              <button type="button" className="krt-btn" onClick={() => fileRef.current?.click()} disabled={!!busy} data-testid="button-choose-backup">{busy === 'read' ? 'Checking...' : 'Import backup'}</button>
              <input ref={fileRef} type="file" accept="application/json,.json" onChange={e => onFile(e.target.files?.[0])} data-testid="input-backup-file" />
            </div>
            {pending && (
              <div className="krt-preview" data-testid="panel-import-preview">
                <p><strong>{pending.name}</strong></p>
                <pre data-testid="text-backup-summary">{pending.summary}</pre>
                <label className="krt-hint">
                  <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} data-testid="checkbox-confirm-replace" />{' '}
                  Replace all progress on this device with this backup. This cannot be undone.
                </label>
                <div className="krt-row">
                  <button type="button" className="krt-btn krt-btn--danger" onClick={doImport} disabled={!confirmed || !!busy} data-testid="button-confirm-import">{busy === 'import' ? 'Restoring...' : 'Replace progress'}</button>
                  <button type="button" className="krt-btn" onClick={() => { setPending(null); setConfirmed(false); }} disabled={busy === 'import'} data-testid="button-cancel-import">Cancel</button>
                </div>
              </div>
            )}
            {msg && <p className={`krt-msg${msg.kind === 'err' ? ' krt-msg--err' : msg.kind === 'ok' ? ' krt-msg--ok' : ''}`} role={msg.kind === 'err' ? 'alert' : 'status'} data-testid="text-backup-message">{msg.text}</p>}
          </div>

          {!installed && (
            <div className="krt-sec">
              <h3>ADD TO HOME SCREEN</h3>
              <ol>
                <li>Open this page in Safari.</li>
                <li>Tap Share.</li>
                <li>Tap Add to Home Screen, then Add.</li>
              </ol>
              <p className="krt-hint">The home screen copy keeps its own storage, separate from Safari. Export here and import there to move progress.</p>
            </div>
          )}

          {portrait && (
            <div className="krt-sec">
              <h3>SCREEN</h3>
              <p className="krt-hint" data-testid="text-landscape-hint">The field may be easier to see in landscape. Turn off Portrait Orientation Lock in Control Center and rotate your phone if you prefer.</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
