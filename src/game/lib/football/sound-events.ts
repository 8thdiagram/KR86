import type { FootballGame } from './types';
export type SoundSnapshot = { home: number; away: number; phase: string; quarter: number; kicks: number; tackles: number };
export const soundSnapshot = (g: FootballGame): SoundSnapshot => ({
  home: g.score.home, away: g.score.away, phase: g.phase, quarter: g.quarter, kicks: g.kickSounds ?? 0, tackles: g.tackleSounds ?? 0,
});
/** Whistle for penalties and actual period/game endings, never during a live play. */
export function footballSoundEvents(before: SoundSnapshot, g: FootballGame) {
  const sounds: ('whistle' | 'cheer' | 'hut' | 'kick' | 'tackle')[] = [];
  const periodEnded = before.quarter === 1 && g.quarter === 2 || before.quarter === 3 && g.quarter === 4 ||
    before.phase !== 'halftime' && g.phase === 'halftime' ||
    before.quarter === 4 && g.quarter === 5 && g.overtime ||
    before.phase !== 'final' && g.phase === 'final';
  if (periodEnded || before.phase !== 'penalty' && g.phase === 'penalty') sounds.push('whistle');
  if (before.phase !== 'live' && g.phase === 'live') sounds.push('hut');
  if ((g.kickSounds ?? 0) > before.kicks) sounds.push('kick');
  if ((g.tackleSounds ?? 0) > before.tackles) sounds.push('tackle');
  if (g.score.home > before.home || g.score.away > before.away) sounds.push('cheer');
  return sounds;
}
