import assert from 'node:assert/strict';
import test from 'node:test';
import { createFootball, queueDefense } from './engine';
import { isFootballGame } from './storage';
import { DEFENSES, defensiveMenuChoices, matchupAdvantage } from './playbook';

const create = () => createFootball(1986, { player: 'Big Blue', opponent: 'Redbirds' });
test('man coverage and run blitz are distinct, relative to the offensive call', () => {
  assert.equal(DEFENSES.find(d => d.id === 'pass')!.name, 'Zone coverage');
  assert.equal(DEFENSES.find(d => d.id === 'blitz')!.name, 'Man blitz');
  assert(matchupAdvantage('power', 'run-blitz') < matchupAdvantage('power', 'blitz'));
  assert(matchupAdvantage('post', 'run-blitz') > matchupAdvantage('post', 'man'));
  assert(matchupAdvantage('out', 'man') < matchupAdvantage('out', 'pass'));
  assert(matchupAdvantage('draw', 'man') > matchupAdvantage('draw', 'pass'));
});
test('situation changes recommendations within the complete eligible defense menu', () => {
  const short = create(); short.target = short.spot + 1;
  const long = create(); long.target = long.spot + 12; long.down = 3;
  assert.equal(defensiveMenuChoices(short).length, 7);
  assert.equal(defensiveMenuChoices(short)[0]!.id, 'run-blitz');
  assert.deepEqual(new Set(defensiveMenuChoices(long).slice(0,2).map(d=>d.id)),new Set(['pass','prevent']));
});
test('every defense can be called, saved and restored', () => {
  for (const d of ['man', 'run-blitz'] as const) {
    const g = create(); g.phase = 'play-call'; g.possession = 'away';
    queueDefense(g, d);
    assert.equal(g.live!.defense, d);
    assert(isFootballGame(JSON.parse(JSON.stringify(g))));
  }
});
