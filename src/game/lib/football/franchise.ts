import { KICK_TEAMS } from '../kick-return-teams';
import { kickSeed } from '../kick-return-engine';
import { createFootball } from './engine';
import type { FootballGame } from './types';
import { playoffEligibility, queueFranchiseAnnouncement, withPlayoffPresentation, type FranchiseAnnouncement } from './franchise-announcements';
import type { FranchiseLeague, LeagueAward } from './league-types';
import { beginLeagueSeason, ensureLeague, finishLeagueChampionship, recordHumanLeagueAward,
  recordLeaguePlayoff, recordLeagueRegular, simulateLeaguePlayoff } from './league';
import { legacyTeamCounts, ownedTeamAwards, type PlayerAward } from './legend-awards';
import { selectChampionshipMvp } from './mvp-performance';

export type MvpSlot = import('./mvp').MvpId;
export const MVP_SLOTS: { id: MvpSlot; name: string; reward: string }[] = [
  { id: 'QB1', name: 'Quarterback · QB1', reward: '+20% passing accuracy' },
  { id: 'KR1', name: 'Kick returner · KR1', reward: 'Diminishing speed awards' },
  { id: 'DB1', name: 'Defensive back · DB1', reward: 'Speed + clutch turnover execution' },
  { id: 'RB1', name: 'Running back · RB1', reward: 'Diminishing speed awards' },
  { id: 'WR1', name: 'Wide receiver · WR1', reward: 'Diminishing speed awards' },
  { id: 'LB1', name: 'Linebacker · LB1', reward: '+20% pass-rush execution' },
  { id: 'K1', name: 'Kicker · K1', reward: 'Slower clutch meter / CPU control' },
];
export const ROUND_NAMES = ['SWEET SIXTEEN', 'ELITE EIGHT', 'FINAL FOUR', 'SUPER CUP'];
export type FranchiseResult = { home: number; away: number; won: boolean; gameId: string };
export type Fixture = { opponent: string; result?: FranchiseResult };
export type Standing = { team: string; wins: number; losses: number; seed: number };
export type BracketMatch = { id: string; a: string | null; b: string | null; winner?: string; score?: [number, number]; human: boolean };
export type Franchise = {
  version: 1; id: string; revision: number; team: string; season: number; rng: number;
  announcements?: FranchiseAnnouncement[];
  phase: 'regular' | 'playoffs' | 'eliminated' | 'offseason' | 'mvp';
  schedule: Fixture[]; standings: Standing[];
  bracket: { teams: Standing[]; rounds: BracketMatch[][]; round: number } | null;
  championships: { season: number; opponent: string; home: number; away: number }[];
  awards: ({ season: number; slot: MvpSlot } & PlayerAward)[];
  league?: FranchiseLeague;
  history: { season: number; schedule: Fixture[]; standings: Standing[]; bracket: Franchise['bracket'] }[];
  active: { id: string; opponent: string; kind: 'regular' | 'playoff'; index: number; round: number;
    game: FootballGame; introDone: boolean; halftimeDone: boolean; halftimeRemaining: number; scoutingDone?: boolean } | null;
  ceremony: { season: number; winner: string; opponent: string; home: number; away: number; won: boolean;
    loser?: string; mvp?: LeagueAward; mvpUnavailable?: string } | null;
};
const teams = KICK_TEAMS.map(t => t.name as string);
const draw = (f: { rng: number }) => { f.rng = (Math.imul(f.rng, 1664525) + 1013904223) >>> 0; return f.rng / 4294967296; };
const mutate = (f: Franchise) => { const n = structuredClone(f); n.revision++; ensureLeague(n); return n; };
export const franchiseRecord = (f: Franchise) => {
  const results = f.schedule.flatMap(g => g.result ? [g.result] : []);
  const wins = results.filter(r => r.won).length;
  return { wins, losses: results.length - wins, remaining: 16 - results.length };
};
export const mvpCounts = (f: Franchise): Record<MvpSlot, number> =>
  Object.fromEntries(MVP_SLOTS.map(s => [s.id, f.awards.filter(a => a.slot === s.id).length])) as Record<MvpSlot, number>;
