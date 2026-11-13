import type { FootballGame } from './types';

/** Transient account warnings belong after the match, not over live football. */
export function visibleFranchiseSaveError(error: string, syncFailure: boolean, game?: FootballGame) {
  return syncFailure && game && game.phase !== 'final' ? '' : error;
}
export const franchiseRetryDelay = (attempt: number) => Math.min(30000, 5000 * 2 ** Math.min(3, attempt));
export function retryableFranchiseSyncError(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  return status === undefined || status === 408 || status === 429 || status >= 500;
}
