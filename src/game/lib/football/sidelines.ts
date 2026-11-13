/** Full Game sprites are torso-anchored; their planted feet are about 6px
 * below Y. Far turf starts at 18, near turf ends at 174. A helmet crossing
 * the far stripe is not a grounded foot crossing it. Keep the near cutoff. */
export const FOOTBALL_SIDELINES = { minY: 12, maxY: 168 } as const;
export const outsideFootballSideline = (y: number) =>
  y <= FOOTBALL_SIDELINES.minY || y >= FOOTBALL_SIDELINES.maxY;
