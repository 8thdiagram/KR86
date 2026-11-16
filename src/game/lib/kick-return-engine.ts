import { createKickMatchup, isKickMatchup, type KickMatchup } from './kick-return-teams';
import { SAFETY, stepFreeSafety, type SafetyMotion } from './kick-return-safety';
import { ROAMER, roamerAnchorX, roamerSpeedBoost, roamerLateralBoost, stepKickRoamer, type RoamerMotion } from './kick-return-roamers';
import { DIVE, LUNGE, fitsCompactDive, kickDiveTiming, readDiveTrajectory, startKickDive, stepCommittedDive, type DiveRead, type KickDive } from './kick-return-dive';
import { isKickMoves, jukePursuitRead, readKickJuke, stepKickMoves, type CarrierBounds, type JukeRead, type KickMoveInput, type KickMoves } from './kick-return-moves';
import { kickDiveBallReach, kickDiveFinish } from './kick-return-burst';
import { isKickReturnRecord, recordKickReturn, type KickReturnRecord } from './kick-return-timing';
import { upgradeExtraCoverage, upgradeMediumCoverage } from './kick-return-coverage';
import { stepOpenFieldCoverage } from './kick-open-field';
import { stepFullCoverage } from './kick-full-coverage';
import { openFieldGain } from './football/athleticism';
import { playerSpeed } from './player-pace';
import { constrainEvasionStep, EVADE } from './carrier-evasion';

