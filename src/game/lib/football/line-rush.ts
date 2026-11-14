import { kickSeed } from '../kick-return-engine';
import { PLAYBOOK } from './playbook';
import { clamp, type Athlete, type FootballGame, type LivePlay } from './types';

export const LINE_RUSH = { delay: 3, chance: .2 } as const;

// Independent seeded streams keep the result stable across saves/frame rates
// without consuming the passing/fumble random stream.
export function lineRushRoll(g: FootballGame, l: LivePlay, defender: number, second = LINE_RUSH.delay as number) {
  // Keep the first check compatible with saves from the original one-roll rule.
  const key = `${g.seed}:${g.plays}:${l.snapSpot}:${g.possession}:line-rush:${defender}`;
  let seed = kickSeed(second === LINE_RUSH.delay ? key : `${key}:second:${second}`);
  // Avalanche the complete key so neighboring defender IDs are not correlated.
  seed = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad);
  seed = Math.imul(seed ^ (seed >>> 15), 0x735a2d97);
  return ((seed ^ (seed >>> 15)) >>> 0) / 4294967296;
}

export function stepLineRush(g: FootballGame) {
  if (g.phase !== 'live' || !g.live) return;
  const l = g.live;
  if (PLAYBOOK[l.play].kind !== 'pass' || !['dropback', 'scramble'].includes(l.mode) ||
      l.passCaught || l.crossedLos || l.athletes[5]!.x >= 100 + l.snapSpot * 10 ||
      l.time < LINE_RUSH.delay) return;
  const second = Math.floor(l.time + 1e-9);
  const prior = l.lineRush;
  const state = l.lineRush ??= { checked: true, lastCheck: LINE_RUSH.delay - 1, winners: [] };
  // Legacy saves already made their first check. Resume at the next second,
  // rather than granting retroactive rolls on loading a long-held play.
  if (prior && state.lastCheck === undefined) state.lastCheck = second;
  const blockers = l.athletes.filter(a => a.side === 'offense' && a.role === 'OL');
  const linemen = l.athletes.filter(d => d.side === 'defense' && d.role === 'DL');
  for (let check = state.lastCheck! + 1; check <= second; check++) {
    for (const d of linemen) {
      if (state.winners.some(w => w.defender === d.id) || l.penetration?.event?.defender === d.id) continue;
      // Do not manufacture a breakthrough for a rusher already in open space.
      const blocked = d.engaged > l.time || (d.x >= 100 + l.snapSpot * 10 - 7 &&
        blockers.some(b => Math.hypot(d.x - b.x, d.y - b.y) < 30));
      if (!blocked || lineRushRoll(g, l, d.id, check) >= LINE_RUSH.chance) continue;
      d.engaged = Math.min(d.engaged, l.time);
      d.pursuit = undefined;
      state.winners.push({ defender: d.id, escapeY: clamp(d.startY < 96
        ? Math.min(...blockers.map(b => b.y)) - 18
        : Math.max(...blockers.map(b => b.y)) + 18, 25, 167) });
    }
    // Persist misses as well as wins: no repeated roll within this second.
    state.lastCheck = check;
  }
}

export function lineRushTarget(l: LivePlay, d: Athlete) {
  const win = l.lineRush?.winners.find(w => w.defender === d.id);
  if (!win || l.passCaught || !['dropback', 'scramble'].includes(l.mode)) return;
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
