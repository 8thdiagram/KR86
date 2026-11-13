import type { KickDefender } from './kick-return-engine';
import { roamerLateralBoost, roamerSpeedBoost } from './kick-return-roamers';

/** Promote ordinary early-wave defenders; never add bodies, move a patrol band,
 * replace an existing specialist, or alter the final safety.
 */
export function upgradeMediumCoverage(defenders: KickDefender[], random: () => number) {
  const count = random() < .5 ? 1 : 2;
  const pool = defenders.filter(d => d.id < 6 && !d.roamer);
  for (let i = 0; i < count; i++) {
    const d = pool.splice(Math.floor(random() * pool.length), 1)[0]!;
    d.roamer = { vx: 0, stride: 0, tier: 'medium' };
    d.speed *= roamerSpeedBoost(d);
    d.lateralSpeed *= roamerLateralBoost(d);
  }
}

/** One additional, distinct ordinary player; keep the roster at eleven. */
export function upgradeExtraCoverage(defenders: KickDefender[], random: () => number) {
  const pool = defenders.filter(d => d.id < 10 && !d.roamer);
  const d = pool[Math.floor(random() * pool.length)]!;
  d.roamer = { vx: 0, stride: 0, tier: 'medium' };
  d.speed *= roamerSpeedBoost(d);
  d.lateralSpeed *= roamerLateralBoost(d);
}
