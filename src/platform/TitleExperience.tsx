import { useCallback, useEffect, useRef, useState } from 'react';
import type { Franchise } from '../game/lib/football/franchise';
import { unlockRetroAudio, playMenuSound } from './retro-audio';
import midfield86 from './assets/midfield-86.png';

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
  return <div className={`kr-art${animate ? ' kr-art--moving' : ''}`} role="img" aria-label="Pixel football player running with the ball through a night stadium">
    <svg className="kr-stadium-art" viewBox="0 0 480 300" preserveAspectRatio="none" aria-hidden="true" shapeRendering="crispEdges">
    <defs>
      <pattern id="kr-crowd" width="12" height="9" patternUnits="userSpaceOnUse">
        <rect width="12" height="9" fill="#0b1d42" />
        <rect x="1" y="2" width="2" height="2" fill="#37669e" />
        <rect x="6" y="5" width="2" height="2" fill="#81bde4" />
        <rect x="10" y="1" width="1" height="2" fill="#d9edff" />
      </pattern>
      <linearGradient id="kr-sky" x2="0" y2="1">
        <stop stopColor="#07132c" />
        <stop offset=".55" stopColor="#123b75" />
        <stop offset="1" stopColor="#287cb1" />
      </linearGradient>
    </defs>
    <rect width="480" height="300" fill="url(#kr-sky)" />
    <path d="M0 41h58v8h40v-8h54v8h62v-8h75v8h59v-8h48v8h84v129H0z" fill="#102955" />
    <path d="M0 58h480v12H0zM0 74h480v4H0z" fill="#244879" />
    <path d="M0 82h480v92H0z" fill="url(#kr-crowd)" />
    <path d="M0 163h480v14H0z" fill="#07152b" />
    <path d="M0 177h480v123H0z" fill="#11733a" />
    <path d="M0 184h480v4H0zm0 37h480v4H0zm0 36h480v4H0zm0 34h480v4H0z" fill="#54d764" />
    <path d="M32 178l-19 122h8l21-122zm91 0l-13 122h8l15-122zm95 0l-6 122h8l8-122zm97 0l2 122h8l-1-122zm95 0l11 122h8l-10-122z" fill="#e4f0da" />
    <path d="M7 201h466v3H7zm0 72h466v3H7z" fill="#c5e7c3" opacity=".82" />
    <path d="M0 177h480v8H0z" fill="#f3f4df" />
    <path d="M29 37h38v11H29zM412 37h39v11h-39z" fill="#c8e8ff" />
    <path d="M33 40h5v5h-5zm9 0h5v5h-5zm9 0h5v5h-5zm9 0h5v5h-5zm356 0h5v5h-5zm9 0h5v5h-5zm9 0h5v5h-5zm9 0h5v5h-5z" fill="#fff9dc" />
    <path d="M19 48h59v3H19zm383 0h59v3h-59z" fill="#80cfff" />
    <path d="M91 22h63v13H91zm8-10h44v10H99zM337 23h55v12h-55zm8-11h38v11h-38z" fill="#132d56" />
    <path d="M103 24h35v5h-35zm245 0h30v5h-30z" fill="#527aab" />
    <path d="M0 98h480v1H0zm0 35h480v2H0z" fill="#78a8da" opacity=".35" />
    <path d="M65 118h10v4H65zm21 13h8v4h-8zm288-20h9v4h-9zm-22 27h8v4h-8z" fill="#9dcfff" />
    <path d="M190 270l44-4 24 12-4 10-54 4-23-11z" fill="#081326" opacity=".7" />
    </svg>
    <svg className="kr-runner-art" viewBox="110 100 220 175" aria-hidden="true" shapeRendering="crispEdges">
    <g className="kr-runner">
      <path d="M177 151l18-15 54 2 20 19-2 54-15 12-11 26-35-6-4-17-31-7 13-29z" fill="#071020" />
      <path d="M196 151h50v57h-50z" fill="#18aab0" />
      <path d="M190 157h12v40h-12zm53-3h9v43h-9z" fill="#eb3b8b" />
      <path d="M204 161h8v11h-8zm28 0h8v11h-8z" fill="#f3f5f1" />
      <path d="M207 182h11v3h-11zm8 0h3v17h-3zm-8 7h11v3h-11zm0 7h11v3h-11zM223 182h11v3h-11zm8 0h3v10h-3zm-8 7h11v3h-11zm0 0h3v10h-3zm0 7h11v3h-11z" fill="#f7f5ec" />
      <path d="M203 205h32v17h-32z" fill="#eb3b8b" />
      <path d="M212 205h13v8h-13z" fill="#fff" />
      <path d="M173 147h23v19h-17v25h-19v-25h13z" fill="#071020" />
      <path d="M168 145h24v15h-14v22h-17v-22h7z" fill="#f5a66c" />
      <path d="M158 159h17v17h-17z" fill="#ffc183" />
      <path d="M240 145h22v17h13v12h-14v17h-20z" fill="#071020" />
      <path d="M244 143h20v18h12v10h-12v15h-20z" fill="#f5a66c" />
      <path d="M255 142h19v15h-19z" fill="#ffc183" />
      <path d="M180 206l-27 18-25 2-8 14 14 10 37-10 30-17z" fill="#071020" />
      <path d="M178 210l-25 17-24 1-5 9 11 6 33-8 25-16z" fill="#fff" />
      <path d="M129 226h20v7h-20z" fill="#16a8b0" />
      <path d="M245 211l26 16 20 0 14 12-10 12-35-5-32-17z" fill="#071020" />
      <path d="M246 214l24 15 20 0 10 9-8 8-31-4-29-16z" fill="#f8f7ee" />
      <path d="M280 228h22v7h-22z" fill="#eb3b8b" />
      <path d="M135 243h21v10h-28v-6zM290 245h24v9h-31z" fill="#071020" />
      <path d="M132 250h25v7h-25zm154 1h29v7h-29z" fill="#f5f2e9" />
      <path d="M153 149l-21-13-14 8 13 20 26 8 14-12z" fill="#071020" />
      <path d="M150 148l-19-11-11 6 12 16 21 6 10-10z" fill="#f2a16b" />
      <path d="M117 139l10-12 17-4 12 7-5 13-14 7z" fill="#071020" />
      <path d="M121 136l9-9 14-3 8 6-4 10-13 6z" fill="#8e4a27" />
      <path d="M127 131l2-4 3 4-2 3zm14 9l2-4 3 4-2 3z" fill="#f5e3c8" />
      <path d="M195 134h56l15-12 19 8 4 21-17 22-21-5-19-17h-30z" fill="#071020" />
      <path d="M199 132h53l13-11 15 7 3 17-14 19-19-5-19-17h-32z" fill="#e8edf1" />
      <path d="M209 127h7v30h-7zm14-3h7v31h-7z" fill="#16a8b0" />
      <path d="M237 122h7v31h-7z" fill="#eb3b8b" />
      <path d="M250 141h24v8h-24z" fill="#101a30" />
      <path d="M251 148h23v8h-23z" fill="#f5a66c" />
      <path d="M263 146h11v6h-11z" fill="#f3d18a" />
      <path d="M256 113h17v14h-17z" fill="#071020" />
    </g>
    </svg>
  </div>;
}

