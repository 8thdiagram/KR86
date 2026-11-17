import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { prepareFootballCanvas } from './football-resolution';
import { KickBackToMenu } from './kick-back-confirm';
import { beginKickReturn, emptyKickProgress, enforceKickDowns, kickDownName, KR, returnedYards, restartKickReturn, skipKickReturn, stepKickAttempt,
  updateKickProgress, type KickReturnProgress } from '../lib/kick-return-engine';
import { createKickMatchup, kickMatchupTeams } from '../lib/kick-return-teams';
import { drawKickReturn, kickRenderCamera } from './kick-return-renderer';
import { kickViewport, type KickViewport } from '../lib/kick-return-viewport';
import { createKickCrowdAudio } from '../lib/kick-return-audio';
import { TD_SECONDS } from '../lib/football/celebration-timing';
import './kick-return-game.css';
import { useGameModeRuntime } from './games/GameModeContext';
import { FootballRanking } from './football-ranking';
import { createKickControls, kickControlAtPoint, type KickControl } from '../lib/kick-return-controls';
import { interpolateKickAttempt } from '../lib/kick-return-presentation';
import { formatKickTime, kickClockFrame, kickTimingStats, recordKickReturn } from '../lib/kick-return-timing';
import { useFootballRanking } from '../lib/use-football-ranking';
import { makeFounderEnvelope, type FounderSessionProps } from '../lib/founder-session';
import { readSound, writeSound } from '../../platform/local-save';

// Reserve the tallest message at the current width/font size, including later downs.
// Invisible copies participate in layout but are excluded from accessibility.
const statusSpaceMessages = [
  'First Down is next. You run forward automatically. Use UP and DOWN to dodge.',
  'Slide UP/DOWN. Press ACTION to juke, spin or escape rear pursuit with a burst; hold to halt.',
  'RETURN TIME: 99:59.99 · NEW FASTEST TOUCHDOWN!',
  'Good game! All four downs are played. Your best return was 106 yards.',
  'TOUCHDOWN! You found a way through!',
  'Skipped. No penalty.',
  'Paused. Your return is saved right here.',
  'CAUGHT! The return is on.',
  ...[1, 2, 3, 4].flatMap(down => [
    `${kickDownName(down)} — Kickoff! You catch it automatically.`,
    `${kickDownName(down)} — Find the opening. Keep moving.`,
    `TACKLED! 106 yards returned. Next up: ${kickDownName(down)}.`,
  ]),
];

const withTeams = (p: KickReturnProgress): KickReturnProgress => {
  const teams = p.teams ?? p.current?.teams ?? createKickMatchup();
  const a = p.current;
  // The new button semantics also apply to resumed active games. Historical
  // finished records and unknown pre-clock durations are never rewritten.
  const moves = a && !p.outcome && ['kickoff', 'returning'].includes(a.phase) && a.moves?.version !== 2
    ? { ...a.moves, version: 2 as const, sequence: a.moves?.sequence ?? 0, readyAt: a.returnTime,
      backward: false, hesitating: false, vx: 73, furthestX: a.moves?.furthestX ?? a.player.x, active: undefined }
    : a?.moves;
  return { ...p, teams, ...(a ? { current: { ...a, teams, moves } } : {}) };
};

export interface KickReturnGameProps {
  seed: number;
  state?: KickReturnProgress;
  /** Save in the assessment's already-hydrated, identity-scoped run. */
  persist: (value: KickReturnProgress) => boolean;
  onContinue: () => void;
  showContinue?: boolean;
  ranked?: boolean;
  activity?: 'final' | 'optional';
  /** Optional isolated Founder Signal mode: one return, controlled state, no replay/next-down/skip, no standalone writes. */
  founderSession?: FounderSessionProps;
  /** DEV fixtures are fresh scenarios, not resumed saves requiring confirmation. */
  developmentFreshStart?: boolean;
}

