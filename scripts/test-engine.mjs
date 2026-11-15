import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const app = path.resolve(import.meta.dirname, '..');
const directory = path.join(app, 'src/game/lib/football');
// These original tests assert account-scoped localStorage, which intentionally
// does not exist here. Their replacement is the standalone IndexedDB/journal suite.
const accountOnly = 'full-game saves are identity isolated|historical three-minute saves|leftward live saves retain|timeout remainder and pending';
const files = fs.readdirSync(directory).filter(f => f.endsWith('.test.ts')).map(f => path.join(directory, f));
files.push(path.join(app, 'src/game/lib/game-audio-activation.test.ts'),
  path.join(app, 'src/game/components/football-animation-clock.test.ts'));
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test',
  `--test-skip-pattern=${accountOnly}`, ...files], { cwd: app, stdio: 'inherit' });
process.exit(result.status ?? 1);
