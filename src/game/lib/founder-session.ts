import type { FounderTrialGame } from './founder-game-trial';

/** Optional isolated mode accepted by the real game components. Absent => ordinary standalone behavior. */
export type FounderSessionProps = {
  seed: number;
  /** Raw `trial.progress`; validated by the game with readFounderEnvelope. */
  progress?: unknown;
  onProgress: (progress: unknown) => void;
  /** Called at most once, only when the game reaches its bounded terminal state. */
  onComplete: (outcome: 'completed' | 'lost') => void;
};

export type FounderEnvelope = { kind: 'founder-session'; v: 1; game: FounderTrialGame; seed: number; state: unknown; inputs?: unknown[] };

export const normalizeFounderSeed = (seed: number) => {
  const v = Math.abs(Math.floor(Number.isFinite(seed) ? seed : 1));
  return v === 0 ? 1 : ((v - 1) % 2147483646) + 1;
};
export const founderRunId = (seed: number) => `founder-session-${normalizeFounderSeed(seed)}`;

export const makeFounderEnvelope = (game: FounderTrialGame, seed: number, state: unknown, inputs?: unknown[]): FounderEnvelope =>
  ({ kind: 'founder-session', v: 1, game, seed: normalizeFounderSeed(seed), state: JSON.parse(JSON.stringify(state)), ...(inputs ? { inputs: JSON.parse(JSON.stringify(inputs)) } : {}) });

const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (...n: unknown[]) => n.every(x => typeof x === 'number' && Number.isFinite(x));

/** Envelope + per-game structural validation. Returns null for anything stale, foreign or malformed. */
export function readFounderEnvelope(raw: unknown, game: FounderTrialGame, seed: number): FounderEnvelope | null {
  if (!obj(raw) || raw.kind !== 'founder-session' || raw.v !== 1 || raw.game !== game || raw.seed !== normalizeFounderSeed(seed) || !obj(raw.state)) return null;
  const s = raw.state;
  const ok = game === 'double-ninjas' ? s.runId === founderRunId(seed) && s.seed === normalizeFounderSeed(seed) && s.level === 0 && Array.isArray(raw.inputs) &&
      ['intro', 'fight', 'ko', 'won', 'lost'].includes(s.phase) && obj(s.player) && obj(s.cpu) && fin(s.tick, s.player.hp, s.cpu.hp) && Array.isArray(s.opponents)
    : game === 'paper-paper' ? s.runId === founderRunId(seed) && s.seed === normalizeFounderSeed(seed) && Array.isArray(raw.inputs) &&
      ['running', 'level-end', 'complete'].includes(s.phase) && fin(s.tick, s.x, s.y, s.score, s.level) && Array.isArray(s.houses) && Array.isArray(s.papers) && Array.isArray(s.effects)
    : game === 'duck-hunt' ? typeof s.seed === 'string' && s.seed.endsWith(String(normalizeFounderSeed(seed))) && s.gameId === founderRunId(seed) &&
      fin(s.timeMs, s.phaseMs, s.level) && typeof s.phase === 'string' && Array.isArray(s.ducks) && Array.isArray(s.levelHits) && Array.isArray(s.levelShots)
    : obj(s.current) && fin(s.attempts) && s.attempts === 1;
  return ok ? (raw as FounderEnvelope) : null;
}

/** Wraps a terminal callback so it can fire exactly once, however often the game re-detects the end. */
export function once<A extends unknown[]>(fn: (...a: A) => void) {
  let fired = false;
  return Object.assign((...a: A) => { if (fired) return false; fired = true; fn(...a); return true; }, { fired: () => fired });
}