function season(f: Franchise) {
  const opponents = teams.filter(t => t !== f.team);
  f.schedule = Array.from({ length: 16 }, () => ({ opponent: opponents[Math.floor(draw(f) * opponents.length)]! }));
  f.announcements = [];
  f.standings = opponents.map(team => ({ team, wins: 0, losses: 0, seed: 0 }));
  f.phase = 'regular'; f.bracket = null; f.active = null; f.ceremony = null;
  beginLeagueSeason(f);
}
export function createFranchise(team: string, seed: number): Franchise {
  if (!teams.includes(team)) throw new Error('Choose an available team.');
  const f: Franchise = { version: 1, id: `franchise-${seed >>> 0}-${team}`, revision: 1, team, season: 1,
    rng: seed >>> 0, phase: 'regular', schedule: [], standings: [], bracket: null, championships: [], awards: [], history: [],
    league: { version: 1, awards: [], seasons: [] }, active: null, ceremony: null };
  season(f); return f;
}
function createBracket(f: Franchise, qualified = true) {
  const r = franchiseRecord(f);
  const seeded = (qualified ? [...f.standings.slice(0, 15), { team: f.team, wins: r.wins, losses: r.losses, seed: 0 }]
    : f.standings.slice(0, 16))
    .sort((a, b) => b.wins - a.wins || teams.indexOf(a.team) - teams.indexOf(b.team)).map((t, i) => ({ ...t, seed: i + 1 }));
  // Adjacent winners feed each other; seeds 1 and 2 remain in opposite halves.
  const order = [1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 2, 15];
  f.bracket = { teams: seeded, round: 0, rounds: Array.from({ length: 4 }, (_, round) =>
    Array.from({ length: 8 / 2 ** round }, (_, i) => {
      const a = round === 0 ? seeded[order[i * 2]! - 1]!.team : null;
      const b = round === 0 ? seeded[order[i * 2 + 1]! - 1]!.team : null;
      return { id: `${f.season}:${round}:${i}`, a, b, human: a === f.team || b === f.team };
    })) };
}
function simulate(f: Franchise, match: BracketMatch) {
  simulateLeaguePlayoff(f, match);
}
function advanceBracket(f: Franchise) {
  const b = f.bracket!;
  while (b.round < 4) {
    const current = b.rounds[b.round]!;
    for (const match of current) if (!match.human || f.phase === 'eliminated') simulate(f, match);
    if (current.some(m => !m.winner)) return;
    if (b.round === 3) { b.round = 4; finishLeagueChampionship(f); return; }
    const next = b.rounds[++b.round]!;
    next.forEach((m, i) => {
      m.a = current[i * 2]!.winner!; m.b = current[i * 2 + 1]!.winner!;
      m.human = m.a === f.team || m.b === f.team;
    });
  }
  finishLeagueChampionship(f);
}
export function startFranchiseGame(f: Franchise): Franchise {
  if (f.active) return f;
  const n = mutate(f);
  let opponent: string, index: number, round = -1;
  if (n.phase === 'regular') {
    index = n.schedule.findIndex(g => !g.result);
    if (index < 0) throw new Error('The regular season is complete.');
    opponent = n.schedule[index]!.opponent;
  } else if (n.phase === 'playoffs' && n.bracket && n.bracket.round < 4) {
    round = n.bracket.round; advanceBracket(n);
    index = n.bracket.rounds[round]!.findIndex(m => m.human && !m.winner);
    if (index < 0) throw new Error('No unplayed franchise matchup in this round.');
    const m = n.bracket.rounds[round]![index]!;
    opponent = m.a === n.team ? m.b! : m.a!;
  } else throw new Error('No game is available. Complete the current season first.');
  const id = `${n.id}:${n.season}:${round}:${index}`;
  const playerTeam = KICK_TEAMS.find(t => t.name === n.team), opponentTeam = KICK_TEAMS.find(t => t.name === opponent);
  if (!playerTeam || !opponentTeam) throw new Error('The saved matchup contains an unavailable team.');
  const game = createFootball(kickSeed(id), { player: playerTeam.name, opponent: opponentTeam.name });
  game.franchise = { gameId: id, awards: legacyTeamCounts(n, n.team), opponentAwards: legacyTeamCounts(n, opponent),
    playerAwards: { home: ownedTeamAwards(n, n.team), away: ownedTeamAwards(n, opponent) },
    ...(round === 3 ? { performance: { version: 1 as const, gameId: id, coverage: 'full-game' as const, players: {} } } : {}) };
  n.active = { id, opponent, kind: round < 0 ? 'regular' : 'playoff', index, round, game,
    introDone: round !== 3, halftimeDone: round !== 3, halftimeRemaining: 15, scoutingDone: false };
  n.active.game = withPlayoffPresentation(n, game);
  if (round === 0) queueFranchiseAnnouncement(n, 'playoffs');
  return n;
}
export function completeFranchiseGame(f: Franchise, game: FootballGame): Franchise {
  if (!f.active) return f; // A repeated acknowledgment never records another result.
  if (game.phase !== 'final' || !game.winner || game.score.home === game.score.away ||
      game.winner !== (game.score.home > game.score.away ? 'home' : 'away') ||
      game.franchise?.gameId !== f.active.id || game.seed !== f.active.game.seed ||
      game.teams.player !== f.team || game.teams.opponent !== f.active.opponent)
    throw new Error('Only the completed active franchise game can be recorded.');
  const n = mutate(f), a = n.active!, won = game.winner === 'home';
  const result: FranchiseResult = { gameId: a.id, home: game.score.home, away: game.score.away, won };
  if (a.kind === 'regular') {
    const previousEligibility = playoffEligibility(f);
    n.schedule[a.index]!.result = result;
    recordLeagueRegular(n, a.index, game);
    const eligibility = playoffEligibility(n);
    if (previousEligibility === 'undecided' && eligibility !== 'undecided')
      queueFranchiseAnnouncement(n, eligibility);
    const record = franchiseRecord(n);
    if (!record.remaining) {
      n.phase = record.wins > record.losses ? 'playoffs' : 'offseason';
      createBracket(n, n.phase === 'playoffs'); advanceBracket(n);
    }
  } else {
    const m = n.bracket!.rounds[a.round]![a.index]!;
    m.winner = won ? n.team : a.opponent;
    m.score = m.a === n.team ? [game.score.home, game.score.away] : [game.score.away, game.score.home];
    recordLeaguePlayoff(n, m, game);
    if (a.round === 3) {
      n.ceremony = { season: n.season, winner: m.winner, opponent: a.opponent, home: game.score.home, away: game.score.away, won };
      if (won) {
        n.championships.push({ season: n.season, opponent: a.opponent, home: game.score.home, away: game.score.away });
        n.phase = 'offseason';
      } else n.phase = 'offseason';
      const selection = selectChampionshipMvp(game);
      const season = n.league!.seasons.find(s => s.season === n.season)!;
      if (selection.award && !n.league!.awards.some(a => a.season === n.season)) {
        const award = { season: n.season, ...selection.award };
        n.league!.awards.push(award);
        if (won) n.awards.push({ ...award });
        season.mvp = award; n.ceremony.mvp = award;
      } else if (!selection.award) {
        season.mvpUnavailable = selection.reason; n.ceremony.mvpUnavailable = selection.reason;
      }
    } else if (!won) n.phase = 'eliminated';
    advanceBracket(n);
    if (won) queueFranchiseAnnouncement(n, 'advanced', a.round);
  }
  n.active = null; return n;
}
/** Legacy pending-award API only. New games finalize a measured MVP
 * automatically and never enter the old selection phase. */
