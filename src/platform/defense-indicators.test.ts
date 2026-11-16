import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('only the original offensive receiver has a player selection target', () => {
  const renderer = read('../game/components/football-renderer.ts');
  assert.doesNotMatch(renderer, /controlledDefenderId|isUserKickoffCoverage|manualDefense/);
  assert.equal([...renderer.matchAll(/playerTarget\(ctx,/g)].length, 1);
  assert.match(renderer, /a\.id === read && g\.possession === 'home'/);
  assert.match(renderer, /live\.holdingPass \? PLAYER_TARGET_YELLOW : PLAYER_TARGET_WHITE/);
  assert.doesNotMatch(read('../game/lib/football/diagrams.ts'), /controlledDefenderId|controlled:/);
  assert.doesNotMatch(read('../game/components/football-preplay.tsx'), /fbp-controlled|PLAYER_TARGET_PIXELS/);
});

test('panic positioning does not restore manual arrows, persistent selection or the old kicker override', () => {
  const files = ['../game/lib/football/pursuit.ts', '../game/lib/football/field.ts',
    '../game/lib/football/controls.ts', '../game/lib/football/special-teams.ts',
    '../game/lib/kick-return-engine.ts', '../game/lib/kick-full-coverage.ts',
    '../game/lib/kick-open-field.ts', '../game/lib/football/types.ts',
    '../game/components/football-game.tsx'];
  for (const file of files)
    assert.doesNotMatch(read(file), /defenseDirection|userDefense|user-defense|prepareUserDefense|consumeDefenseRelease|coverageInput|KickCoverageInput|strafe/i, file);
  assert.equal(fs.existsSync(new URL('../game/lib/football/user-defense.ts', import.meta.url)), false);
  const game = read('../game/components/football-game.tsx');
  assert.match(game, /disabled=\{!controlsActive\}/);
  const controls = read('../game/lib/football/controls.ts');
  assert.match(controls, /control === 'juke' && canDefensiveAction\(g\)/);
  assert.match(controls, /kick = true; consumed\.add\(id\); return/);
  assert.doesNotMatch(controls, /defenseOwner|defenseTap|DEFENSE_HOLD_MS/);
  assert.match(controls, /defenseHold: validDefense\(\)/);
  const panic = read('../game/lib/football/defensive-panic.ts');
  assert.match(panic, /new WeakMap/);
  assert.doesNotMatch(read('../game/lib/football/storage.ts'), /defenseHold|panic|selectedDefender/);
});
