import type { Athlete, FootballGame, Side } from './types';
import { other } from './types';
import { legendaryPlayer, legendaryRoleFactor, type LegendPosition } from './legendary-roster';
export { legendaryPlayer, legendaryRoleFactor } from './legendary-roster';

export const legendTeam = (g: FootballGame, side: Side) => side === 'home' ? g.teams.player : g.teams.opponent;
const slotCache = new WeakMap<Athlete[], ReadonlyMap<number, LegendPosition>>();
const fieldSlots: ReadonlyMap<number, LegendPosition> = new Map([
  [3,'WR'],[4,'TE'],[5,'QB'],[6,'RB'],[10,'LB'],[11,'CB'],[13,'S'],
]);
function slots(players: Athlete[]) {
  // Current field/punt/FG units retain these exact slots, even in interpolated
  // render snapshots. Historical larger units use the cached fallback.
  if (players.length === 14 && players[3]?.role === 'WR' && players[5]?.role === 'QB')
    return fieldSlots;
  let found = slotCache.get(players);
  if (found) return found;
  const mapped = new Map<number, LegendPosition>();
  for (const side of ['offense', 'defense'] as const) {
    const peers = players.filter(p => p.side === side);
    for (const role of ['QB', 'RB', 'WR', 'TE', 'LB'] as const) {
      const p = peers.find(p => p.role === role);
      if (p) mapped.set(p.id, role);
    }
    const secondary = peers.filter(p => p.role === 'DB');
    if (secondary[0]) mapped.set(secondary[0].id, 'CB');
    if (secondary.length > 1) mapped.set(secondary.at(-1)!.id, 'S');
  }
  slotCache.set(players, mapped);
  return mapped;
}
export function legendaryAthlete(g: FootballGame, a: Athlete) {
  const s = g.special;
  let side: Side, position: LegendPosition | undefined;
  if (s) {
    side = a.side === 'offense' ? s.kicking : s.receiver;
    const returner = s.kind === 'field-goal' ? undefined : s.kind === 'punt' ? s.athletes.at(-1)?.id : 13;
    if (a.id === returner)
      position = 'KR';
    else if (a.id === s.kicker) position = 'K';
    else {
      // Punt/FG units retain their original field identities; kickoff coverage
      // already uses three stable secondary slots and one front linebacker.
      const kickoff = s.kind === 'full' || s.kind === 'squib' || s.kind === 'onside';
      if (!kickoff) position = slots(s.athletes).get(a.id);
      else if (a.side === 'offense')
        position = a.id === 2 ? 'LB' : a.id === 3 ? 'CB' : a.id === 5 ? 'S' : undefined;
    }
  } else {
    const l = g.live;
    if (!l) return;
    const offense = l.offense ?? g.possession;
    side = a.side === 'offense' ? offense : other(offense);
    if (l.mode === 'kick' && a.id === 5) position = 'K';
    else position = slots(l.athletes).get(a.id);
  }
  return position ? legendaryPlayer(legendTeam(g, side), position) : undefined;
}
/** Derived effective attributes only. No baseline field, save or roster is mutated. */
export function legendaryAthleteFactor(g: FootballGame, a: Athlete, category: 'movement' | 'skill' = 'movement') {
  const p = legendaryAthlete(g, a);
  if (!p) return 1;
  if (p.position === 'K') return 1;
  return 1 + (p.position === 'QB' ? category === 'movement' ? p.rushing : p.passing : p.boost) / 100;
}
export function legendaryDefensiveFactor(g: FootballGame, a: Athlete) {
  const p = legendaryAthlete(g, a);
  return p && (p.position === 'LB' || p.position === 'CB' || p.position === 'S') ? 1 + p.boost / 100 : 1;
}
export const legendaryPassingFactor = (g: FootballGame) =>
  1 + (legendaryPlayer(legendTeam(g, g.live?.offense ?? g.possession), 'QB')?.passing ?? 0) / 100;
export const legendaryKickingFactor = (g: FootballGame, side: Side = g.possession) =>
  legendaryRoleFactor(legendTeam(g, side), 'K');
export const effectiveKickRange = (g: FootballGame) => g.profiles[g.possession].kickMax * legendaryKickingFactor(g);
