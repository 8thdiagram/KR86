/**
 * Kick Return '86 player atlas.
 *
 * Every frame is authored as overlapping, hard-edged pixel clusters on a
 * 16x22 design grid. Each design cell expands to 2x2 atlas pixels: frames are
 * exactly 32x44 pixels, rendered at the shared player raster scale.
 * The 16x22 design grid expands 2x; the foot anchor is native atlas pixel
 * (16,42), so cleat pixels 40-41 meet the shared turf line at y+5. Each
 * directional sheet changes the anatomy/silhouette; none is a rotated
 * standing sprite. Immutable templates validate eagerly; flattened row-runs
 * are memoized only when their selected frame is first requested.
 */
import { BALL_ART, UNIFORM, playerSkin, type FootballKit } from './football-art';
import type { FootballPlayerAction, FootballPlayerView } from './football-player-actions';
import { PLAYER_RASTER_SCALE } from '../lib/player-dimensions';
import {
  applyEliteCPosition,
  ELITE_C_DIRECTIONAL_TOPS,
  ELITE_C_GAME_ARMS,
  ELITE_C_KICK_LEGS,
  ELITE_C_KNEEL_LEGS,
  ELITE_C_PLANTED_LEGS,
  ELITE_C_RUN_LEGS,
  ELITE_C_STANCE_LEGS,
  stripEliteCBakedArmOverhang,
} from './football-player-sheets';

export const PLAYER_FRAME_WIDTH = 32;
export const PLAYER_FRAME_HEIGHT = 44;
// Shared art reduction keeps the approved silhouette intact while giving
// athletes slightly more breathing room on the field. Possession redraws use
// this same painter/scale so hands and held balls remain registered.
export const PLAYER_FRAME_SCALE = PLAYER_RASTER_SCALE;
export const PLAYER_FRAME_ANCHOR = Object.freeze({ x: 16, y: 42 });
export const PLAYER_FRAME_DIRECTIONS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8] as const);
export const PLAYER_RUN_PHASES = Object.freeze([
  'stride', 'plant', 'push', 'opposite-stride', 'opposite-plant', 'opposite-push',
] as const);
export const PLAYER_ACTIONS = Object.freeze([
  'idle', 'stance', 'run', 'hold', 'snap', 'handoff', 'throw', 'catch', 'block',
  'break', 'backpedal', 'jump', 'kick', 'kneel', 'fall', 'dive', 'ground',
] as const satisfies readonly FootballPlayerAction[]);

export type FootballPlayerGlyph = '.' | 'K' | 'J' | 'j' | 'H' | 'M' | 'm' | 'W' | 'w' | 'S' | 'F' | 'B' | 'T' | 'L' | 'b' | 'O' | 'G';
type Glyph = FootballPlayerGlyph;
type Grid = readonly string[];
type FrameRun = Readonly<{ row: number; x: number; length: number; color: Glyph }>;
export type FootballPlayerFrame = Readonly<{
  width: 32;
  height: 44;
  view: FootballPlayerView;
  action: FootballPlayerAction;
  phase: number;
  locomotionPhase?: number;
  ball: boolean;
  build: string;
  grip: Readonly<{ x: number; y: number }> | null;
  runs: readonly FrameRun[];
}>;

const blank = (rows: number): string[] => Array.from({ length: rows }, () => '................');
const overlay = (target: string[], source: Grid, x = 0, y = 0, mirror = false) => {
  source.forEach((line, sy) => {
    const dy = y + sy;
    [...line].forEach((glyph, sx) => {
      if (glyph === '.') return;
      const dx = x + (mirror ? line.length - 1 - sx : sx);
      if (line.length > 16) throw new Error(`Player sheet row ${sy} is ${line.length} cells wide (expected <=16).`);
      if (dx < 0 || dx >= 16 || dy < 0 || dy >= target.length)
        throw new Error(`Player sheet pixel (${dx},${dy}) is outside the authored frame.`);
      const row = [...target[dy]!];
      row[dx] = glyph;
      target[dy] = row.join('');
    });
  });
};
function validateSheet(name: string, rows: Grid, width = 16, height = 22) {
  if (rows.length !== height) throw new Error(`${name} has ${rows.length} rows; expected ${height}.`);
  rows.forEach((row, index) => {
    if (row.length !== width) throw new Error(`${name} row ${index} has ${row.length} cells; expected ${width}.`);
  });
}

