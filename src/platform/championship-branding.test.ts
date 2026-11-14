import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROUND_NAMES } from '../game/lib/football/franchise';

test('championship labels, animated presentations, accessibility and spoken announcements use Super Cup', () => {
  assert.equal(ROUND_NAMES.at(-1), 'SUPER CUP');
  for (const file of ['components/football-franchise.tsx', 'components/franchise-league.tsx',
    'components/franchise-shows.tsx', 'lib/football/franchise.ts']) {
    const source = fs.readFileSync(new URL(`../game/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /super[\s_-]*bowl/i, file);
  }
  const shows = fs.readFileSync(new URL('../game/components/franchise-shows.tsx', import.meta.url), 'utf8');
  for (const label of ['YOU MADE THE SUPER CUP!', 'THE SUPER CUP!', 'SUPER CUP HALFTIME',
    'YOU WON THE SUPER CUP!', 'SUPER CUP FINAL', 'SUPER CUP MVP:', 'Super Cup halftime show',
    "a.say('The Super Cup!'", 'a.say(`Super Cup M V P:']) {
    assert(shows.includes(label), `Missing championship presentation: ${label}`);
  }
});
