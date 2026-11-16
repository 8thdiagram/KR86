/**
 * Elite-1988 selected raster source shared by comparison and production.
 * Authored at 16x22 design cells; each cell expands to the 32x44 atlas.
 * Directions 0/1/2 are the exact reviewed comparison sheets.
 */
export type PlayerDesignGrid = readonly string[];
export type EliteCView = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const D = '................';
const fitRow = (value: string) => {
  let row = value;
  while (row.length > 16) {
    if (row.endsWith('.')) row = row.slice(0, -1);
    else if (row.startsWith('.')) row = row.slice(1);
    else throw new Error(`Elite C art exceeds its native width: ${value}`);
  }
  return row.padEnd(16, '.');
};
const fit = (rows: readonly string[]) => Object.freeze(rows.map(fitRow));

export const ELITE_C_COMPARISON_TOPS: Readonly<Record<0 | 1 | 2, PlayerDesignGrid>> = Object.freeze({
  0: fit([
    D,'.....KKKK.......','....KMMMMK......','...KMMMMMMK.....',
    '...KMMTMMMKK....','...KMMmMSSFF....','....KKKKFFFF....','....KSSK........',
    '..KKJJJJJJJKK...','..KJJHJJJJJJJKK.','..KJJJJJJJJJJJKK.',
    '...KJJjJJJJJKK...','....KKJJJJKK.....','....KKWWWWK......',
  ]),
  1: fit([
    D,'......KKKK......','.....KMMMMK.....','....KMMMMMMK....',
    '....KMMTMMMKK...','....KMMmMSSFF...','.....KKKKFFFF...','.....KSSK.......',
    '..KKKJJJJJJJKK..','..KJJHJJJJJJJKK..','..KJJJJJJJJJJJKK.',
    '...KKJJjJJJJJKK..','.....KKJJJJKK....','.....KKWWWWK.....',
  ]),
  2: fit([
    D,'.......KKK......','......KMMMK.....','.....KMMMMMK....',
    '.....KMMTMMKK...','......KMmSSFF...','.......KKFFFF...','.......KSSK.....',
    '.....KKJJJJKK...','....KJJHJJJJKK...','....KJJJJJJJJKK..',
    '.....KKJJjJJJKK..','......KKJJJJKK...','......KKWWWWK....',
  ]),
});

const FAR_QUARTER = fit([
  D,'......KKKK......','.....KMMMMK.....','....KMMMMMMK....',
  '....KMMTMMMK....','...FFSSmMMMK....','...FFFFKKKK.....','......KSSK......',
  '.....KKJJJJJKK...','....KKJJHJJJJJKK.','...KKJJJJJJJJJKK.',
  '....KKJJjJJJJKK..','......KKJJJJKK...','......KKWWWWK....',
]);
const BACK = fit([
  D,'.....KKKK.......','....KMMMMK......','...KMMMMMMK.....',
  '...KMMMMMMMK....','...KMMmMMMMKK...','....KKKKKKKK....','....KJJjK........',
  '...KJJJJJJKK.....','..KJJJJJJJJJKK...','..KJJJJHJJJJJKK..',
  '...KJJJJJJJKK....','....KKJJJJKK......','....KKWWWWK.......',
]);
const BACK_QUARTER = fit([
  D,'......KKKK......','.....KMMMMK.....','....KMMMMMMK....',
  '....KMMMMMMK....','....KMMmMMMMKK..','.....KKKKKKKK...','.....KJJjK......',
  '...KKJJJJJJKK...','..KKJJJJJJJJJKK..','..KJJJJHJJJJJJKK.',
  '...KKJJJJJJJKK...','.....KKJJJJKK.....','.....KKWWWWK......',
]);
const BACK_SIDE = fit([
  D,'.......KKK......','......KMMMK.....','.....KMMMMMK....',
  '.....KMMMMMMK...','......KMMmSSFF..','.......KKFFFF...','.......KJJjK....',
  '......KJJJJKK...','.....KJJJJJJKK...','.....KJJJJHJJKK..',
  '......KJJJJJKK...','.......KKJJKK....','.......KKWWK.....',
]);
const REAR_QUARTER = fit([
  D,'......KKKK......','.....KMMMMK.....','....KMMMMMMK....',
  '....KMMMMMMK....','...FFSSMMmMK....','...FFFFKKKK.....','.....KJJjK.......',
  '....KKJJJJJJKK...','...KKJJJJJJJJJKK..','..KKJJJJHJJJJJJKK.',
  '...KKJJJJJJJJKK..','.....KKJJJJKK.....','.....KKWWWWK......',
]);
const FRONT_DIAGONAL = fit([
  D,'......KKKK......','.....KMMMMK.....','....KMMMMMMK....',
  '....KMMTMMMK....','....KMMmMSSFF...','.....KKKKFFFF...','.....KSSK........',
  '..KKJJJJJJJKK....','..KJJHJJJJJJJKK..','..KJJJJJJJJJJKK..',
  '...KJJjJJJJJKK...','....KKJJJJKK......','....KKWWWWK.......',
]);
const RETURN_DIAGONAL = fit([
  D,'......KKKK......','.....KMMMMK.....','....KMMMMMMK....',
  '....KMMMMMMK....','...KKMMMMmMK.....','...KKKKKKKK......','......KJJjK......',
  '...KKJJJJJJJKK...','..KKJJJJHJJJJJKK..','..KJJJJJJJJJJJKK..',
  '...KKJJJJJJJKK....','.....KKJJJJKK......','.....KKWWWWK.......',
]);

