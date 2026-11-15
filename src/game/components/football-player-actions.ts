/** Visual-only football actions. Progress is normalized and never drives gameplay. */
export type FootballPlayerAction =
  | 'idle' | 'stance' | 'run' | 'hold' | 'snap' | 'handoff' | 'throw'
  | 'catch' | 'block' | 'break' | 'backpedal' | 'jump' | 'kick' | 'kneel'
  | 'fall' | 'dive' | 'ground';

export type FootballPlayerView = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type FootballPlayerOptions = {
  view?: FootballPlayerView;
  /** Legacy continuous cycle, 0..4. Zero is a planted, non-running pose. */
  step?: number;
  lean?: number;
  crouch?: boolean;
  engaged?: boolean;
  hold?: boolean;
  kick?: number;
  ball?: boolean;
  action?: FootballPlayerAction;
  /** Normalized action time, 0..1. */
  progress?: number;
};

export type FootballProneOptions = {
  angle: number;
  lift: number;
  crouch?: number;
  ball?: boolean;
};