// Production consumes the reviewed Elite-1988 raster sheets directly.
// Every directional body keeps the selected adult helmet/shoulder/leg language.
const top22 = (top: Grid): Grid => [...top, ...blank(22 - top.length)];
const productionTop = (view: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): Grid =>
  top22(stripEliteCBakedArmOverhang(ELITE_C_DIRECTIONAL_TOPS[view]));
const UPRIGHT: Record<string, Grid> = {
  front: productionTop(0),
  quarter: productionTop(1),
  side: productionTop(2),
  farQuarter: productionTop(3),
  back: productionTop(4),
  backQuarter: productionTop(5),
  backSide: productionTop(6),
  rearQuarter: productionTop(7),
  frontDiagonal: productionTop(8),
};

// The reviewed C leg atlas is the production run cycle, not a reskin/overlay
// of the former draft. The native y+5 foot line is unchanged.
const LOWER = (rows: readonly string[]): Grid => [...blank(13), ...rows, '................'];
const RUN_LEGS: readonly Grid[] = ELITE_C_RUN_LEGS.map(LOWER);
const GROUNDED_RUN_LEGS = RUN_LEGS;

// The production atlas keeps the selected C body/legs and uses a separate
// gameplay arm pass so the approved concept comparison remains unchanged.
const ARMS = ELITE_C_GAME_ARMS;
const IDLE_LEGS = LOWER(ELITE_C_PLANTED_LEGS);
const STANCE_LEGS = LOWER(ELITE_C_STANCE_LEGS);
const KNEEL_LEGS = LOWER(ELITE_C_KNEEL_LEGS);
const ACTION_LEGS: Partial<Record<FootballPlayerAction, Grid>> = {
  idle: IDLE_LEGS, stance: STANCE_LEGS, hold: IDLE_LEGS, snap: STANCE_LEGS,
  handoff: STANCE_LEGS, throw: STANCE_LEGS, catch: STANCE_LEGS, block: STANCE_LEGS,
  break: GROUNDED_RUN_LEGS[2], backpedal: GROUNDED_RUN_LEGS[3], jump: GROUNDED_RUN_LEGS[2], kick: IDLE_LEGS,
  kneel: KNEEL_LEGS, fall: GROUNDED_RUN_LEGS[4], dive: GROUNDED_RUN_LEGS[5], ground: KNEEL_LEGS,
};
const ACTION_ARMS: Partial<Record<FootballPlayerAction, Grid>> = {
  idle: ARMS.guard, stance: ARMS.guard, hold: ARMS.carryA, snap: ARMS.reach,
  handoff: ARMS.reach, throw: ARMS.drawBack, catch: ARMS.reach, block: ARMS.block,
  break: ARMS.pumpB, backpedal: ARMS.pumpB, jump: ARMS.reach, kick: ARMS.pumpA,
  kneel: ARMS.guard, fall: ARMS.reach, dive: ARMS.reach, ground: ARMS.guard,
};

const ACTION_ORDER = PLAYER_ACTIONS as readonly FootballPlayerAction[];
const LOCOMOTION_LEG_ACTIONS: ReadonlySet<FootballPlayerAction> = new Set([
  'hold', 'throw', 'handoff', 'catch', 'block', 'break',
]);
const VIEW_BASE: Readonly<Record<FootballPlayerView, keyof typeof UPRIGHT>> = Object.freeze({
  0: 'front', 1: 'quarter', 2: 'side', 3: 'farQuarter', 4: 'back',
  5: 'backQuarter', 6: 'backSide', 7: 'rearQuarter', 8: 'frontDiagonal',
});
// A view can reflect the body for direction, while markings are painted in
// the final palette pass and are never numeric or text-bearing.
const VIEW_MIRROR: Readonly<Record<FootballPlayerView, boolean>> = Object.freeze({
  0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false,
});
const VIEW_OFFSETS: Readonly<Record<FootballPlayerView, number>> = Object.freeze({
  0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0,
});

const KICK_LEGS: readonly Grid[] = ELITE_C_KICK_LEGS.map(LOWER);