export const ELITE_C_DIRECTIONAL_TOPS: Readonly<Record<EliteCView, PlayerDesignGrid>> = Object.freeze({
  0: ELITE_C_COMPARISON_TOPS[0],
  1: ELITE_C_COMPARISON_TOPS[1],
  2: ELITE_C_COMPARISON_TOPS[2],
  3: FAR_QUARTER,
  4: BACK,
  5: FRONT_DIAGONAL,
  6: BACK_SIDE,
  7: REAR_QUARTER,
  8: RETURN_DIAGONAL,
});

/**
 * The reviewed directional top cells include obsolete horizontal arm strokes.
 * Production layers the current action arms separately, so erase only the
 * outboard baked strokes on rows 9–12; keep the row-8 shoulder pads and the
 * central chest (columns 5–10) untouched. The source concept sheets remain
 * immutable comparison art.
 */
export function stripEliteCBakedArmOverhang(top: PlayerDesignGrid): PlayerDesignGrid {
  return Object.freeze(top.map((line, y) => {
    if (y < 9 || y > 12) return line;
    const row = [...line];
    for (let x = 0; x < row.length; x++) {
      if ((x < 5 || x > 10) && row[x] !== '.') row[x] = '.';
    }
    return row.join('');
  }));
}

export const ELITE_C_PLANTED_LEGS = fit([
  '...KWWWWWK......','..KWWWWWWWK.....','..KWWwWWWKK.....','..KWWK..KWWK....',
  '.KKWWK...KWWK...','KKWK.....KKWK...','KKK.......KKK...','KKKK.....KKKK...',
]);
export const ELITE_C_RUN_LEGS: readonly PlayerDesignGrid[] = Object.freeze([
  // 1 — left drives long, right thigh recoils and its heel lifts behind.
  fit(['..KWWWK...KWWWK.','..KWWWK....KWWWK','...KWWwK...KWWWK','....KWWwK..KWWwK',
    '.....KWWwK.KWWwK','......KWWK..KWWK','..........CCCCC.','..CCCCC.........']),
  // 2 — left foot plants under the hip as the right knee drives through.
  fit(['...KWWWK.KWWWK..','...KWWWK..KWWWK.','....KWWwK.KWWwK.','.....KWWwK.KWWwK',
    '.....KWWK..KWWK.','....KWWK...KWWK.','...CCC.....CCC..','...CCCCC........']),
  // 3 — close passing step; both knees scissor without merging either calf.
  fit(['...KWWWK...KWWWK.','....KWWWK..KWWWK.','....KWWwK.KWWwK.','.....KWWwK.KWWwK',
    '.....KWWK.KWWK..','....KWWK.KWWK...','....KWWK..KWWK..','...CCCCC...CCCCC']),
  // 4 — the opposite lead: a deliberate mirror of the left-leg reach.
  fit(['..KWWWK...KWWWK.','KWWWK....KWWWK..','KWWWK...KWWwK...','KWWwK..KWWwK....',
    'KWWwK.KWWwK.....','KWWK..KWWK......','.CCCCC..........','.........CCCCC..']),
  // 5 — right foot plants; the left leg folds back into recovery.
  fit(['..KWWWK.KWWWK...','KWWWK..KWWWK...','KWWwK.KWWwK....','KWWwK.KWWwK.....',
    'KWWK..KWWK.....','KWWK...KWWK....','..CCC.....CCC...','..........CCCCC.']),
  // 6 — right-to-left pass, with a bent left knee and the right toe airborne.
  fit(['...KWWWK...KWWWK.','....KWWWK..KWWWK.','....KWWwK.KWWwK.','....KWWwK..KWWwK.',
    '.....KWWK..KWWK..','......KWWK.KWWK..','..CCCCC..CCCCC...','................']),
  // 7 — left knee reaches again while the right leg extends into push-off.
  fit(['..KWWWK...KWWWK.','...KWWWK...KWWWK.','....KWWwK..KWWwK.','.....KWWwK..KWWK.',
    '.....KWWK...KWWK.','....KWWK.....KWWK','...CCC.......CCC.','..CCCCC.....CCCCC']),
  // 8 — settle toward the next plant; left toe low, rear right heel raised.
  fit(['..KWWWK....KWWWK','...KWWWK...KWWWK.','...KWWwK...KWWwK.','....KWWwK..KWWK..',
    '.....KWWK..KWWK..','....KWWK...KWWK..','..........CCC....','...CCCCC.........']),
]);
export const ELITE_C_STRAFE_LEGS: readonly PlayerDesignGrid[] = Object.freeze([
  fit(['...KWWWK..KWWWK..','...KWWWK...KWWWK.','....KWWwK...KWWWK','.....KWWwK..KWWK..',
    '......KWWK...KWWK.','.....KWWK....KWWK.','...CCC......CCCCC.','..CCCCC...........']),
  fit(['....KWWWK.KWWWK..','....KWWWK...KWWWK.','.....KWWwK..KWWwK.','......KWWwK..KWWK..',
    '.....KWWK...KWWK..','....KWWK.....KWWK.','....CCC.....CCC...','.....CCCCC..CCCCC.']),
  fit(['.....KWWWK.KWWWK.','....KWWWK...KWWWK.','...KWWwK....KWWwK.','..KWWwK.....KWWK..',
    '..KWWK......KWWK..','...KWWK.....KWWK..','..CCCCC.....CCCCC.','...CCCCC....CCCCC.']),
  fit(['....KWWWK...KWWWK','.....KWWWK...KWWWK','......KWWwK..KWWK.','.......KWWwK.KWWK..',
    '......KWWK..KWWK...','.....KWWK...KWWK...','......CCC..CCCCC...','.......CCCCC..CCCCC']),
  fit(['...KWWWK...KWWWK.','..KWWWK....KWWWK..','.KWWwK.....KWWwK..','KWWwK......KWWK...',
    'KWWK.......KWWK...','.KWWK......KWWK....','CCCCC......CCC.....','CCCCC.....CCCCC....']),
  fit(['..KWWWK...KWWWK...','...KWWWK..KWWWK...','....KWWwK.KWWwK...','.....KWWwK.KWWK...',
    '......KWWK..KWWK..','.....KWWK....KWWK.','....CCCCC..CCC....','...CCCCC....CCCCC.']),
  fit(['...KWWWK....KWWWK.','....KWWWK...KWWWK.','.....KWWwK..KWWwK.','......KWWwK.KWWK..',
    '.....KWWK..KWWK...','....KWWK....KWWK..','...CCC.....CCCCC..','..CCCCC....CCCCC..']),
  fit(['....KWWWK..KWWWK..','...KWWWK...KWWWK..','..KWWwK....KWWwK..','.KWWwK.....KWWK...',
    'KWWK......KWWK....','.KWWK.....KWWK.....','CCCCC.....CCC......','CCCCC....CCCCC.....']),
]);
export const ELITE_C_BACKPEDAL_LEGS: readonly PlayerDesignGrid[] = Object.freeze([
  fit(['..KWWWK....KWWWK.','...KWWWK...KWWWK..','....KWWwK...KWWwK.','....KWWK.....KWWK.',
    '...KWWK......KWWK.','..KWWK.......KWWK..','...CCC......CCCCC.','..CCCCC...........']),
  fit(['...KWWWK...KWWWK..','....KWWWK...KWWWK.','.....KWWwK..KWWwK.','......KWWK..KWWK..',
    '.....KWWK...KWWK..','....KWWK.....KWWK.','....CCC......CCC...','.....CCCCC..CCCCC.']),
  fit(['....KWWWK..KWWWK..','...KWWWK....KWWWK..','..KWWwK.....KWWwK..','..KWWK......KWWK...',
    '...KWWK.....KWWK...','....KWWK...KWWK.....','..CCCCC.....CCCCC.','...CCCCC...CCCCC..']),
  fit(['.....KWWWK...KWWWK','....KWWWK...KWWWK.','...KWWwK....KWWwK.','..KWWK......KWWK..',
    '...KWWK.....KWWK..','....KWWK...KWWK...','......CCC..CCC....','.....CCCCC..CCCCC.']),
  fit(['...KWWWK....KWWWK.','..KWWWK.....KWWWK..','.KWWwK......KWWwK..','KWWwK.......KWWK...',
    'KWWK........KWWK...','.KWWK......KWWK....','CCCCC.......CCC....','CCCCC......CCCCC...']),
  fit(['..KWWWK...KWWWK...','...KWWWK...KWWWK...','....KWWwK..KWWwK...','.....KWWK...KWWK...',
    '......KWWK..KWWK...','.....KWWK....KWWK..','....CCCCC..CCC.....','...CCCCC....CCCCC..']),
  fit(['...KWWWK...KWWWK...','....KWWWK..KWWWK...','.....KWWwK.KWWwK...','......KWWK.KWWK....',
    '.....KWWK...KWWK...','....KWWK.....KWWK..','...CCC......CCCCC..','..CCCCC.....CCCCC..']),
  fit(['..KWWWK....KWWWK...','...KWWWK...KWWWK...','....KWWwK...KWWwK..','.....KWWK....KWWK..',
    '....KWWK.....KWWK..','...KWWK.......KWWK.','..........CCC......','...CCCCC....CCCCC..']),
]);

