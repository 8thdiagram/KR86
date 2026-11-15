/**
 * Independent anatomy studies for the iPhone-size CURRENT | A | B | C review.
 * Each concept owns its own head/torso/arm sheets and seven different lower
 * body constructions; none is derived from the production atlas.
 */
import type { FootballKit } from './football-art';
import {
  paintFootballPlayerFrame,
  PLAYER_FRAME_ANCHOR,
  PLAYER_FRAME_HEIGHT,
  PLAYER_FRAME_SCALE,
  PLAYER_FRAME_WIDTH,
  type FootballPlayerFrame,
  type FootballPlayerGlyph,
} from './football-player-frames';
import {
  composeEliteCGrid,
  ELITE_C_ARMS,
  ELITE_C_COMPARISON_TOPS,
  ELITE_C_PLANTED_LEGS,
  ELITE_C_RUN_LEGS,
} from './football-player-sheets';

export type FootballPlayerConcept = 'A' | 'B' | 'C';
export type FootballConceptPose = 'planted' | 'run';
export type FootballConceptPosition = 'QB' | 'RB' | 'OL' | 'LB' | 'DB';
export type FootballConceptView = 0 | 1 | 2;
type Glyph = FootballPlayerGlyph;
type Grid = readonly string[];
type Run = Readonly<{ row: number; x: number; length: number; color: Glyph }>;

export const FOOTBALL_PLAYER_CONCEPTS = Object.freeze({
  A: Object.freeze({
    name: 'Classic Arcade Football',
    anatomy: 'Compact sport-game build: modest pad flare, tapered trunk, thick paired thigh/calf masses.',
    movement: 'Quick, economical strides with an unmistakable planted-foot beat.',
  }),
  B: Object.freeze({
    name: 'Powerful Athletic Football',
    anatomy: 'Low center, deep chest, oversized-but-proportional pad yoke, loaded thighs and blocky calves.',
    movement: 'Long, forceful leg drives with heavy knee lift and broad arm counter-swing.',
  }),
  C: Object.freeze({
    name: 'Elite 1988 NES Character',
    anatomy: 'Balanced adult silhouette, carved quarter-view torso, distinct knees, shaded helmet and separated calves.',
    movement: 'Six articulated phases retain weight while shoulders and hips counter-rotate.',
  }),
} as const);

export type FootballPlayerConceptFrame = Readonly<FootballPlayerFrame & {
  concept: FootballPlayerConcept;
  pose: FootballConceptPose;
  position: FootballConceptPosition;
}>;

const BLANK = '................';
const blank = (height: number) => Array.from({ length: height }, () => BLANK);
function fitAuthoredRow(source: string): string {
  let row = source;
  // Only trim transparent edge padding; preserve every drawn pixel. Content
  // beyond the 16-cell frame is shifted inward using transparent margin, never
  // clipped off. Short rows receive explicit transparent right padding.
  while (row.length > 16) {
    if (row.endsWith('.')) row = row.slice(0, -1);
    else if (row.startsWith('.')) row = row.slice(1);
    else throw new Error(`Concept row has nontransparent art beyond the 16-cell frame: ${source}`);
  }
  return row.padEnd(16, '.');
}
const fitSheet = (rows: Grid): Grid => rows.map(fitAuthoredRow);
const fitViews = <T extends Record<number, Grid>>(views: T) =>
  Object.fromEntries(Object.entries(views).map(([view, rows]) => [view, fitSheet(rows)])) as T;
const overlay = (to: string[], from: Grid, atY = 0, mirror = false) => {
  from.forEach((line, y) => {
    if (line.length !== 16) throw new Error(`Concept sheet row ${y} must be exactly 16 cells.`);
    const targetY = y + atY;
    [...line].forEach((glyph, x) => {
      if (glyph === '.') return;
      const targetX = mirror ? 15 - x : x;
      if (targetY < 0 || targetY >= 22 || targetX < 0 || targetX >= 16) {
        throw new Error(`Concept pixel (${targetX},${targetY}) escapes its 16x22 design grid.`);
      }
      const row = [...to[targetY]!];
      row[targetX] = glyph;
      to[targetY] = row.join('');
    });
  });
};

