import { useEffect, useState } from 'react';
import { KickReturnGame } from '../game/components/kick-return-game';
import { FootballGame } from '../game/components/football-game';
import { FootballFranchise } from '../game/components/football-franchise';
import { ContainedGameMode } from '../game/components/games/GameModeHost';
import { useFranchiseSave } from '../game/lib/football/use-franchise-save';
import { initializeSaves, readSlot, writeSlot, useSaveStatus } from './local-save';
import StandaloneTools from '../components/StandaloneTools';
import '../game/components/games/game-mode.css';
import '../game/components/games/game-mode-layouts.css';
import './fonts.css';

type Mode = 'classic' | 'football' | 'franchise' | 'playoffs' | null;
export function GameHost() {
  const { loaded, error } = useSaveStatus();
  const [edition, setEdition] = useState(0);
  useEffect(() => {
    void initializeSaves().catch(() => undefined);
    const restored = () => setEdition(n => n + 1);
    window.addEventListener('kick-return-save-imported', restored);
    return () => window.removeEventListener('kick-return-save-imported', restored);
  }, []);
  if (!loaded) return <main className="startup" role={error ? 'alert' : 'status'}>
    <h1>KICK RETURN ’86</h1>
    <p>{error || 'Opening your game…'}</p>
    {error && <button type="button" onClick={() => window.location.reload()}>RETRY</button>}
  </main>;
  return <DeviceGame key={edition} />;
}
function DeviceGame() {
  const [mode, setMode] = useState<Mode>(null);
  const [frame, setFrame] = useState(0);
  const [classic] = useState(() => readSlot('classic'));
  const franchise = useFranchiseSave();
  const saveStatus = useSaveStatus();
  const playoffUnlocked = !!franchise.state?.bracket;
  const back = () => { setMode(null); setFrame(n => n + 1); };
  const choose = (next: Mode) => {
    setMode(next);
    // Best effort only: Safari may not implement orientation locking.
    const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
    if (next && orientation?.lock) void orientation.lock('landscape').catch(() => undefined);
  };
  return <ContainedGameMode key={frame} id="kick-return" onBack={back}>
    <div className="ga-scope"><div>
      {saveStatus.error && <div role="alert" className="device-save-error">
        {saveStatus.error} <button type="button" onClick={back}>SAVE TOOLS</button>
      </div>}
      {!mode ? <>
        {/* This is the existing game chooser, not a replacement design. */}
        <section className="fb-choose" aria-label="Choose game mode" data-testid="kick-mode-chooser">
          <p className="fb-choose-brand">KICK RETURN '86</p>
          <div className="fb-choose-row">
            <button type="button" className="fb-choose-card" onClick={() => choose('classic')} data-testid="button-mode-classic">
              <strong>CLASSIC MODE</strong><span>The original return. Steer, hit ACTION, find the end zone.</span></button>
            <button type="button" className="fb-choose-card fb-choose-full" onClick={() => choose('football')} data-testid="button-mode-football">
              <strong>FULL GAME</strong><span>Four quarters. Call plays, play defense, work the clock.</span></button>
            <button type="button" className="fb-choose-card fb-choose-franchise" onClick={() => choose('franchise')} data-testid="button-mode-franchise">
              <strong>FRANCHISE MODE</strong><span>{franchise.state ? `CONTINUE FRANCHISE · ${franchise.state.team} · Season ${franchise.state.season}` : 'Pick a team. 16-game seasons, playoffs, Super Bowls, permanent MVPs.'}</span></button>
            <button type="button" className="fb-choose-card fb-choose-playoff" aria-disabled={!playoffUnlocked}
              onClick={() => { if (playoffUnlocked) choose('playoffs'); }} data-testid="button-mode-playoffs" data-unlocked={playoffUnlocked}>
              <strong>PLAYOFF MODE{playoffUnlocked ? '' : ' · LOCKED'}</strong><span>{playoffUnlocked ? (franchise.state?.bracket?.teams.some(t => t.team === franchise.state?.team) && franchise.state.phase === 'playoffs' ? 'Your 16-team bracket is saved. Continue your playoff run.' : 'View the league playoff bracket and champion.') : 'Finish a Franchise season with a winning record to unlock.'}</span></button>
          </div>
        </section>
        <StandaloneTools />
      </> : mode === 'classic' ? <KickReturnGame seed={classic.seed} state={classic.progress}
        persist={progress => writeSlot('classic', { seed: classic.seed, progress })}
        onContinue={() => undefined} showContinue={false} activity="optional" ranked={false} />
        : mode === 'football' ? <FootballGame />
        : <FootballFranchise store={franchise} entry={mode === 'playoffs' ? 'playoffs' : 'franchise'} onBack={back} />}
    </div></div>
  </ContainedGameMode>;
}