export type EliteCArmPose = 'pumpA' | 'pumpB' | 'guard' | 'reach' | 'throw' | 'block';
const arms22 = (poseRows: readonly string[]) => fit([...Array.from({ length: 8 }, () => D), ...poseRows, ...Array.from({ length: 22 - 8 - poseRows.length }, () => D)]);
const armRow = (left: string, right: string) =>
  '...' + left.padStart(4, '.').slice(-4) + '..' + right.padEnd(4, '.').slice(0, 4) + '...';
export const ELITE_C_ARMS: Readonly<Record<EliteCArmPose, PlayerDesignGrid>> = Object.freeze({
  pumpA: arms22(['..KJJJ..........','...KJJJKK........','....KJJJKK.......','.....KSSK........','.........KJJ.....','........KKJJ.....','........KSSK.....']),
  pumpB: arms22(['..........JJJ...','.........KKJJJ...','........KKJJJK...','........KSSK.....','....KJJ..........','....KJJKK.........','.....KSSK.........']),
  guard: arms22(['..KJJJ....KJJJ..','...KJJJKKKKJJJ...','....KSSK..KSSK..']),
  reach: arms22(['...KJJJ..........','...KJJJJKKKKK....','....KJJJKKKKK....','.....KKJJK........','......KSSK........']),
  throw: arms22(['.........KSSK...','.........KJJJ...','........KKJJ....','.......KKJJ.....','......KKJJ......','...KJJJKKKKK....','...KJJJJJKK.....']),
  block: arms22(['..KJJJ....KJJJ..','...KJJJKKKKJJJ...','....KSSK..KSSK..']),
});