const A_TOPS: Readonly<Record<FootballConceptView, Grid>> = {
  0: [
    BLANK,'.....KKKK.......','....KMMMMK......','...KMMMMMMK.....',
    '...KMMTMMMKK....','...KMMmMMMKF....','....KKKKKKFF....','....KSSK........',
    '...KJJJJJKK.....','..KJJHJJJJJKK...','..KJJJJJJJJJKK..',
    '...KJJjJJJJK....','....KJJJJK......','....KWWWK.......',
  ],
  1: [
    BLANK,'......KKKK......','.....KMMMMK.....','....KMMMMMMK....',
    '....KMMTMMMKK...','....KMMmMMMKF...','.....KKKKKKFF...','.....KSSK.......',
    '...KKJJJJJKK....','..KJJHJJJJJKK...','..KJJJJJJJJJKK..',
    '...KKJJjJJJJK...','.....KJJJJK.....','.....KWWWK......',
  ],
  2: [
    BLANK,'.......KKK......','......KMMMK.....','.....KMMMMMK....',
    '.....KMMTMMKK...','......KMMmMKF...','.......KKKKFF...','.......KSSK.....',
    '......KJJJKK....','.....KJJHJJKK...','.....KJJJJJKK...',
    '......KJJjJKK...','......KJJJK.....','......KWWK......',
  ],
};

const B_TOPS: Readonly<Record<FootballConceptView, Grid>> = {
  0: [
    BLANK,'....KKKKKK......','...KMMMMMMK.....','..KMMMMMMMMK....',
    '..KMMTMMMMMKK...','..KMMmMMMMKF....','...KKKKKKKFF....','...KSSK.........',
    '.KKJJJJJJJJJKK..','KJJJHHJJJJJJJKK.','KJJJJJJJJJJJJJKK',
    '.KJJjjJJJJJJJKK.','..KKJJJJJJJKK....','..KKWWWWWWK.....',
  ],
  1: [
    BLANK,'.....KKKKK......','....KMMMMMMK....','...KMMMMMMMMK...',
    '...KMMTMMMMMKK..','...KMMmMMMMKF...','....KKKKKKKFF...','....KSSK........',
    '.KKKJJJJJJJJJKK.','KKJJJHHJJJJJJJKK.','KJJJJJJJJJJJJJKK',
    '.KKJJjjJJJJJJJKK','...KKJJJJJJJKK...','...KKWWWWWWK....',
  ],
  2: [
    BLANK,'......KKKK......','.....KMMMMMK....','....KMMMMMMK....',
    '....KMMTMMMMKK..','.....KMMmMMKF...','......KKKKKKFF..','......KSSK......',
    '....KKJJJJJKK...','...KJJHHJJJKK...','...KJJJJJJJJKK...',
    '....KKJJjjJKK...','.....KKJJJJKK....','.....KKWWWWK.....',
  ],
};

