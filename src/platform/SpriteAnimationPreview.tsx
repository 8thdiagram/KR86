import { useEffect, useRef } from 'react';
import { positionKit, uniformKit } from '../game/components/football-art';
import { drawFootballPlayer, type FootballPlayerOptions } from '../game/components/football-player-art';
import { updateFootballAnimation } from '../game/components/football-animation-clock';

type Demo = Readonly<{
  id: string;
  label: string;
  note: string;
  vx: number;
  vy: number;
  facing: 1 | -1;
  fallbackView: 0 | 2 | 4;
}>;

const DEMOS: readonly Demo[] = [
  { id: 'standing', label: 'Standing', note: 'feet planted', vx: 0, vy: 0, facing: 1, fallbackView: 0 },
  { id: 'left', label: 'Running left', note: 'side-on stride', vx: -34, vy: 0, facing: -1, fallbackView: 2 },
  { id: 'right', label: 'Running right', note: 'side-on stride', vx: 34, vy: 0, facing: 1, fallbackView: 2 },
  { id: 'near', label: 'Near sideline', note: 'lateral step', vx: 0, vy: 34, facing: 1, fallbackView: 0 },
  { id: 'far', label: 'Far sideline', note: 'far sideline movement', vx: 0, vy: -34, facing: 1, fallbackView: 4 },
];
const RUN_POSE_LABELS = ['LEFT REACH', 'PASS → RIGHT', 'RIGHT REACH', 'PASS → LEFT'] as const;

const kitFor = (facing: 1 | -1) => positionKit(
  uniformKit({ body: '#bd3036', trim: '#e7bb57' }, facing),
  'RB',
);

/** In-game player painter and its render-only motion clock, isolated for review. */
export default function SpriteAnimationPreview() {
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});

  useEffect(() => {
    const owner = {};
    const startPositions = new Map(DEMOS.map((demo, index) => [
      demo.id, { x: 180 + index * 31, y: 96 + index * 9 },
    ]));
    let startAt: number | undefined;
    let raf = 0;

    const draw = (timestamp: number) => {
      if (startAt === undefined) startAt = timestamp;
      const elapsed = Math.max(0, (timestamp - startAt) / 1000);
      for (const demo of DEMOS) {
        const canvas = canvases.current[demo.id];
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) continue;
        const origin = startPositions.get(demo.id)!;
        const cadence = updateFootballAnimation(owner, demo.id, {
          now: elapsed,
          x: origin.x + demo.vx * elapsed,
          y: origin.y + demo.vy * elapsed,
          vx: demo.vx,
          vy: demo.vy,
          facing: demo.facing,
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        const kit = kitFor(demo.facing);
        const options: FootballPlayerOptions = {
          action: cadence.moving ? 'run' : 'idle',
          step: cadence.step,
          locomotionStep: cadence.moving ? Math.floor(cadence.phase * 4) % 4 : undefined,
          locomotionGait: cadence.shuffling ? 'strafe' : 'run',
          view: cadence.view ?? demo.fallbackView,
          ball: true,
        };
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        drawFootballPlayer(ctx, 25, 42, kit, options);
        ctx.setTransform(2.2, 0, 0, 2.2, 80, 0);
        drawFootballPlayer(ctx, 18, 34, kit, options);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#e0c76f';
        ctx.font = '8px ui-monospace, monospace';
        const poseIndex = cadence.moving ? Math.floor(cadence.phase * 4) % 4 : 0;
        const poseLabel = !cadence.moving ? 'PLANTED'
          : demo.id === 'near' || demo.id === 'far' ? `LATERAL ${poseIndex + 1}/4`
            : RUN_POSE_LABELS[poseIndex];
        ctx.fillText(poseLabel, 88, 95);
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section aria-label="Kick Return ’86 sprite animation diagnostics" style={{
      boxSizing: 'border-box', padding: 16, color: '#dce5e5', background: '#142026',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    }}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0, color: '#f1d680', fontSize: 16, fontWeight: 700 }}>
          PLAYER ANIMATION / LIVE RASTER CHECK
        </h1>
        <p style={{ margin: '5px 0 0', color: '#aababb', fontSize: 11 }}>
          Shared game renderer + motion clock · four-pose cycle 0.56–0.68s
        </p>
      </header>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
        gap: 8,
        alignItems: 'start',
      }}>
        {DEMOS.map((demo) => (
          <article key={demo.id} style={{
            overflow: 'hidden',
            border: '1px solid #35464b',
            borderRadius: 4,
            background: '#1d2b31',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              gap: 8, padding: '8px 9px 0',
            }}>
              <h2 style={{
                margin: 0, color: '#f1d680', fontSize: 11, fontWeight: 700,
              }}>
                {demo.label}
              </h2>
              <span style={{
                color: '#b0c2c2', fontSize: 9,
              }}>
                {demo.id === 'standing' ? 'PLANTED' : demo.id === 'near' || demo.id === 'far' ? 'STRAFE' : 'RUN'}
              </span>
            </div>
            <canvas
              ref={(node) => { canvases.current[demo.id] = node; }}
              width={190}
              height={100}
              aria-label={`${demo.label} player animation`}
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                aspectRatio: '19 / 10',
                imageRendering: 'pixelated',
              }}
            />
            <p style={{
              margin: 0, padding: '0 9px 8px', color: '#9eaeaf', fontSize: 9,
            }}>
              {demo.note} · 1× + 2.2×
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