/**
 * Gameplay-only action arms. The reviewed concept sheets above remain the
 * untouched comparison baseline; these compact, outlined bends are layered
 * over the same approved bodies only in the live atlas.
 */
export const ELITE_C_GAME_ARMS = Object.freeze({
  pumpA: arms22([
    armRow('..KJ', 'KJ..'),
    armRow('.KJJ', '..KSS'),
    armRow('KKJ.', '..KJ'),
    armRow('.KJ.', '...K'),
    armRow('.KSS', '....'),
  ]),
  pumpB: arms22([
    armRow('KJ..', '..KJ'),
    armRow('KSS.', '.KJJ'),
    armRow('KJ..', '.KKJ'),
    armRow('K...', '..KJ'),
    armRow('....', '..KSS'),
  ]),
  guard: arms22([
    armRow('..KJ', 'KJ..'),
    armRow('.KJJ', 'JJ..'),
    armRow('..SS', 'SS..'),
  ]),
  reach: arms22([
    // The distal double-ink K cells made the profile arm read as a barrel.
    // End the sleeve at the existing colored forearm instead of adding a tip.
    armRow('.KKJ', 'KJ..'),
    armRow('KJJJ', 'KKJJ'),
    armRow('..SS', 'SS..'),
  ]),
  drawBack: arms22([
    armRow('..KJ', 'KJ..'),
    armRow('.KJJ', 'KJJ.'),
    armRow('KJJ.', '..KK'),
    armRow('.KSS', '...S'),
  ]),
  throwForward: arms22([
    armRow('.KJ.', 'KJ..'),
    armRow('.KJJ', 'KKJJ'),
    armRow('....', 'KJJJ'),
    armRow('....', '.KSS'),
  ]),
  release: arms22([
    armRow('.KJ.', 'KJ..'),
    armRow('.KJJ', 'KKJJ'),
    armRow('....', '..KJJ'),
    armRow('....', '...S'),
  ]),
  followThrough: arms22([
    armRow('.KJ.', 'KJ..'),
    armRow('.KJJ', 'KKJ.'),
    armRow('KJJ.', '..KJJ'),
    armRow('.KSS', '..KSS'),
  ]),
  block: arms22([
    armRow('KJJ.', '.KJJ'),
    armRow('.KJJ', 'KJJ.'),
    armRow('..SS', 'SS..'),
  ]),
  carryA: arms22([
    armRow('..KJ', 'KJ..'),
    armRow('.KJJ', 'KKJJ'),
    armRow('.KJJ', 'KKJ.'),
    armRow('..KSS', '...S'),
  ]),
  carryB: arms22([
    armRow('KJ..', 'KJ..'),
    armRow('KKJJ', 'KKJJ'),
    armRow('.KJJ', 'KKJ.'),
    armRow('..KSS', '...S'),
  ]),
});

