import { helmetColor, playerSkin, UNIFORM, type FootballKit } from './football-art';
import { tone } from './football-deluxe-art';

type View = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type Options = {
  view?: View;
  step?: number;
  lean?: number;
  crouch?: boolean;
  engaged?: boolean;
  hold?: boolean;
  kick?: number;
};

const INK = UNIFORM.ink;

/** Half-world-unit authored clusters resolve as single pixels on the doubled canvas. */
export function drawFootballPlayer(ctx: CanvasRenderingContext2D, x: number, y: number,
  kit: FootballKit, options: Options = {}) {
  const cx = Math.round(x), ground = Math.round(y), view = options.view ?? 0;
  const phase = options.step ?? 0;
  const stride = Math.sin(phase * Math.PI / 2);
  const lean = options.lean ?? 0;
  const braced = !!options.crouch || !!options.engaged;
  const side = view === 2;
  const back = view === 4 || view === 8;
  const diagonal = view === 1 || view === 3 || view >= 5;
  const narrow = side || view === 1 || view === 3;
  const width = side ? 5 : narrow ? 7 : diagonal ? 8 : 9;
  // Rear-quarter shoulders trail the head; the far diagonal leads it.
  // These are distinct body silhouettes, not duplicate frames with new labels.
  const shoulderTurn = view === 3 || view === 7 ? -.5 * kit.dir : view === 6 ? .5 * kit.dir : 0;
  const left = cx - width / 2 + lean + shoulderTurn;
  const jersey = kit.body;
  const shell = helmetColor(kit);
  const skin = playerSkin(kit);
  const put = (color: string, px: number, py: number, w: number, h: number) => {
    ctx.fillStyle = color;
    const snap = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);
    const left = Math.round(px * 2) / 2, top = Math.round(py * 2) / 2;
    ctx.fillRect(left, top, snap(w), snap(h));
  };
  // Fine connected limb contours, including the cocked and extended kicking
  // leg. Moving only the calf would detach it from the hip in follow-through.
  const segment = (color: string, ax: number, ay: number, bx: number, by: number, width: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      put(color, ax + (bx - ax) * t - width / 2, ay + (by - ay) * t, width, .5);
    }
  };

  // Long, separated legs: white thigh masses, visible offset knees, and calves
  // that reach the same cleat/ground line in every upright and turn view.
  const legY = ground - 0.5;
  const legSpread = side ? 1.1 : diagonal ? 1.65 : 2;
  const swing = braced ? 0 : stride * 1.1;
  const kick = options.kick === undefined ? undefined : Math.max(0, Math.min(1, options.kick));
  const kickTravel = kick === undefined ? 0 : (kick * 2 - 1) * 3.5 * kit.dir;
  const kickLift = kick === undefined ? 0 : Math.sin(kick * Math.PI) * 1.5 + Math.max(0, kick - 0.5) * 2;
  const legs = [
    { x: cx - legSpread - swing, bend: -0.5 + swing * 0.5, swingLeg: false },
    { x: cx + legSpread + swing, bend: 0.5 - swing * 0.5, swingLeg: true },
  ];
  for (const leg of legs) {
    const tx = leg.x;
    const legOffsetY = leg.swingLeg ? kickLift : 0;
    const travel = leg.swingLeg ? kickTravel : 0;
    const kneeX = tx + leg.bend + travel * .55, kneeY = legY + 2 - legOffsetY * .5;
    const ankleX = tx + leg.bend + travel, ankleY = ground + 4 - legOffsetY;
    const pants = leg.swingLeg ? UNIFORM.pants : UNIFORM.pantsShade;
    segment(INK, tx + .5, legY, kneeX + .5, kneeY, 2.5);
    segment(INK, kneeX + .5, kneeY, ankleX + .5, ankleY, 2);
    segment(pants, tx + .5, legY, kneeX + .5, kneeY, 1.5);
    segment(pants, kneeX + .5, kneeY, ankleX + .5, ankleY, 1);
    const toe = ankleX + (kit.dir > 0 ? 0.25 : -1);
    const footY = ground + 4.5 - legOffsetY;
    put(INK, toe - 0.5, footY, 2.5, 0.5);
    put(tone(INK, 1.24), toe + (kit.dir > 0 ? 0.5 : 1), footY, 1, 0.5);
  }

  // Neckline gap makes the helmet a separate piece rather than a jersey crown.
  put(INK, cx - 1.5 + lean, ground - 6.5, 3, 1);
  put(skin, cx - 0.5 + lean, ground - 6.5, 1.5, 0.5);

  // Arm silhouettes sit behind the single-color jersey, with elbow breaks.
  const armPhase = options.hold ? -1.5 : options.engaged ? -0.75 : braced ? 0 : stride * 0.7;
  const arms = [
    { x: left - 1, y: ground - 5 + armPhase, hand: left - 1.5 },
    { x: left + width - 1, y: ground - 5 - armPhase, hand: left + width + 0.5 },
  ];
  for (const arm of arms) {
    put(INK, arm.x - 0.5, arm.y, 2.5, 3);
    put(jersey, arm.x, arm.y + 0.25, 1.5, 2.25);
    put(INK, arm.x + (arm.x < cx ? 0.5 : 1), arm.y + 2.5, 1.75, 1.5);
    put(jersey, arm.x + (arm.x < cx ? 0.75 : 1), arm.y + 2.5, 1, 1);
    put(skin, arm.hand, arm.y + 3.5, 1.5, 1);
  }

  // Shoulder caps and torso share exactly the primary team color: no yoke,
  // trim stripes, number blocks, or multicolor jersey highlights.
  const top = ground - (options.crouch ? 5.5 : options.engaged ? 6 : 6.5);
  put(INK, left + 1, top - 0.5, width - 2, 0.5);
  put(INK, left + 0.5, top, width - 1, 0.5);
  put(INK, left + 0.25, top + 0.5, width - 0.5, 1);
  put(jersey, left + 1.5, top - 0.5, width - 3, 0.5);
  put(jersey, left + 1, top, width - 2, 0.5);
  put(jersey, left + 0.75, top + 0.5, width - 1.5, 1);
  put(INK, left + 0.75, top + 1.5, width - 1.5, 5.5);
  put(jersey, left + 1, top + 1.5, width - 2, 5);
  // Waist is intentionally high; it exposes the length and knee articulation.
  put(INK, cx - (side ? 1 : 2) + lean, ground, side ? 2 : 4, 0.75);
  put(UNIFORM.pants, cx - (side ? 0.5 : 1.5) + lean, ground, side ? 1 : 3, 0.5);

  // Re-open the small skin neckline after the shoulders overlap the torso.
  put(INK, cx - 1.5 + lean, ground - 7, 3, 0.5);
  put(skin, cx - 0.5 + lean, ground - 7, 1.5, 0.5);

  // Shell is secondary-color, with a fine outside contour and matching cage.
  const headY = ground - 12;
  const headW = side ? 5.5 : narrow ? 6 : 6.5;
  const headX = cx - headW / 2 + (kit.dir > 0 ? 0.35 : -0.35);
  put(INK, headX + 1, headY - 0.5, headW - 2, 0.5);
  put(INK, headX + 0.5, headY, headW - 1, 4);
  put(INK, headX + 1, headY + 4, headW - 2, 0.5);
  put(shell, headX + 1, headY, headW - 2, 0.5);
  put(shell, headX + 0.5, headY + 0.5, headW - 1, 3);
  put(shell, headX + 1, headY + 3.5, headW - 2, 0.5);
  // Back view gets no face; every other view has a stable, small skin slit.
  if (!back) {
    const faceX = kit.dir > 0 ? headX + headW - 2 : headX + 0.5;
    put(skin, faceX, headY + 2, 1.5, 1);
    put(shell, faceX - 0.5, headY + 1.5, 0.5, 2);
    put(shell, faceX + 1.5, headY + 1.5, 0.5, 2);
    put(shell, faceX - 0.5, headY + 3, 3, 0.5);
  } else {
    put(shell, cx - 1, headY + 2, 2, 0.5);
  }
}
