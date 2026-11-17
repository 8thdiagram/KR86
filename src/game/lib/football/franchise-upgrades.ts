import type { Athlete, FootballGame, Side } from './types';
import { kickerControl, mvpMultiplier, speedSlot, type MvpId } from './mvp';
import { legendaryAthlete, legendaryAthleteFactor, legendaryDefensiveFactor, legendaryKickingFactor } from './legendary';
import { modernCount, modernSpeedCount, ownedGameAwards, slotLegend } from './legend-awards';

export type UpgradeSlot = MvpId;
export const legacyAwardCount = (g: FootballGame, slot: UpgradeSlot, side: Side) =>
  (side === 'home' ? g.franchise?.awards : g.franchise?.opponentAwards)?.[slot] ?? 0;
export const awardCount = (g: FootballGame, slot: UpgradeSlot, side: Side) => {
  const row = ownedGameAwards(g, side, slotLegend(g, side, slot));
  return legacyAwardCount(g, slot, side) + (speedSlot(slot) ? modernSpeedCount(row) : modernCount(row, slot));
};
export const franchiseFactor = (g: FootballGame, slot: UpgradeSlot, side: Side = 'home') =>
  mvpMultiplier(slot, awardCount(g, slot, side), !!g.clutchActive);
export const franchiseKickControl = (g: FootballGame, side: Side) =>
  kickerControl(awardCount(g, 'K1', side), !!g.clutchActive);
export const effectiveKickControl = (g: FootballGame, side: Side) =>
  franchiseKickControl(g, side) / legendaryKickingFactor(g, side);
export function athleteAwards(g: FootballGame, a: Athlete, slot: 'DB1' | 'LB1') {
  const players = g.live?.athletes.includes(a) ? g.live.athletes : g.special?.athletes;
  if (!players || a.role !== (slot === 'DB1' ? 'DB' : 'LB')) return 0;
  const side = g.live?.athletes.includes(a)
    ? a.side === 'offense' ? g.live.offense ?? g.possession : (g.live.offense ?? g.possession) === 'home' ? 'away' : 'home'
    : a.side === 'offense' ? g.special!.kicking : g.special!.receiver;
  return (players.find(p => p.side === a.side && p.role === a.role)?.id === a.id ? legacyAwardCount(g, slot, side) : 0)
    + modernCount(ownedGameAwards(g, side, legendaryAthlete(g, a)), slot);
}
export const linebackerSkill = (g: FootballGame, a: Athlete) =>
  mvpMultiplier('LB1', athleteAwards(g, a, 'LB1'), !!g.clutchActive) * legendaryAthleteFactor(g, a, 'skill');
export const turnoverSkill = (g: FootballGame, a: Athlete) =>
  (g.clutchActive ? mvpMultiplier('LB1', athleteAwards(g, a, 'DB1'), true) : 1) * legendaryDefensiveFactor(g, a);
/** Fixed roster identities: the first WR/DB and the established RB slot.
 * Never promote every athlete sharing a position. Each team owns its own awards. */
export function franchiseAthleteFactor(g: FootballGame, a: Athlete) {
  const l = g.live;
  if (!l || !g.franchise) return 1;
  const offense = l.offense ?? g.possession;
  const side = a.side === 'offense' ? offense : offense === 'home' ? 'away' : 'home';
  const first = (role: Athlete['role']) => l.athletes.find(p => p.side === a.side && p.role === role)?.id === a.id;
  const legacy = a.role === 'RB' && first('RB') ? legacyAwardCount(g, 'RB1', side)
    : a.role === 'WR' && first('WR') ? legacyAwardCount(g, 'WR1', side)
    : a.role === 'DB' && first('DB') ? legacyAwardCount(g, 'DB1', side) : 0;
  const count = legacy + modernSpeedCount(ownedGameAwards(g, side, legendaryAthlete(g, a)));
  return mvpMultiplier('RB1', count, !!g.clutchActive);
}
export function upgradedPassingBaseline(g: FootballGame, baseline: number) {
  // Additive awards multiply ORIGINAL accuracy, before situational adjustments.
  // Keep room for inaccurate throws; catches and coverage are adjudicated later.
  return Math.min(.94, baseline * franchiseFactor(g, 'QB1', g.possession));
}
export const effectiveAthleteFactor = (g: FootballGame, a: Athlete) =>
  franchiseAthleteFactor(g, a) * legendaryAthleteFactor(g, a);
/** Special teams already apply the old KR/first-CB multiplier in their return
 * model. Replace that factor with the actual award owner's total, never stack
 * a second multiplier or transfer a safety/TE award to the first CB/WR. */
export function specialAwardAdjustment(g: FootballGame, a: Athlete, side: Side,
  appliedSlot?: 'KR1' | 'DB1', appliedFactor = 1) {
  const owned = modernSpeedCount(ownedGameAwards(g, side, legendaryAthlete(g, a)));
  const legacy = appliedSlot ? legacyAwardCount(g, appliedSlot, side) : 0;
  return mvpMultiplier('RB1', legacy + owned, !!g.clutchActive) / appliedFactor;
}