// Every lower sheet is concept-owned. The plant/stride silhouettes are not
// shared between concepts; the middle rows explicitly articulate knee/calf.
const A_LEGS: readonly (readonly Grid[])[] = [
  [
    ['...KWWWWK.......','...KWWWWK.......','...KWWwWK.......','...KWWK..KWWK...',
      '...KWWK..KWWK...','...KKWK..KKWK...','...KKK....KKK...','..KKKK....KKKK..'],
    ['...KWWWWK.......','..KWWWWKK.......','..KWWwWKK.......','..KWWK...KWWK...',
      '.KKWK....KWWK...','KKK.......KKWK..','KKK........KKK...','KKKK......KKKK...'],
    ['...KWWWWK.......','...KWWWWKK......','...KWWwWKKK.....','...KWWK...KWWK..',
      '...KKWK...KWWK..','...KKK....KWWK..','..KKKK....KKWK..','..KKKK....KKKK..'],
    ['...KWWWWK.......','...KWWWWK.......','...KWWwWK..KK....','...KWWK..KWWK...',
      '...KKWK...KWWK..','...KKK....KKWK..','..KKKK.....KKK..','..KKKK....KKKK..'],
    ['...KWWWWK.......','..KWWWWKK.......','..KWWwWKK.......','..KWWK...KWWK...',
      '..KKWK....KWWK..','..KKK......KKWK.','..KKK.......KKK.','KKKK.......KKKK..'],
    ['...KWWWWK.......','...KWWWWKK......','...KWWwWKKK.....','....KWWK..KWWK...',
      '.....KKWK..KWWK..','......KKK...KKWK.','.......KKK...KKK.','.......KKKK..KKKK.'],
    ['...KWWWWK.......','...KWWWWK.......','...KWWwWK.......','...KWWK..KWWK...',
      '...KWWK..KWWK...','...KWWK..KWWK...','...KKWK..KKWK...','..KKKKK..KKKKK..'],
  ],
  [
    ['..KWWWWKK.......','..KWWWWKK.......','..KWWwWWK.......','..KWWK...KWWK...',
      '.KKWK....KWWK...','KKK.......KKWK..','KKK........KKK...','KKKK......KKKK...'],
    ['..KWWWWKK.......','..KWWWWKK.......','..KWWwWWK.......','..KWWK....KWWK..',
      '.KKWK.....KWWK..','KKK.......KKWK..','KKK........KKK...','KKKK......KKKK...'],
    ['..KWWWWKK.......','..KWWWWKK.......','..KWWwWWK..KK....','..KWWK...KWWK...',
      '..KKWK....KWWK..','..KKK.....KWWK..','..KKKK.....KKK...','..KKKK....KKKK...'],
    ['..KWWWWKK.......','..KWWWWKK.......','..KWWwWWK..KK....','..KWWK....KWWK..',
      '..KKWK....KWWK..','..KKK.....KWWK..','..KKKK....KKWK..','..KKKK....KKKK..'],
    ['..KWWWWKK.......','..KWWWWKK.......','..KWWwWWK.......','..KWWK....KWWK..',
      '..KKWK.....KWWK.','..KKK......KKWK.','..KKKK......KKK.','..KKKK.....KKKK.'],
    ['..KWWWWKK.......','..KWWWWKK.......','..KWWwWWK.......','...KWWK...KWWK...',
      '....KKWK...KWWK..','.....KKK....KKWK.','......KKK....KKK.','......KKKK..KKKK.'],
    ['..KWWWWKK.......','..KWWWWKK.......','..KWWwWWK.......','..KWWK...KWWK...',
      '..KWWK...KWWK...','..KKWK...KKWK...','..KKK.....KKK...','..KKKK...KKKK...'],
  ],
];

const B_LEGS: readonly (readonly Grid[])[] = [
  [
    ['..KWWWWWWK......','..KWWWWWWK......','..KWWwwWWK......','..KWWWK..KWWWK...',
      '.KKWWK...KWWK....','KKWWK.....KWWK...','KKKK.......KKKK..','KKKK......KKKKK..'],
    ['..KWWWWWWK......','..KWWWWWWK......','..KWWwwWWK......','..KWWWK...KWWK...',
      '.KKWWK.....KWWK..','KKWWK......KKWWK..','KKKK........KKKK.','KKKK.......KKKK..'],
    ['..KWWWWWWK......','..KWWWWWWK......','..KWWwwWWKK......','..KWWWK...KWWWK...',
      '..KWWK....KWWWK..','..KKWK....KWWWK..','..KKK.....KKWWK..','..KKKK....KKKKK..'],
    ['..KWWWWWWK......','..KWWWWWWK......','..KWWwwWWK..KK....','..KWWWK...KWWWK...',
      '..KWWK....KWWWK..','..KKWK....KWWWK..','..KKK.....KKWWK..','..KKKK....KKKKK..'],
    ['..KWWWWWWK......','..KWWWWWWK......','..KWWwwWWK......','..KWWWK....KWWWK..',
      '..KWWK.....KWWWK.','..KKWK......KWWK.','..KKK........KKK.','..KKKK......KKKK.'],
    ['..KWWWWWWK......','..KWWWWWWK......','..KWWwwWWK......','...KWWWK...KWWWK..',
      '....KWWK....KWWWK.','.....KKWK....KWWK.','......KKK.....KKK.','......KKKK...KKKK.'],
    ['..KWWWWWWK......','..KWWWWWWK......','..KWWwwWWK......','..KWWWK...KWWWK...',
      '..KWWWK...KWWWK...','..KKWWK...KKWWK...','..KKKK.....KKKK...','..KKKKK...KKKKK...'],
  ],
  [
    ['.KWWWWWWK.......','.KWWWWWWK.......','.KWWwwWWK.......','.KWWWK...KWWWK...',
      'KKWWK....KWWK....','KKWK......KWWK...','KKK........KKK...','KKKK......KKKK...'],
    ['.KWWWWWWK.......','.KWWWWWWK.......','.KWWwwWWK.......','.KWWWK....KWWWK..',
      'KKWWK.....KWWK...','KKWK.......KWWK..','KKK.........KKK..','KKKK........KKKK.'],
    ['.KWWWWWWK.......','.KWWWWWWK.......','.KWWwwWWK..KK....','.KWWWK...KWWWK...',
      '.KWWK....KWWWK...','KKWK.....KWWWK...','KKK......KKWWK...','KKKK.....KKKKK...'],
    ['.KWWWWWWK.......','.KWWWWWWK.......','.KWWwwWWK..KK....','.KWWWK....KWWWK..',
      '.KWWK.....KWWWK..','KKWK......KWWWK..','KKK.......KKWWK..','KKKK......KKKKK..'],
    ['.KWWWWWWK.......','.KWWWWWWK.......','.KWWwwWWK.......','.KWWWK....KWWWK..',
      '.KWWK.....KWWWK..','KKWK.......KWWK..','KKK.........KKK..','KKKK........KKKK.'],
    ['.KWWWWWWK.......','.KWWWWWWK.......','.KWWwwWWK.......','..KWWWK...KWWWK..',
      '...KWWK....KWWWK.','....KKWK....KWWK.','.....KKK.....KKK.','.....KKKK...KKKK.'],
    ['.KWWWWWWK.......','.KWWWWWWK.......','.KWWwwWWK.......','.KWWWK...KWWWK...',
      '.KWWWK...KWWWK...','KKWWK....KKWWK...','KKKK......KKKK...','KKKKK....KKKKK...'],
  ],
];

