import { useEffect, useState } from 'react';
import { KickReturnGame } from '../game/components/kick-return-game';
import { FootballGame } from '../game/components/football-game';
import { FootballFranchise } from '../game/components/football-franchise';
import { ContainedGameMode } from '../game/components/games/GameModeHost';
import { useFranchiseSave } from '../game/lib/football/use-franchise-save';
import { initializeSaves, readSlot, writeSlot, useSaveStatus } from './local-save';
import { unlockRetroAudio, playMenuSound, playIntroSound, stopIntroSound, setRetroSoundEnabled } from './retro-audio';
import { TitleExperience } from './TitleExperience';
import StandaloneTools from '../components/StandaloneTools';
import '../game/components/games/game-mode.css';
import '../game/components/games/game-mode-layouts.css';
import './fonts.css';
import './retro-theme.css';

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
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
  const [classic] = useState(() => readSlot('classic'));
  const franchise = useFranchiseSave();
  const saveStatus = useSaveStatus();
  const playoffUnlocked = !!franchise.state?.bracket;
  useEffect(() => { setRetroSoundEnabled(true); }, []);
  const back = () => { setMode(null); setFrame(n => n + 1); };
  const choose = (next: Mode) => {
    if (!next) return;
    if (next === 'playoffs' && !playoffUnlocked) return;
    setMode(next);
    // Best effort only: Safari may not implement orientation locking.
    const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
    if (next && orientation?.lock) void orientation.lock('landscape').catch(() => undefined);
  };
  useEffect(() => {
    const root = document.querySelector('.gm-screen[data-game="kick-return"]');
    if (!root) return;
    const onClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button');
      if (!button || button.dataset.retroSound === 'off') return;
      const inFranchise = !!button.closest('.frn') && !button.closest('.frn-game');
      const inAudioMenu = !!button.closest('.kr-title-screen, .krt, [data-retro-audio="menu"]');
      if (!inFranchise && !inAudioMenu) return;
      void unlockRetroAudio();
      const kind = button.classList.contains('frn-back') ? 'transition'
        : button.classList.contains('frn-tab') ? 'move'
        : button.dataset.retroSound === 'locked' ? 'locked'
        : button.dataset.retroSound === 'move' ? 'move'
        : button.dataset.retroSound === 'transition' ? 'transition' : 'confirm';
      playMenuSound(kind);
    };
    const onChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.closest('.frn, .krt')
        && !target.closest('.frn-game')) playMenuSound('move');
    };
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
    };
  }, [frame]);
  useEffect(() => {
    const stop = () => stopIntroSound();
    const hidden = () => { if (document.hidden) stopIntroSound(); };
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', stop);
      document.removeEventListener('visibilitychange', hidden);
      stopIntroSound();
    };
  }, []);
  return <ContainedGameMode key={frame} id="kick-return" onBack={back}>
    <div className="ga-scope"><div className="kr-app-root">
      {saveStatus.error && <div role="alert" className="device-save-error">
        {saveStatus.error} <button type="button" onClick={back}>SAVE TOOLS</button>
      </div>}
      {!mode ? <>
        <TitleExperience
          playIntro={!hasSeenIntro}
          onIntroComplete={() => setHasSeenIntro(true)}
          onIntroStinger={() => playIntroSound('stinger')}
          onTitleHut={() => playIntroSound('hut')}
          onIntroStop={stopIntroSound}
          franchise={franchise.state}
          playoffUnlocked={playoffUnlocked}
          onChoose={choose}
        />
        <StandaloneTools />
      </> : mode === 'classic' ? <KickReturnGame seed={classic.seed} state={classic.progress}
        persist={progress => writeSlot('classic', { seed: classic.seed, progress })}
        onContinue={() => undefined} showContinue={false} activity="optional" ranked={false} />
        : mode === 'football' ? <FootballGame />
        : <FootballFranchise store={franchise} entry={mode === 'playoffs' ? 'playoffs' : 'franchise'} onBack={back} />}
    </div></div>
  </ContainedGameMode>;
}
