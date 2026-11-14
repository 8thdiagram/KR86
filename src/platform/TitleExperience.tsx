import { useCallback, useEffect, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { Franchise } from '../game/lib/football/franchise';
import { unlockRetroAudio, playMenuSound } from './retro-audio';
import midfield86 from './assets/midfield-86.png';
import kickReturnArtwork from './assets/kick-return-nes.png';
import kickReturnIntro from './assets/kick-return-intro.mp4';

type Mode = 'classic' | 'football' | 'franchise' | 'playoffs' | null;
type Props = {
  playIntro: boolean;
  onIntroComplete: () => void;
  soundOn: boolean;
  onSoundToggle: () => void;
  onIntroStinger: () => void;
  onIntroTheme: () => void;
  onIntroStop: () => void;
  franchise: Franchise | null | undefined;
  playoffUnlocked: boolean;
  onChoose: (mode: Mode) => void;
};

const choices = [
  { mode: 'classic' as const, name: 'CLASSIC MODE', number: '01', description: 'The original return.' },
  { mode: 'football' as const, name: 'FULL GAME', number: '02', description: 'Four quarters. Call plays. Play defense.' },
  { mode: 'franchise' as const, name: 'FRANCHISE MODE', number: '03', description: 'Build a season. Chase the playoffs.' },
  { mode: 'playoffs' as const, name: 'PLAYOFF MODE', number: '04', description: 'Locked. Earn a winning season.' },
];

function PixelArtwork({ animate = false }: { animate?: boolean }) {
  return <div className={`kr-art${animate ? ' kr-art--moving' : ''}`}>
    <img src={kickReturnArtwork} alt="A block-drawn football runner carrying the ball across a marked field beneath packed stadium stands" />
  </div>;
}

export function TitleExperience(props: Props) {
  const { playIntro, onIntroComplete, soundOn, onSoundToggle, onIntroStinger, onIntroTheme, onIntroStop, franchise, playoffUnlocked, onChoose } = props;
  const [stage, setStage] = useState<'black' | 'mark' | 'film' | 'menu'>(playIntro ? 'black' : 'menu');
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const [selected, setSelected] = useState(0);
  const [replayToken, setReplayToken] = useState(0);
  const [introError, setIntroError] = useState('');
  const [musicError, setMusicError] = useState(false);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const timers = useRef<number[]>([]);
  const loadTimer = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const runId = useRef(0);
  const activeRun = useRef(false);
  const themeStarted = useRef(false);
  const callbacks = useRef({ onIntroStinger, onIntroTheme, onIntroStop, onIntroComplete });
  callbacks.current = { onIntroStinger, onIntroTheme, onIntroStop, onIntroComplete };
  const finishIntro = useCallback((unlock = false) => {
    if (stageRef.current === 'menu') return;
    activeRun.current = false;
    runId.current += 1;
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    if (loadTimer.current !== null) window.clearTimeout(loadTimer.current);
    loadTimer.current = null;
    videoRef.current?.pause();
    if (unlock) void unlockRetroAudio();
    callbacks.current.onIntroStop();
    stageRef.current = 'menu';
    setStage('menu');
    callbacks.current.onIntroComplete();
  }, []);
  const skip = useCallback(() => {
    if (stageRef.current === 'menu') return;
    finishIntro(true);
  }, [finishIntro]);

  useEffect(() => {
    if (!playIntro && replayToken === 0) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const currentRun = ++runId.current;
    activeRun.current = true;
    themeStarted.current = false;
    setIntroError('');
    setMusicError(false);
    stageRef.current = 'black';
    setStage('black');
    timers.current.push(window.setTimeout(() => {
      if (runId.current !== currentRun || !activeRun.current) return;
      setStage('mark');
      stageRef.current = 'mark';
      callbacks.current.onIntroStinger();
      if (reduced) {
        timers.current.push(window.setTimeout(() => finishIntro(), 760));
        return;
      }
      timers.current.push(window.setTimeout(() => {
        if (runId.current !== currentRun || !activeRun.current) return;
        setStage('film');
        stageRef.current = 'film';
      }, 650));
    }, reduced ? 120 : 500));
    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
      if (loadTimer.current !== null) window.clearTimeout(loadTimer.current);
      loadTimer.current = null;
      if (runId.current === currentRun) {
        activeRun.current = false;
        runId.current += 1;
      }
      videoRef.current?.pause();
      callbacks.current.onIntroStop();
    };
  }, [playIntro, replayToken, finishIntro]);

  const renderRunId = runId.current;
  const onVideoPlaying = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (event.currentTarget !== videoRef.current || renderRunId !== runId.current
      || !activeRun.current || stageRef.current !== 'film' || document.visibilityState === 'hidden'
      || themeStarted.current) return;
    themeStarted.current = true;
    if (loadTimer.current !== null) window.clearTimeout(loadTimer.current);
    loadTimer.current = null;
    callbacks.current.onIntroTheme();
  };

  const onVideoError = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (event.currentTarget !== videoRef.current || renderRunId !== runId.current
      || !activeRun.current || stageRef.current !== 'film') return;
    if (loadTimer.current !== null) window.clearTimeout(loadTimer.current);
    loadTimer.current = null;
    videoRef.current?.pause();
    themeStarted.current = false;
    callbacks.current.onIntroStop();
    setIntroError('THE INTRO CLIP COULD NOT LOAD.');
  };

  const tryPlayVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeRun.current) return;
    setIntroError('');
    if (video.error) {
      video.load();
      themeStarted.current = false;
    } else if (video.ended) {
      video.currentTime = 0;
      themeStarted.current = false;
    }
    const currentRun = runId.current;
    const attempt = video.play();
    if (attempt) attempt.catch(() => {
      if (runId.current === currentRun && activeRun.current && stageRef.current === 'film'
        && document.visibilityState !== 'hidden') {
        setIntroError('PLAYBACK WAS BLOCKED. TAP PLAY INTRO TO TRY AGAIN.');
      }
    });
  }, []);

  useEffect(() => {
    const onMusicError = () => setMusicError(true);
    window.addEventListener('kick-return-intro-audio-error', onMusicError);
    return () => window.removeEventListener('kick-return-intro-audio-error', onMusicError);
  }, []);

  useEffect(() => {
    if (stage !== 'film' || !activeRun.current) return;
    const currentRun = runId.current;
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    loadTimer.current = window.setTimeout(() => {
      if (runId.current === currentRun && activeRun.current && !themeStarted.current) {
        setIntroError('INTRO CLIP IS TAKING TOO LONG TO START.');
      }
    }, 3500);
    tryPlayVideo();
    return () => {
      if (loadTimer.current !== null) window.clearTimeout(loadTimer.current);
      loadTimer.current = null;
    };
  }, [stage, renderRunId, tryPlayVideo]);

  useEffect(() => {
    if (stage === 'menu') return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') finishIntro();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [stage, finishIntro]);

  const replayIntro = () => {
    void unlockRetroAudio();
    setReplayToken(token => token + 1);
  };

  useEffect(() => {
    if (stage === 'menu') return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key !== 'Tab'
        && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
        event.preventDefault(); skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, skip]);

  useEffect(() => {
    if (stage !== 'menu') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      void unlockRetroAudio();
      playMenuSound('move');
      let next = selected;
      for (let tries = 0; tries < choices.length; tries++) {
        next = (next + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length;
        if (choices[next]?.mode !== 'playoffs' || playoffUnlocked) break;
      }
      setSelected(next);
      buttons.current[next]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, selected, playoffUnlocked]);

  return <section className="kr-title-screen" aria-label="Kick Return '86 title screen" data-testid="kick-mode-chooser">
    {stage !== 'menu' && <div className={`kr-intro kr-intro--${stage}`} onClick={skip} role="dialog" aria-modal="true"
      aria-label="Kick Return '86 intro">
      {stage === 'black' ? <span className="kr-intro-black" /> : stage === 'mark'
        ? <div className="kr-mark-stinger"><img src={midfield86} alt="86" /></div>
        : <div className="kr-film">
          <video ref={videoRef} className="kr-film-video" src={kickReturnIntro} autoPlay muted playsInline
            preload="auto" onPlaying={onVideoPlaying} onEnded={() => {
              if (renderRunId === runId.current && activeRun.current) finishIntro();
            }} onError={onVideoError} aria-label="Silent Kick Return '86 pixel football intro" />
          <div className="kr-film-scan" />
          {musicError && <p className="kr-intro-music-note" role="status">INTRO MUSIC UNAVAILABLE · VIDEO IS SILENT</p>}
          {introError && <div className="kr-film-message" role="status">
            <span>{introError}</span>
            {!introError.startsWith('THE INTRO CLIP') && <button type="button" className="kr-intro-play"
              onClick={event => { event.stopPropagation(); tryPlayVideo(); }}
              onKeyDown={event => event.stopPropagation()}>PLAY INTRO</button>}
            {introError.startsWith('THE INTRO CLIP') && <button type="button" className="kr-intro-play"
              onClick={event => { event.stopPropagation(); tryPlayVideo(); }}
              onKeyDown={event => event.stopPropagation()}>RETRY VIDEO</button>}
          </div>}
        </div>}
        <button type="button" className="kr-skip" onClick={event => { event.stopPropagation(); skip(); }}>
          TAP OR PRESS ANY KEY TO SKIP
        </button>
    </div>}
    <div className="kr-title-frame" inert={stage !== 'menu'}>
      <header className="kr-title-topline">
        <span>GRIDIRON SERIES</span><span>NO. 86&nbsp; / &nbsp;USA</span>
        <button type="button" className="kr-replay" onClick={replayIntro} data-retro-sound="confirm">REPLAY INTRO</button>
        <button type="button" className="kr-sound" aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
          aria-pressed={soundOn} onClick={onSoundToggle} data-retro-sound="off">{soundOn ? 'SOUND: ON' : 'SOUND: OFF'}</button>
      </header>
      <div className="kr-hero-art">
        <h1 className="kr-wordmark">
          <span className="kr-word-kick">KICK</span>
          <span className="kr-word-return">RETURN</span>
        </h1>
        <PixelArtwork />
        <div className="kr-score-rule"><span>KICK RETURN ’86</span><span>GRIDIRON FOOTBALL</span></div>
      </div>
      <div className="kr-menu-heading"><span>SELECT YOUR GAME</span><i>▼</i></div>
      <div className="kr-mode-list">
        {choices.map((choice, index) => {
          const locked = choice.mode === 'playoffs' && !playoffUnlocked;
          const description = choice.mode === 'franchise' && franchise
            ? `CONTINUE ${franchise.team.toUpperCase()} · SEASON ${franchise.season}`
            : choice.mode === 'playoffs' && playoffUnlocked ? 'Continue your run or review the bracket.' : choice.description;
          return <button key={choice.mode} ref={element => { buttons.current[index] = element; }}
            type="button" className={`kr-mode-option${selected === index ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
            aria-disabled={locked} aria-current={selected === index ? 'true' : undefined}
            onFocus={() => setSelected(index)}
            onClick={() => { setSelected(index); onChoose(choice.mode); }}
            data-retro-sound={locked ? 'locked' : 'transition'}
            data-testid={`button-mode-${choice.mode}`}>
            <span className="kr-mode-number">{choice.number}</span>
            <span className="kr-mode-copy"><strong>{choice.name}{locked ? ' · LOCKED' : ''}</strong><small>{locked ? 'Finish a winning Franchise season to unlock.' : description}</small></span>
            <span className="kr-mode-arrow" aria-hidden="true">{selected === index ? '▶' : ' '}</span>
          </button>;
        })}
      </div>
      <footer className="kr-title-footer"><span>◀ ▲ ▼ ▶ &nbsp; SELECT</span><span>ENTER &nbsp; CONFIRM</span><span>BATTERY BACKUP READY</span></footer>
    </div>
  </section>;
}
