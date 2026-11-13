import type { FootballGame, TackleActor } from '../lib/football/types';
import { tackleFrame } from '../lib/football/tackle-scene';
import { slim, R, type Kit } from './football-sprites';

/** Five held pixel-art poses. Outcome coordinates remain untouched. No camera
 * shake or enlarged hitboxes; two bodies visibly connect, buckle and settle. */
export function drawTackle(ctx: CanvasRenderingContext2D, g: FootballGame,
  home: Omit<Kit, 'dir'>, away: Omit<Kit, 'dir'>) {
  const s = g.tackleScene;
  if (!s) return;
  const frame = tackleFrame(s), settle = [0, .18, .5, .85, 1][frame]!;
  const dir = s.direction;
  const cx = s.carrier.x + dir * settle * 4, cy = s.carrier.y + settle * 3;
  const dx = s.defender.x + (s.carrier.x - dir * 5 - s.defender.x) * settle;
  const dy = s.defender.y + (s.carrier.y + 6 - s.defender.y) * settle;
  const pose = (a: TackleActor, x: number, y: number, carrier: boolean) => {
    const kit: Kit = { ...(a.team === 'home' ? home : away),
      dir: carrier ? dir : s.carrier.x < s.defender.x ? -1 : 1 };
    const angle = [0, .28, .78, 1.32, Math.PI / 2][frame]! * dir;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    // Blocky silhouettes rotate only at explicit keyframes, not a smooth spin.
    ctx.rotate(angle);
    slim(ctx, 0, 0, kit, { ball: carrier, crouch: frame <= 1,
      lean: frame === 0 ? (carrier ? -dir : kit.dir) : 0, hold: !carrier });
    ctx.restore();
  };
  // Follow-through overlaps at the shoulders, with the carrier's ball secured.
  pose(s.defender, dx, dy, false);
  pose(s.carrier, cx, cy, true);
  if (frame === 0) {
    const x = Math.round((cx + dx) / 2), y = Math.round((cy + dy) / 2) - 4;
    // Two short impact ticks, not a large arcade explosion.
    R(ctx, '#f1e6d0', x - 3, y - 6, 2, 2);
    R(ctx, '#f1e6d0', x + 3, y - 3, 2, 1);
    R(ctx, s.defender.team === 'home' ? home.body : away.body, x - 2, y, 4, 2);
  }
  if (frame === 3) {
    R(ctx, '#b5ae74', cx - 8, cy + 8, 2, 1);
    R(ctx, '#b5ae74', cx + 9, cy + 7, 2, 1);
  }
}
