import { isKickContact } from '../kick-return-engine';
import { canTackle } from './defensive-action';
import { other, type Athlete, type FootballGame, type Side, type TackleActor, type TackleScene } from './types';

export const TACKLE_TIMING = { impact: .09, fall: .27, groundHold: .7 } as const;
type Body = { id: number; x: number; y: number; vx?: number; vy?: number };
/** Freeze the real contact pair, not a random nearby defender. */
export function beginTackle(g: FootballGame, carrier: Body, defender: Body,
  team: Side, space: TackleScene['space']) {
  if (g.tackleScene) return;
  const actor = (a: Body, team: Side): TackleActor => ({
    id: a.id, x: a.x, y: a.y, vx: a.vx ?? 0, vy: a.vy ?? 0, team,
  });
  g.tackleScene = { space, phase: 'impact', elapsed: 0, holdRemaining: 0,
    carrier: actor(carrier, team), defender: actor(defender, other(team)),
    direction: (carrier.vx ?? 0) < -1 ? -1 : 1 };
  g.playClockRunning = false;
}
export function captureFieldTackle(g: FootballGame) {
  const l = g.live!, c = l.athletes[l.carrier]!;
  if (l.loose) return; // An automatic fumble recovery is not a fresh collision.
  const d = l.athletes.filter(a => a.side !== c.side && a.engaged <= l.time && canTackle(a) && isKickContact(c, a))
    .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y) || a.id - b.id)[0];
  if (d) beginTackle(g, c, d, l.offense ?? g.possession, 'scrimmage');
}
export function captureReturnTackle(g: FootballGame) {
  const a = g.returnAttempt;
  if (!a || a.phase !== 'tackled' || a.endReason === 'out-of-bounds') return;
  const d = a.defenders.filter(d => !['grounded', 'recovering'].includes(d.dive?.phase ?? '') && isKickContact(a.player, d))
    .sort((d, e) => Math.hypot(d.x - a.player.x, d.y - a.player.y) - Math.hypot(e.x - a.player.x, e.y - a.player.y) || d.id - e.id)[0];
  if (!d) return;
  const s = g.special;
  const runner = s?.athletes[s.returner] ?? { ...a.player, id: -1, vx: a.moves?.vx ?? 73, vy: 0 };
  const defender = s?.athletes[d.id] ?? { ...d, vx: d.motion?.vx ?? -d.speed, vy: d.motion?.vy ?? 0 };
  beginTackle(g, runner, defender, s?.returnSide ?? s?.receiver ?? g.kickReceiver, s ? 'special' : 'legacy-return');
}
/** Wall-time presentation. The 0.7-second downed hold starts ONLY after all falling
 * frames finish. Large deltas split at boundaries; pause simply never calls this.
 */
export function stepTackleScene(scene: TackleScene, elapsed: number, holdEnabled = true) {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Invalid tackle elapsed time');
  let left = elapsed;
  while (left > 1e-10) {
    if (scene.phase === 'ground') {
      if (!holdEnabled) return false;
      const used = Math.min(left, scene.holdRemaining);
      scene.holdRemaining = Math.max(0, scene.holdRemaining - used);
      return scene.holdRemaining < 1e-9;
    }
    const duration = scene.phase === 'impact' ? TACKLE_TIMING.impact : TACKLE_TIMING.fall;
    const used = Math.min(left, duration - scene.elapsed);
    scene.elapsed += used; left -= used;
    if (scene.elapsed + 1e-9 >= duration) {
      scene.elapsed = 0;
      if (scene.phase === 'impact') scene.phase = 'fall';
      else { scene.phase = 'ground'; scene.holdRemaining = TACKLE_TIMING.groundHold; }
    }
  }
  return scene.phase === 'ground' && scene.holdRemaining < 1e-9;
}
/** Discrete retro key poses: contact → buckle → descend → land → settled. */
export function tackleFrame(s: TackleScene): 0 | 1 | 2 | 3 | 4 {
  return s.phase === 'impact' ? 0 : s.phase === 'ground' ? 4
    : s.elapsed < .09 ? 1 : s.elapsed < .18 ? 2 : 3;
}
export const isTackleActor = (g: FootballGame, a: Pick<Athlete, 'id'>, space: TackleScene['space']) =>
  g.tackleScene?.space === space && [g.tackleScene.carrier.id, g.tackleScene.defender.id].includes(a.id);
