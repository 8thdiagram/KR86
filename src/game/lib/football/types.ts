import type { KickAttempt, KickDirection } from '../kick-return-engine';
import type { KickMatchup } from '../kick-return-teams';
import type { KickMoveInput } from '../kick-return-moves';
import type { KickDive } from '../kick-return-dive';
import type { MvpCounts } from './mvp';

export type Side = 'home' | 'away';
/** 'pass' is zone coverage and 'blitz' is the man blitz; both ids are kept so saved games stay valid. */
export type Defense = 'run' | 'pass' | 'man' | 'blitz' | 'run-blitz' | 'prevent' | 'goal-line' | 'contain';
export const DEFENSE_IDS: readonly Defense[] = ['run', 'pass', 'man', 'blitz', 'run-blitz', 'prevent', 'goal-line', 'contain'];
export const isBlitz = (d: Defense) => d === 'blitz' || d === 'run-blitz';
export const isPassCoverage = (d: Defense) => d === 'pass' || d === 'man' || d === 'prevent' || d === 'contain';
export type PlayId = 'power' | 'sweep' | 'counter' | 'draw' | 'sneak' | 'slant' | 'screen' | 'out' | 'cross' | 'post' | 'verticals' | 'play-action' | 'flood' | 'speed-option' | 'punt' | 'fake-punt' | 'field-goal';
export type Formation = 'I' | 'single-back' | 'shotgun' | 'pistol' | 'goal-line' | 'under-center' | 'punt';
export type Play = { id: PlayId; name: string; kind: 'run' | 'pass' | 'kick'; formation: Formation; description: string; depth: number; develop: number; risk: number };
export type Profile = { identity: string; run: number; line: number; qb: number; receivers: number; rush: number; coverage: number; back: number; kickMax: number };
export type Athlete = { id: number; side: 'offense' | 'defense'; role: 'QB' | 'OL' | 'RB' | 'WR' | 'TE' | 'DL' | 'LB' | 'DB'; x: number; y: number; startX: number; startY: number; vx: number; vy: number; engaged: number; route: number; beaten: number; coverageHesitated?: boolean; runSeal?: { defender: number; side: -1 | 1; starts: number; until: number }; dive?: KickDive; defensiveAttempt?: { kind: 'tackle' | 'intercept' | 'recover'; at: number; resolved?: boolean; ideal?: boolean }; scrambleTarget?: { x: number; y: number; until: number }; pursuit?: { x: number; y: number; until: number; role: 'tackle' | 'contain' | 'cutback' | 'deep' | 'trail' | 'cover' | 'rush'; seenX: number; seenY: number; seenVx: number; seenVy: number } };
export type LooseBall = { x: number; y: number; time: number; recoverer?: number; fromX?: number; fromY?: number;
  z?: number; vx?: number; vy?: number; originX?: number; originY?: number; secure?: number;
  kind?: 'fumble' | 'muff' | 'block'; owner?: Side; lostBy?: number; variant?: number };
export type PassType = 'normal' | 'bullet';
/** All coordinates use the receiving team's left-to-right return perspective. */
export type SpecialTeams = {
  kind: 'full' | 'squib' | 'onside' | 'punt' | 'field-goal';
  stage: 'lineup' | 'snap' | 'hold' | 'approach' | 'flight' | 'bounce' | 'recovery' | 'return' | 'loose' | 'resolved';
  age: number; stageAge: number; receiver: Side; kicking: Side;
  fromX: number; fromY: number; toX: number; toY: number;
  ball: { x: number; y: number; z: number }; duration: number;
  athletes: Athlete[]; kicker: number; returner: number; recovery?: number;
  recoveryFrom?: { x: number; y: number }; onsideWinner?: Side;
  accuracy?: number; good?: boolean; travel?: number; touchback?: boolean;
  loose?: LooseBall; blockAttempt?: { defender: number; side: -1 | 1; contacted?: boolean; cleared?: boolean; tested?: boolean };
  blockChecked?: boolean;
  receptionChecked?: boolean; returnSide?: Side; returnGroup?: Athlete['side']; mirrored?: boolean;
  rareOrigin?: 'muff' | 'block' | 'fumble'; scrimmageReturn?: boolean;
};
export type Flight = { x: number; y: number; z: number; fromX: number; fromY: number; toX: number; toY: number; age: number; duration: number; receiver: number; accuracy: number; type?: PassType; contested?: number[]; attempted?: number[];
  /** Unperturbed launch aim, for distinguishing delivery misses from unreachable catches. */
  aimX?: number; aimY?: number;
  deflected?: { age: number; x: number; y: number; z: number; toX: number; toY: number; detail: string } };
