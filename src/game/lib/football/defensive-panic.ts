import type { KickDive } from '../kick-return-dive';

export const DEFENSIVE_HOLD_MS = 180;
export type DefensivePosition = { id: number; x: number; y: number };
type Defender = DefensivePosition & {
  dive?: KickDive; engaged?: number;
  pursuit?: unknown; motion?: { reactionLeft: number };
};
// Gesture ownership is transient: never serialize a held button or a selected defender.
const selections = new WeakMap<object, { id?: number }>();

/** Call in the simulation's field-relative frame, never in screen coordinates.
 * A hold chooses once, including when nobody is eligible. No replacement if
 * the selected athlete subsequently gets blocked, dives, or leaves the play. */
export function defensivePanicTarget<T extends Defender>(owner: object, held: boolean,
  defenders: T[], carrier: { y: number }, goalX: 100 | 1100, now: number,
  blocked?: ReadonlySet<number>): DefensivePosition | undefined {
  let selection = selections.get(owner);
  if (!held) {
    if (selection) {
      const selectedId = selection.id;
      const d = defenders.find(d => d.id === selectedId);
      if (d) {
        // Re-evaluate normal pursuit this very step; preserve physical velocity.
        delete d.pursuit;
        if (d.motion) d.motion.reactionLeft = 0;
      }
      selections.delete(owner);
    }
    return;
  }
  const eligible = (d: T) => !d.dive && (d.engaged ?? 0) <= now && !blocked?.has(d.id);
  if (!selection) {
    const direction = goalX === 1100 ? 1 : -1;
    const deepest = defenders.filter(eligible)
      .sort((a, b) => direction * (b.x - a.x) || a.id - b.id)[0];
    selection = { id: deepest?.id };
    selections.set(owner, selection);
  }
  const d = defenders.find(d => d.id === selection.id);
  return d && eligible(d) ? { id: d.id, x: goalX, y: carrier.y } : undefined;
}
