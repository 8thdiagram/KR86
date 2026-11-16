import { chaosOpportunity } from './clutch';
import { canTackle } from './defensive-action';
import { PASS_DEFENSE } from './pass-defense';
import { PLAYBOOK } from './playbook';
import { clamp, isPassCoverage, random, type FootballGame } from './types';
import { legendaryAthleteFactor } from './legendary';

/** Existing physical ball/contact reach; never enlarge sprites or teleport a catch. */
export const CATCH_REACH = PASS_DEFENSE.reach;

/** Called only at the actual landing, after the existing airborne defensive contests.
 * Accuracy has already placed the ball. Securing a delivered, catchable ball is a
 * receiver skill check, not a second lottery against the QB's throwing accuracy. */
export function resolveReception(g: FootballGame): string | undefined {
  const l = g.live!, f = l.flight!, receiver = l.athletes[f.receiver]!;
  const gap = Math.hypot(receiver.x - f.x, receiver.y - f.y);
  if (gap > CATCH_REACH) {
    const misplaced = f.aimX !== undefined && f.aimY !== undefined &&
      Math.hypot(f.toX - f.aimX, f.toY - f.aimY) > CATCH_REACH;
    return misplaced ? 'ACCURACY MISS' : 'UNCATCHABLE THROW';
  }
  // A nearby but blocked, grounded, or out-of-reach defender cannot spoil a catch.
  const disrupted = l.athletes.some(d => d.side === 'defense' && d.engaged <= l.time &&
    canTackle(d) && Math.hypot(d.x - f.x, d.y - f.y) <= CATCH_REACH);
  const contest = disrupted ? isPassCoverage(l.defense) ? .29 : .22 : 0;
  const ability = g.profiles[g.possession].receivers * legendaryAthleteFactor(g, receiver, 'skill');
  const skill = clamp(.92 + (ability - .6) * .12, .88, .97);
  const success = chaosOpportunity(g, clamp(skill - contest, .12, .96),
    PLAYBOOK[l.play].depth >= 17 || disrupted, .96);
  if (random(g) > success) return disrupted ? 'PASS BREAKUP' : 'DROPPED PASS';
  return undefined;
}
