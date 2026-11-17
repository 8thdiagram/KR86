import type { FootballGame } from './types';
import { legendaryPlayer } from './legendary-roster';
import { MVP_IDS } from './mvp';
import { PERFORMANCE_STATS } from './mvp-performance';
import { rewardSlot } from './legend-awards';

/** Optional additive fields: absence means historical/unavailable, not zero
 * performance. Reject corrupt identity/count data rather than inventing it. */
export function validMvpState(g: FootballGame) {
  const f = g.franchise;
  if (!f) return true;
  if (typeof f !== 'object' || !g.teams || typeof g.teams.player !== 'string' ||
      typeof g.teams.opponent !== 'string') return false;
  const teams = { home: g.teams.player, away: g.teams.opponent };
  if (f.playerAwards !== undefined) {
    if (!f.playerAwards || typeof f.playerAwards !== 'object' || Array.isArray(f.playerAwards)) return false;
    for (const [side, rows] of Object.entries(f.playerAwards)) {
      if (side !== 'home' && side !== 'away' || !rows || typeof rows !== 'object' || Array.isArray(rows)) return false;
      for (const [id, counts] of Object.entries(rows)) {
        if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return false;
        for (const [slot, count] of Object.entries(counts)) {
          if (!MVP_IDS.includes(slot as typeof MVP_IDS[number]) || !Number.isSafeInteger(count) || count! < 0 ||
              !(['QB', 'RB', 'WR', 'TE', 'LB', 'CB', 'S', 'KR', 'K'] as const).some(position => {
                const p = legendaryPlayer(teams[side], position);
                return p?.identity === id && rewardSlot(position) === slot;
              })) return false;
        }
      }
    }
  }
  const p = f.performance;
  if (p === undefined) return true;
  if (!p || p.version !== 1 || p.gameId !== f.gameId || p.coverage !== 'full-game' ||
      !p.players || typeof p.players !== 'object' || Array.isArray(p.players)) return false;
  for (const [side, rows] of Object.entries(p.players)) {
    if (side !== 'home' && side !== 'away' || !rows || typeof rows !== 'object' || Array.isArray(rows)) return false;
    if (Object.keys(rows).length > 9) return false;
    for (const [key, row] of Object.entries(rows)) {
      if (!row || typeof row !== 'object') return false;
      const legend = legendaryPlayer(teams[side], row.position);
      if (!legend || row.identity !== legend.identity || row.number !== legend.number ||
          key !== `${row.identity}/${row.position}` || !row.stats || typeof row.stats !== 'object' ||
          Array.isArray(row.stats) || !Object.entries(row.stats).every(([metric, value]) =>
            PERFORMANCE_STATS.includes(metric as typeof PERFORMANCE_STATS[number]) && Number.isFinite(value) &&
            (metric.endsWith('Yards') || Number.isSafeInteger(value) && value! >= 0))) return false;
    }
  }
  return true;
}
