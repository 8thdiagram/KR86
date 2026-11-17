import type { Franchise } from './franchise';
import type { LeagueStats } from './league-types';
import { KICK_TEAMS } from '../kick-return-teams';
import { LEAGUE_SLOTS } from './league-ratings';
import { validPlayerAward } from './legend-awards';
export function validLeague(f: Franchise) {
  if (!f.league) return true; // Version-1 saves migrate additively after reconciliation.
  const l = f.league, integer = (v: unknown, min = 0) => Number.isSafeInteger(v) && (v as number) >= min;
  const team = (v: unknown) => KICK_TEAMS.some(t => t.name === v);
  const stats = (s: LeagueStats, limit: number) => s && Object.entries(s).every(([key, n]) =>
    key === 'passYards' || key === 'rushYards' ? Number.isFinite(n) : integer(n)) &&
    s.games <= limit && s.games === s.wins + s.losses && s.games === s.played + s.simulated && s.completions <= s.attempts;
  if (l.version !== 1 || !Array.isArray(l.awards) || !Array.isArray(l.seasons) ||
      !l.seasons.some(s => s.season === f.season) || new Set(l.seasons.map(s => s.season)).size !== l.seasons.length) return false;
  if (!l.seasons.every(s => integer(s.season, 1) && s.season <= f.season && integer(s.week) && s.week <= 16 &&
    typeof s.legacy === 'boolean' && typeof s.complete === 'boolean' &&
    (s.mvpUnavailable === undefined || typeof s.mvpUnavailable === 'string' && s.mvpUnavailable.length <= 600) &&
    (!s.champion || team(s.champion)) && Array.isArray(s.postseasonKeys) && s.postseasonKeys.every(k => typeof k === 'string') &&
    new Set(s.postseasonKeys).size === s.postseasonKeys.length &&
    Array.isArray(s.teams) && s.teams.length === KICK_TEAMS.length && new Set(s.teams.map(t => t.team)).size === s.teams.length &&
    s.teams.every(t => team(t.team) && t.rating && ['overall', 'offense', 'defense', 'special'].every(k =>
      Number.isFinite(t.rating[k as keyof typeof t.rating]) && t.rating[k as keyof typeof t.rating] >= 0) &&
      t.awards && LEAGUE_SLOTS.every(k => (k === 'LB1' || k === 'K1') && t.awards[k] === undefined || integer(t.awards[k])) && stats(t.regular, 16) && stats(t.playoffs, 4) &&
      (!t.legacyRecord || integer(t.legacyRecord.wins) && integer(t.legacyRecord.losses) && t.legacyRecord.wins + t.legacyRecord.losses <= 16)))) return false;
  if (new Set(l.awards.map(a => a.season)).size !== l.awards.length || !l.awards.every(a =>
    integer(a.season, 1) && team(a.team) && LEAGUE_SLOTS.includes(a.slot) && validPlayerAward(a, a.team) &&
    l.seasons.some(s => s.season === a.season && s.champion === a.team))) return false;
  const playerAwards = l.awards.filter(a => a.team === f.team);
  return playerAwards.length === f.awards.length && playerAwards.every(a => f.awards.some(p =>
    p.season === a.season && p.slot === a.slot && p.legendId === a.legendId && p.position === a.position));
}