for (const [name, sheet] of Object.entries(UPRIGHT)) validateSheet(`upright:${name}`, sheet);
RUN_LEGS.forEach((sheet, index) => validateSheet(`run-legs:${index}`, sheet));
GROUNDED_RUN_LEGS.forEach((sheet, index) => validateSheet(`grounded-run-legs:${index}`, sheet));
for (const [name, sheet] of Object.entries(ARMS)) validateSheet(`arms:${name}`, sheet);
for (const [name, sheet] of Object.entries(ACTION_LEGS)) validateSheet(`action-legs:${name}`, sheet!);
KICK_LEGS.forEach((sheet, index) => validateSheet(`kick:${index}`, sheet));

function actionPose(action: FootballPlayerAction, phase: number, ball: boolean): { arms: Grid; legs: Grid; bodyShift?: number } {
  if (action === 'run' || action === 'backpedal') {
    const p = action === 'backpedal' ? (phase + 3) % 6 : phase;
    const arms = ball
      ? (p < 3 ? ARMS.carryA : ARMS.carryB)
      : (p < 3 ? ARMS.pumpA : ARMS.pumpB);
    return { arms, legs: GROUNDED_RUN_LEGS[p]! };
  }
  if (action === 'throw') {
    const throwArms = [ARMS.guard, ARMS.drawBack, ARMS.throwForward, ARMS.release, ARMS.followThrough, ARMS.guard];
    return { arms: throwArms[phase]!,
      legs: STANCE_LEGS, bodyShift: 1 };
  }
  if (action === 'catch') {
    return { arms: phase < 5 ? ARMS.reach : ARMS.guard, legs: phase < 5 ? STANCE_LEGS : IDLE_LEGS,
      bodyShift: phase < 5 ? 1 : 0 };
  }
  if (action === 'block') {
    return { arms: phase % 2 ? ARMS.block : ARMS.guard, legs: STANCE_LEGS, bodyShift: 1 };
  }
  if (action === 'break') return {
    arms: phase < 3 ? ARMS.reach : phase % 2 ? ARMS.pumpA : ARMS.pumpB,
    legs: GROUNDED_RUN_LEGS[(phase + 2) % 6]!,
  };
  if (action === 'jump') return { arms: phase < 3 ? ARMS.reach : ARMS.guard, legs: GROUNDED_RUN_LEGS[phase < 3 ? 2 : 5]! };
  if (action === 'kick') {
    const kickArms = [ARMS.pumpA, ARMS.guard, ARMS.throwForward, ARMS.reach, ARMS.pumpB, ARMS.guard];
    return { arms: kickArms[phase]!, legs: KICK_LEGS[phase]! };
  }
  if (action === 'dive' || action === 'fall') {
    return { arms: ARMS.reach, legs: GROUNDED_RUN_LEGS[(phase + 4) % 6]! };
  }
  if (action === 'stance' || action === 'snap' || action === 'handoff') {
    return { arms: ACTION_ARMS[action] ?? ARMS.guard, legs: STANCE_LEGS, bodyShift: 1 };
  }
  if (action === 'kneel') return { arms: ARMS.guard, legs: KNEEL_LEGS, bodyShift: 2 };
  if (action === 'ground') return { arms: ARMS.guard, legs: KNEEL_LEGS, bodyShift: 2 };
  return { arms: ACTION_ARMS[action] ?? ARMS.guard, legs: ACTION_LEGS[action] ?? GROUNDED_RUN_LEGS[0]! };
}

type Build = 'standard' | 'bulky' | 'compact' | 'linebacker' | 'lean';
function buildForPosition(position?: string): Build {
  if (position === 'OL' || position === 'DL') return 'bulky';
  if (position === 'RB' || position === 'KR') return 'compact';
  if (position === 'LB') return 'linebacker';
  if (position === 'WR' || position === 'DB') return 'lean';
  return 'standard';
}
function applyBuild(grid: string[], build: Build) {
  const role = build === 'bulky' ? 'OL' : build === 'compact' ? 'RB'
    : build === 'linebacker' ? 'LB' : build === 'lean' ? 'DB' : 'QB';
  applyEliteCPosition(grid, role);
}

