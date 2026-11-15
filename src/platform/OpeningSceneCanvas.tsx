import { useEffect, useRef, useState } from 'react';
import openingArtwork from './assets/super-cup-opening.webp';
import { OPENING_DURATION_MS, OPENING_MARK_START_MS, OPENING_SCENE_START_MS, renderOpeningScene } from './opening-scene';

type Props = {
  startedAt: number;
  reducedMotion: boolean;
};

export function OpeningSceneCanvas({ startedAt, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [artFailed, setArtFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    canvas.width = 640;
    canvas.height = 640;
    const artwork = new Image();
    artwork.decoding = 'async';
    let mounted = true;
    let frameId: number | null = null;
    const reducedTimers: number[] = [];
    const drawAt = (now: number) => {
      const elapsed = Math.min(OPENING_DURATION_MS, Math.max(0, now - startedAt));
      const staticSceneAt = OPENING_SCENE_START_MS + 1000;
      const frameTime = reducedMotion && elapsed >= OPENING_SCENE_START_MS ? staticSceneAt : elapsed;
      renderOpeningScene(context, canvas.width, canvas.height, frameTime,
        artwork.complete && artwork.naturalWidth > 0 ? artwork : undefined);
    };
    artwork.onload = () => { if (mounted) drawAt(performance.now()); };
    artwork.onerror = () => {
      if (!mounted) return;
      setArtFailed(true);
      drawAt(performance.now());
    };
    artwork.src = openingArtwork;
    drawAt(performance.now());
    if (reducedMotion) {
      for (const boundary of [OPENING_MARK_START_MS, OPENING_SCENE_START_MS]) {
        const delay = Math.max(0, startedAt + boundary - performance.now());
        reducedTimers.push(window.setTimeout(() => drawAt(performance.now()), delay));
      }
    } else {
      const animate = (now: number) => {
        if (!mounted) return;
        drawAt(now);
        if (now - startedAt < OPENING_DURATION_MS) frameId = window.requestAnimationFrame(animate);
      };
      frameId = window.requestAnimationFrame(animate);
    }
    return () => {
      mounted = false;
      artwork.onload = null;
      artwork.onerror = null;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      reducedTimers.forEach(window.clearTimeout);
    };
  }, [startedAt, reducedMotion]);

  return <>
    <canvas ref={canvasRef} className="kr-opening-canvas" role="img"
      aria-label="KR ’86 chrome title over a low-poly Super Cup stadium, with a football runner carrying the ball." />
    {artFailed && <p className="kr-opening-error" role="status">OPENING ARTWORK UNAVAILABLE</p>}
  </>;
}
