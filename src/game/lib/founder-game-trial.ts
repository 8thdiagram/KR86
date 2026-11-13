export const FOUNDER_TRIAL_GAMES = ['paper-paper', 'kick-return', 'double-ninjas', 'duck-hunt'] as const;
export type FounderTrialGame = typeof FOUNDER_TRIAL_GAMES[number];
/** One isolated, unranked round. No arcade records or existing saves are used. */
export type FounderGameTrialProps = {
  game: FounderTrialGame;
  seed: number;
  progress?: unknown;
  onProgress: (progress: unknown) => void;
  onComplete: (outcome: 'completed' | 'lost') => void;
  onUnavailable: () => void;
};
export const FOUNDER_TRIAL_TITLES: Record<FounderTrialGame, string> = {
  'paper-paper': 'Paper, Paper', 'kick-return': 'Kick Return ’86',
  'double-ninjas': 'Double Ninjas', 'duck-hunt': 'Duck Huntin’',
};
export type FinalFounderTrial = {
  game: FounderTrialGame;
  status: 'offered' | 'playing' | 'declined' | 'skipped' | 'completed' | 'lost' | 'unavailable';
  progress?: unknown;
  /** New 8-step edition: true once the player picked a game in the arcade selector. */
  picked?: boolean;
};
export function assignFounderTrial(runId: string, prior?: FounderTrialGame): FinalFounderTrial {
  let hash = 2166136261;
  for (const char of runId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const choices = FOUNDER_TRIAL_GAMES.filter(game => game !== prior);
  return { game: choices[hash % choices.length]!, status: 'offered' };
}
export function isFinalFounderTrial(value: unknown): value is FinalFounderTrial {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as FinalFounderTrial;
  return FOUNDER_TRIAL_GAMES.includes(v.game)
    && ['offered', 'playing', 'declined', 'skipped', 'completed', 'lost', 'unavailable'].includes(v.status);
}
export function founderTrialResult(trial: FinalFounderTrial) {
  if (trial.status === 'offered' || trial.status === 'playing') return undefined;
  return trial.status === 'declined'
    ? { accepted: false as const, outcome: 'declined' as const }
    : { accepted: true as const, game: trial.game, outcome: trial.status };
}