export const ELITE_C_STANCE_LEGS = fit([
  '...KWWWWWK......','..KWWWWWWWK.....','..KWWwWWWKK.....','..KWWK..KWWK....',
  '.KKWWK...KWWK...','KKWK.....KKWK...','KKK.......KKK...','KKKK.....KKKK...',
]);
export const ELITE_C_KNEEL_LEGS = fit([
  '...KWWWWWK......','...KWWWWWK......','...KWWwWWK......','...KWWK.........',
  '...KKWK.........','...KKK..........','..KKWWWWKK......','KKKKKKKKKKKK....',
]);
export const ELITE_C_KICK_LEGS: readonly PlayerDesignGrid[] = Object.freeze([
  ELITE_C_RUN_LEGS[0]!,
  fit(['...KWWWWWK......','...KWWWWWK......','...KWWwWWK......','...KWWK..KWWK...',
    '...KWWK..KWWK...','...KKWK..KKWK...','...KKK....KKK...','..KKKK....KKKK..']),
  fit(['...KWWWWWKK.....','...KWWWWWKK.....','...KWWwWWKKK....','...KWWK..KWWK...',
    '...KKWK...KWWK..','...KKK....KWWK..','..KKKK....KKWK..','..KKKK....KKKK..']),
  fit(['...KWWWWWK......','...KWWWWWKK.....','...KWWwWWKKK....','...KWWK...KWWK...',
    '...KKWK...KWWK..','...KKK....KKWK..','..KKKK....KKK...','..KKKK...KKKK...']),
  ELITE_C_RUN_LEGS[4]!,
  ELITE_C_PLANTED_LEGS,
]);