function buildGlyphGrid(
  view: FootballPlayerView, action: FootballPlayerAction, phase: number, ball: boolean,
  build: Build, locomotionPhase?: number,
): Grid {
  const out = blank(22);
  const baseName = VIEW_BASE[view];
  const mirror = VIEW_MIRROR[view];
  const pose = actionPose(action, phase, ball);
  const bodyShift = pose.bodyShift ?? 0;
  overlay(out, UPRIGHT[baseName]!, VIEW_OFFSETS[view], bodyShift, mirror);
  const legs = locomotionPhase !== undefined && LOCOMOTION_LEG_ACTIONS.has(action)
    ? GROUNDED_RUN_LEGS[locomotionPhase]!
    : pose.legs;
  overlay(out, legs, 0, 0, mirror);
  for (const y of [15, 16]) {
    const row = [...out[y]!];
    if (row[10] === '.') row[10] = 'W';
    if (y === 15 && row[9] === '.') row[9] = 'W';
    out[y] = row.join('');
  }
  // The cleaned body base is followed by current authored action arms; no
  // legacy arm pixels survive underneath them.
  overlay(out, pose.arms, 0, bodyShift, mirror);
  applyBuild(out, build);
  if (action === 'jump') {
    // Raise the entire authored pose by a row, leaving anchor conversion to
    // the frame compositor; no canvas transform or sprite rotation is used.
    const raised = blank(22);
    overlay(raised, out, 0, -1);
    return withBall(raised, view, action, ball);
  }
  if ((action === 'fall' || action === 'dive') && phase < 2) return withBall(out, view, action, ball);
  if (action === 'dive' || action === 'fall' || action === 'ground') {
    const prone = composeProne(view);
    if (ball) addBall(prone, view, action);
    return prone;
  }
  return withBall(out, view, action, ball);
}

const PRONE_PARTS = {
  horizontal: [
    '........KKKKKK..','......KMMMMMMK..','.....KMTMMMMK...',
    '......KMMMMMMK..','........KSSFFK..','....KKKKKKKKKK..',
    '...KJJJJJJJJJKK.','..KJJjJJJJJJJKK.','..KJJJJJJJJJKK..',
    'KWWWWKKJJJJJKK..','KKWWWWKKKKKK....','KKWWWWKKKKKK....',
  ],
  verticalDown: [
    '................','................','.....KKKKKK.....','....KMMMMMMK....',
    '....KMTMMMMK....','....KMMMMMMK....','.....KSSFFK.....',
    '......KKKK......','....KKKKKKKK....','...KJJJJJJJKK...',
    '..KJJJJJJJJJKK..','..KJJjJJJJJJKK..','...KJJJJJJJKK...',
    '....KKWWKK......','....KWWWWK......','....KWWwWK......',
    '....KWWWWK......','...KKWWKK.......',
  ],
  verticalUp: [
    '...KKWWKK.......','....KWWWWK......','....KWWwWK......',
    '....KWWWWK......','...KKWWKK.......','....KJJJJJKK....',
    '...KJJJJJJKK....','..KJJJJjJJJJKK..','..KJJJJJJJJJKK..',
    '...KJJJJJJJKK...','....KKKKKK......','.....KKKK.......',
    '......KSSFFK....','.....KMMMMMMK...','.....KMTMMMMK...',
    '.....KMMMMMMK...','......KKKKKK....','................',
  ],
  diagonalDown: [
    '........KKKKKK..','......KMMMMMMK..','.....KMTMMMMK...',
    '......KMMMMMMK..','........KSSFFK..','.....KKKKKKKK...',
    '....KJJJJJJJKK..','...KJJJJjJJJJKK.','...KJJJJJJJJJKK.',
    '..KWWWWKJJJJKK..','.KWWWWKKJJJKK...','KKWWWWKKKK......',
    'KKWWWWKKKK......','KKWWWWKKKK......','KKKKKKKK........',
  ],
  diagonalUp: [
    '..KKKKKK........','..KMMMMMMK......','..KMTMMMMK......',
    '..KMMMMMMK......','...KSSFFK.......','...KKKKKKKK.....',
    '...KJJJJJJJKK...','..KJJJJjJJJJKK..','..KJJJJJJJJJKK..',
    '...KJJJJJJJKK...','....KKJJJKKWWWWK','.....KKJJKKWWWWK',
    '......KKKKKWWWWK','........KKWWWWKK','.........KKWWKK.',
  ],
};
for (const [name, rows] of Object.entries(PRONE_PARTS)) {
  rows.forEach((row, index) => {
    if (row.length !== 16) throw new Error(`prone:${name} row ${index} has ${row.length} cells; expected 16.`);
  });
}
const PRONE_VIEW: Readonly<Record<FootballPlayerView, Readonly<{ part: keyof typeof PRONE_PARTS; mirror: boolean }>>> =
  Object.freeze({
    0: { part: 'horizontal', mirror: false }, 1: { part: 'diagonalDown', mirror: false },
    2: { part: 'verticalDown', mirror: false }, 3: { part: 'diagonalDown', mirror: true },
    4: { part: 'horizontal', mirror: true }, 5: { part: 'diagonalUp', mirror: true },
    6: { part: 'verticalUp', mirror: false }, 7: { part: 'diagonalUp', mirror: false },
    8: { part: 'diagonalDown', mirror: true },
  });
