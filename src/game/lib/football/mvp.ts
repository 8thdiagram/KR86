/** Stable, team-owned player identities, shared by persistence, UI and engines. */
export const MVP_IDS = ['QB1', 'KR1', 'DB1', 'RB1', 'WR1', 'LB1', 'K1'] as const;
export type MvpId = typeof MVP_IDS[number];
// New slots are optional on historical snapshots, never inferred historical awards.
export type MvpCounts = Record<'QB1' | 'KR1' | 'DB1' | 'RB1' | 'WR1', number> &
  Partial<Record<'LB1' | 'K1', number>>;
export const speedSlot = (slot: MvpId) => ['KR1', 'RB1', 'WR1', 'DB1'].includes(slot);
const count = (n: number) => Number.isSafeInteger(n) && n > 0 ? n : 0;
export function speedBonus(n: number, clutch = false) {
  const limit = clutch ? .8 : .4;
  // At very large counts IEEE doubles round the asymptote to the endpoint.
  // Keep the nearest safely lower representation, not a gameplay/balance cap.
  return Math.min(limit - Number.EPSILON, limit * (1 - .5 ** count(n)));
}
export const skillBonus = (n: number, clutch = false) => (clutch ? .4 : .2) * count(n);
export const mvpMultiplier = (slot: MvpId, n: number, clutch = false) =>
  speedSlot(slot) ? Math.min((clutch ? 1.8 : 1.4) - Number.EPSILON, 1 + speedBonus(n, clutch))
    : 1 + (slot === 'K1' ? 0 : skillBonus(n, clutch));
/** A functional meter at every award count; equivalent CPU error contraction. */
export const kickerControl = (n: number, clutch: boolean) => clutch ? Math.max(.35, 1 - .1 * count(n)) : 1;
export function mvpSummary(slot: MvpId, n: number) {
  const pct = (v: number) => `${Number((v * 100).toFixed(6))}%`;
  if (slot === 'K1') return `${pct(1 - kickerControl(n, true))} slower clutch meter`;
  const normal = speedSlot(slot) ? speedBonus(n) : skillBonus(n);
  if (speedSlot(slot) && Number((normal * 100).toFixed(6)) === 40)
    return 'speed bonus <40%' + (slot === 'DB1' && n ? ` · clutch turnover +${pct(skillBonus(n, true))}` : '');
  return `+${pct(normal)} ${slot === 'QB1' ? 'accuracy' : slot === 'LB1' ? 'rush execution' : 'speed'}` +
    (slot === 'DB1' && n ? ` · clutch turnover +${pct(skillBonus(n, true))}` : '');
}