export type EliteCPosition = 'QB' | 'RB' | 'OL' | 'LB' | 'DB' | 'DL' | 'KR' | 'WR';
export function applyEliteCPosition(grid: string[], position: EliteCPosition) {
  const role = position === 'DL' ? 'OL' : position === 'KR' ? 'RB' : position === 'WR' ? 'DB' : position;
  if (role === 'OL' || role === 'LB') {
    for (const y of [8, 9, 10]) {
      const row = [...grid[y]!];
      const body = row.findIndex(g => g === 'J' || g === 'H');
      const extension = role === 'OL' ? 2 : 1;
      if (body > extension && row[body - 1] !== '.') row[body - extension] = 'K';
      if (body >= 0 && body < 15 - extension && row[body + 1] !== '.') {
        row[body + extension] = 'K';
      }
      grid[y] = row.join('');
    }
  }
  if (role === 'RB') {
    for (const y of [14, 15]) {
      const row = [...grid[y]!];
      if (row[8] !== '.' && row[9] === '.') row[9] = 'W';
      if (row[10] !== '.' && row[9] === '.') row[9] = 'W';
      if (row[9] !== '.' && row[10] === '.') row[10] = 'W';
      grid[y] = row.join('');
    }
  }
  if (role === 'DB') {
    for (const y of [11, 12]) {
      const row = [...grid[y]!];
      if (row[3] === 'J' && row[4] !== '.') row[3] = '.';
      if (row[12] === 'J' && row[11] !== '.') row[12] = '.';
      grid[y] = row.join('');
    }
  }
}

/** Compose the selected concept's authored layers in the shared native grid. */
export function composeEliteCGrid(
  view: EliteCView,
  pose: 'planted' | 'run',
  phase: number,
  arms: EliteCArmPose,
  legs: PlayerDesignGrid = pose === 'run' ? ELITE_C_RUN_LEGS[((phase % 8) + 8) % 8]! : ELITE_C_PLANTED_LEGS,
  bodyShift = 0,
  position: EliteCPosition = 'QB',
): string[] {
  const grid = Array.from({ length: 22 }, () => D);
  const stamp = (source: PlayerDesignGrid, y: number) => source.forEach((line, sy) => {
    const yy = y + sy;
    if (line.length !== 16) throw new Error(`Elite C template row ${sy} is not 16 cells wide.`);
    if (yy < 0 || yy >= 22) throw new Error(`Elite C template row ${yy} escapes 16x22 frame.`);
    const target = [...grid[yy]!];
    [...line].forEach((glyph, x) => { if (glyph !== '.') target[x] = glyph; });
    grid[yy] = target.join('');
  });
  stamp(ELITE_C_DIRECTIONAL_TOPS[view], bodyShift);
  stamp(legs, 13);
  stamp(ELITE_C_ARMS[arms], bodyShift);
  for (const y of [15, 16]) {
    const row = [...grid[y]!];
    if (row[10] === '.') row[10] = 'W';
    if (y === 15 && row[9] === '.') row[9] = 'W';
    grid[y] = row.join('');
  }
  applyEliteCPosition(grid, position);
  return grid;
}