/** Original, deterministic miniature football physics. No assessment scoring. */
export const KR = {
  width: 320, height: 192, minY: 24, maxY: 168,
  receivingGoal: 100, goal: 1100, worldWidth: 1200,
  forwardSpeed: 73, lateralSpeed: 86, kickoffSeconds: 1.55, dt: 1 / 60, downs: 4,
} as const;
export type KickDirection = -1 | 0 | 1;
export type KickPhase = 'kickoff' | 'returning' | 'tackled' | 'touchdown';
export type KickDefender = {
  id: number; x: number; y: number; homeX: number; minY: number; maxY: number;
  speed: number; lateralSpeed: number; active: boolean;
  motion?: SafetyMotion; observedY?: number;
  roamer?: RoamerMotion;
  dive?: KickDive;
  diveSpent?: boolean;
  jukeRead?: JukeRead;
};
export type KickAttempt = {
  version: 1; seed: number; number: number; phase: KickPhase; time: number;
  returnTime: number; player: { x: number; y: number }; landing: { x: number; y: number };
  defenders: KickDefender[]; gaps: number[]; formation: string;
  difficulty?: 'hard';
  safetyVersion?: 1;
  diveVersion?: 1;
  /** Reachability-based dive admission for new downs; existing saves retain their rules. */
  divePolicy?: 2 | 3;
  diveRead?: DiveRead;
  lastDiveTime?: number;
  moves?: KickMoves;
  /** New-down rules only. Absence retains the previous saved physics. */
  mechanicsVersion?: 2;
  /** Early-wave promotions and five-yard dives; old saves retain their rules. */
  returnUpgrade?: 1;
  /** Extra personnel promotion and observed-motion pursuit on new returns only. */
  pursuitVersion?: 1;
  /** New kickoff downs only; absent on historical saves and scrimmage/punt adapters. */
  kickoffBoost?: 1.04;
  teams?: KickMatchup;
  /** Only Full Game's physical kick/punt coverage uses this adapter. */
  fullCoverage?: { elite: number[]; openFieldAge?: number; speedMatch?: number; extraSpeedMatch?: number;
    returnSpeed?: number; executionSpeed?: number; defenderSpeed?: { id: number; factor: number } };
  /** Absent on pre-clock saves; never invent historical elapsed time. */
  elapsedMs?: number;
  endReason?: 'out-of-bounds';
};
export type KickReturnProgress = {
  version: 1; attempts: number; bestYards: number; current?: KickAttempt;
  /** Completed downs only; current net yardage can now decrease during retreat. */
  bankedBestYards?: number;
  outcome?: 'touchdown' | 'skipped' | 'downs-exhausted'; continued?: boolean;
  rankingRoundId?: string;
  teams?: KickMatchup;
  returns?: KickReturnRecord[];
  newFastestTouchdown?: boolean;
};
const templates = [
   { name: 'switchback', gaps: [46, 146, 48, 144, 50] },
   { name: 'sideline', gaps: [146, 48, 142, 46, 144] },
   { name: 'cutback', gaps: [66, 146, 46, 144, 58] },
   { name: 'double-juke', gaps: [140, 46, 138, 148, 48] },
] as const;
export const waveX = (wave: number) => 250 + wave * 165;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function kickSeed(text: string): number {
  let value = 2166136261;
  for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function createKickAttempt(seed: number, number: number, mechanics: 1 | 2 | 3 | 4 = 4): KickAttempt {
  let state = kickSeed(`${seed}:kick-return-86:${number}`);
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const template = templates[Math.floor(random() * templates.length)]!;
  const gaps = template.gaps.map(y => clamp(y + Math.round(random() * 12 - 6), 44, 148));
  const landing = { x: 48 + Math.round(random() * 70), y: 36 + Math.round(random() * 120) };
  const defenders: KickDefender[] = [];
  gaps.forEach((gap, wave) => {
    for (const side of [-1, 1]) {
      // A defended upper/lower band, not an invisible safety adjustment.
      // Historical returns keep these patrol bands. New-return pursuit can
      // leave a lane once the runner is close or has passed the defender.
       const minY = side < 0 ? KR.minY : Math.min(KR.maxY, gap + 16);
       const maxY = side < 0 ? Math.max(KR.minY, gap - 16) : KR.maxY;
      const x = waveX(wave) + Math.round(random() * 12 - 6);
      defenders.push({
         id: defenders.length, x, homeX: x, y: clamp(gap + side * 34, minY, maxY),
         minY, maxY, speed: 17 + wave * 1.5, lateralSpeed: 40 + wave * 4, active: false,
      });
    }
  });
  // The original kicker becomes the final coverage defender (eleven total).
   const x = waveX(4) + 65;
    defenders.push({ id: 10, x, homeX: x, y: KR.minY + 8, minY: KR.minY,
      maxY: KR.maxY, speed: SAFETY.forward, lateralSpeed: SAFETY.lateral, active: false });
    // Draw only after the original formation RNG: gaps, landing and safety stay intact.
    const count = random() < .5 ? 1 : 2;
    const pool = defenders.slice(0, 10);
    for (let i = 0; i < count; i++) {
      const index = Math.floor(random() * pool.length);
      const [d] = pool.splice(index, 1);
      d!.speed *= ROAMER.speedBoost;
      d!.lateralSpeed *= ROAMER.lateralBoost;
      d!.roamer = { vx: 0, stride: 0 };
    }
    // Two more, distinct defenders at exactly half the existing boost.
    for (let i = 0; i < 2; i++) {
      const [d] = pool.splice(Math.floor(random() * pool.length), 1);
      d!.roamer = { vx: 0, stride: 0, tier: 'medium' };
      d!.speed *= roamerSpeedBoost(d!);
      d!.lateralSpeed *= roamerLateralBoost(d!);
    }
      if (mechanics !== 1) {
       // Independent depth and band placement, not a translated template. A 40px
       // corridor is retained at every wave; changes between waves remain reachable.
       let previous = 96;
       for (let wave = 0; wave < 5; wave++) {
         const gap = Math.round(clamp(previous + (random() * 2 - 1) * 62, 44, 148));
         gaps[wave] = gap;
         previous = gap;
         for (const side of [-1, 1]) {
           const d = defenders[wave * 2 + (side < 0 ? 0 : 1)]!;
           d.minY = side < 0 ? KR.minY : gap + 20;
           d.maxY = side < 0 ? gap - 20 : KR.maxY;
           d.y = Math.round(d.minY + random() * (d.maxY - d.minY));
           d.x = d.homeX = waveX(wave) + Math.round(random() * 60 - 30);
         }
       }
     }
      if (mechanics >= 3) upgradeMediumCoverage(defenders, random);
      if (mechanics === 4) upgradeExtraCoverage(defenders, random);
      return { version: 1, difficulty:'hard', safetyVersion: 1, diveVersion: 1,
      ...(mechanics !== 1 ? { mechanicsVersion: 2 as const, divePolicy: 3 as const } : {}),
      ...(mechanics >= 3 ? { returnUpgrade: 1 as const, kickoffBoost: 1.04 as const } : {}),
      ...(mechanics === 4 ? { pursuitVersion: 1 as const } : {}),
    moves: { version: mechanics === 1 ? 1 : 2, sequence: 0, readyAt: 0, backward: false, vx: 73, furthestX: 62 }, elapsedMs: 0,
    seed, number, phase: 'kickoff', time: 0, returnTime: 0,
    player: { x: 62, y: 96 }, landing, defenders, gaps, formation: template.name };
}
export function kickBallPosition(a: KickAttempt): { x: number; y: number; height: number } {
  const flight = clamp((a.time - .35) / 1.05, 0, 1);
  return { x: 1060 + (a.landing.x - 1060) * flight,
    y: 96 + (a.landing.y - 96) * flight, height: Math.sin(flight * Math.PI) * 42 };
}
export function isKickContact(player: { x: number; y: number }, defender: { x: number; y: number }): boolean {
  // Sprite-centred, tight hitboxes: no tackling at a distance.
  return Math.abs(player.x - defender.x) < 9 && Math.abs(player.y - defender.y) < 10;
}
export function stepKickAttempt(a: KickAttempt, direction: KickDirection, dt = KR.dt, input: KickMoveInput = {},
  bounds: CarrierBounds = { minY: KR.minY, maxY: KR.maxY }, position?: { id: number; x: number; y: number }): KickAttempt {
  return advanceKickAttempt(a, direction, dt, true, input, bounds, position);
}

/** Conservative admission check: offer at least one immediate, real-physics escape.
 * Both hypothetical cuts are examined, never the player's next actual input. */
export function canEvadeKickDive(a: KickAttempt, diver: KickDefender): boolean {
  for (const direction of [-1, 1] as const) {
    let preview = { ...a, defenders: a.defenders.map(d => d.id === diver.id ? diver : d) };
    for (let frame = 0; frame < 30 && preview.phase === 'returning'; frame++)
      preview = advanceKickAttempt(preview, direction, KR.dt, false, { backward: a.moves?.backward, hesitate: a.moves?.hesitating });
    if (preview.phase !== 'tackled') return true;
  }
  return false;
}

function advanceKickAttempt(a: KickAttempt, direction: KickDirection, dt: number, allowDiveStarts: boolean, input: KickMoveInput = {},
  bounds: CarrierBounds = { minY: KR.minY, maxY: KR.maxY }, position?: { id: number; x: number; y: number }): KickAttempt {
  if (a.phase === 'touchdown' || a.phase === 'tackled') return a;
  if (!Number.isFinite(dt) || dt <= 0 || dt > KR.dt + .000001)
    throw new Error('Kick Return requires fixed, bounded physics steps');
  const time = a.time + dt;
  if (a.phase === 'kickoff') {
    const catchTravel = clamp((time - .25) / 1.15, 0, 1);
    return { ...a, time, phase: time + 1e-9 >= KR.kickoffSeconds ? 'returning' : 'kickoff',
      player: { x: 62 + (a.landing.x - 62) * catchTravel, y: 96 + (a.landing.y - 96) * catchTravel },
      ...(a.moves ? { moves: { ...a.moves, furthestX: Math.max(a.moves.furthestX, a.landing.x) } } : {}) };
  }
  const diveRead = a.diveVersion === 1 ? readDiveTrajectory(a, dt) : undefined;
  let diveStarted = false;
   // Existing in-progress saves keep their original controls and coverage.
   const hard=a.difficulty==='hard';
  const movement = stepKickMoves(a, direction, dt, input, bounds);
  if (a.fullCoverage) {
    const boost = (a.fullCoverage.returnSpeed ?? 1) * (a.fullCoverage.executionSpeed ?? 1);
    if (boost !== 1) {
      movement.player.x = a.player.x + (movement.player.x - a.player.x) * boost;
      if (!movement.spinStep) movement.player.y = clamp(a.player.y + (movement.player.y - a.player.y) * boost, bounds.minY, bounds.maxY);
    }
    const ramp = { ...a.player, openFieldAge: a.fullCoverage.openFieldAge };
    const runningGains = !movement.spinStep && (!movement.moves?.active || movement.evasiveStep);
    const gain = openFieldGain(ramp, a.defenders, dt, !!runningGains && !input.hesitate);
    a.fullCoverage.openFieldAge = ramp.openFieldAge;
    if (runningGains && !input.hesitate) {
      movement.player.x = a.player.x + (movement.player.x - a.player.x) * gain;
      movement.player.y = clamp(a.player.y + (movement.player.y - a.player.y) * gain, bounds.minY, bounds.maxY);
    }
  }
  if (movement.evasiveStep) movement.player = constrainEvasionStep(a.player, movement.player, a.defenders);
  const { player } = movement;
  const fooled = movement.started ? readKickJuke(a, movement.moves!) : new Set<number>();
  const defenders = a.defenders.map(original => {
      const d = fooled.has(original.id) ? { ...original,
        jukeRead: jukePursuitRead(a, original, movement.moves!.active!.side) } : original;
       if (a.diveVersion === 1 && d.dive) return stepCommittedDive(d, dt, a.mechanicsVersion === 2);
      // Full-game human defense only supplies this temporary destination.
      // Keep all ordinary movement/collision rules; never start an automatic dive on hold.
      if (position?.id === d.id) return a.fullCoverage ? stepFullCoverage(a, d, dt, position)
        : stepOpenFieldCoverage(a, d, dt, d.speed, d.lateralSpeed, position);
      if (!a.pursuitVersion && !a.fullCoverage && a.safetyVersion === 1 && d.id === 10) return d;
     const active = d.active || player.x >= d.homeX - (a.pursuitVersion && d.id === 10 ? 350 : hard?215:180);
    if (!active) return d;
    if (allowDiveStarts && diveRead && !diveStarted) {
      const diving = startKickDive(a, { ...d, active }, diveRead);
      if (diving.dive) {
        diveStarted = true;
        return diving.dive.approach ? stepCommittedDive(diving, dt, true) : diving;
      }
    }
     if (a.fullCoverage) return stepFullCoverage(a, d, dt);
     if (a.pursuitVersion) return stepOpenFieldCoverage(a, d, dt, d.speed, d.lateralSpeed);
    // Predictable pursuit within each clearly separated patrol band.
    const target = clamp(d.jukeRead && d.jukeRead.until > a.returnTime ? d.jukeRead.targetY
      : player.y + direction * 10, d.minY, d.maxY);
    if (d.roamer && d.id !== 10) return stepKickRoamer(d, player.x, target, dt, movement.moves?.furthestX);
    return { ...d, active, x: d.x - playerSpeed(d.speed) * dt,
      y: d.y + clamp(target - d.y, -playerSpeed(d.lateralSpeed) * dt, playerSpeed(d.lateralSpeed) * dt) };
  });
  if (a.safetyVersion === 1 && !a.fullCoverage && !a.pursuitVersion) {
    const index = defenders.findIndex(d => d.id === 10);
    if (index >= 0 && !defenders[index]!.dive) {
      const d = defenders[index]!;
      const diving = allowDiveStarts && diveRead && !diveStarted ? startKickDive(a,
        { ...d, active: d.active || a.player.x >= d.homeX - 350 }, diveRead) : d;
      if (diving.dive) diveStarted = true;
      defenders[index] = diving.dive ? diving.dive.approach ? stepCommittedDive(diving, dt, true) : diving : stepFreeSafety(a, d, dt, defenders,
        d.jukeRead && d.jukeRead.until > a.returnTime ? d.jukeRead.targetY : undefined);
    }
  }
   let phase: KickPhase = defenders.some(d => !['grounded', 'recovering'].includes(d.dive?.phase ?? '') && isKickContact(player, d)) ? 'tackled'
    : player.x >= KR.goal ? 'touchdown' : 'returning';
  let fraction = 1;
  let endReason: 'out-of-bounds' | undefined;
  if (a.moves?.version === 2 && (movement.moves?.active?.kind === 'dive' || a.moves.active?.kind === 'dive')) {
    const reach = movement.moves?.active?.kind === 'dive' ? kickDiveBallReach(movement.moves.active.elapsed, a) : 0;
    const finish = kickDiveFinish(a, player, defenders, reach);
    phase = finish.phase; fraction = finish.fraction;
  }
  if ('outAt' in movement && movement.outAt !== undefined && movement.outAt < fraction) {
    phase = 'tackled'; fraction = movement.outAt; endReason = 'out-of-bounds';
  }
  return { ...a, time: a.time + dt * fraction, returnTime: a.returnTime + dt * fraction, player, defenders, phase,
    ...(endReason ? { endReason } : {}),
    ...(a.elapsedMs !== undefined ? { elapsedMs: a.elapsedMs + dt * fraction * 1000 } : {}),
    ...(movement.moves ? { moves: movement.moves } : {}),
    ...(diveRead ? { diveRead } : {}), ...(diveStarted ? { lastDiveTime: a.returnTime } : {}) };
}
export const emptyKickProgress = (): KickReturnProgress => ({ version: 1, attempts: 0, bestYards: 0 });
/** An explicit new game, never a fifth down in the finished game. */
export function restartKickReturn(p: KickReturnProgress): KickReturnProgress {
  return p.outcome ? emptyKickProgress() : p;
}
export const kickDownName = (down: number) => ['First Down', 'Second Down', 'Third Down', 'Fourth Down'][clamp(down || 1, 1, KR.downs) - 1]!;
/** Preserve earlier saves, but never grant a fifth down under the new rule. */
export function enforceKickDowns(p: KickReturnProgress): KickReturnProgress {
  if (!p.outcome && (p.attempts > KR.downs || p.attempts === KR.downs && p.current?.phase === 'tackled'))
    return { ...p, outcome: 'downs-exhausted' };
  return p;
}
export function beginKickReturn(p: KickReturnProgress, seed: number): KickReturnProgress {
  if (p.outcome || p.attempts >= KR.downs || p.current && !['tackled'].includes(p.current.phase)) return p;
  const attempts = p.attempts + 1;
  const teams = p.teams ?? p.current?.teams ?? createKickMatchup();
  return { ...p, teams, attempts, bankedBestYards: p.bestYards,
    current: { ...createKickAttempt(seed, attempts), teams } };
}
export function returnedYards(a: KickAttempt): number {
  return clamp(Math.floor(((a.phase === 'touchdown' ? Math.max(KR.goal, a.player.x) : a.player.x) - a.landing.x) / 10), 0, 106);
}
export function updateKickProgress(p: KickReturnProgress, a: KickAttempt): KickReturnProgress {
  if (p.outcome) return p;
  return { ...p, current: a, bestYards: Math.max(a.moves ? p.bankedBestYards ?? 0 : p.bestYards, returnedYards(a)),
    ...(recordKickReturn(p, a, returnedYards(a)) ? { returns: recordKickReturn(p, a, returnedYards(a)) } : {}),
    ...(a.phase === 'touchdown' ? { outcome: 'touchdown' as const }
      : a.phase === 'tackled' && p.attempts >= KR.downs ? { outcome: 'downs-exhausted' as const } : {}) };
}
export function skipKickReturn(p: KickReturnProgress): KickReturnProgress {
  return p.outcome ? p : { ...p, outcome: 'skipped' };
}
/** A constructive witness. Uses exactly the same bounded UP/DOWN physics as the player. */
export function kickWitnessDirection(a: KickAttempt): KickDirection {
  const upcoming = a.defenders.filter(d => d.x >= a.player.x - 9).sort((x, y) => x.homeX - y.homeX)[0];
  const wave = upcoming ? Math.min(4, Math.max(0, Math.round((upcoming.homeX - 250) / 165))) : 4;
  const target = a.gaps[wave]!;
  return Math.abs(target - a.player.y) <= KR.lateralSpeed * KR.dt ? 0 : target < a.player.y ? -1 : 1;
}
export function simulateKickWitness(seed: number, number: number, legacy = false): KickAttempt {
   let attempt = createKickAttempt(seed, number, legacy ? 1 : 2);
  if (legacy) {
    const { safetyVersion: _, diveVersion: _dive, diveRead: _read, moves: _moves, ...historical } = attempt;
    attempt = { ...historical, defenders: attempt.defenders.map(d => {
      if (d.id === 10) return { ...d, y: Math.min(32, Math.max(KR.minY, attempt.gaps[4]! - 16)),
        speed: 25, lateralSpeed: 60, maxY: Math.max(KR.minY, attempt.gaps[4]! - 16) };
      const { roamer: _, ...ordinary } = d;
      return { ...ordinary, speed: 17 + Math.floor(d.id / 2) * 1.5,
        lateralSpeed: 40 + Math.floor(d.id / 2) * 4 };
    }) };
  }
  for (let i = 0; i < 2400 && !['tackled', 'touchdown'].includes(attempt.phase); i++)
    attempt = stepKickAttempt(attempt, kickWitnessDirection(attempt));
  return attempt;
}
export function isKickReturnProgress(value: unknown): value is KickReturnProgress {
  if (!value || typeof value !== 'object') return false;
  const p = value as KickReturnProgress;
  if (p.teams !== undefined && !isKickMatchup(p.teams)) return false;
  if (p.current?.teams !== undefined && (!isKickMatchup(p.current.teams) ||
    p.teams !== undefined && (p.current.teams.player !== p.teams.player || p.current.teams.opponent !== p.teams.opponent))) return false;
  const finite = (...numbers: unknown[]) => numbers.every(n => typeof n === 'number' && Number.isFinite(n));
  if (p.version !== 1 || !Number.isSafeInteger(p.attempts) || p.attempts < 0 ||
    p.rankingRoundId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.rankingRoundId) ||
    !finite(p.bestYards) || p.bestYards < 0 || p.bestYards > 106 ||
    p.bankedBestYards !== undefined && (!finite(p.bankedBestYards) || p.bankedBestYards < 0 || p.bankedBestYards > p.bestYards) ||
    p.outcome !== undefined && !['touchdown', 'skipped', 'downs-exhausted'].includes(p.outcome) ||
    p.continued !== undefined && typeof p.continued !== 'boolean' ||
    p.outcome === 'downs-exhausted' && p.attempts < KR.downs) return false;
  if (p.newFastestTouchdown !== undefined && typeof p.newFastestTouchdown !== 'boolean') return false;
  if (p.returns !== undefined && (!Array.isArray(p.returns) || p.returns.length > 4 ||
    !p.returns.every(r => isKickReturnRecord(r) && r.down <= p.attempts) ||
    new Set(p.returns.map(r => r.down)).size !== p.returns.length)) return false;
  if (!p.current) return p.attempts === 0 && p.outcome !== 'touchdown' && (!p.continued || !!p.outcome);
  const a = p.current;
  // Full Game coverage is private match state, never Classic/assessment evidence.
  if (a.fullCoverage !== undefined) return false;
  if (a.kickoffBoost !== undefined && a.kickoffBoost !== 1.04) return false;
  if (a.version !== 1 || a.number !== p.attempts || !Number.isSafeInteger(a.seed) ||
    (a.difficulty!==undefined&&a.difficulty!=='hard') ||
    (a.pursuitVersion !== undefined && (a.pursuitVersion !== 1 || a.returnUpgrade !== 1)) ||
    (a.safetyVersion !== undefined && a.safetyVersion !== 1) ||
     (a.mechanicsVersion !== undefined && a.mechanicsVersion !== 2) ||
     (a.returnUpgrade !== undefined && (a.returnUpgrade !== 1 || a.mechanicsVersion !== 2 ||
       a.divePolicy !== 3 || a.moves?.version !== 2)) ||
    (a.diveVersion !== undefined && a.diveVersion !== 1) ||
    (a.elapsedMs !== undefined && (!finite(a.elapsedMs) || a.elapsedMs < 0 || a.elapsedMs > 86400000)) ||
    (a.endReason !== undefined && (a.endReason !== 'out-of-bounds' || a.phase !== 'tackled')) ||
    (a.divePolicy !== undefined && (![2, 3].includes(a.divePolicy) || a.mechanicsVersion !== 2 || a.diveVersion !== 1)) ||
    (a.lastDiveTime !== undefined && (a.diveVersion !== 1 || !finite(a.lastDiveTime) ||
      a.lastDiveTime < 0 || a.lastDiveTime > a.returnTime)) ||
    (a.diveRead !== undefined && (a.diveVersion !== 1 ||
      !finite(a.diveRead.y, a.diveRead.vy, a.diveRead.steadyFor) ||
      a.diveRead.y < KR.minY || a.diveRead.y > KR.maxY ||
      // A real diagonal fake adds its lateral escape to ordinary steering.
      // This is validation of observed motion only, not a defensive speed buff.
      Math.abs(a.diveRead.vy) > (a.moves?.version === 2
        ? playerSpeed(KR.lateralSpeed) + EVADE.spinDistance / EVADE.outward
        : playerSpeed(KR.lateralSpeed)) + .000001 ||
      a.diveRead.steadyFor < 0 || a.diveRead.steadyFor > 10)) ||
    !['kickoff', 'returning', 'tackled', 'touchdown'].includes(a.phase) ||
    !finite(a.time, a.returnTime, a.player?.x, a.player?.y, a.landing?.x, a.landing?.y) ||
    a.time < 0 || !a.moves && a.time > 60 || a.returnTime < 0 || a.returnTime > a.time || a.player.x < 0 || a.player.x > KR.worldWidth ||
    a.player.y < KR.minY || a.player.y > KR.maxY ||
    !Array.isArray(a.gaps) || a.gaps.length !== 5 || !Array.isArray(a.defenders) || a.defenders.length !== 11) return false;
  if (!isKickMoves(a.moves, a) || a.gaps.some(y => !finite(y) || y < 44 || y > 148)) return false;
  if (!a.defenders.every(d => finite(d.x, d.y, d.homeX, d.minY, d.maxY, d.speed, d.lateralSpeed) &&
     typeof d.active === 'boolean' && d.minY >= KR.minY && d.maxY <= KR.maxY &&
      (d.diveSpent === undefined || a.mechanicsVersion === 2 && d.diveSpent === true) &&
      d.minY <= d.maxY && d.y >= (a.pursuitVersion || d.dive || d.diveSpent ? KR.minY : d.minY) && d.y <= (a.pursuitVersion || d.dive || d.diveSpent ? KR.maxY : d.maxY) && d.speed >= 0 &&
     d.speed <= (a.safetyVersion === 1 && d.id === 10 ? SAFETY.forward : d.roamer ? 23 * roamerSpeedBoost(d) : a.difficulty==='hard'?25:20) &&
     d.lateralSpeed >= 0 && d.lateralSpeed <= (a.safetyVersion === 1 && d.id === 10 ? SAFETY.lateral : d.roamer ? 56 * roamerLateralBoost(d) : a.difficulty==='hard'?60:40) &&
     (d.roamer === undefined || a.difficulty === 'hard' && d.id >= 0 && d.id < 10 &&
       (d.roamer.tier === undefined || d.roamer.tier === 'medium') &&
       finite(d.roamer.vx, d.roamer.stride) && Math.abs(d.roamer.vx) <= playerSpeed(d.speed) + .000001 &&
        d.roamer.stride >= 0 && (!!a.pursuitVersion || !!d.dive || d.diveSpent || Math.abs(d.x - roamerAnchorX(d, a.moves?.furthestX ?? a.player.x)) <= ROAMER.reach + d.speed + .000001)) &&
     (d.jukeRead === undefined || !!a.moves && !!d.jukeRead && finite(d.jukeRead.until, d.jukeRead.targetY) &&
       d.jukeRead.until >= 0 && d.jukeRead.until <= a.returnTime + .2 &&
       d.jukeRead.targetY >= d.minY && d.jukeRead.targetY <= d.maxY) &&
     (d.dive === undefined || a.diveVersion === 1 && (d.roamer || d.id === 10 && d.motion) &&
        (d.dive.approach === undefined || d.dive.compact && a.divePolicy === 3 &&
          finite(d.dive.approach.vx, d.dive.approach.vy) &&
          Math.abs(d.dive.approach.vx) <= playerSpeed(d.speed) + .000001 && Math.abs(d.dive.approach.vy) <= playerSpeed(d.lateralSpeed) + .000001) &&
        (d.dive.compact === undefined || d.dive.compact === true && a.divePolicy === 3 && fitsCompactDive(d, d.dive.vx, d.dive.vy)) &&
        (['windup', 'airborne', 'grounded'].includes(d.dive.phase) ||
          a.mechanicsVersion === 2 && d.dive.phase === 'recovering') &&
       finite(d.dive.elapsed, d.dive.vx, d.dive.vy, d.dive.angle) &&
        d.dive.elapsed >= 0 && d.dive.elapsed <= (d.dive.phase === 'windup' ? kickDiveTiming(d.dive).windup
          : a.mechanicsVersion === 2 && d.dive.phase === 'grounded' ? DIVE.recovery
          : d.dive.phase === 'recovering' ? DIVE.pushUp : d.dive.compact ? LUNGE.flight : DIVE.flight) &&
       Math.hypot(d.dive.vx, d.dive.vy) <= DIVE.speed + .000001 &&
       Math.abs(d.dive.angle) <= Math.PI && d.x >= 0 && d.x <= KR.worldWidth) &&
     (d.observedY === undefined || finite(d.observedY) && d.observedY >= KR.minY && d.observedY <= KR.maxY) &&
     (d.motion === undefined || (a.pursuitVersion === 1 || a.safetyVersion === 1 && d.id === 10) &&
       finite(d.motion.vx, d.motion.vy, d.motion.targetX, d.motion.targetY, d.motion.reactionLeft, d.motion.stride) &&
       Math.max(Math.abs(d.motion.vx / playerSpeed(a.pursuitVersion ? d.speed : SAFETY.forward)), Math.abs(d.motion.vy / playerSpeed(a.pursuitVersion ? d.lateralSpeed : SAFETY.lateral))) <= 1.000001 &&
       d.motion.targetX >= (a.pursuitVersion ? 8 : 100) && d.motion.targetX <= (a.pursuitVersion ? 1180 : 1096) && d.motion.targetY >= KR.minY && d.motion.targetY <= KR.maxY &&
       d.motion.reactionLeft >= 0 && d.motion.reactionLeft <= (a.pursuitVersion ? .08 : SAFETY.reaction) &&
       d.motion.stride >= 0 && (d.motion.facing === -1 || d.motion.facing === 1)))) return false;
  if (a.defenders.filter(d => d.roamer && d.roamer.tier !== 'medium').length > 2 ||
       a.defenders.filter(d => d.roamer?.tier === 'medium').length > (a.pursuitVersion ? 5 : a.returnUpgrade === 1 ? 4 : 2)) return false;
  return (p.outcome !== 'touchdown' || a.phase === 'touchdown') &&
    (a.phase !== 'touchdown' || p.outcome === 'touchdown') && (!p.continued || !!p.outcome);
}
