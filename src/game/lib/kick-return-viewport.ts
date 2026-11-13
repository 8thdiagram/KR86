import { KR } from './kick-return-engine';

export type KickViewport = {
  width: number;
  height?: number;
  worldScale?: number;
  landscape?: boolean;
  /** Optional overlaid scoreboard clearance, in canvas pixels. Classic omits it. */
  topClearance?: number;
};

/** Keep the normal scale unless shifting down would crop the NEAR playing
 * stripe. Prefer cropping the referee apron, not shrinking the playing field. */
export function fieldViewportFrame(view?: KickViewport) {
  const height = Math.max(1, view?.height ?? KR.height);
  const normalScale = height / KR.height;
  const clearance = Math.max(0, Math.min(height - 1, view?.topClearance ?? 0));
  // Far stripe starts at world Y=16, near stripe ends at Y=176.
  const scale = Math.min(normalScale, (height - clearance) / 160);
  return { scale, offsetY: Math.max(0, clearance - 16 * scale) };
}

/** Only reserve space when the scoreboard actually overlays the playfield. */
export function footballHudClearance(stage: HTMLElement, hud: HTMLElement | null) {
  if (!hud) return 0;
  const field = stage.getBoundingClientRect(), score = hud.getBoundingClientRect();
  const top = field.top + stage.clientTop;
  return score.bottom > top && score.top < field.bottom
    ? Math.max(0, score.bottom - top + 4) : 0;
}

/** Presentation only: both sidelines fit at every viewport size. */
export function kickViewport(
  width: number, height: number, viewportWidth: number, viewportHeight: number,
): KickViewport {
  const landscape = viewportWidth / viewportHeight >= 1.5;
  if (!landscape) return { width: Math.max(1, Math.round(KR.height * width / height)) };
  const pixelHeight = Math.max(1, Math.round(height));
  return {
    width: Math.max(1, Math.round(width)), height: pixelHeight,
    worldScale: pixelHeight / KR.height, landscape: true,
  };
}