const HELD_BALL_GRID: Grid = ['..OO....','OBBBO...','OBLbO...','..OO....'];
const POSSESSION_GLYPHS: ReadonlySet<Glyph> = new Set(['G', 'O', 'B', 'b', 'L']);
validateSheet('held-ball', HELD_BALL_GRID, 8, 4);
const PRONE_LAYOUT: Readonly<Record<keyof typeof PRONE_PARTS, Readonly<{
  rows: number; headRows: number; headAtEnd?: boolean; start: number;
}>>> = Object.freeze({
  horizontal: { rows: 12, headRows: 5, start: 8 },
  // Lengthen the trunk/legs toward the far end while leaving each helmet mask
  // at native proportions and on the same directional end of its sheet.
  verticalDown: { rows: 18, headRows: 5, start: 3 },
  verticalUp: { rows: 18, headRows: 5, headAtEnd: true, start: 3 },
  // Diagonal poses need a modest extension, not the tall treatment used by
  // end-on views; their original oblique silhouette remains easy to read.
  diagonalDown: { rows: 15, headRows: 5, start: 6 },
  diagonalUp: { rows: 15, headRows: 5, start: 6 },
});
function composeProne(view: FootballPlayerView): string[] {
  const frame = blank(22);
  const selected = PRONE_VIEW[view];
  const rows = PRONE_PARTS[selected.part];
  const layout = PRONE_LAYOUT[selected.part];
  const preservedHead = layout.headAtEnd
    ? rows.slice(rows.length - layout.headRows)
    : rows.slice(0, layout.headRows);
  const body = layout.headAtEnd
    ? rows.slice(0, rows.length - layout.headRows)
    : rows.slice(layout.headRows);
  const bodyLength = layout.rows - layout.headRows;
  const expandedBody = Array.from({ length: bodyLength }, (_, index) =>
    body[Math.min(body.length - 1, Math.floor(index * body.length / bodyLength))]!,
  );
  const expanded = layout.headAtEnd
    ? [...expandedBody, ...preservedHead]
    : [...preservedHead, ...expandedBody];
  overlay(frame, expanded, 0, layout.start, selected.mirror);
  return frame;
}

function withBall(grid: string[], view: FootballPlayerView, action: FootballPlayerAction, ball: boolean): Grid {
  if (ball) addBall(grid, view, action);
  return grid;
}
function addBall(grid: string[], view: FootballPlayerView, action: FootballPlayerAction) {
  // Ball stays secured to the same tucked arm through every run phase and the
  // throw pose. Only the parent possession flag controls whether it exists.
  const right = action === 'dive' || action === 'fall' || action === 'ground'
    ? !PRONE_VIEW[view].mirror
    : !VIEW_MIRROR[view];
  const bx = right ? 8 : 0;
  const by = action === 'dive' || action === 'fall' || action === 'ground' ? 14 : 10;
  overlay(grid, HELD_BALL_GRID, bx, by);
  const handX = right ? bx - 1 : bx + 8;
  const handY = by + 2;
  if (handY < 22 && handX >= 0 && handX < 16) {
    const row = [...grid[handY]!];
    row[handX] = 'G';
    grid[handY] = row.join('');
  }
}

