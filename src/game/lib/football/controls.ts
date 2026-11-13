import { createKickControls, type KickControl } from '../kick-return-controls';
import { canForwardPass, highlightedReceiver, PASS_HOLD_MS, QB_SCRAMBLE_MS } from './passing';
import type { FootballGame, FootballInput } from './types';
import { canDefensiveAction } from './defensive-action';

/** Routes a whole gesture once. Crossing the line/catching a pass never converts its release into an evade. */
export function createFootballControls() {
  const movement = createKickControls();
  const consumed = new Set<string>();
  let owner: { id: string; since: number; scrambled?: boolean } | undefined;
  let scramble = false;
  let press = false, target: number | undefined, cancel = false, release: FootballInput['passRelease'], kick = false;
  const enter = (id: string, control: KickControl | null, now: number, g: FootballGame) => {
    if (owner?.id === id) {
      if (control === 'juke') return;
      owner = undefined; press = false; cancel = true; consumed.delete(id);
    } else if (consumed.has(id)) return;
    if (control === 'juke' && canDefensiveAction(g)) {
      kick = true; consumed.add(id); return;
    }
    if(control==='juke'&&g.phase==='live'&&g.possession==='home'&&g.live?.option?.phase==='read') {
      // Pitch on the press, not on tap-release or the ordinary hesitation hold.
      kick=true;consumed.add(id);return;
    }
    if (control === 'juke' && g.phase === 'live' && !g.special && g.live?.mode !== 'return' && g.possession === 'home') {
      if (g.live && canForwardPass(g.live)) {
        // A fresh press after releasing the scramble hold throws immediately.
        if (g.live.mode === 'scramble') { if (!owner) kick = true; consumed.add(id); return; }
        if (!owner && !release) {
          owner = { id, since: now }; press = true;
          // Capture identity at the actual keyboard/pointer-down event, before
          // the next simulation step can advance the displayed progression.
          target = highlightedReceiver(g.live);
        }
        consumed.add(id); return;
      }
      if (g.live?.mode === 'kick') { kick = true; consumed.add(id); return; }
      if (g.live?.mode === 'scramble') { consumed.add(id); return; }
    }
    movement.enter(id, control, now);
  };
  return {
    enter,
    has: (id: string) => movement.has(id) || owner?.id === id || consumed.has(id),
    release(id: string, now: number, canceled = false) {
      if (owner?.id === id) {
        if (canceled) { cancel = true; press = false; }
        else {
          if (now - owner.since >= QB_SCRAMBLE_MS && !owner.scrambled) scramble = true;
          // Releasing the activating hold only releases the button, never the ball.
          if (!owner.scrambled && now - owner.since < QB_SCRAMBLE_MS)
            release = now - owner.since >= PASS_HOLD_MS ? 'bullet' : 'normal';
        }
        owner = undefined;
      }
      if (consumed.delete(id)) return;
      movement.release(id, now, canceled);
    },
    clear() { movement.clear(); owner = undefined; consumed.clear(); press = false; target = undefined; cancel = false; release = undefined; kick = false; scramble = false; },
    tapJuke: () => movement.tapJuke(),
    tapDirection: movement.tapDirection,
    sample(now: number, consume = true) {
      const s = movement.sample(now, consume);
      const startScramble = scramble || !!owner && !owner.scrambled && now - owner.since >= QB_SCRAMBLE_MS;
      if (consume && startScramble && owner) owner.scrambled = true;
      const result = { ...s, action: kick || s.juke, passPress: press, passTarget: target, passRelease: release, passCancel: cancel,
        qbScramble: startScramble,
        bulletReady: !!owner && !owner.scrambled && now - owner.since >= PASS_HOLD_MS && now - owner.since < QB_SCRAMBLE_MS,
        pressed: { ...s.pressed, juke: s.pressed.juke || !!owner } };
      if (consume) { press = false; target = undefined; release = undefined; cancel = false; kick = false; scramble = false; }
      return result;
    },
  };
}
