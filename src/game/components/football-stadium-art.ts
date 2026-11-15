import { kickMatchupTeams, type KickMatchup } from '../lib/kick-return-teams';
import { SKIN_TONES } from './football-art';
import { tone } from './football-deluxe-art';

const INK = '#10192b';
const DEEP_BLUE = '#17295c';
const BLUE_LIGHT = '#29447a';
const CONCRETE = '#9aa8a3';
const ORANGE = '#ed7624';
const R = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, w, h);
};

function hash(n: number) {
  let h = Math.imul(n ^ 0x45d9f3b, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Pixel crowd and compact sideline fixtures, authored entirely in the Y0..16
 * apron. The caller's existing world transform keeps the stands world-anchored.
 */
export function drawBroadcastStadium(
  ctx: CanvasRenderingContext2D,
  left: number,
  right: number,
  matchup?: KickMatchup,
  cheering = false,
  seconds = 0,
) {
  const teams = kickMatchupTeams(matchup);
  const home = teams.player, away = teams.opponent;
  const shirts = [home.body, home.trim, away.body, away.trim, home.body, away.body, '#d8d6c6'];
  const start = Math.floor(left / 6) * 6;
  const end = Math.ceil(right / 6) * 6;

  R(ctx, INK, left, 0, right - left, 16);
  R(ctx, '#172039', left, 0, right - left, 1);
  R(ctx, '#202d4a', left, 5, right - left, 1);
  R(ctx, '#172039', left, 11, right - left, 2);

  // Compact, individually shaded spectators: head silhouettes, necks,
  // team-color shoulder blocks and changing arm poses fill the broadcast stand.
  for (let row = 0; row < 2; row++) {
    const headY = row === 0 ? 1 : 7;
    for (let x = start; x <= end; x += 6) {
      const index = Math.floor(x / 6);
      const seed = hash(index * 37 + row * 173);
      if (seed % 19 === 0) continue;
      const skin = SKIN_TONES[(seed >>> 5) % SKIN_TONES.length]!;
      const shirt = shirts[(seed >>> 10) % shirts.length]!;
      const raised = cheering && ((index + Math.floor(seconds * 2) + row) % 6 === 0);
      const shirtY = headY + 2;
      // Stepped hair/head outline, lit cheek, collar, torso and sleeves.
      R(ctx, INK, x - 1, headY, 4, 2);
      R(ctx, INK, x, headY - .5, 2, .5);
      R(ctx, skin, x, headY, 2, 2);
      R(ctx, tone(skin, 1.12), x, headY, 1, 1);
      R(ctx, tone(skin, .72), x + 1.5, headY + 1, .5, 1);
      R(ctx, INK, x, headY + 2, 2, 1);
      R(ctx, INK, x - 2, shirtY, 6, 3);
      R(ctx, shirt, x - 1, shirtY, 4, 2);
      R(ctx, tone(shirt, 1.2), x - .5, shirtY, 2, .5);
      R(ctx, tone(shirt, .68), x + 2, shirtY + 1, 1, 1);
      R(ctx, tone(home.trim, .84), x, shirtY, 1, .5);
      if (raised) {
        R(ctx, shirt, x - 2, headY, 1, 2);
        R(ctx, skin, x - 2, headY - 1, 1, 1);
        R(ctx, shirt, x + 4, headY, 1, 2);
        R(ctx, skin, x + 4, headY - 1, 1, 1);
      } else {
        R(ctx, shirt, x - 2, shirtY + .5, 1, 2);
        R(ctx, shirt, x + 4, shirtY + .5, 1, 2);
      }
    }
  }

  // Deep-blue rail and concrete cap sit wholly above the existing sideline.
  R(ctx, DEEP_BLUE, left, 13, right - left, 3);
  R(ctx, BLUE_LIGHT, left, 13, right - left, 1);
  R(ctx, CONCRETE, left, 15, right - left, 1);
  for (let x = Math.floor(left / 48) * 48; x < right; x += 48) {
    R(ctx, '#101e43', x, 13, 2, 2);
    R(ctx, '#314b78', x + 2, 14, 1, 1);
  }

  // A few small, periodic game-day details, all confined to the apron.
  const firstFixture = Math.floor(left / 144) * 144;
  for (let x = firstFixture; x < right; x += 144) {
    const markerX = x + 72;
    // Chain crew post with a compact orange top marker.
    R(ctx, '#151b27', markerX, 9, 2, 6);
    R(ctx, ORANGE, markerX - 2, 9, 6, 2);
    R(ctx, '#ffd27c', markerX - 1, 9, 2, 1);
    // One small chain-crew figure in front of the barrier.
    R(ctx, INK, markerX + 7, 9, 3, 3);
    R(ctx, SKIN_TONES[2], markerX + 8, 10, 1, 1);
    R(ctx, '#faf8ef', markerX + 7, 12, 3, 2);
    R(ctx, home.body, markerX + 8, 12, 1, 2);
    R(ctx, INK, markerX + 7, 14, 1, 2);
    R(ctx, INK, markerX + 9, 14, 1, 2);
    // Low sideline bench and a small team-color cooler.
    const benchX = x + 98;
    R(ctx, INK, benchX, 11, 18, 1);
    R(ctx, '#d2d8cf', benchX + 1, 10, 16, 1);
    R(ctx, DEEP_BLUE, benchX + 2, 11, 14, 2);
    R(ctx, tone(home.body, .82), benchX + 3, 11, 12, 1);
    R(ctx, '#b7c0b9', benchX + 3, 13, 1, 2);
    R(ctx, '#b7c0b9', benchX + 14, 13, 1, 2);
    const coolerX = x + 121;
    R(ctx, INK, coolerX, 11, 7, 5);
    R(ctx, away.trim, coolerX + 1, 11, 5, 3);
    R(ctx, tone(away.trim, .72), coolerX + 1, 14, 5, 1);
    R(ctx, '#d9e2dc', coolerX + 2, 10, 3, 1);
    R(ctx, INK, x + 132, 11, 5, 5);
    R(ctx, '#e6e6d9', x + 133, 10, 3, 1);
    R(ctx, away.body, x + 133, 11, 3, 3);
    R(ctx, tone(away.body, .72), x + 134, 14, 1, 1);
  }
}
