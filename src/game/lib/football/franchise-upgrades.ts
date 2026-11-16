import type { Athlete, FootballGame, Side } from './types';
import { kickerControl, mvpMultiplier, type MvpId } from './mvp';
import { legendaryAthleteFactor, legendaryDefensiveFactor, legendaryKickingFactor } from './legendary';

export type UpgradeSlot = MvpId;
export const awardCount = (g: FootballGame, slot: UpgradeSlot, side: Side) =>
  (side === 'home' ? g.franchise?.awards : g.franchise?.opponentAwards)?.[slot] ?? 0;
export const franchiseFactor = (g: FootballGame, slot: UpgradeSlot, side: Side = 'home') =>
  mvpMultiplier(slot, awardCount(g, slot, side), !!g.clutchActive);
export const franchiseKickControl = (g: FootballGame, side: Side) =>
  kickerControl(awardCount(g, 'K1', side), !!g.clutchActive);
export const effectiveKickControl = (g: FootballGame, side: Side) =>
  franchiseKickControl(g, side) / legendaryKickingFactor(g, side);
export function athleteAwards(g: FootballGame, a: Athlete, slot: 'DB1' | 'LB1') {
  const players = g.live?.athletes.includes(a) ? g.live.athletes : g.special?.athletes;
  if (!players || a.role !== (slot === 'DB1' ? 'DB' : 'LB') ||
      players.find(p => p.side === a.side && p.role === a.role)?.id !== a.id) return 0;
  const side = g.live?.athletes.includes(a)
    ? a.side === 'offense' ? g.live.offense ?? g.possession : (g.live.offense ?? g.possession) === 'home' ? 'away' : 'home'
    : a.side === 'offense' ? g.special!.kicking : g.special!.receiver;
  return awardCount(g, slot, side);
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
  return a.role === 'RB' && first('RB') ? franchiseFactor(g, 'RB1', side)
    : a.role === 'WR' && first('WR') ? franchiseFactor(g, 'WR1', side)
    : a.role === 'DB' && first('DB') ? franchiseFactor(g, 'DB1', side) : 1;
}
export function upgradedPassingBaseline(g: FootballGame, baseline: number) {
  // Additive awards multiply ORIGINAL accuracy, before situational adjustments.
  // Keep room for inaccurate throws; catches and coverage are adjudicated later.
  return Math.min(.94, baseline * franchiseFactor(g, 'QB1', g.possession));
}
export const effectiveAthleteFactor = (g: FootballGame, a: Athlete) =>
  franchiseAthleteFactor(g, a) * legendaryAthleteFactor(g, a);
