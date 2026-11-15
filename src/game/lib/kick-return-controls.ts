import { JUKE } from './kick-return-moves';
import type { KickDirection } from './kick-return-engine';

export type KickControl = 'up' | 'down' | 'juke';
type ControlBounds = { left: number; right: number; top: number; bottom: number };
/** Half-open bounds give a shared divider exactly one owner in either layout. */
export function kickControlAtPoint(
  controls: ReadonlyArray<{ control: KickControl; bounds: ControlBounds }>, x: number, y: number,
): KickControl | null {
  return controls.find(({ bounds: r }) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)?.control ?? null;
}
type Press = { control: KickControl | null; since: number; order: number; usedHold: boolean };

/** One press has one outcome. A slide changes ownership without releasing capture.
 * Wall-clock input duration is separate from paused/fixed-step simulation time. */
export function createKickControls(options: { immediateAction?: boolean } = {}) {
  const presses = new Map<string, Press>();
  let order = 0, queued = false, tap: KickDirection = 0, tapUntil = 0;
  const enter = (id: string, control: KickControl | null, now: number) => {
    const old = presses.get(id);
    if (old?.control === control) return;
    presses.set(id, { control, since: now, order: ++order,
      usedHold: !!old && (old.usedHold || old.control === 'juke' && now - old.since >= JUKE.holdMs) });
    if (options.immediateAction && control === 'juke' && !old?.usedHold) {
      queued = true; presses.get(id)!.usedHold = true;
    }
    if (control === 'up' || control === 'down') {
      tap = control === 'up' ? -1 : 1;
      tapUntil = now + 160;
    } else tapUntil = 0;
  };
  return {
    enter,
    has: (id: string) => presses.has(id),
    release(id: string, now: number, canceled = false) {
      const p = presses.get(id);
      // Normal pointerup is followed by lostpointercapture. That second event
      // must not erase a short steering tap or affect a different finger.
      if (!p) return;
      if (!options.immediateAction && p?.control === 'juke' && !canceled && !p.usedHold && now - p.since < JUKE.holdMs) queued = true;
      presses.delete(id);
      if (canceled) tapUntil = 0;
    },
    tapJuke() { queued = true; },
    tapDirection(direction: -1 | 1, now: number) { tap = direction; tapUntil = now + 160; },
    clear() { presses.clear(); queued = false; tap = 0; tapUntil = 0; },
    sample(now: number, consume = true) {
      const all = [...presses.values()];
      const vertical = all.filter(p => p.control === 'up' || p.control === 'down')
        .sort((a, b) => b.order - a.order)[0];
      const direction: KickDirection = vertical ? vertical.control === 'up' ? -1 : 1
        : now < tapUntil ? tap : 0;
      const backward = !options.immediateAction && all.some(p => p.control === 'juke' && now - p.since >= JUKE.holdMs);
      for (const p of all)
        if (p.control === 'juke' && now - p.since >= JUKE.holdMs) p.usedHold = true;
      const juke = queued;
      if (consume) queued = false;
      return { direction, backward, hesitate: backward, juke, evasion: !!options.immediateAction,
        pressed: { up: direction === -1, down: direction === 1,
          juke: all.some(p => p.control === 'juke') } };
    },
  };
}
