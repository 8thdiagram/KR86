/** Intercept observed motion using the game's independent forward/lateral caps.
 * No controller input, random draws, speed boosts or collision shortcuts.
 */
export function pursuitPoint(
  defender: { x: number; y: number }, carrier: { x: number; y: number },
  vx: number, vy: number, forward: number, lateral: number,
  minY = 24, maxY = 168,
) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const distance = Math.hypot(carrier.x - defender.x, carrier.y - defender.y);
  // Finish the tackle instead of repeatedly aiming beyond a nearby runner.
  const horizon = distance < 24 ? .08 : .65;
  let first = 0, last = horizon;
  for (const [delta, velocity, speed] of [
    [carrier.x - defender.x, vx, forward],
    [carrier.y - defender.y, vy, lateral],
  ]) {
    for (const [offset, slope] of [[delta!, velocity! - speed!], [-delta!, -velocity! - speed!]]) {
      if (Math.abs(slope!) < 1e-9) { if (offset! > 0) last = -1; }
      else if (slope! < 0) first = Math.max(first, -offset! / slope!);
      else last = Math.min(last, -offset! / slope!);
    }
  }
  const lead = first <= last ? clamp(first, 0, horizon)
    : Math.min(horizon, distance / Math.max(1, forward, lateral));
  return { x: clamp(carrier.x + vx * lead, 8, 1180),
    y: clamp(carrier.y + vy * lead, minY, maxY) };
}