type ArmPose = 'pumpA' | 'pumpB' | 'guard';
const ARM_PHASE: readonly ArmPose[] = ['pumpA', 'pumpB', 'pumpA', 'pumpB', 'pumpA', 'pumpB'];
const TOPS = {
  A: fitViews(A_TOPS), B: fitViews(B_TOPS), C: ELITE_C_COMPARISON_TOPS,
} as const;
const fitLegSet = (sets: readonly (readonly Grid[])[]) => sets.map(set => set.map(fitSheet));
const LEGS = {
  A: fitLegSet(A_LEGS), B: fitLegSet(B_LEGS),
} as const;
const ARM_SHEETS = Object.fromEntries(
  Object.entries({
    A: {
      pumpA: [BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,'..KJJ...........','..KJJJKK........','...KJJJKK.......','....KSSK........','........KJJ.....','.......KKJJ.....','.......KSSK.....',...blank(7)],
      pumpB: [BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,'...........JJK..','..........KKJJ..','.........KKJJJ...','.........KSSK....','.....KJJ.........','.....KJJKK.......','......KSSK.......',...blank(7)],
      guard: [BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,'..KJJJ....KJJJ..','...KJJJKKKKJJJ..','....KSSK..KSSK..',...blank(11)],
    },
    B: {
      pumpA: [BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,'.KKJJJ..........','.KKJJJJKK........','..KKJJJKK........','...KKSSK.........','........KKJJ.....','.......KKJJJ.....','.......KKSSK.....',...blank(7)],
      pumpB: [BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,'..........JJKK..','.........KKJJJ...','........KKJJJJ...','........KSSKK....','....KKJJ.........','....KKJJJKK.......','.....KKSSK........',...blank(7)],
      guard: [BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,BLANK,'.KKJJJ....KKJJJ.','.KKJJJJKKKKJJJJ.','..KKSSK...KKSSK..',...blank(11)],
    },
  }).map(([concept, poses]) => [concept, Object.fromEntries(
    Object.entries(poses as Record<string, Grid>).map(([pose, rows]) => [pose, fitSheet(rows)]),
  )]),
) as Readonly<Record<'A' | 'B', Readonly<Record<ArmPose, Grid>>>>;
const CONCEPT_C_ARMS: Readonly<Record<ArmPose, Grid>> = ELITE_C_ARMS;
const POSITION_LIST: readonly FootballConceptPosition[] = ['QB', 'RB', 'OL', 'LB', 'DB'];
const ACTION_PHASES = ['idle', 'stride', 'plant', 'push', 'opposite-stride', 'opposite-plant', 'opposite-push'] as const;

