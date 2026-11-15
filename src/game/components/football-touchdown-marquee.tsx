import { TD_W, TD_H, TD_ART_RECTS } from './football-touchdown-art';
import './football-touchdown-marquee.css';

export function FootballTouchdownMarquee({ label = 'TOUCHDOWN!' }: { label?: string }) {
  const detail = label.replace(/touchdown!?/i, '').replace(/^[\s\-–—:·|]+|[\s\-–—:·|]+$/g, '').trim();
  return (
    <div className="fbtd" data-testid="graphic-touchdown">
      <svg className="fbtd-svg" viewBox={`0 0 ${TD_W} ${TD_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
        {TD_ART_RECTS.map((rect, index) => (
          <rect
            key={`pixel-${index}`}
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            fill={rect.color}
          />
        ))}
      </svg>
      {detail && <p className="fbtd-detail" aria-hidden="true" data-testid="text-touchdown-detail">{detail}</p>}
    </div>
  );
}

export default FootballTouchdownMarquee;
