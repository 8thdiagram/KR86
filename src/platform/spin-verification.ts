import { createKickAttempt, stepKickAttempt, type KickAttempt } from '../game/lib/kick-return-engine';
import { createKickControls } from '../game/lib/kick-return-controls';
import { EVADE } from '../game/lib/carrier-evasion';

type Position = { x: number; y: number };
export type SpinTrace = {
  side: -1 | 1;
  original: Position;
  selected: string;
  intended: number;
  actual: number;
  final: Position;
  resumed: Position;
  frames: KickAttempt[];
};

/** The real controls and Classic solver, started while already running.
 * No drawing offsets, fake coordinates, save writes or altered tackle rules. */
export function measureSpin(side: -1 | 1): SpinTrace {
  let a = createKickAttempt(777, 1);
  a.phase = 'returning'; a.player = { x: 500, y: 96 };
  a.time = 3; a.returnTime = 1; a.defenders = [];
  a.moves = { version: 2, sequence: 0, readyAt: 0, backward: false, vx: 57, furthestX: 500 };
  const dt = 1 / 60;
  for (let i = 0; i < 12; i++) a = stepKickAttempt(a, 0, dt, { evasion: true });
  const original = { ...a.player };
  a.defenders = [{ id: 1, homeX: original.x + 8, x: original.x + 8,
    y: original.y - side * 30, minY: 24, maxY: 168, speed: 0, lateralSpeed: 0, active: true }];
  const controls = createKickControls({ immediateAction: true });
  controls.enter('action', 'juke', 0);
  const frames = [structuredClone(a)];
  let selected = '', final = { ...original };
  for (let i = 0; i < 35; i++) {
    if (i === 4) controls.release('action', i * dt * 1000);
    const input = controls.sample(i * dt * 1000);
    a = stepKickAttempt(a, input.direction, dt, input);
    if (i === 0) selected = `${a.moves?.active?.kind}:${a.moves?.active?.side}`;
    if (i === 14) final = { ...a.player };
    frames.push(structuredClone(a));
  }
  const actual = final.y - original.y;
  if (selected !== `spin:${side}` || Math.abs(actual - side * EVADE.bodyWidth) > .001 ||
      Math.abs(a.player.y - final.y) > .001)
    throw new Error(`Spin verification failed: ${selected}, intended ${side * EVADE.bodyWidth}, actual ${actual}`);
  return { side, original, selected, intended: side * EVADE.bodyWidth, actual,
    final, resumed: { ...a.player }, frames };
}
