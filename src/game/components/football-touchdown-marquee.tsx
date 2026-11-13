import { TD_W, TD_H, TD_COLORS as c, touchdownGlyphDots } from './football-touchdown-art';
import './football-touchdown-marquee.css';

const GLYPHS = touchdownGlyphDots();

export function FootballTouchdownMarquee({ label = 'TOUCHDOWN!' }: { label?: string }) {
  const detail = label.replace(/touchdown!?/i, '').replace(/^[\s\-–—:·|]+|[\s\-–—:·|]+$/g, '').trim();
  return (
    <div className="fbtd" data-testid="graphic-touchdown">
      <svg className="fbtd-svg" viewBox={`0 0 ${TD_W} ${TD_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
        <rect width={TD_W} height={TD_H} fill={c.frame} />
        <rect x={3} y={3} width={TD_W - 6} height={TD_H - 6} fill={c.rim} />
        <rect x={6} y={6} width={TD_W - 12} height={TD_H - 12} fill={c.panel} />
        <rect x={14} y={14} width={TD_W - 28} height={TD_H - 28} fill={c.frame} />
        <g className="fbtd-word">
          {GLYPHS.map((d, i) => <rect key={`g${i}`} x={d.x - 3.5} y={d.y - 3.5} width={7} height={7} fill={c.glow} />)}
          {GLYPHS.map((d, i) => (
            <g key={i}>
              <rect x={d.x - 2.5} y={d.y - 2.5} width={5} height={5} fill={c.socket} />
              <rect x={d.x - 2} y={d.y - 2} width={4} height={4} fill={c.bulb} />
              <rect x={d.x - 1.5} y={d.y - 1.5} width={2} height={2} fill={c.bulbHot} />
            </g>
          ))}
        </g>
      </svg>
      {detail && <p className="fbtd-detail" aria-hidden="true" data-testid="text-touchdown-detail">{detail}</p>}
    </div>
  );
}

export default FootballTouchdownMarquee;
