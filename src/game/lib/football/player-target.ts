/** Exact pixel rectangles used by the in-game targeting brackets. */
export const PLAYER_TARGET_PIXELS = [
  [-8, -16, 1, 5],
  [-8, 2, 1, 5],
  [-8, -16, 4, 1],
  [-8, 6, 4, 1],
  [8, -16, 1, 5],
  [8, 2, 1, 5],
  [5, -16, 4, 1],
  [5, 6, 4, 1],
] as const;

/** Geometric center of the asymmetric feet-anchored 17 × 23 pixel symbol. */
export const PLAYER_TARGET_CENTER = { x: 0.5, y: -4.5 } as const;

export const PLAYER_TARGET_WHITE = '#f1e6d0';
export const PLAYER_TARGET_YELLOW = '#f4d23c';
