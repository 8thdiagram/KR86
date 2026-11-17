import type { Franchise } from './franchise';
import { LEGENDS, legendaryPlayer, type Legend } from './legendary-roster';
import { legendAwardCounts, legendEffectCounts, modernSpeedCount } from './legend-awards';
import { kickerControl, mvpMultiplier, mvpSummary } from './mvp';
import { teamProfile } from './playbook';

export type ScoutingLegend = {
  identity: string; position: string; number: number;
  legendBonuses: string[]; mvpCount: number; mvpBonuses: string[]; totals: string[];
};
export type ScoutingTeam = {
  team: string; label: 'YOUR TEAM' | 'OPPONENT'; players: ScoutingLegend[];
};
const pct = (factor: number) => `${Number(((factor - 1) * 100).toFixed(3))}%`;
const gain = (factor: number) => `${factor >= 1 ? '+' : ''}${pct(factor)}`;
export function scoutingLegend(f: Franchise, team: string, p: Legend): ScoutingLegend {
  const all = legendAwardCounts(f, team, p), counts = legendEffectCounts(f, team, p);
  const mvpCount = Object.values(all).reduce((sum, n) => sum + n, 0);
  const speed = modernSpeedCount(counts), normalSpeed = mvpMultiplier('RB1', speed);
  const clutchSpeed = mvpMultiplier('RB1', speed, true), base = 1 + p.boost / 100;
  const mvpBonuses: string[] = [], legendBonuses: string[] = [], totals: string[] = [];
  if (p.position === 'QB') {
    legendBonuses.push(`Passing +${p.passing}%`, `Rushing +${p.rushing}%`);
    if (counts.QB1) mvpBonuses.push(`${mvpSummary('QB1', counts.QB1)} before cap`,
      `Clutch accuracy ${gain(mvpMultiplier('QB1', counts.QB1, true))} before cap`);
    // Match throwAccuracy: the Legend multiplies the QB attribute inside the
    // baseline, not its constant .30 term. MVP then multiplies that baseline
    // and the existing .94 cap applies. A naive 1.2 × 1.2 is NOT +44% accuracy.
    const qb = teamProfile(team).qb, unboosted = .30 + qb * .43;
    const baseline = .30 + qb * (1 + p.passing / 100) * .43;
    const accuracy = (clutch: boolean) => Math.min(.94, baseline * mvpMultiplier('QB1', counts.QB1 ?? 0, clutch));
    const accuracyLine = (clutch: boolean) => `${clutch ? 'Clutch base' : 'Base'} pass accuracy ${Number((accuracy(clutch) * 100).toFixed(2))}% (${gain(accuracy(clutch) / unboosted)})`;
    totals.push(accuracyLine(false), `Pass-flight modifier ×${Number((1 + p.passing / 100).toFixed(3))}`,
      `Rushing +${p.rushing}%`, 'Base accuracy is before pressure, movement and route adjustments; not completion probability.');
    if (counts.QB1) totals.push(accuracyLine(true));
  } else if (p.position === 'K') {
    legendBonuses.push(`Kick range +${p.boost}%`, `Aim/meter factor ×${Number((1 / base).toFixed(4))} (lower is better)`);
    if (counts.K1) mvpBonuses.push(mvpSummary('K1', counts.K1), 'Clutch only; no speed or extra range.');
    totals.push(`Kick range +${p.boost}%`, `Normal aim/meter ×${Number((1 / base).toFixed(4))}`,
      `Clutch aim/meter ×${Number((kickerControl(counts.K1 ?? 0, true) / base).toFixed(4))}`);
  } else {
    legendBonuses.push(`Speed +${p.boost}%`);
    if (p.position === 'WR' || p.position === 'TE') legendBonuses.push(`Receiving ability +${p.boost}%`);
    if (speed) mvpBonuses.push(mvpSummary('RB1', speed), `Clutch speed ${gain(clutchSpeed)} (diminishing awards)`);
    totals.push(`Speed ${gain(base * normalSpeed)}`);
    if (p.position === 'WR' || p.position === 'TE') totals.push(`Receiving ability +${p.boost}%`);
    if (speed) totals.push(`Clutch speed ${gain(base * clutchSpeed)}`);
    if (p.position === 'LB') {
      legendBonuses.push(`Rush execution +${p.boost}%`);
      if (counts.LB1) mvpBonuses.push(mvpSummary('LB1', counts.LB1));
      totals.push(`Rush execution ${gain(base * mvpMultiplier('LB1', counts.LB1 ?? 0))}`);
      if (counts.LB1) totals.push(`Clutch rush execution ${gain(base * mvpMultiplier('LB1', counts.LB1, true))}`);
    }
    if (p.position === 'CB' || p.position === 'S') {
      legendBonuses.push(`Turnover execution +${p.boost}%`);
      if (counts.DB1) mvpBonuses.push(`Clutch turnover execution ${gain(mvpMultiplier('LB1', counts.DB1, true))}`);
      totals.push(`Turnover execution +${p.boost}%`,
        `Clutch turnover execution ${gain(base * mvpMultiplier('LB1', counts.DB1 ?? 0, true))}`);
    }
  }
  if (mvpCount && Object.values(counts).reduce((sum, n) => sum + n, 0) < mvpCount)
    mvpBonuses.push('Historical awards in other roles do not transfer to this role.');
  return { identity: p.identity, position: p.position, number: p.number, legendBonuses, mvpCount, mvpBonuses, totals };
}
export function scoutingTeams(f: Franchise, opponent: string): readonly ScoutingTeam[] {
  return ([{ team: f.team, label: 'YOUR TEAM' }, { team: opponent, label: 'OPPONENT' }] as const).map(t => ({
    ...t, players: LEGENDS.filter(p => legendaryPlayer(t.team, p.position)?.identity === p.identity &&
      legendaryPlayer(t.team, p.position)?.number === p.number).map(p => scoutingLegend(f, t.team, p)),
  }));
}
export function scoutingOpponent(f: Franchise) {
  if (f.active) return f.active.opponent;
  const match = f.bracket?.rounds[f.bracket.round]?.find(m => m.human && !m.winner);
  return match ? match.a === f.team ? match.b! : match.a!
    : f.schedule.find(m => !m.result)?.opponent ?? f.ceremony?.opponent ?? f.schedule.at(-1)!.opponent;
}
