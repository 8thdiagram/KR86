import type { Franchise } from './franchise';
import type { FootballGame, Side } from './types';
import { legendaryPlayer, type Legend, type LegendPosition } from './legendary-roster';
import { MVP_IDS, speedSlot, type MvpId, type MvpCounts } from './mvp';

export type PlayerAward = {
  legendId?: string; position?: LegendPosition; number?: number;
  performance?: string;
};
export type OwnedAwards = Record<string, Partial<Record<MvpId, number>>>;
export const rewardSlot = (position: LegendPosition): MvpId =>
  position === 'QB' ? 'QB1' : position === 'K' ? 'K1' : position === 'KR' ? 'KR1'
    : position === 'RB' ? 'RB1' : position === 'LB' ? 'LB1'
    : position === 'CB' || position === 'S' ? 'DB1' : 'WR1';
export const legacyPosition: Record<MvpId, LegendPosition> = {
  QB1: 'QB', RB1: 'RB', WR1: 'WR', DB1: 'CB', LB1: 'LB', KR1: 'KR', K1: 'K',
};
/** Human records are authoritative on old saves with no league ledger yet. */
export function teamAwards(f: Franchise, team: string) {
  return team === f.team ? f.awards : (f.league?.awards ?? []).filter(a => a.team === team);
}
export function legacyTeamCounts(f: Franchise, team: string): MvpCounts {
  const rows = teamAwards(f, team);
  return Object.fromEntries(MVP_IDS.map(slot => [slot, rows.filter(a => !a.legendId && a.slot === slot).length])) as MvpCounts;
}
export function ownedTeamAwards(f: Franchise, team: string): OwnedAwards {
  const owned: OwnedAwards = {};
  for (const a of teamAwards(f, team)) if (a.legendId) {
    const row = owned[a.legendId] ??= {};
    row[a.slot] = (row[a.slot] ?? 0) + 1;
  }
  return owned;
}
export function ownedGameAwards(g: FootballGame, side: Side, legend: Legend | undefined) {
  return legend ? g.franchise?.playerAwards?.[side]?.[legend.identity] : undefined;
}
export function modernCount(row: Partial<Record<MvpId, number>> | undefined, slot: MvpId) {
  return row?.[slot] ?? 0;
}
export function modernSpeedCount(row: Partial<Record<MvpId, number>> | undefined) {
  return MVP_IDS.reduce((sum, slot) => sum + (speedSlot(slot) ? modernCount(row, slot) : 0), 0);
}
export function slotLegend(g: FootballGame, side: Side, slot: MvpId) {
  return legendaryPlayer(side === 'home' ? g.teams.player : g.teams.opponent, legacyPosition[slot]);
}
export function legendAwardCounts(f: Franchise, team: string, legend: Legend) {
  const counts: Partial<Record<MvpId, number>> = { ...ownedTeamAwards(f, team)[legend.identity] };
  // Historical slot awards stay on their original actor, never move to a
  // safety, TE, or another player with the same jersey number.
  for (const a of teamAwards(f, team)) {
    if (!a.legendId && legendaryPlayer(team, legacyPosition[a.slot])?.identity === legend.identity)
      counts[a.slot] = (counts[a.slot] ?? 0) + 1;
  }
  return counts;
}
export function legendEffectCounts(f: Franchise, team: string, legend: Legend) {
  const counts: Partial<Record<MvpId, number>> = { ...ownedTeamAwards(f, team)[legend.identity] };
  for (const a of teamAwards(f, team)) if (!a.legendId && legacyPosition[a.slot] === legend.position)
    counts[a.slot] = (counts[a.slot] ?? 0) + 1;
  return counts;
}
export function validPlayerAward(a: PlayerAward & { slot: MvpId }, team: string) {
  if (a.legendId === undefined)
    return a.position === undefined && a.number === undefined && a.performance === undefined;
  const legend = a.position && legendaryPlayer(team, a.position);
  return !!legend && legend.identity === a.legendId && legend.number === a.number &&
    rewardSlot(legend.position) === a.slot && typeof a.performance === 'string' && a.performance.length <= 600;
}
