import { useEffect, useMemo, useRef } from 'react';
import { drawKickReturn } from '../game/components/kick-return-renderer';
import { measureSpin, type SpinTrace } from './spin-verification';

const point = (p: { x: number; y: number }) => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;

function SpinReplay({ trace }: { trace: SpinTrace }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const view = structuredClone(trace.frames[0]);
    let frame = 0, start = 0;
    function paint(now: number) {
      if (!start) start = now;
      // Real 60Hz simulation samples, with a pause only between repeats.
      const age = (now - start) % 1800;
      const index = Math.min(trace.frames.length - 1, Math.floor(age / (1000 / 60)));
      Object.assign(view, trace.frames[index]);
      drawKickReturn(ctx!, view);
      frame = requestAnimationFrame(paint);
    }
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [trace]);
  return <article style={{ minWidth: 0, border: '1px solid #627992', padding: 12 }}>
    <h3>Defender {trace.side === -1 ? 'right' : 'left'} → juke {trace.side === -1 ? 'left' : 'right'}</h3>
    <canvas ref={canvas} width={320} height={192}
      aria-label={`Actual engine spin ${trace.side}`} style={{ width: '100%', imageRendering: 'pixelated' }} />
    <dl style={{ font: '13px/1.7 monospace', overflowWrap: 'anywhere' }} data-testid={`spin-proof-${trace.side}`}>
      <dt>Already-running start</dt><dd>{point(trace.original)}</dd>
      <dt>Selected move</dt><dd>{trace.selected}</dd>
      <dt>Intended / actual lateral distance</dt><dd>{trace.intended.toFixed(2)} / {trace.actual.toFixed(2)}</dd>
      <dt>After 0.25 seconds</dt><dd>{point(trace.final)}</dd>
      <dt>After normal running resumes</dt><dd>{point(trace.resumed)}</dd>
    </dl>
  </article>;
}

export function SpinMovementVerification() {
  const traces = useMemo(() => [measureSpin(-1), measureSpin(1)], []);
  return <section style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
    <h2>Actual movement verification</h2>
    <p>These replays use the game’s controls, movement solver and renderer. The figures are world coordinates, not screen offsets.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
      {traces.map(trace => <SpinReplay key={trace.side} trace={trace} />)}
    </div>
    <a href="/" style={{ color: '#ffe260' }}>Back to the game</a>
  </section>;
}
