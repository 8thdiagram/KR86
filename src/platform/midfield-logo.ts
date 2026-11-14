import type { FootballGame } from '../game/lib/football/types';

let logo: HTMLImageElement | undefined;
function logoImage() {
  if (!logo && typeof Image !== 'undefined') {
    logo = new Image();
    logo.src = new URL('./assets/midfield-86-turf.png', import.meta.url).href;
  }
  return logo;
}

export function hasRegularSeasonLogo(g: FootballGame) {
  return !!g.franchise && !g.franchise.playoff;
}

/** Field paint in world coordinates, drawn beneath athletes and the ball. */
export function drawRegularSeasonMidfield(
  ctx: CanvasRenderingContext2D, g: FootballGame, source?: HTMLImageElement,
) {
  if (!hasRegularSeasonLogo(g)) return;
  const image = source ?? logoImage();
  if (!image?.complete || !image.naturalWidth) return;
  const height = 60, width = height * image.naturalWidth / image.naturalHeight;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 600 - width / 2, 96 - height / 2, width, height);
  ctx.restore();
}
