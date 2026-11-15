import type { FootballGame } from './types';

type Pose = { object: Record<string, unknown>; values: Record<string, number> };
export type FootballRenderSample = {
  live: FootballGame['live']; special: FootballGame['special'];
  phase: FootballGame['phase']; mode?: string; stage?: string; carrier?: number;
  poses: Pose[];
};
/** Small render-only samples. Identity stays stable for the animation clocks;
 * no copied game, saved schema fields, randomness, or physics are introduced. */
export function captureFootballRender(g: FootballGame): FootballRenderSample {
  const poses: Pose[] = [];
  const sample = (value: object | undefined, fields: string[]) => {
    if (!value) return;
    const object = value as Record<string, unknown>, values: Record<string, number> = {};
    for (const key of fields) if (typeof object[key] === 'number') values[key] = object[key] as number;
    poses.push({ object, values });
  };
  const actors = g.special?.athletes ?? g.live?.athletes ?? [];
  for (const actor of actors) sample(actor, ['x', 'y', 'vx', 'vy']);
  sample(g.live, ['time', 'snapAge']);
  sample(g.special, ['age', 'stageAge']);
  sample(g.special?.ball, ['x', 'y', 'z']);
  return { live: g.live, special: g.special, phase: g.phase, mode: g.live?.mode,
    stage: g.special?.stage, carrier: g.live?.carrier, poses };
}

/** Paint between completed fixed steps, then restore every numeric field even
 * if drawing fails. The solver, sound events, React UI and saves see only the
 * authoritative game state. Never interpolate across a contact or new action. */
export function withFootballRenderInterpolation<T>(
  g: FootballGame, previous: FootballRenderSample | undefined, alpha: number, paint: () => T,
): T {
  if (!previous || previous.live !== g.live || previous.special !== g.special ||
      previous.phase !== g.phase || previous.mode !== g.live?.mode ||
      previous.stage !== g.special?.stage || previous.carrier !== g.live?.carrier ||
      g.tackleScene || g.playResult || g.sideSwitch || g.phase !== 'live' && g.phase !== 'kickoff') return paint();
  const blend = Math.max(0, Math.min(1, alpha)), restored: Pose[] = [];
  try {
    for (const { object, values } of previous.poses) {
      const current: Record<string, number> = {};
      for (const [key, before] of Object.entries(values)) {
        const after = object[key];
        if (typeof after !== 'number') continue;
        current[key] = after;
        // Teleports/recoveries are authoritative, not interpolated journeys.
        if ((key === 'x' || key === 'y') && Math.abs(after - before) > 24) continue;
        object[key] = before + (after - before) * blend;
      }
      restored.push({ object, values: current });
    }
    return paint();
  } finally {
    for (const { object, values } of restored) Object.assign(object, values);
  }
}
