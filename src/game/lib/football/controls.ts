import { createKickControls, type KickControl } from '../kick-return-controls';
import { canForwardPass, highlightedReceiver, PASS_HOLD_MS, QB_SCRAMBLE_MS } from './passing';
import type { FootballGame, FootballInput } from './types';
import { canDefensiveAction } from './defensive-action';
import { DEFENSE_HOLD_MS, isUserDefensivePlay } from './user-defense';

/** Routes a whole gesture once. Crossing the line/catching a pass never converts its release into an evade. */
export function createFootballControls() {
  const movement = createKickControls();
  const consumed = new Set<string>();
  let owner: { id: string; since: number; scrambled?: boolean } | undefined;
  let scramble = false;
  let defenseOwner: { id: string; since: number } | undefined;
  const steering = new Map<string, -1 | 1>();
  let defenseTap = false;
  let steeringPulse: { direction: -1 | 1; until: number } | undefined;
  let press = false, target: number | undefined, cancel = false, release: FootballInput['passRelease'], kick = false;
  const enter = (id: string, control: KickControl | null, now: number, g: FootballGame) => {
    steering.delete(id);
    if (control === 'up' || control === 'down') {
      steering.set(id, control === 'up' ? -1 : 1); steeringPulse = undefined;
    }
    if (defenseOwner?.id === id) {
      if (control === 'juke') return;
      defenseOwner = undefined; consumed.delete(id);
    }
    if (owner?.id === id) {
      if (control === 'juke') return;
      owner = undefined; press = false; cancel = true; consumed.delete(id);
    } else if (consumed.has(id)) return;
    if (control === 'juke' && isUserDefensivePlay(g)) {
      movement.release(id, now, true); // A captured finger may have slid here from an arrow.
      if (!defenseOwner) defenseOwner = { id, since: now };
      consumed.add(id); return;
    }
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
      steering.delete(id);
      if (defenseOwner?.id === id) {
        if (!canceled && now - defenseOwner.since < DEFENSE_HOLD_MS) defenseTap = true;
        defenseOwner = undefined;
      }
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
    clear() { movement.clear(); owner = undefined; defenseOwner = undefined; steering.clear(); steeringPulse = undefined; defenseTap = false; consumed.clear(); press = false; target = undefined; cancel = false; release = undefined; kick = false; scramble = false; },
    tapJuke: () => movement.tapJuke(),
    tapDirection(direction: -1 | 1, now: number) {
      movement.tapDirection(direction, now); steeringPulse = { direction, until: now + 160 };
    },
    sample(now: number, consume = true) {
      const s = movement.sample(now, consume);
      const defenseDirection: FootballInput['defenseDirection'] = [...steering.values()].at(-1) ??
        (steeringPulse && now < steeringPulse.until ? steeringPulse.direction : 0);
      const startScramble = scramble || !!owner && !owner.scrambled && now - owner.since >= QB_SCRAMBLE_MS;
      if (consume && startScramble && owner) owner.scrambled = true;
      const result = { ...s, action: kick || s.juke || defenseTap, passPress: press, passTarget: target, passRelease: release, passCancel: cancel,
        defensePressed: !!defenseOwner,
        defenseHold: !!defenseOwner && now - defenseOwner.since >= DEFENSE_HOLD_MS,
        defenseDirection,
        qbScramble: startScramble,
        bulletReady: !!owner && !owner.scrambled && now - owner.since >= PASS_HOLD_MS && now - owner.since < QB_SCRAMBLE_MS,
        pressed: { ...s.pressed, juke: s.pressed.juke || !!owner || !!defenseOwner } };
      if (consume) { press = false; target = undefined; release = undefined; cancel = false; kick = false; scramble = false; defenseTap = false; }
      return result;
    },
  };
}
