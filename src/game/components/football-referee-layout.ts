import type { KickViewport } from '../lib/kick-return-viewport';
import { KR } from '../lib/kick-return-engine';

export const REFEREE_WORLD_Y = 185;

/** Presentation only. Lift the official a little in landscape, and enough to
 * retain his feet when HUD clearance consumes the lower referee apron. */
export function refereeRenderY(view: KickViewport | undefined, scale: number, offsetY: number) {
  if (!view?.landscape) return REFEREE_WORLD_Y;
  const visibleBottom = ((view.height ?? KR.height) - offsetY) / scale;
  return Math.min(179, Math.floor(visibleBottom) - 7);
}
