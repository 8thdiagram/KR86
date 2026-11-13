import type { Franchise } from './franchise';
import type { FootballGame } from './types';

export type FranchiseAnnouncement = {
  id: string; season: number;
  kind: 'clinched' | 'eliminated' | 'playoffs' | 'advanced';
  round?: number;
};
export const franchiseYear = (season: number) => 1985 + season;
export function playoffEligibility(f: Franchise) {
  const wins = f.schedule.filter(s => s.result?.won).length;
  const losses = f.schedule.filter(s => s.result && !s.result.won).length;
  return wins >= 9 ? 'clinched' : losses >= 8 ? 'eliminated' : 'undecided';
}
/** Called only on a newly cloned transition; acknowledgments survive reloads. */
export function queueFranchiseAnnouncement(f: Franchise, kind: FranchiseAnnouncement['kind'], round?: number) {
  const id = `${f.season}:${kind}:${round ?? 'season'}`;
  f.announcements ??= [];
  if (!f.announcements.some(n => n.id === id))
    f.announcements.push({ id, season: f.season, kind, ...(round === undefined ? {} : { round }) });
}
export function acknowledgeFranchiseAnnouncement(f: Franchise, id: string) {
  if (f.announcements?.[0]?.id !== id) return f;
  const n = structuredClone(f); n.revision++; n.announcements!.shift(); return n;
}
/** Also decorates older active playoff saves without changing match identity. */
export function withPlayoffPresentation(f: Franchise, game: FootballGame): FootballGame {
  if (f.active?.kind !== 'playoff' || !game.franchise) return game;
  return { ...game, franchise: { ...game.franchise,
    playoff: { season: f.season, year: franchiseYear(f.season), round: f.active.round } } };
}