function flatten(
  view: FootballPlayerView, action: FootballPlayerAction, phase: number, ball: boolean,
  build: Build, locomotionPhase?: number,
): FootballPlayerFrame {
  const grid = buildGlyphGrid(view, action, phase, ball, build, locomotionPhase);
  validateSheet('complete-player-frame', grid);
  if (grid[21] !== '................')
    throw new Error('Player sheet paints below native foot anchor row 42.');
  const pixels: Glyph[][] = Array.from({ length: PLAYER_FRAME_HEIGHT }, () => Array<Glyph>(PLAYER_FRAME_WIDTH).fill('.'));
  grid.forEach((line, y) => [...line].forEach((glyph, x) => {
    if (glyph === '.') return;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const pixelY = y * 2 + dy;
      pixels[pixelY]![x * 2 + dx] = glyph as Glyph;
    }
  }));
  refineFootballHelmetWidth(pixels);
  const runs: FrameRun[] = [];
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
  const isProne = action === 'dive' || action === 'fall' || action === 'ground';
  const right = isProne ? !PRONE_VIEW[view].mirror : !VIEW_MIRROR[view];
  const grip = ball ? Object.freeze({
    x: right ? 24 : 8,
    y: isProne ? 32 : 24,
  }) : null;
  return Object.freeze({
    width: 32, height: 44, view, action, phase,
    ...(locomotionPhase === undefined ? {} : { locomotionPhase }),
    ball, build, grip,
    runs: Object.freeze(runs),
  });
}

/**
 * The authored head keeps its original mask, stripe, shading and colors. On
 * rows carrying helmet material, trim one outer black pixel (alternating
 * sides) at native atlas resolution. This is the closest crisp-pixel
 * adjustment to a 5–8% width reduction without scaling or softening the art.
 * The material glyphs also identify the helmet in turned and prone sheets.
 */
export function refineFootballHelmetWidth(pixels: string[][]) {
  for (let y = 0; y < pixels.length; y++) {
    const row = pixels[y]!;
    const helmetXs = row.flatMap((glyph, x) => glyph === 'M' || glyph === 'm' || glyph === 'T' ? [x] : []);
    if (!helmetXs.length) continue;
    let left = helmetXs[0]!;
    let right = helmetXs[helmetXs.length - 1]!;
    while (left > 0 && row[left - 1] === 'K') left--;
    while (right < row.length - 1 && row[right + 1] === 'K') right++;
    // A one-pixel cut from a 12–18px shell row is 5.5–8.3%. Never cut the
    // facemask or a colored helmet pixel when the contour is not available.
    if (right - left + 1 >= 12) {
      // Atlas pixels are expanded in vertical pairs from one authored cell;
      // keep each pair aligned, alternating only between authored rows.
      const trimLeft = Math.floor(y / 2) % 2 === 0;
      const edge = trimLeft ? left : right;
      if (row[edge] === 'K') row[edge] = '.';
    }
  }
}

const frameCache = new Map<string, FootballPlayerFrame>();
const frameKey = (
  view: FootballPlayerView, action: FootballPlayerAction, phase: number, ball: boolean,
  build: Build, locomotionPhase?: number,
) => `${view}:${action}:${phase}:${Number(ball)}:${build}:${locomotionPhase ?? '-'}`;
function cachedFrame(
  view: FootballPlayerView, action: FootballPlayerAction, phase: number, ball: boolean,
  build: Build, locomotionPhase?: number,
) {
  const key = frameKey(view, action, phase, ball, build, locomotionPhase);
  let frame = frameCache.get(key);
  if (!frame) {
    frame = flatten(view, action, phase, ball, build, locomotionPhase);
    frameCache.set(key, frame);
  }
  return frame;
}
/** Lazy, read-only compatibility catalog. Frames are flattened only on demand. */
export const FOOTBALL_PLAYER_FRAME_CATALOG = new Proxy(Object.create(null) as Record<string, FootballPlayerFrame>, {
  get(_target, key) {
    if (typeof key !== 'string') return undefined;
    const [view, action, phase, ball, build] = key.split(':');
    if (!PLAYER_FRAME_DIRECTIONS.includes(Number(view) as FootballPlayerView)
      || !ACTION_ORDER.includes(action as FootballPlayerAction)
      || !['standard', 'bulky', 'compact', 'linebacker', 'lean'].includes(build ?? '')
      || !Number.isInteger(Number(phase))) return undefined;
    return cachedFrame(Number(view) as FootballPlayerView, action as FootballPlayerAction,
      ((Number(phase) % 6) + 6) % 6, ball === '1', build as Build);
  },
  set() { return false; },
}) as Readonly<Record<string, FootballPlayerFrame>>;
export const getCachedFootballPlayerFrameCount = () => frameCache.size;

