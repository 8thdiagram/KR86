import type { MvpSlot } from './franchise';
export type AwardCounts = Record<MvpSlot, number>;
export type LeagueAward = { season: number; team: string; slot: MvpSlot } & import('./legend-awards').PlayerAward;
export type TeamRating = { offense: number; defense: number; special: number; overall: number };
export type LeagueStats = {
  games: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number;
  passYards: number; rushYards: number; attempts: number; completions: number;
  touchdowns: number; fieldGoals: number; turnovers: number; played: number; simulated: number;
};
export type LeagueTeamSeason = {
  team: string; rating: TeamRating; awards: AwardCounts;
  regular: LeagueStats; playoffs: LeagueStats;
  /** Old saved records are authoritative; missing old box scores are unavailable. */
  legacyRecord?: { wins: number; losses: number };
};
export type LeagueSeason = {
  season: number; week: number; teams: LeagueTeamSeason[]; postseasonKeys: string[];
  legacy: boolean; complete: boolean; champion?: string; mvp?: LeagueAward; mvpUnavailable?: string;
};
export type FranchiseLeague = { version: 1; awards: LeagueAward[]; seasons: LeagueSeason[] };
