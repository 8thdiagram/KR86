export type RenderCamera = { x: number; target: number; velocity: number; at: number };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Exact critically-damped integration against a linearly moving target.
 * Unlike a repeated fixed blend, steady scrolling follows the same path at
 * 30/60/120 Hz. A small, predictable tracking distance avoids hard corrections. */
export function stepRenderCamera(
  previous: RenderCamera | undefined, target: number, now: number,
  visible: number, worldWidth: number, ball?: number,
): RenderCamera {
  const max = Math.max(0, worldWidth - visible);
  const margin = Math.min(visible * .2, Math.max(8, visible * .055));
  const frame = (x: number, padding: number) => clamp(ball === undefined ? x :
    clamp(x, ball - visible + padding, ball - padding), 0, max);
  target = frame(target, margin + 14);
  if (!previous || now - previous.at > 300 || now < previous.at)
    return { x: target, target, velocity: 0, at: now };
  const dt = (now - previous.at) / 1000;
  if (dt <= 0) return previous;
  // Ignore sub-pixel positional noise only when already nearly stationary.
  if (Math.abs(previous.velocity) < 4 && Math.abs(target - previous.target) < .3) target = previous.target;
  const rate = 20, targetVelocity = (target - previous.target) / dt;
  // Include the particular solution for a moving target. Omitting this term
  // injects velocity feed-forward and causes overshoot on starts and reversals.
  const lag = 2 * targetVelocity / rate;
  const error = previous.x - previous.target + lag, relative = previous.velocity - targetVelocity;
  const j = relative + rate * error, decay = Math.exp(-rate * dt);
  const ideal = target - lag + (error + j * dt) * decay;
  const x = frame(ideal, margin);
  return { x, target, velocity: x === ideal
    ? targetVelocity + (relative - rate * j * dt) * decay : (x - previous.x) / dt, at: now };
}