function validateAuthoredSheets() {
  for (const [concept, views] of Object.entries(TOPS)) {
    for (const [view, rows] of Object.entries(views)) {
      if (rows.length !== 14) throw new Error(`${concept} top ${view} needs 14 authored rows.`);
      rows.forEach((row, index) => {
        if (row.length !== 16) throw new Error(`${concept} top ${view} row ${index} must be 16 cells.`);
      });
    }
  }
  for (const concept of ['A', 'B'] as const) {
    if (LEGS[concept].length !== 2 || LEGS[concept]!.some(set => set.length !== 7)) {
      throw new Error(`${concept} needs one planted and six independent stride sheets.`);
    }
    for (const set of LEGS[concept]!) for (const rows of set) {
      if (rows.length !== 8 || rows.some(row => row.length !== 16))
        throw new Error(`${concept} lower-body pose must be an authored 16x8 sheet.`);
    }
    for (const [pose, rows] of Object.entries(ARM_SHEETS[concept])) {
      if (rows.length !== 22 || rows.some(row => row.length !== 16))
        throw new Error(`${concept} ${pose} arms must be an authored 16x22 sheet.`);
    }
  }
  if (ELITE_C_PLANTED_LEGS.length !== 8 || ELITE_C_RUN_LEGS.length !== 6
    || ELITE_C_RUN_LEGS.some(sheet => sheet.length !== 8 || sheet.some(row => row.length !== 16))) {
    throw new Error('Elite C needs one planted and six validated 16x8 stride sheets.');
  }
}
validateAuthoredSheets();

function positionAdjust(grid: string[], position: FootballConceptPosition) {
  if (position === 'OL' || position === 'LB') {
    // Defensive/line builds carry connected shoulder pad volume without
    // changing world size; OL receives the fuller extension.
    for (const y of [8, 9, 10]) {
      const row = [...grid[y]!];
      const body = row.findIndex(g => g === 'J' || g === 'H');
      const extension = position === 'OL' ? 2 : 1;
      if (body > extension && row[body - 1] !== '.') row[body - extension] = 'K';
      if (body >= 0 && body < 15 - extension && row[body + 1] !== '.') {
        row[body + extension] = 'K';
      }
      grid[y] = row.join('');
    }
  }
  if (position === 'RB') {
    // A returner's loaded seat adds a connected upper-thigh pixel to each leg.
    for (const y of [14, 15]) {
      const row = [...grid[y]!];
      if (row[8] !== '.' && row[9] === '.') row[9] = 'W';
      if (row[10] !== '.' && row[9] === '.') row[9] = 'W';
      if (row[9] !== '.' && row[10] === '.') row[10] = 'W';
      grid[y] = row.join('');
    }
  }
  if (position === 'DB') {
    // A lean coverage posture: compress the jersey waist, not the limbs.
    for (const y of [11, 12]) {
      const row = [...grid[y]!];
      if (row[3] === 'J' && row[4] !== '.') row[3] = '.';
      if (row[12] === 'J' && row[11] !== '.') row[12] = '.';
      grid[y] = row.join('');
    }
  }
}

