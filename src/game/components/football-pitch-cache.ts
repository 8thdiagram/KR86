import { KR } from '../lib/kick-return-engine';
import { FOOTBALL_PIXEL_DENSITY } from './football-resolution';

/** Only permanent paint is cached. Fans, logos, players and effects stay live.
 * Two full-resolution pitches cover both quarter orientations without growing
 * memory across a Franchise season. No pixels are read back from the GPU. */
const pitches = new Map<string, HTMLCanvasElement>();
export const FOOTBALL_PITCH_CACHE_LIMIT = 2;
export function drawCachedFootballPitch(
  ctx: CanvasRenderingContext2D, key: string, paint: (native: CanvasRenderingContext2D) => void,
): boolean {
  let surface = pitches.get(key);
  if (!surface) {
    if (typeof document === 'undefined') return false;
    surface = document.createElement('canvas');
    surface.width = KR.worldWidth * FOOTBALL_PIXEL_DENSITY;
    surface.height = KR.height * FOOTBALL_PIXEL_DENSITY;
    const native = surface.getContext('2d');
    if (!native) return false;
    native.imageSmoothingEnabled = false;
    native.setTransform(FOOTBALL_PIXEL_DENSITY, 0, 0, FOOTBALL_PIXEL_DENSITY, 0, 0);
    paint(native);
    pitches.set(key, surface);
    if (pitches.size > FOOTBALL_PITCH_CACHE_LIMIT) pitches.delete(pitches.keys().next().value!);
  } else {
    pitches.delete(key); pitches.set(key, surface);
  }
  ctx.drawImage(surface, 0, 0, surface.width, surface.height, 0, 0, KR.worldWidth, KR.height);
  return true;
}
