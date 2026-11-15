import type { FootballGame, TackleActor } from '../lib/football/types';
import { tackleFrame } from '../lib/football/tackle-scene';
import { slim, heldBall, R, type Kit } from './football-sprites';
import { kickFootballArt } from './kick-return-renderer';
import { drawPixelEnlarged } from './football-pixel-scale';
import { positionKit, specialSkinPosition, classicSkinPosition, type SkinPosition } from './football-art';

/** Read the same roster duty used before contact; do not store cosmetic state in saves. */
export function tackleSkinPosition(g: FootballGame, actor: TackleActor): SkinPosition {
  if (g.tackleScene?.space === 'scrimmage') {
    const athlete = g.live?.athletes.find(a => a.id === actor.id);
    if (athlete) return athlete.role;
  } else if (g.tackleScene?.space === 'special') {
    const athlete = g.special?.athletes.find(a => a.id === actor.id);
    if (g.special && athlete) return specialSkinPosition(g.special, athlete);
  } else {
    if (actor.id === g.tackleScene?.carrier.id) return 'KR';
    const defender = g.returnAttempt?.defenders.find(a => a.id === actor.id);
    if (defender) return classicSkinPosition(defender);
  }
  return actor.id === g.tackleScene?.carrier.id ? 'RB' : 'DL';
}

/** Five held pixel-art poses. Outcome coordinates remain untouched. No camera
 * shake or enlarged hitboxes; two bodies visibly connect, buckle and settle. */
export function drawTackle(ctx: CanvasRenderingContext2D, g: FootballGame,
  home: Omit<Kit, 'dir'>, away: Omit<Kit, 'dir'>) {
  const s = g.tackleScene;
  if (!s) return;
  const frame = tackleFrame(s), settle = [0, .18, .5, .85, 1][frame]!;
  const dir = s.direction;
  const carrierFumbled = g.live?.loose?.lostBy === s.carrier.id || g.special?.loose?.lostBy === s.carrier.id;
  const cx = s.carrier.x + dir * settle * 4, cy = s.carrier.y + settle * 3;
  const dx = s.defender.x + (s.carrier.x - dir * 5 - s.defender.x) * settle;
  const dy = s.defender.y + (s.carrier.y + 6 - s.defender.y) * settle;
  const pose = (a: TackleActor, x: number, y: number, carrier: boolean) => {
    const kit: Kit = positionKit({ ...(a.team === 'home' ? home : away),
      dir: carrier ? dir : s.carrier.x < s.defender.x ? -1 : 1 }, tackleSkinPosition(g, a));
    if (frame <= 1) {
      slim(ctx, x, y, kit, { ball: carrier && !carrierFumbled, crouch: frame === 1,
        lean: frame === 0 ? (carrier ? -dir : kit.dir) : 0, hold: !carrier,
        view: frame === 1 ? (carrier ? 5 : 6) : undefined });
      return;
    }
    // Contact keyframes descend into custom horizontal anatomy; no whole-sprite
    // rotation or smoothed transform, and the shared turf pose keeps pixel scale.
    const lift = frame === 2 ? 2 : 0;
    kickFootballArt.prone(ctx, Math.round(x), Math.round(y) + 1, kit,
      dir > 0 ? 0 : Math.PI, lift, frame === 2 ? 1 : 0, carrier && !carrierFumbled);
  };
  // On the final two frames the tackler is layered above the carrier at contact.
  if (frame >= 3) {
    pose(s.carrier, cx, cy, true);
    pose(s.defender, dx, dy, false);
  } else {
    pose(s.defender, dx, dy, false);
    pose(s.carrier, cx, cy, true);
  }
  if (frame >= 3 && !carrierFumbled) {
    // Keep the secured football and outside forearm in the foreground when
    // the slightly larger tackler overlaps the carrier's prone silhouette.
    drawPixelEnlarged(ctx, Math.round(cx), Math.round(cy) + 1, (pixels, x, y) => {
      heldBall(pixels, dir > 0 ? x - 1 : x - 7, y - 1);
      const arm = x + (dir > 0 ? 3 : -5);
      R(pixels, s.carrier.team === 'home' ? home.body : away.body, arm, y - 1, 2, 1);
      R(pixels, '#10213a', arm, y, 2, 1);
    });
  }
}
