import { KICK_TEAMS } from '../kick-return-teams';
import type { FootballGame, FootballStats } from './types';
import type { Franchise, BracketMatch } from './franchise';
import type { LeagueStats, LeagueSeason, LeagueTeamSeason } from './league-types';
import { currentTeamRating, leagueWinProbability, teamAwardCounts } from './league-ratings';
import { teamProfile } from './playbook';
import { mvpMultiplier, skillBonus } from './mvp';
import { chaosOpportunity } from './clutch';
export { currentTeamRating, teamAwardCounts, leagueWinProbability } from './league-ratings';
export const leagueRandom = (f: { rng: number }) => {
  f.rng = (Math.imul(f.rng, 1664525) + 1013904223) >>> 0; return f.rng / 4294967296;
};
export const emptyLeagueStats = (): LeagueStats => ({ games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
  passYards: 0, rushYards: 0, attempts: 0, completions: 0, touchdowns: 0, fieldGoals: 0, turnovers: 0, played: 0, simulated: 0 });
function makeSeason(f: Franchise, number: number, legacy: boolean): LeagueSeason {
  return { season: number, week: 0, legacy, complete: false, postseasonKeys: [], teams: KICK_TEAMS.map(({ name }) => ({
    team: name, rating: currentTeamRating(f, name, number - 1), awards: teamAwardCounts(f, name, number - 1),
    regular: emptyLeagueStats(), playoffs: emptyLeagueStats(),
  })) };
}
/** One-time additive migration: preserve old results; NEVER invent old box scores or MVPs. */
export function ensureLeague(f: Franchise) {
  if (f.league) return;
  f.league = { version: 1, awards: f.awards.map(a => ({ ...a, team: f.team })), seasons: [] };
  const old = [...(f.history ?? []), { season: f.season, schedule: f.schedule, standings: f.standings, bracket: f.bracket }];
  for (const h of old) {
    const s = makeSeason(f, h.season, true);
    s.week = h.schedule.filter(g => g.result).length;
    for (const row of s.teams) {
      const record = row.team === f.team
        ? { wins: h.schedule.filter(g => g.result?.won).length, losses: h.schedule.filter(g => g.result && !g.result.won).length }
        : h.standings.find(t => t.team === row.team);
      if (record) row.legacyRecord = { wins: record.wins, losses: record.losses };
    }
    s.postseasonKeys = h.bracket?.rounds.flat().filter(m => m.winner).map(m => m.id) ?? [];
    s.champion = h.bracket?.rounds[3]?.[0]?.winner ?? (f.championships.some(c => c.season === h.season) ? f.team : undefined);
    s.complete = !!s.champion || h.season < f.season;
    s.mvp = f.league.awards.find(a => a.season === h.season);
    f.league.seasons.push(s);
  }
}
export function migrateFranchise(f: Franchise): Franchise {
  if (f.league) return f;
  const n = structuredClone(f); n.revision++; ensureLeague(n);
  // A still-visible old CPU trophy can now announce a newly assigned reward.
  if (n.ceremony && !n.ceremony.won && n.bracket?.round === 4) {
    const s = leagueSeason(n); s.champion = undefined; finishLeagueChampionship(n);
  }
  return n;
}
export function beginLeagueSeason(f: Franchise) {
  f.league ??= { version: 1, awards: [], seasons: [] };
  if (!f.league.seasons.some(s => s.season === f.season)) f.league.seasons.push(makeSeason(f, f.season, false));
}
export function leagueSeason(f: Franchise): LeagueSeason {
  ensureLeague(f);
  const s = f.league!.seasons.find(s => s.season === f.season);
  if (!s) throw new Error('The current league season is missing. Your saved history has not been replaced.');
  return s;
}
type Box = Pick<FootballStats, 'passYards' | 'rushYards' | 'attempts' | 'completions' | 'touchdowns' | 'fieldGoals' | 'turnovers'>;
function simulateBox(f: Franchise, team: string, opponent: string, points: number): Box {
  const p = teamProfile(team), defense = currentTeamRating(f, opponent).defense;
  const a = teamAwardCounts(f, team), opposing = teamAwardCounts(f, opponent);
  const attempts = 15 + Math.floor(leagueRandom(f) * 20);
  const accuracy = Math.max(.2, Math.min(.94, (.3 + p.qb * .43) * mvpMultiplier('QB1', a.QB1) -
    (defense - 65) * .0015));
  let completions = 0;
  for (let i = 0; i < attempts; i++) if (leagueRandom(f) < accuracy) completions++;
  const passYards = Math.round(completions * (8 + leagueRandom(f) * 7) * (1 + (mvpMultiplier('WR1', a.WR1) - 1) / 3));
  const rushYards = Math.round((45 + leagueRandom(f) * 110) * (.65 + p.back * .5) *
    (1 + (mvpMultiplier('RB1', a.RB1) - 1) * .65) / (1 + (mvpMultiplier('DB1', opposing.DB1) - 1) / 10));
  // Every simulated score is a valid combination of sevens and threes.
  const touchdowns = Array.from({ length: Math.floor(points / 7) + 1 }, (_, n) => n).reverse()
    .find(n => (points - n * 7) % 3 === 0) ?? 0;
  return { attempts, completions, passYards, rushYards, touchdowns, fieldGoals: (points - touchdowns * 7) / 3,
    turnovers: Math.floor(leagueRandom(f) * 3) };
}
/** One explicit overtime possession; no clutch attributes on regulation totals.
 * Statistical, not a claim that an animated play was run. Both sides get the
 * same independent exceptional-execution opportunity; earned awards differ. */
