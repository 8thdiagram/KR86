/** Locomotion only. Do not apply this to clocks, reaction times, balls or ratings. */
export const PLAYER_MOVEMENT_SCALE = 1.1;
export const playerSpeed = (ratedSpeed: number) => ratedSpeed * PLAYER_MOVEMENT_SCALE;
