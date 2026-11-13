import type { Franchise, MvpSlot } from './franchise';
import type { AwardCounts, TeamRating } from './league-types';
import { teamProfile } from './playbook';
import { MVP_IDS, mvpMultiplier, kickerControl } from './mvp';
export const LEAGUE_SLOTS: readonly MvpSlot[] = MVP_IDS;
export const emptyAwards = (): AwardCounts => ({ QB1: 0, KR1: 0, DB1: 0, RB1: 0, WR1: 0, LB1: 0, K1: 0 });
export function teamAwardCounts(f: Franchise, team: string, throughSeason = Infinity): AwardCounts {
  const counts = emptyAwards();
  const awards = f.league?.awards ?? f.awards.map(a => ({ ...a, team: f.team }));
  for (const a of awards) if (a.team === team && a.season <= throughSeason) counts[a.slot]++;
  return counts;
}
export function currentTeamRating(f: Franchise, team: string, throughSeason = Infinity, clutch = false): TeamRating {
  const p = teamProfile(team), a = teamAwardCounts(f, team, throughSeason);
  const factor = (slot: MvpSlot) => mvpMultiplier(slot, a[slot], clutch);
  // A reward improves ONE roster slot, not the whole position group/team.
  const offense = 100 * (p.line * .35 + Math.min(.94, (.30 + p.qb * .43) * factor('QB1')) / (.30 + p.qb * .43) * p.qb * .3 +
    p.receivers * .2 * (1 + (factor('WR1') - 1) / 3) + p.back * .15 * factor('RB1'));
  const defense = 100 * (p.rush * .35 * (1 + (factor('LB1') - 1) / 4) +
    p.coverage * .65 * (1 + (factor('DB1') - 1) / 3));
  const special = 100 * (p.back * .6 + p.coverage * .4) * (1 + (factor('KR1') - 1) / 2) *
    (1 + (1 - kickerControl(a.K1, clutch)) * .1);
  const overall = offense * .45 + defense * .45 + special * .1;
  const round = (n: number) => Math.round(n * 10) / 10;
  return { offense: round(offense), defense: round(defense), special: round(special), overall: round(overall) };
}
export function leagueWinProbability(f: Franchise, a: string, b: string) {
  const difference = currentTeamRating(f, a).overall - currentTeamRating(f, b).overall;
  // Nonzero upset chance even for legends; ratings are NOT win percentages.
  return Math.max(.08, Math.min(.92, .5 + difference * .012));
}