export type LivePlay = {
  coachingPlan?: import('./coaching').CoachingPlan;
  coachingSample?: import('./coaching').CoachingSample;
  option?: { phase: 'read' | 'pitch' | 'kept' | 'received' | 'loose'; edge: -1 | 1;
    until: number; pitchedAt?: number; receiveX?: number;
    ball?: { x: number; y: number; z: number; fromX: number; fromY: number; toX: number; toY: number; age: number; duration: number } };
  fieldFrame?: -1;
  offense?: Side;
  play: PlayId; defense: Defense; time: number; snapSpot: number; athletes: Athlete[];
  carrier: number; mode: 'handoff' | 'dropback' | 'scramble' | 'flight' | 'run' | 'loose' | 'kick' | 'return';
  rusher?: number;
  movement: KickAttempt; flight?: Flight; loose?: LooseBall;
  returnKind?: 'fumble' | 'interception';
  turnoverSpot?: number;
  executionRead?: number;
  executionSeed?: number;
  holdingPass?: boolean; lockedReceiver?: number; holdStarted?: number; scrambled?: boolean; crossedLos?: boolean;
  /** Once the actual carrier crosses the LOS, coverage cannot resume on a cutback. */
  carrierCrossedLos?: boolean;
  pressure: number; advantage: number; broken: number; contact: number; passCaught: boolean;
  kickMeter: number; kickAge: number; kickAccuracy?: number; target?: number;
  snapAge?: number; interception?: { catcher: number; age: number; catchX: number; catchY: number };
  defensiveActionAt?: number; cpuActionAt?: number;
  /** Persist whole-second checks and winners so saves cannot reroll pressure.
   * lastCheck is optional only for older one-check saves. */
  lineRush?: { checked: true; lastCheck?: number; winners: { defender: number; escapeY: number; cleared?: boolean }[] };
  penetration?: {
    roll: number; selection: number; recognition: number;
    event?: { defender: number; blocker: number; kind: 'line' | 'blitz'; at: number;
      side: -1 | 1; escapeX: number; escapeY: number;
      stageX?: number; entryDue?: number;
      cleared?: number; entered?: number; fooledUntil: number };
  };
};
export type Phase = 'coin-toss' | 'kickoff-choice' | 'kickoff' | 'play-call' | 'pre-snap' | 'live' | 'play-dead' | 'penalty' | 'halftime' | 'overtime-toss' | 'final';
export type FootballStats = { plays: number; rushYards: number; passYards: number; completions: number; attempts: number; sacks: number; turnovers: number; firstDowns: number; touchdowns: number; fieldGoals: number; punts: number; possession: number };
export type TackleActor = { id: number; x: number; y: number; vx: number; vy: number; team: Side };
/** Post-contact presentation only: recorded spot/outcome never move with the fall. */
export type TackleScene = { space: 'scrimmage' | 'special' | 'legacy-return';
  phase: 'impact' | 'fall' | 'ground'; elapsed: number; holdRemaining: number;
  carrier: TackleActor; defender: TackleActor; direction: 1 | -1 };
export type ClockStoppage = 'incomplete' | 'out-of-bounds' | 'timeout' | 'possession' | 'score' | 'penalty' | 'quarter-transition';
export type FootballGame = {
  /** Lateral dead-ball position for the next field goal; absent in older saves. */
  fieldGoalSpotY?: number;
  rushing?: Partial<Record<Side, Partial<Record<'QB' | 'RB', { carries: number; yards: number; touchdowns: number; fumbles: number }>>>>;
  coaching?: import('./coaching').CoachingMemory;
  /** Snap-locked situational state; never a permanent player attribute. */
  clutchActive?: boolean;
  /** Only matches admitted by Franchise Mode carry individual awards. */
  franchise?: { gameId: string; awards: MvpCounts; opponentAwards?: MvpCounts;
    playerAwards?: Partial<Record<Side, import('./legend-awards').OwnedAwards>>;
    performance?: import('./mvp-performance').ChampionshipPerformance;
    playoff?: { season: number; year: number; round: number } };
  homeOddDirection?: 1 | -1;
  fieldFrame?: 1 | -1;
  sideSwitch?: { remaining: number; quarter: number };
  version: 'football-1'; seed: number; rng: number; teams: KickMatchup; profiles: Record<Side, Profile>;
  secondary?: Record<Side, number[]>;
  phase: Phase; quarter: number; clock: number; quarterSeconds?: 120; possession: Side; spot: number; down: number; target: number;
  score: Record<Side, number>; timeouts: Record<Side, number>; stats: Record<Side, FootballStats>;
  openingWinner?: Side; secondHalfReceiver?: Side; kickReceiver: Side; kickKind: 'full' | 'squib' | 'onside';
  returnAttempt?: KickAttempt; live?: LivePlay; plays: number; event: number; message: string; lastResult: string;
  special?: SpecialTeams;
  rareEvents?: Partial<Record<'fumbles' | 'kickoffMuffs' | 'puntMuffs' | 'blockedPunts' | 'blockedFieldGoals', number>>;
  kickSounds?: number; tackleSounds?: number;
  tackleScene?: TackleScene;
  playResult?: { remaining: number; text: string };
  turnoverNotice?: number;
  clockRunning: boolean; quarterPending: boolean; nextPhase: 'play-call' | 'kickoff-choice' | 'kickoff';
  /** Durable football stoppage; defensive selection/presentation are temporary suspensions. */
  clockStoppage?: ClockStoppage;
  cpuTimeoutPlay?: number;
  playerRuns: number; playerPasses: number; defensiveCalls: Record<Defense, number>; cpuLast: PlayId[]; history: { quarter: number; clock: number; offense: Side; play: string; result: string; gain: number; defense?: Defense }[];
  winner?: Side; overtime: boolean; totalTime: number;
  playClock?: number; playClockRunning?: boolean;
  pendingSnap?: { play: PlayId; defense: Defense; remaining: number };
  delayPenalty?: { remaining: number; yards: number; offense: Side };
};
export type FootballInput = { direction?: KickDirection; action?: boolean; hesitate?: boolean; juke?: boolean; passPress?: boolean; passTarget?: number; passRelease?: PassType; passCancel?: boolean; qbScramble?: boolean;
  /** Transient, human-only ACTION hold; never persisted as a defensive assignment. */
  defenseHold?: boolean;
};
export type FootballMove = KickMoveInput;
export const other = (side: Side): Side => side === 'home' ? 'away' : 'home';
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** Persisted, deterministic PRNG. Never sample randomness in the renderer. */
export function random(g: FootballGame) { g.rng = (Math.imul(g.rng, 1664525) + 1013904223) >>> 0; return g.rng / 4294967296; }
