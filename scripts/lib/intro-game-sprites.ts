import { kickFootballArt } from '../../src/game/components/kick-return-renderer';
import { PixelCanvas, C } from './intro-pixels.ts';
import type { IntroPose } from './intro-scene.ts';

/** A fill-rectangle adapter reuses the game's real sprite renderer, at 3× native texels. */
export function gamePlayer(c: PixelCanvas, pose: IntroPose, defense = false) {
  const x = defense ? pose.defenderX : pose.runnerX;
  const y = defense ? pose.defenderY : pose.runnerY;
  let tx = 0, ty = 0, fillStyle = C.ink as string;
  const stack: [number, number, string][] = [];
  const ctx = {
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    save() { stack.push([tx, ty, fillStyle]); },
    restore() { [tx, ty, fillStyle] = stack.pop()!; },
    translate(dx: number, dy: number) { tx += dx; ty += dy; },
    fillRect(u: number, v: number, w: number, h: number) {
      const color = fillStyle.startsWith('rgba') ? C.turfDark : fillStyle;
      c.rect(color, x + (u + tx) * 3, y + (v + ty) * 3, w * 3, h * 3);
    },
  } as unknown as CanvasRenderingContext2D;
  const running = defense || pose.arms === 'run' || pose.arms === 'cut';
  const step = running ? pose.gait : 0;
  const kit = {
    body: defense ? C.red : C.blue,
    trim: C.white,
    edge: defense ? C.gold : C.red,
    dir: (defense ? -1 : 1) as 1 | -1,
  };
  if (defense && pose.frame >= 76) {
    // Use the actual game's airborne diving silhouette, descending into its turf pose.
    kickFootballArt.prone(ctx, 0, 0, kit, Math.PI, Math.max(0, 4 * (1 - (pose.frame - 76) / 12)));
    return;
  }
  kickFootballArt.sprite(ctx, 0, 0, kit, step, false, running ? 0 : 1,
    defense && pose.frame >= 72 ? -2 : pose.arms === 'cut' ? -1 : 0);
  if (defense) return;

  // Hands are registered to the football itself, including every gather frame.
  if (pose.arms === 'reach' || pose.arms === 'secure') {
    const bx = pose.held ? pose.ballX : x + 26;
    const by = pose.held ? pose.ballY : y - 8;
    c.rect(C.ink, x + 6, by - 4, Math.max(3, bx - x - 3), 4);
    c.rect(C.blue, x + 7, by - 3, Math.max(2, bx - x - 5), 2);
    c.rect(C.skin, bx - 3, by - 4, 5, 2);
    c.rect(C.ink, x + 6, by + 2, Math.max(3, bx - x - 3), 4);
    c.rect(C.blue, x + 7, by + 2, Math.max(2, bx - x - 5), 2);
    c.rect(C.skin, bx - 3, by + 2, 5, 2);
  } else {
    c.rect(C.skin, pose.ballX - 2, pose.ballY + 2, 5, 2);
  }
}