/** Stable pure selector; run phase is an explicit authored six-frame index. */
export function selectFootballPlayerFrame(
  action: FootballPlayerAction, view: FootballPlayerView, phase = 0, ball = false, position?: string,
  locomotionStep?: number,
): FootballPlayerFrame {
  const normalizePhase = (value: number) => Number.isFinite(value)
    ? ((Math.floor(value) % 6) + 6) % 6
    : 0;
  const selected = normalizePhase(phase);
  const selectedLocomotion = locomotionStep === undefined || !Number.isFinite(locomotionStep)
    || !LOCOMOTION_LEG_ACTIONS.has(action)
    ? undefined
    : normalizePhase(locomotionStep);
  const build = buildForPosition(position);
  return cachedFrame(view, action, selected, ball, build, selectedLocomotion);
}

function teamShade(color: string, amount: number): string {
  const hex = /^#([\da-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;
  const channels = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `#${channels.map(value => Math.max(0, Math.min(255,
    Math.round(amount < 0 ? value * (1 + amount) : value + (255 - value) * amount),
  )).toString(16).padStart(2, '0')).join('')}`;
}

export function footballPlayerPalette(kit: FootballKit): Readonly<Record<Glyph, string>> {
  return Object.freeze({
    '.': 'transparent',
    K: UNIFORM.ink,
    J: kit.body,
    j: teamShade(kit.body, -0.28),
    H: teamShade(kit.body, 0.25),
    M: kit.trim,
    m: teamShade(kit.trim, -0.25),
    W: UNIFORM.pants,
    w: UNIFORM.pantsShade,
    S: playerSkin(kit),
    F: UNIFORM.facemask,
    B: BALL_ART.leather,
    b: BALL_ART.shade,
    L: BALL_ART.stripe,
    T: teamShade(kit.trim, 0.23),
    O: BALL_ART.outline,
    G: playerSkin(kit),
  });
}

/** Paint cached row-runs only; caller's canvas state and kit remain untouched. */
export function paintFootballPlayerFrame(
  ctx: CanvasRenderingContext2D, frame: FootballPlayerFrame, x: number, y: number,
  kit: FootballKit, lean = 0, direction: 1 | -1 = 1, possessionOnly = false,
) {
  const palette = footballPlayerPalette(kit);
  const anchorX = Math.round(x + lean), anchorY = Math.round(y) + 5;
  // Quantize shared edges, not individual rectangle widths. Symmetric rounding
  // around the foot anchor keeps the modest reduction sharp and makes left/
  // right poses exact mirrors, including negative quarter-grid tie points.
  const edge = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 2) / 2;
  const previousSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const run of frame.runs) {
    if (possessionOnly && !POSSESSION_GLYPHS.has(run.color)) continue;
    ctx.fillStyle = palette[run.color];
    const runX = direction < 0 ? PLAYER_FRAME_WIDTH - run.x - run.length : run.x;
    const left = anchorX + edge((runX - PLAYER_FRAME_ANCHOR.x) * PLAYER_FRAME_SCALE);
    const right = anchorX + edge((runX + run.length - PLAYER_FRAME_ANCHOR.x) * PLAYER_FRAME_SCALE);
    const top = anchorY + edge((run.row - PLAYER_FRAME_ANCHOR.y) * PLAYER_FRAME_SCALE);
    const bottom = anchorY + edge((run.row + 1 - PLAYER_FRAME_ANCHOR.y) * PLAYER_FRAME_SCALE);
    if (right > left && bottom > top) ctx.fillRect(left, top, right - left, bottom - top);
  }
  ctx.imageSmoothingEnabled = previousSmoothing;
}

/** Redraw only the uniquely tagged hand + football pixels from this exact frame. */
export function paintFootballPlayerPossessionFrame(
  ctx: CanvasRenderingContext2D, frame: FootballPlayerFrame, x: number, y: number,
  kit: FootballKit, direction: 1 | -1 = 1,
) {
  paintFootballPlayerFrame(ctx, frame, x, y, kit, 0, direction, true);
}

/** Grip in world-scaled atlas units relative to the fixed top-left frame origin. */
export function footballPlayerGrip(frame: FootballPlayerFrame, direction: 1 | -1 = 1) {
  if (!frame.grip) return null;
  const x = direction < 0 ? PLAYER_FRAME_WIDTH - frame.grip.x : frame.grip.x;
  return Object.freeze({ x: x * PLAYER_FRAME_SCALE, y: frame.grip.y * PLAYER_FRAME_SCALE });
}