function flatten(
  concept: FootballPlayerConcept, pose: FootballConceptPose, position: FootballConceptPosition,
  view: FootballConceptView, phase: number,
): FootballPlayerConceptFrame {
  let grid: string[];
  if (concept === 'C') {
    const arms = pose === 'run' ? ARM_PHASE[phase] ?? 'pumpA' : 'guard';
    grid = composeEliteCGrid(view, pose, phase, arms, undefined, 0, position);
  } else {
    grid = [...blank(22)];
    overlay(grid, TOPS[concept][view]);
    const legSet = pose === 'planted' ? LEGS[concept][0]![0]! : LEGS[concept][1]![phase]!;
    overlay(grid, legSet, 13);
    overlay(grid, pose === 'run' ? ARM_SHEETS[concept][ARM_PHASE[phase] ?? 'pumpA'] : ARM_SHEETS[concept].guard);
    for (const y of [15, 16]) {
      const row = [...grid[y]!];
      if (row[10] === '.') row[10] = 'W';
      if (y === 15 && row[9] === '.') row[9] = 'W';
      grid[y] = row.join('');
    }
    positionAdjust(grid, position);
  }

  const pixels = Array.from({ length: 44 }, () => Array<Glyph>(32).fill('.'));
  grid.forEach((row, y) => [...row].forEach((glyph, x) => {
    if (glyph === '.') return;
    pixels[y * 2]![x * 2] = glyph as Glyph;
    pixels[y * 2]![x * 2 + 1] = glyph as Glyph;
    pixels[y * 2 + 1]![x * 2] = glyph as Glyph;
    pixels[y * 2 + 1]![x * 2 + 1] = glyph as Glyph;
  }));
  if (grid[21] !== BLANK) throw new Error(`${concept} cleats extend below the native y=42 anchor.`);
  const runs: Run[] = [];
  pixels.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = row[x]!;
      if (color === '.') { x++; continue; }
      const start = x++;
      while (x < row.length && row[x] === color) x++;
      runs.push(Object.freeze({ row: y, x: start, length: x - start, color }));
    }
  });
  const action = pose === 'run' ? 'run' : 'idle';
  return Object.freeze({
    width: PLAYER_FRAME_WIDTH,
    height: PLAYER_FRAME_HEIGHT,
    view,
    action,
    phase,
    ball: false,
    build: `${concept}:${position}`,
    grip: null,
    concept,
    pose,
    position,
    runs: Object.freeze(runs),
  });
}

const cache = new Map<string, FootballPlayerConceptFrame>();
function cached(concept: FootballPlayerConcept, pose: FootballConceptPose,
  position: FootballConceptPosition, view: FootballConceptView, phase: number) {
  const key = `${concept}:${position}:${pose}:${view}:${phase}`;
  let frame = cache.get(key);
  if (!frame) {
    frame = flatten(concept, pose, position, view, phase);
    cache.set(key, frame);
  }
  return frame;
}

export const FOOTBALL_PLAYER_CONCEPT_FRAME_CATALOG = new Proxy(
  Object.create(null) as Record<string, FootballPlayerConceptFrame>,
  {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      const [concept, position, pose, view, phase] = key.split(':');
      if (!['A', 'B', 'C'].includes(concept ?? '')
        || !POSITION_LIST.includes(position as FootballConceptPosition)
        || !['planted', 'run'].includes(pose ?? '')) return undefined;
      return cached(concept as FootballPlayerConcept, pose as FootballConceptPose,
        position as FootballConceptPosition, Number(view) as FootballConceptView, Number(phase));
    },
    set() { return false; },
  },
) as Readonly<Record<string, FootballPlayerConceptFrame>>;
export const getCachedFootballPlayerConceptFrameCount = () => cache.size;

export function selectFootballPlayerConceptFrame(
  concept: FootballPlayerConcept, pose: FootballConceptPose, position: FootballConceptPosition,
  view: FootballConceptView = 0, phase = 0,
): FootballPlayerConceptFrame {
  const selectedPhase = pose === 'planted' ? 0 : ((Math.floor(phase) % 6) + 6) % 6;
  return cached(concept, pose, position, view, selectedPhase);
}

/** Draw a standalone concept at the exact production scale and y+5 ground line. */
export function drawFootballPlayerConcept(
  ctx: CanvasRenderingContext2D, x: number, y: number, kit: FootballKit,
  options: {
    concept: FootballPlayerConcept;
    pose: FootballConceptPose;
    position: FootballConceptPosition;
    view?: FootballConceptView;
    phase?: number;
  },
) {
  const frame = selectFootballPlayerConceptFrame(
    options.concept, options.pose, options.position, options.view ?? 0, options.phase ?? 0,
  );
  paintFootballPlayerFrame(ctx, frame, Math.round(x), Math.round(y), kit, 0, kit.dir);
  return frame;
}

export const FOOTBALL_CONCEPT_DESIGN_GRID = Object.freeze({
  width: 16, height: 22, atlasWidth: 32, atlasHeight: 44, pixelWorldSize: PLAYER_FRAME_SCALE,
  anchor: PLAYER_FRAME_ANCHOR,
  phases: ACTION_PHASES,
});