export function simulateClutchPossession(f: Franchise, offense: string, defense: string) {
  const a = currentTeamRating(f, offense, Infinity, true), d = currentTeamRating(f, defense, Infinity, true);
  const awards = teamAwardCounts(f, defense);
  const exceptionalAttack = leagueRandom(f) < chaosOpportunity({ clutchActive: true }, .06);
  const exceptionalStop = leagueRandom(f) < chaosOpportunity({ clutchActive: true }, .06);
  const turnover = leagueRandom(f) < Math.min(.35, .035 * 1.25 * (1 + skillBonus(awards.DB1, true)));
  const chance = Math.max(.08, Math.min(.8, .32 + (a.offense - d.defense) * .006 +
    (exceptionalAttack ? .12 : 0) - (exceptionalStop ? .12 : 0)));
  return !turnover && leagueRandom(f) < chance;
}
export function simulateLeagueMatch(f: Franchise, a: string, b: string) {
  let winner = leagueRandom(f) < leagueWinProbability(f, a, b) ? a : b;
  const low = Math.floor(leagueRandom(f) * 4) * 7 + Math.floor(leagueRandom(f) * 3) * 3;
  const high = low + (leagueRandom(f) < .5 ? 3 : 7);
  const score: [number, number] = winner === a ? [high, low] : [low, high];
  const overtime = leagueRandom(f) < .16;
  if (overtime) { score[0] = low; score[1] = low; }
  const boxes: [Box, Box] = [simulateBox(f, a, b, score[0]), simulateBox(f, b, a, score[1])];
  if (overtime) {
    // First TD wins, with fair alternating possessions. No field goals/safeties.
    let offense: 0 | 1 = leagueRandom(f) < .5 ? 0 : 1;
    while (!simulateClutchPossession(f, [a, b][offense]!, [a, b][1 - offense]!)) offense = offense === 0 ? 1 : 0;
    score[offense] += 7; boxes[offense].touchdowns++; boxes[offense].rushYards += 20;
    winner = [a, b][offense]!;
  }
  return { winner, score, boxes, overtime };
}
function row(f: Franchise, team: string): LeagueTeamSeason {
  const found = leagueSeason(f).teams.find(t => t.team === team);
  if (!found) throw new Error('The saved league team is missing.');
  return found;
}
function add(stats: LeagueStats, own: number, against: number, box: Box, played: boolean) {
  stats.games++; stats.wins += Number(own > against); stats.losses += Number(own < against);
  stats.pointsFor += own; stats.pointsAgainst += against; stats.played += Number(played); stats.simulated += Number(!played);
  for (const key of ['passYards', 'rushYards', 'attempts', 'completions', 'touchdowns', 'fieldGoals', 'turnovers'] as const)
    stats[key] += box[key];
}
function addMatch(f: Franchise, a: string, b: string, score: [number, number], boxes: [Box, Box], playoffs: boolean, played: boolean) {
  const group = playoffs ? 'playoffs' : 'regular';
  add(row(f, a)[group], score[0], score[1], boxes[0], played);
  add(row(f, b)[group], score[1], score[0], boxes[1], played);
}
/** CPU-only games use statistics, not the expensive real-time engine. One paired week per user result. */
export function recordLeagueRegular(f: Franchise, index: number, g: FootballGame) {
  const s = leagueSeason(f);
  if (!s.legacy && index !== s.week) throw new Error('League weeks must be recorded in schedule order.');
  addMatch(f, f.team, g.teams.opponent, [g.score.home, g.score.away], [g.stats.home, g.stats.away], false, true);
  s.week = index + 1;
  if (s.legacy) {
    const player = row(f, f.team);
    player.legacyRecord = { wins: f.schedule.filter(v => v.result?.won).length,
      losses: f.schedule.filter(v => v.result && !v.result.won).length };
    return; // Retain already saved old CPU records; unavailable old statistics stay unavailable.
  }
  const others = KICK_TEAMS.map(t => t.name as string).filter(t => t !== f.team && t !== g.teams.opponent);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(leagueRandom(f) * (i + 1)); [others[i], others[j]] = [others[j]!, others[i]!];
  }
  for (let i = 0; i < others.length; i += 2) {
    const a = others[i]!, b = others[i + 1]!, m = simulateLeagueMatch(f, a, b);
    addMatch(f, a, b, m.score, m.boxes, false, false);
  }
  f.standings = s.teams.filter(t => t.team !== f.team).map(t => ({
    team: t.team, wins: t.regular.wins, losses: t.regular.losses, seed: 0,
  })).sort((a, b) => b.wins - a.wins || a.team.localeCompare(b.team));
}
export function simulateLeaguePlayoff(f: Franchise, match: BracketMatch) {
  if (!match.a || !match.b || match.winner) return;
  const m = simulateLeagueMatch(f, match.a, match.b);
  match.winner = m.winner; match.score = m.score;
  const s = leagueSeason(f);
  if (!s.postseasonKeys.includes(match.id)) {
    addMatch(f, match.a, match.b, m.score, m.boxes, true, false); s.postseasonKeys.push(match.id);
  }
}
export function recordLeaguePlayoff(f: Franchise, match: BracketMatch, game: FootballGame) {
  const s = leagueSeason(f);
  if (s.postseasonKeys.includes(match.id)) return;
  addMatch(f, f.team, game.teams.opponent, [game.score.home, game.score.away], [game.stats.home, game.stats.away], true, true);
  s.postseasonKeys.push(match.id);
}
export function finishLeagueChampionship(f: Franchise) {
  const final = f.bracket?.rounds[3]?.[0];
  if (!final?.winner || !final.a || !final.b || !final.score) return;
  const s = leagueSeason(f);
  if (s.champion) return;
  s.champion = final.winner; s.complete = true;
  const loser = final.winner === final.a ? final.b : final.a;
  if (final.winner !== f.team) {
    // Consume the old selection draw so future fixtures/results keep their
    // seeded sequence, but do NOT turn that draw into a fabricated MVP.
    leagueRandom(f);
    s.mvp = f.league!.awards.find(a => a.season === f.season);
    s.mvpUnavailable ??= s.mvp ? undefined : 'CPU simulation records team totals only; individual MVP performance is unavailable.';
    f.ceremony ??= { season: f.season, winner: final.winner, opponent: loser, home: final.score[0], away: final.score[1], won: false };
    f.ceremony.loser = loser; f.ceremony.mvp = s.mvp; f.ceremony.mvpUnavailable = s.mvpUnavailable;
  }
}
export function recordHumanLeagueAward(f: Franchise, slot: import('./franchise').MvpSlot) {
  const s = leagueSeason(f);
  if (f.league!.awards.some(a => a.season === f.season)) return;
  const a = { season: f.season, team: f.team, slot };
  f.league!.awards.push(a); s.mvp = a;
}
