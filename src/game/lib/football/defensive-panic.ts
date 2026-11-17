import type { KickDive } from '../kick-return-dive';
import type { FootballGame } from './types';

export const DEFENSIVE_HOLD_MS = 180;
export type DefensivePosition = { id: number; x: number; y: number };
export type PanicDefender = DefensivePosition & {
  dive?: KickDive; engaged?: number; active?: boolean;
  pursuit?: unknown; motion?: { reactionLeft: number };
};
export const eligiblePanicDefender = (d:PanicDefender,now:number,blocked?:ReadonlySet<number>) =>
  d.active!==false && !d.dive && (d.engaged??0)<=now && !blocked?.has(d.id);
// Gesture ownership is transient: never serialize a held button or a selected defender.
const selections = new WeakMap<object, { id?: number; lane: number }>();
export const PANIC_LATERAL_OFFSET = 40;

/** Hold ownership is independent of whether a deflected ball admits a tap. */
export function canDefensivePanic(g: FootballGame) {
  if(g.playResult || g.tackleScene || !['live','kickoff'].includes(g.phase)) return false;
  if(g.special) return g.special.stage==='return' && (g.special.returnSide??g.special.receiver)==='away';
  if(g.phase==='kickoff') return g.kickReceiver==='away' && g.returnAttempt?.phase==='returning';
  const l=g.live;
  return !!l && (l.mode==='return' ? l.offense==='home' :
    g.possession==='away' && ['dropback','flight','run','scramble'].includes(l.mode));
}

/** Call in the simulation's field-relative frame, never in screen coordinates.
 * A hold chooses once, including when nobody is eligible. No replacement if
 * the selected athlete subsequently gets blocked, dives, or leaves the play. */
export function defensivePanicTarget<T extends PanicDefender>(owner: object, held: boolean,
  defenders: T[], carrier: { y: number }, goalX: 100 | 1100, now: number,
  blocked?: ReadonlySet<number>, adjustment?: { direction?: -1|0|1; coverage?: boolean; suspended?: boolean }): DefensivePosition | undefined {
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
  if(adjustment?.suspended) return;
  const eligible = (d: T) => eligiblePanicDefender(d,now,blocked);
  if (!selection) {
    const direction = goalX === 1100 ? 1 : -1;
    const deepest = defenders.filter(eligible)
      .sort((a, b) => direction * (b.x - a.x) || a.id - b.id)[0];
    selection = { id: deepest?.id, lane: deepest?.y ?? carrier.y };
    selections.set(owner, selection);
  }
  const d = defenders.find(d => d.id === selection.id);
  const lane=adjustment?.coverage ? selection.lane : carrier.y;
  return d && eligible(d) ? { id: d.id, x: goalX,
    y: Math.max(24,Math.min(168,lane+(adjustment?.direction??0)*PANIC_LATERAL_OFFSET)) } : undefined;
}
