import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const app = path.resolve(import.meta.dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(app, 'game-source-lock.json'), 'utf8'));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let unchanged = 0, original = 0;
for (const [file, expected] of Object.entries(lock.files)) {
  const source = path.resolve(app, '../ai-business/src', file);
  if (fs.existsSync(source)) {
    if (digest(source) !== expected) throw new Error(`The original game changed since extraction: ${file}. Stage and review updates explicitly.`);
    original++;
  }
  if (!lock.adapters.includes(file)) {
    if (digest(path.join(app, 'src/game', file)) !== expected)
      throw new Error(`Unreviewed game change: ${file}`);
    unchanged++;
  }
}
console.info(`${unchanged} engine, graphics, controls and supporting files match the frozen game exactly.`);
console.info(original ? `${original} original trytry source files remain unchanged.` : 'Portable copy: original trytry project is not present (expected).');
console.info('Only the explicitly listed standalone storage/authentication/sound-setting adapters may differ.');
