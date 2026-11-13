import { FootballTouchdownMarquee } from './football-touchdown-marquee';

/** The actual scoring overlay, shared with the development render fixture. */
export function FootballPlayResult({ text }: { text: string }) {
  const touchdown = text.includes('TOUCHDOWN');
  const variant = touchdown ? ' fb-play-result--touchdown'
    : text.startsWith('FIELD GOAL') ? ' fb-play-result--field-goal' : '';
  return <div className={`fb-play-result${variant}`} role="status" data-testid="football-play-result">
    {touchdown ? <FootballTouchdownMarquee label={text} /> : text}
  </div>;
}