export function awardMvp(f: Franchise, slot: MvpSlot): Franchise {
  if (!MVP_SLOTS.some(s => s.id === slot)) throw new Error('Choose an eligible player.');
  if (f.awards.some(a => a.season === f.season)) return f;
  if (f.phase !== 'mvp' || !f.championships.some(c => c.season === f.season)) throw new Error('Win the Super Cup to award an MVP.');
  const n = mutate(f); n.awards.push({ season: n.season, slot }); recordHumanLeagueAward(n, slot);
  const championship = n.championships.find(c => c.season === n.season)!;
  n.ceremony ??= { season: n.season, winner: n.team, opponent: championship.opponent,
    home: championship.home, away: championship.away, won: true };
  n.ceremony.mvp = { season: n.season, team: n.team, slot };
  n.phase = 'offseason'; return n;
}
/** An old pending selection has no complete individual ledger. Preserve its
 * title and prior rewards; never manufacture historical performances. */
export function resolveLegacyMvp(f: Franchise): Franchise {
  if (f.phase !== 'mvp') return f;
  const n = mutate(f); n.phase = 'offseason';
  if (n.ceremony) n.ceremony.mvpUnavailable = 'Historical individual Super Cup statistics unavailable; prior awards unchanged.';
  return n;
}
export function nextFranchiseSeason(f: Franchise): Franchise {
  if (!['offseason', 'eliminated'].includes(f.phase) || f.active || f.ceremony) throw new Error('Finish this season and its awards first.');
  const n = mutate(f);
  const completedLeague = n.league!.seasons.find(s => s.season === n.season);
  if (completedLeague) completedLeague.complete = true;
  n.history ??= [];
  n.history.push({ season: n.season, schedule: structuredClone(n.schedule), standings: structuredClone(n.standings), bracket: structuredClone(n.bracket) });
  n.season++; season(n); return n;
}
export function updateFranchiseGame(f: Franchise, game: FootballGame): Franchise {
  if (!f.active || game.franchise?.gameId !== f.active.id) throw new Error('This match does not belong to the active franchise.');
  const n = mutate(f); n.active!.game = structuredClone(game); return n;
}
