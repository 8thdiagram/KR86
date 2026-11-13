/** Full Game only. Normal ratings, primary assignments and both movement axes
 * remain authoritative. Boost builds smoothly in space and fades in traffic. */
export const OPEN_FIELD = { acceleration: 1.065, topSpeed: 1.025, clearance: 48 } as const;
export type OpenRunner = { x: number; y: number; openFieldAge?: number };
export function openFieldGain(a: OpenRunner, opponents: { x: number; y: number }[], dt: number, eligible = true) {
  const clear = eligible && opponents.every(d => Math.hypot(d.x - a.x, d.y - a.y) > OPEN_FIELD.clearance);
  const old = a.openFieldAge ?? 0;
  const age = Math.max(0, Math.min(.8, old + (clear ? dt * OPEN_FIELD.acceleration : -dt * 3)));
  a.openFieldAge = age;
  return 1 + (OPEN_FIELD.topSpeed - 1) * age / .8;
}
