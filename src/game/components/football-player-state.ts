import type { Athlete, LivePlay } from '../lib/football/types';
import { updateFootballAnimation } from './football-animation-clock';
import { PLAYBOOK } from '../lib/football/playbook';
import type { Pose } from './football-sprites';

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Presentation only: observations choose raster frames, never the reverse.
 * No randomness, movement, contacts, football release or save fields change. */
export function footballAthletePose(live: LivePlay, athlete: Athlete,
  flags: { snapping: boolean; ball: boolean; engaged: boolean; facing: 1 | -1; direction: 1 | -1 }): Pose {
  const { snapping, ball, engaged, facing, direction } = flags;
  const cadence = updateFootballAnimation(live, athlete.id, {
    now: live.time, x: athlete.x, y: athlete.y, vx: athlete.vx, vy: athlete.vy, facing,
  });
  const moving = !snapping && cadence.moving;
  const stableFacing = cadence.facing;
  const base: Pose = {
    step: moving ? cadence.step : 0,
    locomotionStep: moving ? Math.floor(cadence.phase * 8) % 8 : undefined,
    locomotionGait: moving ? cadence.shuffling ? 'strafe' : 'run' : undefined,
    ball, engaged, crouch: snapping, lean: engaged ? stableFacing : 0,
    view: cadence.view,
  };
  if (snapping) return { ...base, action: 'stance' };
  if (athlete.role === 'QB') {
    if (live.flight && live.flight.age < .22)
      return { ...base, action: 'throw', progress: .6 + .4 * clamp(live.flight.age / .22), ball: false };
    if (ball && live.holdingPass)
      return { ...base, action: 'throw', progress: Math.min(.59, clamp((live.time - (live.holdStarted ?? live.time)) / .28)) };
    if (ball && live.mode === 'dropback' && live.offense === 'away') {
      const releaseRead = live.target ?? PLAYBOOK[live.play].develop;
      if (live.time >= releaseRead - .28)
        return { ...base, action: 'throw', progress: Math.min(.59, clamp((live.time - releaseRead + .28) / .28) * .59) };
    }
    if (ball && (live.snapAge ?? 1) < .3)
      return { ...base, action: 'snap', progress: clamp(((live.snapAge ?? .18) - .18) / .12) };
    if (live.mode === 'handoff') return { ...base, action: 'handoff', progress: clamp(live.time / .45) };
    if (ball && live.mode === 'dropback') return { ...base, action: 'hold' };
  }
  if (athlete.role === 'RB' && live.mode === 'handoff')
    return { ...base, action: 'handoff', progress: clamp(live.time / .45) };
  const flight = live.flight;
  if (flight && Math.hypot(athlete.x - flight.x, athlete.y - flight.y) < 24 &&
      flight.age / Math.max(.01, flight.duration) > .6) {
    if (athlete.id === flight.receiver)
      return { ...base, action: 'catch', progress: .55 * clamp(flight.age / flight.duration) };
    if (athlete.side === 'defense' && ['DB', 'LB'].includes(athlete.role))
      return { ...base, action: 'jump', progress: clamp(flight.age / flight.duration) };
  }
  const attempt = athlete.defensiveAttempt;
  if (attempt?.kind === 'intercept' && live.time >= attempt.at && live.time - attempt.at < .3)
    return { ...base, action: 'jump', progress: (live.time - attempt.at) / .3 };
  if (ball && live.passCaught && live.movement.returnTime < .24)
    return { ...base, action: 'catch', progress: .55 + .45 * clamp(live.movement.returnTime / .24) };
  const winner = live.lineRush?.winners.find(w => w.defender === athlete.id && !w.cleared);
  const breakthroughAge = live.time - (live.lineRush?.lastCheck ?? Math.floor(live.time));
  if (winner && breakthroughAge >= 0 && breakthroughAge < .25)
    return { ...base, action: 'break', progress: breakthroughAge / .25 };
  if (engaged) return { ...base, action: 'block', progress: .5 };
  if (moving && athlete.role === 'DB' && athlete.side === 'defense' &&
      (live.mode === 'dropback' || live.mode === 'flight') && athlete.vx * direction > 3)
    return { ...base, action: 'backpedal' };
  return { ...base, action: moving ? 'run' : athlete.side === 'defense' ? 'stance' : 'idle' };
}
