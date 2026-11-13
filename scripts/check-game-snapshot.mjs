import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const app = path.resolve(import.meta.dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(app, 'game-source-lock.json'), 'utf8'));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let unchanged = 0, original = 0;
let customized = 0;
for (const [file, expected] of Object.entries(lock.files)) {
  const source = path.resolve(app, '../ai-business/src', file);
  if (fs.existsSync(source)) {
    if (digest(source) !== expected) throw new Error(`The original game changed since extraction: ${file}. Stage and review updates explicitly.`);
    original++;
  }
  if (!lock.adapters.includes(file)) {
    const approved = lock.gameplayOverrides?.[file];
    if (digest(path.join(app, 'src/game', file)) !== (approved ?? expected))
      throw new Error(`Unreviewed game change: ${file}`);
    if (approved) customized++;
    else unchanged++;
  }
}
for (const [file, expected] of Object.entries(lock.gameplayOverrides ?? {})) {
  if (!(file in lock.files)) {
    if (digest(path.join(app, 'src/game', file)) !== expected) throw new Error(`Unreviewed gameplay customization: ${file}`);
    customized++;
  }
}
console.info(`${unchanged} engine, graphics, controls and supporting files match the frozen game exactly.`);
if (customized) console.info(`${customized} explicitly approved gameplay customizations match their reviewed snapshots.`);
console.info(original ? `${original} original trytry source files remain unchanged.` : 'Portable copy: original trytry project is not present (expected).');
console.info('Only explicitly listed platform adapters and reviewed gameplay customizations may differ.');
