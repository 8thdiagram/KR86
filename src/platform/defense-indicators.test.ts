import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
test('selection targets exist only on the live field, not defensive play diagrams', () => {
  const diagrams = read('../game/lib/football/diagrams.ts'), preplay = read('../game/components/football-preplay.tsx');
  assert.doesNotMatch(diagrams, /controlledDefenderId|controlled:/);
  assert.doesNotMatch(preplay, /fbp-controlled|PLAYER_TARGET_PIXELS|DIAGRAM_TARGET_SCALE/);
  const renderer = read('../game/components/football-renderer.ts');
  assert.match(renderer, /controlledDefenderId\(live\)/);
  assert.match(renderer, /a\.id === sp\.kicker && isUserKickoffCoverage\(g\)/);
  assert.match(renderer, /playerTarget\(ctx, a\.x, a\.y, manualDefense \? PLAYER_TARGET_YELLOW : PLAYER_TARGET_WHITE\)/);
  assert.match(renderer, /playerTarget\(ctx, a\.x, a\.y, live\.holdingPass \? PLAYER_TARGET_YELLOW : PLAYER_TARGET_WHITE\)/);
  assert.match(renderer, /for \(const \[dx, dy, width, height\] of PLAYER_TARGET_PIXELS\)/);
  assert.doesNotMatch(renderer, /#f0443e/);
});
test('only arrows color the defensive target, and there is no ACTION tap/hold movement system', () => {
  const game = read('../game/components/football-game.tsx'), controls = read('../game/lib/football/controls.ts');
  assert.match(game, /!!controls\.defenseDirection\)/);
  assert.doesNotMatch(game, /controls\.pressed\.juke \|\| controls\.defenseDirection|Hold: pursue/);
  assert.doesNotMatch(controls, /defenseOwner|defenseTap|DEFENSE_HOLD_MS|defenseHold/);
  assert.match(controls, /control === 'juke' && canDefensiveAction\(g\)/);
  assert.match(controls, /kick = true; consumed\.add\(id\); return/);
});
