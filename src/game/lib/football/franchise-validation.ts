import type { Franchise } from './franchise';
import { MVP_SLOTS } from './franchise';
import { KICK_TEAMS } from '../kick-return-teams';
import { isFootballGame } from './storage';
import { validLeague } from './league-validation';
import { validPlayerAward } from './legend-awards';

/** Reject damaged saves rather than silently resetting a franchise. No ranking claims. */
export function isFranchise(value: unknown): value is Franchise {
  try {
    if (!value || typeof value !== 'object') return false;
    const f = value as Franchise, validTeam = (t: unknown) => KICK_TEAMS.some(k => k.name === t);
    const integer = (n: unknown, min = 0) => Number.isSafeInteger(n) && (n as number) >= min;
    if (f.announcements !== undefined && (!Array.isArray(f.announcements) || f.announcements.length > 8 ||
        !f.announcements.every(n => n && typeof n.id === 'string' && integer(n.season, 1) && n.season <= f.season &&
          ['clinched', 'eliminated', 'playoffs', 'advanced'].includes(n.kind) &&
          (n.round === undefined || integer(n.round) && n.round <= 3)) ||
        new Set(f.announcements.map(n => n.id)).size !== f.announcements.length)) return false;
    if (f.version !== 1 || typeof f.id !== 'string' || !integer(f.revision, 1) || !validTeam(f.team) ||
        !integer(f.season, 1) || !integer(f.rng) || !['regular', 'playoffs', 'eliminated', 'offseason', 'mvp'].includes(f.phase) ||
        !Array.isArray(f.schedule) || f.schedule.length !== 16 ||
        !f.schedule.every(s => validTeam(s.opponent) && s.opponent !== f.team && (!s.result ||
          typeof s.result.gameId === 'string' && integer(s.result.home) && integer(s.result.away) &&
          s.result.home !== s.result.away && s.result.won === (s.result.home > s.result.away)))) return false;
    if (!Array.isArray(f.standings) || f.standings.length !== KICK_TEAMS.length - 1 ||
        !f.standings.every(s => validTeam(s.team) && s.team !== f.team && integer(s.wins) &&
          integer(s.losses) && s.wins + s.losses <= 16) ||
        new Set(f.standings.map(s => s.team)).size !== f.standings.length) return false;
    if (!Array.isArray(f.championships) || !f.championships.every(c => integer(c.season, 1) &&
        c.season <= f.season && validTeam(c.opponent) && integer(c.home) && integer(c.away) && c.home > c.away) ||
        new Set(f.championships.map(c => c.season)).size !== f.championships.length) return false;
    if (!Array.isArray(f.awards) || !f.awards.every(a => MVP_SLOTS.some(s => s.id === a.slot) &&
        validPlayerAward(a, f.team) &&
        f.championships.some(c => c.season === a.season)) ||
        new Set(f.awards.map(a => a.season)).size !== f.awards.length) return false;
    if (f.active && (!isFootballGame(f.active.game) || f.active.game.franchise?.gameId !== f.active.id ||
        f.active.scoutingDone !== undefined && typeof f.active.scoutingDone !== 'boolean' ||
        f.active.game.teams.player !== f.team || f.active.game.teams.opponent !== f.active.opponent ||
        !integer(f.active.index) || ![-1, 0, 1, 2, 3].includes(f.active.round) ||
        typeof f.active.introDone !== 'boolean' || typeof f.active.halftimeDone !== 'boolean' ||
        !Number.isFinite(f.active.halftimeRemaining) || f.active.halftimeRemaining < 0 || f.active.halftimeRemaining > 15)) return false;
    if (f.bracket) {
      const b = f.bracket;
      if (!Array.isArray(b.teams) || b.teams.length !== 16 || new Set(b.teams.map(s => s.team)).size !== 16 ||
          !b.teams.every(s => validTeam(s.team)) ||
          (franchiseRecordForValidation(f) > 8 && !b.teams.some(s => s.team === f.team)) ||
          !integer(b.round) || b.round > 4 || !Array.isArray(b.rounds) || b.rounds.length !== 4 ||
          !b.rounds.every((round, i) => Array.isArray(round) && round.length === 8 / 2 ** i &&
            round.every(m => (!m.a || validTeam(m.a)) && (!m.b || validTeam(m.b)) &&
              (!m.winner || m.winner === m.a || m.winner === m.b)))) return false;
    }
    if (f.ceremony && (!validTeam(f.ceremony.winner) || !validTeam(f.ceremony.opponent) ||
        f.ceremony.mvp && (f.ceremony.mvp.team !== f.ceremony.winner ||
          !validPlayerAward(f.ceremony.mvp, f.ceremony.winner)) ||
        f.ceremony.mvpUnavailable !== undefined && (typeof f.ceremony.mvpUnavailable !== 'string' || f.ceremony.mvpUnavailable.length > 600) ||
        f.ceremony.won !== (f.ceremony.winner === f.team) || !integer(f.ceremony.home) || !integer(f.ceremony.away))) return false;
    return validLeague(f);
  } catch { return false; }
}
const franchiseRecordForValidation = (f: Franchise) => f.schedule.filter(g => g.result?.won).length;