export function TitleExperience(props: Props) {
  const { playIntro, onIntroComplete, soundOn, onSoundToggle, onIntroStinger, onIntroTheme, onIntroStop, franchise, playoffUnlocked, onChoose } = props;
  const [stage, setStage] = useState<'black' | 'mark' | 'film' | 'menu'>(playIntro ? 'black' : 'menu');
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const [selected, setSelected] = useState(0);
  const [replayToken, setReplayToken] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const timers = useRef<number[]>([]);
  const callbacks = useRef({ onIntroStinger, onIntroTheme, onIntroStop, onIntroComplete });
  callbacks.current = { onIntroStinger, onIntroTheme, onIntroStop, onIntroComplete };
  const skip = useCallback(() => {
    if (stageRef.current === 'menu') return;
    stageRef.current = 'menu';
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    void unlockRetroAudio();
    callbacks.current.onIntroStop();
    setStage('menu');
    callbacks.current.onIntroComplete();
  }, []);

  useEffect(() => {
    if (!playIntro && replayToken === 0) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stageRef.current = 'black';
    setStage('black');
    timers.current.push(window.setTimeout(() => {
      setStage('mark');
      stageRef.current = 'mark';
      callbacks.current.onIntroStinger();
    }, reduced ? 120 : 500));
    timers.current.push(window.setTimeout(() => {
      setStage('film');
      stageRef.current = 'film';
      callbacks.current.onIntroTheme();
    }, reduced ? 330 : 1150));
    timers.current.push(window.setTimeout(() => {
      setStage('menu');
      stageRef.current = 'menu';
      callbacks.current.onIntroStop();
      callbacks.current.onIntroComplete();
    }, reduced ? 1250 : 4750));
    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
      callbacks.current.onIntroStop();
    };
  }, [playIntro, replayToken]);

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
    {stage !== 'menu' && <div className={`kr-intro kr-intro--${stage}`} onClick={skip} role="button" tabIndex={0}
      aria-label="Skip intro">
      {stage === 'black' ? <span className="kr-intro-black" /> : stage === 'mark'
        ? <div className="kr-mark-stinger"><img src={midfield86} alt="86" /></div>
        : <div className="kr-film">
          <div className="kr-film-head"><span>KICK</span><span>RETURN</span></div>
          <PixelArtwork animate />
          <div className="kr-film-scan" />
        </div>}
      <span className="kr-skip">TAP OR PRESS ANY KEY TO SKIP</span>
    </div>}
    <div className="kr-title-frame" inert={stage !== 'menu'}>
      <header className="kr-title-topline">
        <span>GRIDIRON SERIES</span><span>NO. 86&nbsp; / &nbsp;USA</span>
        <button type="button" className="kr-replay" onClick={replayIntro} data-retro-sound="confirm">REPLAY INTRO</button>
        <button type="button" className="kr-sound" aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
          aria-pressed={soundOn} onClick={onSoundToggle} data-retro-sound="off">{soundOn ? 'SOUND: ON' : 'SOUND: OFF'}</button>
      </header>
      <div className="kr-hero-art">
        <div className="kr-wordmark" aria-label="Kick Return">
          <span className="kr-word-kick">KICK</span>
          <span className="kr-word-return">RETURN</span>
        </div>
        <PixelArtwork />
        <span className="kr-edition-stamp">’86<br /><small>SEASON</small></span>
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