export function KickReturnGame({ seed, state, persist, onContinue, showContinue = true, ranked = false, activity = 'final', founderSession, developmentFreshStart = false }: KickReturnGameProps) {
  const founderRef = useRef(founderSession); founderRef.current = founderSession;
  const founderDone = useRef(false);
  const [progress, setProgress] = useState<KickReturnProgress>(() => withTeams(enforceKickDowns(state ?? emptyKickProgress())));
  const progressRef = useRef(progress);
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const save = (v: KickReturnProgress): boolean => {
    const f = founderRef.current;
    if (!f) return persistRef.current(v);
    f.onProgress(makeFounderEnvelope('kick-return', f.seed, v));
    const done = v.current?.phase === 'touchdown' || v.current?.phase === 'tackled' || !!v.outcome;
    if (done && !founderDone.current) { founderDone.current = true; f.onComplete(v.current?.phase === 'touchdown' || v.outcome === 'touchdown' ? 'completed' : 'lost'); }
    return true;
  };
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<KickViewport | undefined>(undefined);
  const resizeUntil = useRef(0);
  const gameShell = useRef<HTMLElement>(null);
  const [retainedHeight, setRetainedHeight] = useState(0);
  const [paused, setPaused] = useState(() => !(import.meta.env.DEV && developmentFreshStart) && !!state?.current && !state.outcome &&
    ['kickoff', 'returning'].includes(state.current.phase));
  const [error, setError] = useState('');
  const [pressed, setPressed] = useState({ up: false, down: false, juke: false });
  const input = useRef(createKickControls({ immediateAction: true }));
  const controlBar = useRef<HTMLDivElement>(null);
  const lastSave = useRef(0);
  const celebrationStart = useRef(0);
  const audio = useRef<ReturnType<typeof createKickCrowdAudio> | null>(null);
  const [soundOn, setSoundOn] = useState(() => readSound('classic'));
  const soundEnabled = useRef(soundOn);
  const [soundError, setSoundError] = useState('');
  const gameMode = useGameModeRuntime(() => {
    clearInput(); audio.current?.stop();
    const current = progressRef.current;
    if (current.current && !current.outcome) save(current);
  });
  const phase = progress.current?.phase ?? 'ready';
  const observation = useFootballRanking(progress, ranked && !founderSession);
  const localTimes = kickTimingStats(progress.returns ?? []);
  const timing = observation.ranking?.returnTiming;
  useEffect(() => {
    if (!timing?.newFastestTouchdown || progressRef.current.newFastestTouchdown) return;
    const value = { ...progressRef.current, newFastestTouchdown: true };
    progressRef.current = value; setProgress(value); save(value);
  }, [timing?.newFastestTouchdown]);
  const active = !progress.outcome && (phase === 'kickoff' || phase === 'returning');
  // Queue a first cut during the kick; physics still catches automatically.
  const controlsEnabled = active && !paused && !gameMode?.paused;

  const clearInput = () => {
    input.current.clear();
    setPressed({ up: false, down: false, juke: false });
  };
  const commit = (value: KickReturnProgress) => {
    progressRef.current = value;
    setProgress(value);
    const saved = save(value);
    setError(saved ? '' : 'Your browser could not save this optional game. Keep this tab open; refreshing may lose its progress. You can still skip with no penalty.');
    return saved;
  };
  const draw = (seconds = 0, attempt = progressRef.current.current) => {
    const ctx = canvas.current && prepareFootballCanvas(canvas.current, view.current?.width ?? KR.width, view.current?.height ?? KR.height);
    const shownSeconds = attempt?.phase === 'touchdown' && seconds === 0 && celebrationStart.current
      ? Math.max(0, (performance.now() - celebrationStart.current) / 1000) : seconds;
    if (ctx) drawKickReturn(ctx, attempt ?? null, shownSeconds,
      progressRef.current.outcome === 'downs-exhausted', view.current, progressRef.current.teams);
    if (import.meta.env.DEV && attempt && gameShell.current) {
      // Read-only frame-time diagnostics; no mutation hooks or throttled autosave data.
      gameShell.current.dataset.qaFrame = JSON.stringify({
        phase: attempt.phase, x: attempt.player.x, y: attempt.player.y, move: attempt.moves?.active,
        hesitating: !!attempt.moves?.hesitating, count: attempt.moves?.sequence, clock: attempt.elapsedMs,
        total: attempt.defenders.length, seconds,
        camera: kickRenderCamera(attempt, view.current?.width ?? KR.width, !!view.current, view.current),
        viewport: view.current,
      });
    }
  };

  useLayoutEffect(() => {
    if (!gameMode || !canvas.current) return;
    const element = canvas.current, stage = element.parentElement!;
    const measure = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (width < 80 || height < 80) return; // hidden retained game / intermediate resize
      const style = getComputedStyle(stage);
      const w = width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
      const h = height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
      const slot = gameShell.current?.closest('.gm-slot')?.getBoundingClientRect();
      const viewportWidth = slot?.width ?? window.innerWidth;
      const viewportHeight = slot?.height ?? window.innerHeight;
      const next = kickViewport(w, h, viewportWidth, viewportHeight);
      if (JSON.stringify(view.current) === JSON.stringify(next)) return;
      resizeUntil.current = performance.now() + 140;
      clearInput();
      view.current = next;
      draw(progressRef.current.outcome ? 2 : 0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => observer.disconnect();
  }, [gameMode]);

  useEffect(() => {
    draw();
    if (state && state !== progressRef.current) commit(progressRef.current);
    return () => { audio.current?.close(); };
  }, []);
  useEffect(() => {
    if (!active || paused || gameMode?.paused) return;
    let frame = 0, previous = performance.now(), accumulator = 0, lastUI = 0;
    let previousAttempt = progressRef.current.current;
    const tick = (now: number) => {
      // Read the mutable runtime as well as React's effect snapshot: BACK must
      // stop this very next frame, not wait for navigation/effect cleanup.
      if (gameMode?.paused || now < resizeUntil.current) {
        previousAttempt = progressRef.current.current;
        previous = now; accumulator = 0; frame = requestAnimationFrame(tick); return;
      }
      // A slow frame never advances a full unseen interval or tunnels through a tackle.
      const realMs = Math.max(0, now - previous);
      accumulator += Math.min(.1, realMs / 1000);
      previous = now;
      let p = progressRef.current;
      const before = p.current;
      const available = accumulator;
      while (accumulator >= KR.dt && p.current && !p.outcome && p.current.phase !== 'tackled') {
        const i = input.current.sample(now);
        previousAttempt = p.current;
        p = updateKickProgress(p, stepKickAttempt(p.current, i.direction, KR.dt, i));
        accumulator -= KR.dt;
      }
      if (before && p.current) {
        const elapsedMs = kickClockFrame(before, p.current, realMs, available);
        if (elapsedMs !== undefined) {
          const current = { ...p.current, elapsedMs };
          p = { ...p, current, returns: recordKickReturn(p, current, returnedYards(current)) };
        }
      }
      progressRef.current = p;
      draw(p.current?.phase === 'tackled' ? .001 : 0,
        p.current ? interpolateKickAttempt(previousAttempt, p.current, accumulator / KR.dt) : undefined);
      if (p.outcome || p.current?.phase === 'tackled') {
        clearInput();
        celebrationStart.current = now;
        commit(p);
        if (p.outcome === 'touchdown' && soundEnabled.current && !audio.current?.cheer())
          setSoundError('Sound is unavailable right now. The touchdown celebration still plays.');
        else if (p.current?.phase === 'tackled' && soundEnabled.current) audio.current?.tackle();
        return;
      }
      if (now - lastUI > 100) {
        lastUI = now; setProgress(p);
        setPressed(input.current.sample(now, false).pressed);
      }
      if (now - lastSave.current > 500) { lastSave.current = now; commit(p); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, paused, phase, gameMode?.paused]);

  useEffect(() => {
    if (progress.outcome !== 'touchdown') return;
    const start = celebrationStart.current || performance.now();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const tick = (now: number) => {
      draw(reduced ? TD_SECONDS : Math.min(TD_SECONDS, (now - start) / 1000));
      if (!reduced && now - start < TD_SECONDS * 1000) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [progress.outcome]);

  useEffect(() => {
    if (phase !== 'tackled' || !celebrationStart.current) return;
    const start = celebrationStart.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(.25, Math.max(.001, (now - start) / 1000));
      draw(reduced ? .25 : t);
      if (!reduced && t < .25) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    const canInput = () => !!progressRef.current.current && ['kickoff','returning'].includes(progressRef.current.current.phase) && !progressRef.current.outcome;
    const key = (e: KeyboardEvent) => {
      const control: KickControl | undefined = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down'
        : ['ArrowLeft', ' ', 'j', 'J'].includes(e.key) ? 'juke' : undefined;
      if (!control) return;
      const id = `key:${e.code || e.key}`, now = performance.now();
      if (e.type === 'keyup') input.current.release(id, now);
      if (!canInput() || paused || gameMode?.paused ||
        (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable=true]'))) return;
      e.preventDefault();
      if (e.type === 'keydown' && !e.repeat) input.current.enter(id, control, now);
      setPressed(input.current.sample(now, false).pressed);
    };
    const suspend = () => {
      clearInput();
      const p = progressRef.current;
      if (!p.outcome && p.current && ['kickoff', 'returning'].includes(p.current.phase)) {
        commit(p);
        setPaused(true);
      }
    };
    const visibility = () => { if (document.hidden) suspend(); };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    window.addEventListener('blur', suspend);
    window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
      window.removeEventListener('blur', suspend);
      window.removeEventListener('pagehide', suspend);
      document.removeEventListener('visibilitychange', visibility);
      const p = progressRef.current;
      if (p.current && !p.outcome) save(p);
    };
  }, [paused, gameMode?.paused]);

  const unlockSound = () => {
    if (!soundEnabled.current) return;
    audio.current ??= createKickCrowdAudio();
    void audio.current.unlock().catch(() => setSoundError('This browser could not enable audio. You can still play without sound.'));
  };
  useEffect(() => {
    const recover = () => {
      if (!document.hidden && active && !gameMode?.paused) unlockSound();
    };
    window.addEventListener('pointerdown', recover, true);
    window.addEventListener('keydown', recover, true);
    document.addEventListener('visibilitychange', recover);
    return () => {
      window.removeEventListener('pointerdown', recover, true);
      window.removeEventListener('keydown', recover, true);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [active]);
  const begin = () => {
    let p = beginKickReturn(progressRef.current, seed);
    if (p === progressRef.current) return;
    if (ranked && progressRef.current.attempts === 0 && p.attempts === 1 && p.current?.difficulty === 'hard') {
      p = { ...p, rankingRoundId: crypto.randomUUID() };
    }
    clearInput();
    setPaused(false);
    commit(p);
    unlockSound();
    if (p.current?.phase === 'kickoff' && soundEnabled.current) audio.current?.kick();
  };
  const press = (control: KickControl, e: React.PointerEvent<HTMLButtonElement>) => {
    if (!controlsEnabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    input.current.enter(`pointer:${e.pointerId}`, control, performance.now());
    setPressed(input.current.sample(performance.now(), false).pressed);
  };
  const slide = (e: React.PointerEvent) => {
    const id = `pointer:${e.pointerId}`;
    if (!input.current.has(id) || !controlsEnabled) return;
    e.preventDefault();
    const targets = (['juke', 'up', 'down'] as const).flatMap(control => {
      const button = controlBar.current?.querySelector(`[data-testid="kick-return-${control}"]`);
      return button ? [{ control, bounds: button.getBoundingClientRect() }] : [];
    });
    const control = kickControlAtPoint(targets, e.clientX, e.clientY);
    input.current.enter(id, control, performance.now());
    setPressed(input.current.sample(performance.now(), false).pressed);
  };
  const release = (e: React.PointerEvent, canceled = false) => {
    input.current.release(`pointer:${e.pointerId}`, performance.now(), canceled);
    setPressed(input.current.sample(performance.now(), false).pressed);
  };
  const skip = () => { clearInput(); commit(skipKickReturn(progressRef.current)); draw(); };
  const restart = () => {
    const base = restartKickReturn(progressRef.current);
    if (base === progressRef.current) return;
    const fresh = { ...base, teams: createKickMatchup() };
    // Keep the finished result intact unless the new game is safely saved.
    if (!save(fresh)) {
      setError('Your browser could not save the restart. Your finished game is still available. Try again.');
      return;
    }
    // Removing a tall results/ranking panel must not clamp the viewport upward.
    setRetainedHeight(h => Math.max(h, gameShell.current?.getBoundingClientRect().height ?? 0));
    clearInput();
    audio.current?.stop();
    setPaused(false);
    progressRef.current = fresh;
    setProgress(fresh);
    setError('');
    draw();
  };
  const finish = () => {
    if (!progressRef.current.outcome) return;
    if(commit({ ...progressRef.current, continued: true }))onContinue();
  };
  const kits = kickMatchupTeams(progress.teams);
  const yards = progress.current ? returnedYards(progress.current) : 0;
  const activeActionKind = (progress.current?.moves?.active as { kind: string } | undefined)?.kind;
  const status = progress.outcome === 'touchdown' ? 'TOUCHDOWN! You found a way through!'
    : progress.outcome === 'downs-exhausted' ? `Good game! All four downs are played. Your best return was ${progress.bestYards} yards.`
    : progress.outcome === 'skipped' ? 'Skipped. No penalty.'
    : paused ? 'Paused. Your return is saved right here.'
    : phase === 'kickoff' ? `${kickDownName(progress.attempts)} — Kickoff! You catch it automatically.`
    : phase === 'returning' && (progress.current?.returnTime ?? 0) < .8 ? 'CAUGHT! The return is on.'
    : phase === 'returning' ? `${kickDownName(progress.attempts)} — Find the opening. Keep moving.`
    : phase === 'tackled' ? founderSession ? `RETURN COMPLETE! ${yards} yards returned.` : `TACKLED! ${yards} yards returned. Next up: ${kickDownName(progress.attempts + 1)}.`
     : 'Slide UP/DOWN. Press ACTION to juke, spin or escape rear pursuit with a burst; hold to halt.';
  const primaryAction = founderSession ? (phase === 'ready' ? { label: 'START', run: begin, testId: 'kick-return-start' } : null) : progress.outcome ? { label: 'Play again', run: restart, testId: 'kick-return-restart' }
    : phase === 'ready' ? { label: 'START', run: begin, testId: 'kick-return-start' }
    : phase === 'tackled' ? { label: `PLAY ${kickDownName(progress.attempts + 1).toUpperCase()}`, run: begin, testId: 'kick-return-retry' }
    : null;
  const toggleSound = () => {
    const enabled = !soundOn;
    if (!writeSound('classic', enabled)) return;
    setSoundOn(enabled); soundEnabled.current = enabled;
    if (!enabled) audio.current?.stop();
    else {
      audio.current ??= createKickCrowdAudio();
      void audio.current.unlock().then(() => {
        setSoundError('');
        if (progressRef.current.outcome === 'touchdown') audio.current?.cheer();
      }).catch(() => setSoundError('This browser could not enable audio.'));
    }
  };
  const pauseMetrics = <dl className="kr-pause-metrics" aria-label="Current game statistics">
    <div><dt>DOWN</dt><dd>{Math.min(KR.downs, progress.attempts || 1)} / 4</dd></div>
    <div><dt>RETURNED</dt><dd>{yards} YD</dd></div>
    <div><dt>BEST</dt><dd>{progress.bestYards} YD</dd></div>
    <div><dt>TIME</dt><dd>{formatKickTime(progress.current?.elapsedMs ?? 0)}</dd></div>
    <div><dt>FASTEST TD</dt><dd>{formatKickTime(timing?.fastestTouchdownMs ?? localTimes.fastestTouchdownMs ?? undefined)}</dd></div>
    <div><dt>AVERAGE TIME</dt><dd>{formatKickTime(timing?.averageMs ?? localTimes.averageMs ?? undefined)}</dd></div>
  </dl>;

  return <section ref={gameShell} className="kr-game kr-football trytry-game-active" aria-label="Kick Return ’86"
    style={{ minHeight: retainedHeight || undefined }}
    data-testid="kick-return-game" data-phase={phase} data-outcome={progress.outcome ?? ''} data-paused={paused}
    data-attempts={progress.attempts} data-player-x={progress.current?.player.x.toFixed(2)}
    data-player-y={progress.current?.player.y.toFixed(2)}
    data-backward={progress.current?.moves?.backward ?? false}
    data-hesitating={progress.current?.moves?.hesitating ?? false}
    data-juke-kind={progress.current?.moves?.active?.kind ?? ''}
    data-juke-count={progress.current?.moves?.sequence ?? 0}>
    <header className="kr-heading"><p className="kr-kicker">{activity === 'optional' ? 'Optional Founder Signal game' : 'Final Founder Signal activity'} · you can skip playing</p>
      <h2 className="kr-title">KICK RETURN ’86</h2>
      <p className="kr-subtitle">One ball. Eleven defenders. Find your way to the end zone.</p>
       <p className="kr-note">Slide UP/DOWN to steer. ACTION: juke head-on, spin away from side pressure, burst from close rear pursuit. Open field: spin.</p>
       <p className="kr-note kr-rules" data-testid="kick-return-rules">
        {founderSession ? 'One kickoff return. A touchdown, tackle or out-of-bounds ends this session, then you return to Founder Signal.' : 'You get four downs: First Down, Second Down, Third Down, Fourth Down. Score a touchdown before they run out. A touchdown or your fourth tackle ends the game.'}</p>
    </header>
    <div className="kr-scoreboard kr-timed-scoreboard" aria-label="Scoreboard">
      <div><small>DOWN</small><strong>{Math.min(KR.downs, progress.attempts || 1)} / 4</strong></div>
      <div><small>RETURNED</small><strong>{yards} YD</strong></div>
      <div><small>BEST</small><strong>{progress.bestYards} YD</strong></div>
      <div className="kr-clock"><small>TIME</small><strong data-testid="kick-return-clock">{formatKickTime(progress.current?.elapsedMs ?? (phase === 'ready' ? 0 : undefined))}</strong></div>
    </div>
    <div className="kr-matchup" data-testid="kick-return-matchup" aria-label={`You are the ${kits.player.name}, ${kits.player.primary} and ${kits.player.secondary}. Opponent is the ${kits.opponent.name}, ${kits.opponent.primary} and ${kits.opponent.secondary}.`}>
      {([['YOU', kits.player], ['OPPONENT', kits.opponent]] as const).map(([label, t]) =>
        <div key={label} className="kr-team" data-testid={`kick-return-team-${label.toLowerCase()}`}>
          <span className="kr-swatch" aria-hidden="true" style={{ background: t.body, borderColor: t.trim, boxShadow: `inset 0 0 0 3px ${t.body}, inset 0 -8px 0 ${t.trim}` }} />
          <span className="kr-team-text"><small>{label}</small><strong>{t.name}</strong><em>{t.primary} / {t.secondary}</em></span>
        </div>)}
    </div>
    <div className="kr-screen"><canvas ref={canvas} className="kr-canvas" width={KR.width} height={KR.height}
      role="img" aria-label={`Pixel football field. ${status}`} data-testid="kick-return-field" />
      <button type="button" className="kr-pause-tool" data-testid="kick-return-pause"
        aria-pressed={paused} aria-label={paused ? 'Resume game' : active ? 'Pause game' : 'Show stats'} onClick={() => {
          clearInput();
          if (!paused) { audio.current?.stop(); save(progressRef.current); }
          setPaused(value => !value);
        }}>{paused ? '\u25B6' : active ? '\u2161' : 'STATS'}</button>
      {paused && !progress.outcome && <div className="kr-overlay"><h3>PAUSED</h3>
        <p>No play was lost while you were away.</p>
        {pauseMetrics}
        <div className="kr-overlay-tools">
          <button type="button" className="kr-primary"
            onClick={() => { clearInput(); unlockSound(); setPaused(false); }} data-testid="kick-return-resume">RESUME</button>
          <button type="button" className="kr-primary kr-pause-sound" onClick={toggleSound}
            aria-pressed={soundOn}>Sound: {soundOn ? 'on' : 'off'}</button>
        </div>
        <KickBackToMenu active={!founderSession && progress.attempts > 0} onBeforeExit={() => save(progressRef.current)} /></div>}
      {phase === 'tackled' && !progress.outcome && !paused &&
        <div className="kr-between-stats" data-testid="kick-return-between-stats">
          <h3>RETURN COMPLETE · {yards} YD</h3>{pauseMetrics}
        </div>}
    </div>
    <div className="kr-status-space">
      {statusSpaceMessages.map(message => <p key={message} className="kr-status-reserve" aria-hidden="true">{message}</p>)}
      <p className="kr-status" aria-live="polite" aria-atomic="true">
        {['tackled', 'touchdown'].includes(phase) && progress.current?.elapsedMs !== undefined ?
          <span className="kr-return-time" data-testid="kick-return-final-time">{phase === 'touchdown' ? 'TOUCHDOWN!' : progress.current.endReason === 'out-of-bounds' ? 'OUT OF BOUNDS' : 'TACKLED!'} RETURN TIME: {formatKickTime(progress.current.elapsedMs)}</span> : status}
      </p>
    </div>
    <div ref={controlBar} className="kr-controls" role="group" aria-label="Football movement controls"
      onPointerMove={slide} onContextMenu={e => e.preventDefault()}>
      <div className="kr-juke-column">
        <button type="button" className="kr-direction kr-juke" data-game-pointer-input
          data-testid="kick-return-juke" disabled={!controlsEnabled || !progress.current?.moves}
          aria-describedby="kick-return-action-hint"
          data-pressed={pressed.juke} aria-label="Action"
          onPointerDown={e => press('juke', e)} onPointerUp={e => release(e)}
          onPointerCancel={e => release(e, true)} onLostPointerCapture={e => release(e, true)}
          onClick={e => { if (e.detail === 0 && controlsEnabled) input.current.tapJuke(); }}>
          ACTION
        </button>
        <small className="action-key-hints" id="kick-return-action-hint" data-testid="kick-return-juke-status">
          {!progress.current?.moves && progress.current ? <span>Next down</span>
            : progress.current?.moves?.hesitating ? <span>↑/↓: Steer</span>
            : progress.current?.moves?.active ? <span>{activeActionKind === 'spin' ? 'Spin' : activeActionKind === 'boost' ? 'Boost' : activeActionKind === 'dive' ? 'Dive' : 'Juke'}</span>
            : progress.current?.moves && progress.current.returnTime < progress.current.moves.readyAt ? <span>Recovering</span>
            : <><span>Tap: Evade</span><span>Hold: Halt</span><span>↑/↓: Steer</span></>}
        </small>
      </div>
      <div className="kr-steering">
      {([-1, 1] as const).map(direction => <button key={direction} type="button" className="kr-direction" data-game-pointer-input
        disabled={!controlsEnabled} data-pressed={direction < 0 ? pressed.up : pressed.down}
        aria-label={direction < 0 ? 'Move up' : 'Move down'}
        data-testid={direction < 0 ? 'kick-return-up' : 'kick-return-down'}
        onPointerDown={e => press(direction < 0 ? 'up' : 'down', e)} onPointerUp={e => release(e)}
        onPointerCancel={e => release(e, true)} onLostPointerCapture={e => release(e, true)}
        onClick={e => {
          // Keyboard/screen-reader button activation (pointer taps are handled above).
          if (e.detail === 0 && controlsEnabled) {
            input.current.tapDirection(direction, performance.now());
          }
        }}><span aria-hidden="true" className="kr-arrow">{direction < 0 ? '\u2191' : '\u2193'}</span></button>)}
      </div>
    </div>
    <section className="kr-result-summary" aria-label={progress.outcome ? 'Final results' : 'Game metrics'} data-testid="kick-return-results">
      <h3>{progress.newFastestTouchdown ? 'NEW FASTEST TOUCHDOWN!' : progress.outcome ? 'Final results' : 'Game metrics'}</h3>
      <div><small>RESULT</small><strong>{progress.outcome === 'touchdown' ? 'Touchdown!' : progress.outcome === 'downs-exhausted' ? '4 downs played' : progress.outcome === 'skipped' ? 'Skipped' : 'In progress'}</strong></div>
      <div><small>DOWNS USED</small><strong>{progress.attempts} / {KR.downs}</strong></div>
      <div><small>BEST RETURN</small><strong>{progress.bestYards} YD</strong></div>
      <div><small>LATEST RETURN</small><strong>{formatKickTime(timing?.latestMs ?? localTimes.latest?.durationMs)}</strong></div>
      <div><small>AVERAGE TIME</small><strong>{formatKickTime(timing?.averageMs ?? localTimes.averageMs ?? undefined)}</strong></div>
      <div><small>FASTEST TD</small><strong data-testid="kick-return-fastest">{formatKickTime(timing?.fastestTouchdownMs ?? localTimes.fastestTouchdownMs ?? undefined)}</strong></div>
      {progress.returns?.length ? <details className="kr-return-history"><summary>Return times · {timing?.count ?? localTimes.count} recorded</summary>
        <ol>{progress.returns.map(r => <li key={r.down}>Down {r.down}: {r.outcome === 'touchdown' ? 'Touchdown' : r.outcome === 'out-of-bounds' ? 'Out of bounds' : 'Tackled'} · {r.yards} yd · {formatKickTime(r.durationMs)}</li>)}</ol>
        <p>Earlier untimed returns are excluded. Times belong to this browser player, not a verified speed leaderboard.</p>
        {observation.error && <p role="status">{observation.error} Return times remain saved on this device.</p>}
        {ranked && <button type="button" className="kr-skip" onClick={observation.refresh} disabled={observation.loading}>Sync return records</button>}
      </details> : null}
    </section>
    <div className="kr-actions kr-main-actions">
      <button type="button" className="kr-primary kr-action-slot" onClick={primaryAction?.run}
        data-testid={primaryAction?.testId ?? 'kick-return-action-placeholder'} disabled={!primaryAction}
        aria-hidden={!primaryAction} tabIndex={primaryAction ? 0 : -1}
        style={{ visibility: primaryAction ? 'visible' : 'hidden' }}>{primaryAction?.label ?? 'START'}</button>
      {showContinue && <button type="button" className="kr-primary kr-action-slot" onClick={finish} data-testid="kick-return-continue"
        disabled={!progress.outcome} aria-hidden={!progress.outcome} tabIndex={progress.outcome ? 0 : -1}
        style={{ visibility: progress.outcome ? 'visible' : 'hidden' }}>CONTINUE</button>}
    </div>
    {progress.outcome && <div className="kr-actions kr-menu-exit"><KickBackToMenu active={false} /></div>}
    <FootballRanking progress={progress} enabled={ranked} observation={observation}/>
    <footer className="kr-footer" hidden={!!founderSession}><button type="button" className="kr-skip"
      onClick={skip} data-testid="kick-return-skip" disabled={!!progress.outcome} aria-hidden={!!progress.outcome}
      tabIndex={progress.outcome ? -1 : 0} style={{ visibility: progress.outcome ? 'hidden' : 'visible' }}>Skip Game</button>
      <p className="kr-note">{founderSession?'One return, then back to Founder Signal.':'Four downs per game. Play again starts a fresh game.'}<br />
        Slide UP/DOWN to steer. ACTION: head-on juke, side-pressure spin, rear-pursuit burst. Open field: spin.<br />
        Desktop: arrows steer; press Space, J or ← for ACTION.</p>
    </footer>
    <button type="button" className="kr-skip" data-testid="kick-return-sound" aria-pressed={soundOn}
      onClick={toggleSound}>Sound: {soundOn ? 'on' : 'off'}</button>
    {soundError && <p className="kr-note" role="status">{soundError}</p>}
    {error && <><p className="kr-error" role="alert">{error}</p><button type="button" className="kr-save-retry"
      onClick={() => commit(progressRef.current)}>Try saving again</button></>}
  </section>;
}
