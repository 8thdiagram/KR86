import { kickSeed } from '../kick-return-engine';
import { PLAYBOOK } from './playbook';
import { clamp, type Athlete, type FootballGame, type LivePlay } from './types';

export const LINE_RUSH = { delay: 3, chance: .2 } as const;

// Independent seeded streams keep the result stable across saves/frame rates
// without consuming the passing/fumble random stream.
export function lineRushRoll(g: FootballGame, l: LivePlay, defender: number) {
  let seed = kickSeed(`${g.seed}:${g.plays}:${l.snapSpot}:${g.possession}:line-rush:${defender}`);
  // Avalanche the complete key so neighboring defender IDs are not correlated.
  seed = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad);
  seed = Math.imul(seed ^ (seed >>> 15), 0x735a2d97);
  return ((seed ^ (seed >>> 15)) >>> 0) / 4294967296;
}

export function stepLineRush(g: FootballGame) {
  const l = g.live!;
  if (PLAYBOOK[l.play].kind !== 'pass' || !['dropback', 'scramble'].includes(l.mode) ||
      l.passCaught || l.crossedLos || l.time < LINE_RUSH.delay || l.lineRush) return;
  const blockers = l.athletes.filter(a => a.side === 'offense' && a.role === 'OL');
  const winners = l.athletes.filter(d => d.side === 'defense' && d.role === 'DL')
    .filter(d => lineRushRoll(g, l, d.id) < LINE_RUSH.chance)
    .map(d => {
      d.engaged = Math.min(d.engaged, l.time);
      d.pursuit = undefined;
      return { defender: d.id, escapeY: clamp(d.startY < 96
        ? Math.min(...blockers.map(b => b.y)) - 18
        : Math.max(...blockers.map(b => b.y)) + 18, 25, 167) };
    });
  // Persist misses as well as wins: never reroll on a later frame or reload.
  l.lineRush = { checked: true, winners };
}

export function lineRushTarget(l: LivePlay, d: Athlete) {
  const win = l.lineRush?.winners.find(w => w.defender === d.id);
  if (!win || l.passCaught || !['dropback', 'scramble', 'flight'].includes(l.mode)) return;
  const los = 100 + l.snapSpot * 10;
  if (!win.cleared && (Math.abs(d.y - win.escapeY) < 4 || d.x < los - 7)) {
    win.cleared = true;
  }
  // Physically slip around the protection, then pursue the QB. Contact, not
  // the random roll, produces the sack through the normal tackle rules.
  if (!win.cleared) return { x: los - 6, y: win.escapeY };
  const qb = l.athletes[5]!;
  return { x: qb.x, y: qb.y };
}
