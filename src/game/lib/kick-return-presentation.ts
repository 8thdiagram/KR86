import type { KickAttempt } from './kick-return-engine';

/** Render-only interpolation. Neither snapshots nor saved/authoritative physics
 * are modified. One bounded physics tick of latency supports 60/90/120Hz displays. */
export function interpolateKickAttempt(previous: KickAttempt | undefined, current: KickAttempt, alpha: number): KickAttempt {
  if (!previous || previous.seed !== current.seed || previous.number !== current.number ||
      previous.phase !== current.phase || current.phase === 'tackled' || current.phase === 'touchdown') return current;
  const t = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  if (t === 1) return current;
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { ...current, time: mix(previous.time, current.time), returnTime: mix(previous.returnTime, current.returnTime),
    player: { x: mix(previous.player.x, current.player.x), y: mix(previous.player.y, current.player.y) },
    moves: current.moves && { ...current.moves, active: current.moves.active && {
      ...current.moves.active, elapsed: previous.moves?.active?.kind === current.moves.active.kind
        ? mix(previous.moves.active.elapsed, current.moves.active.elapsed) : current.moves.active.elapsed,
    } },
    defenders: current.defenders.map((d, index) => {
      const p = previous.defenders[index];
      if (!p || p.id !== d.id) return d;
      return { ...d, x: mix(p.x, d.x), y: mix(p.y, d.y),
        roamer: d.roamer && { ...d.roamer, stride: mix(p.roamer?.stride ?? d.roamer.stride, d.roamer.stride) },
        motion: d.motion && { ...d.motion, stride: mix(p.motion?.stride ?? d.motion.stride, d.motion.stride) },
        dive: d.dive && { ...d.dive, elapsed: p.dive?.phase === d.dive.phase ? mix(p.dive.elapsed, d.dive.elapsed) : d.dive.elapsed },
      };
    }),
  };
}
