import type { KickReturnProgress } from './kick-return-engine';
/** trytry's server-based cross-player comparisons do not exist in this independent offline edition. */
export function useFootballRanking(_progress: KickReturnProgress, _enabled: boolean) {
  return { ranking: null as { returnTiming?: { newFastestTouchdown?: boolean; fastestTouchdownMs?: number;
    averageMs?: number; latestMs?: number; count?: number } } | null,
    error: '', loading: false, refresh: () => undefined };
}
