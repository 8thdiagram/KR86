import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KR } from '../lib/kick-return-engine';
import { createKickMatchup, kickMatchupTeams } from '../lib/kick-return-teams';
import { footballHudClearance, kickViewport, type KickViewport } from '../lib/kick-return-viewport';
import { createKickCrowdAudio } from '../lib/kick-return-audio';
import { kickControlAtPoint, type KickControl } from '../lib/kick-return-controls';
import { createFootballControls } from '../lib/football/controls';
import { canForwardPass, highlightedReceiver } from '../lib/football/passing';
import { useGameModeRuntime } from './games/GameModeContext';
import { useSession } from '../lib/session';
import { advanceFootball, advanceFootballReady, advanceFootballPresentation, isFootballReady, canTakeTimeout, footballClockStoppage, FULL_GAME_SPEED, queueDefense, chooseKick, queueOffense, snapFootball, createFootball, stepFootball, takeTimeout, tossFootball } from '../lib/football/engine';
import { clearFootball, loadFootball, saveFootball } from '../lib/football/storage';
import type { FootballGame as Game, FootballStats } from '../lib/football/types';
import { drawFootball } from './football-renderer';
import { createFootballWhistle } from './football-audio';
import { canDefensiveAction, defensiveActionKind } from '../lib/football/defensive-action';
import { footballSoundEvents, soundSnapshot, type SoundSnapshot } from '../lib/football/sound-events';
import { FootballPreplay, FootballPlayClock, FootballPenalty } from './football-preplay';
import './football-game.css';
import { footballFormationPreview } from '../lib/football/presentation';
import { KickBackToMenu } from './kick-back-confirm';
import { resultVisible } from '../lib/football/play-result';
import { turnoverReturnLabel } from '../lib/football/interception';
import { FootballPlayResult } from './football-play-result';
import { TD_W, TD_H } from './football-touchdown-art';
import { readSound, writeSound } from '../../platform/local-save';

const DT = 1 / 60;
const RUNNING = ['kickoff', 'live'];
const shouldTick = (g: Game) => !!g.sideSwitch || !!g.tackleScene || !!g.playResult || RUNNING.includes(g.phase) || isFootballReady(g) || g.phase === 'penalty' ||
  g.clockRunning && g.phase === 'play-dead';
const ord = (n: number) => ['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`;
const clockText = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const yardLine = (spot: number) => spot === 50 ? 'MID 50' : spot < 50 ? `OWN ${Math.round(spot)}` : `OPP ${Math.round(100 - spot)}`;
const KICKS = [
  { id: 'full', name: 'Deep kick', description: 'Pin them deep. They get a full return.' },
  { id: 'squib', name: 'Squib', description: 'Low and bouncing. Shorter return, better field.' },
  { id: 'onside', name: 'Onside', description: 'Ten-yard gamble to steal the ball back.' },
] as const;

/** Franchise adapter: the parent owns persistence. The supplied game is adopted once per franchise gameId. */
export type FootballFranchiseAdapter = {
  game: Game;
  /** Durable save of the in-progress match; returns false if it could not be saved. */
  onSave: (g: Game) => boolean;
  /** Called with the finished game (phase final, result display finished); returns false if recording failed. */
  onComplete: (g: Game) => boolean;
  onBack: () => void;
  label?: string;
};

export function FootballGame({ franchise }: { franchise?: FootballFranchiseAdapter } = {}) {
  const { scope, ready } = useSession();
  const fRef = useRef(franchise); fRef.current = franchise;
  const franchiseId = franchise?.game.franchise?.gameId;
  const [completeError, setCompleteError] = useState('');
  const gRef = useRef<Game | null>(null);
  const [, setTick] = useState(0);
  const rerender = () => setTick(t => t + 1);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const contextGesture = useRef<{ id: number; phase: Game['phase']; event: number; run: () => void } | null>(null);
  const lastContextRelease = useRef(-Infinity);
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [pressed, setPressed] = useState({ up: false, down: false, juke: false });
  const [bulletReady, setBulletReady] = useState(false);
  const [soundOn, setSoundOn] = useState(() => readSound('football'));
  const [audioNotice, setAudioNotice] = useState('');
  const soundRef = useRef(soundOn);
  const canvas = useRef<HTMLCanvasElement>(null);
  const shell = useRef<HTMLElement>(null);
  const controlBar = useRef<HTMLDivElement>(null);
  const view = useRef<KickViewport | undefined>(undefined);
  const input = useRef(createFootballControls());
  const crowd = useRef<ReturnType<typeof createKickCrowdAudio> | null>(null);
  const whistle = useRef<ReturnType<typeof createFootballWhistle> | null>(null);
  const scopeRef = useRef(scope);

  const save = () => {
    const g = gRef.current;
    if (!g) return;
    const ok = fRef.current ? fRef.current.onSave(g) : saveFootball(scopeRef.current, g);
    setSaveError(ok ? '' : 'This browser could not save the game. Keep the tab open to avoid losing progress.');
  };
  const draw = (seconds = 0) => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx && gRef.current) {
      drawFootball(ctx, footballFormationPreview(gRef.current), view.current, seconds);
    }
  };
  const clearInput = () => {
    contextGesture.current = null;
    input.current.clear(); setBulletReady(false); setPressed({ up: false, down: false, juke: false });
    if (gRef.current?.live) { gRef.current.live.holdingPass = false; gRef.current.live.lockedReceiver = undefined; }
  };
  const gameMode = useGameModeRuntime(() => { clearInput(); crowd.current?.stop(); whistle.current?.stopVoice(); whistle.current?.stopEffects(); save(); setPaused(true); });
  useEffect(() => {
    whistle.current ??= createFootballWhistle();
    void whistle.current.preload().catch(() => setAudioNotice('The snap voice could not load. Other game sounds are unchanged.'));
  }, []);

  // Load only once the identity scope is known.
  useEffect(() => {
    if (!ready) return;
    if (fRef.current) {
      if (gRef.current?.franchise?.gameId === franchiseId) return;
      clearInput(); setLoadError('');
      const adopted = structuredClone(fRef.current.game);
      if (adopted.live) { adopted.live.holdingPass = false; adopted.live.lockedReceiver = undefined; }
      gRef.current = adopted; setPaused(shouldTick(adopted) && adopted.phase !== 'kickoff-choice' && adopted.phase !== 'coin-toss');
      rerender(); draw(); return;
    }
    if (gRef.current) saveFootball(scopeRef.current, gRef.current);
    clearInput(); scopeRef.current = scope;
    gRef.current = null; setLoadError('');
    let loaded: Game | null;
    try { loaded = loadFootball(scope); }
    catch {
      setLoadError('The saved match could not be read. It has not been overwritten. Starting a new match will replace this full-game save, not Classic.');
      rerender(); return;
    }
    gRef.current = loaded ?? createFootball(Math.floor(Math.random() * 2 ** 31), createKickMatchup());
    if (gRef.current.live) { gRef.current.live.holdingPass = false; gRef.current.live.lockedReceiver = undefined; }
    setPaused(!!loaded && shouldTick(loaded));
    if (!loaded) save();
    rerender(); draw();
  }, [ready, scope, franchiseId]);

  useLayoutEffect(() => {
    const el = canvas.current; if (!el) return;
    const stage = el.parentElement!;
    const hud = shell.current?.querySelector<HTMLElement>('.fb-hud') ?? null;
    const measure = () => {
      const width = stage.clientWidth, height = stage.clientHeight;
      if (width < 80 || height < 80) return;
      stage.style.setProperty('--fb-touchdown-width',
        `${Math.max(72, Math.min(520, width * .9, (height * .84 - 28) * TD_W / TD_H))}px`);
      const slot = shell.current?.closest('.gm-slot')?.getBoundingClientRect();
      const next = kickViewport(width, height, slot?.width ?? window.innerWidth, slot?.height ?? window.innerHeight);
      const v = { ...(next.landscape ? next : { ...next, height: KR.height }),
        topClearance: footballHudClearance(stage, hud) };
      if (JSON.stringify(view.current) === JSON.stringify(v)) return;
      view.current = v; el.width = v.width; el.height = v.height ?? KR.height;
      clearInput(); draw();
    };
    const ro = new ResizeObserver(measure); ro.observe(stage); if (hud) ro.observe(hud); measure();
    return () => ro.disconnect();
  }, [ready, scope, !!gRef.current]);

  const sound = (kind: 'whistle' | 'cheer' | 'tackle' | 'kick' | 'hut') => {
    if (!soundRef.current) return;
    if (kind === 'whistle') (whistle.current ??= createFootballWhistle()).blow();
    else if (kind === 'kick') whistle.current?.kick();
    else if (kind === 'hut') whistle.current?.hut();
    else if (kind === 'cheer') crowd.current?.cheer();
    else whistle.current?.tackle();
  };
  const unlock = () => {
    if (!soundRef.current) return;
    crowd.current ??= createKickCrowdAudio();
    void crowd.current.unlock().catch(() => undefined);
    (whistle.current ??= createFootballWhistle()).unlock();
  };
  const playSounds = (before: SoundSnapshot) => {
    for (const kind of footballSoundEvents(before, gRef.current!)) {
      if (kind === 'whistle') whistle.current?.stopVoice();
      sound(kind);
    }
  };
  const afterChange = () => {
    save(); rerender(); draw();
  };
  const act = (fn: (g: Game) => void) => {
    const g = gRef.current; if (!g || paused) return;
    unlock();
    const before = soundSnapshot(g);
    fn(g); clearInput(); playSounds(before); afterChange();
  };

  const phase = gRef.current?.phase;
  const presentingResult = !!gRef.current?.playResult;
  const running = !!phase && RUNNING.includes(phase) && !paused && !gameMode?.paused;
  const controlledSide = gRef.current?.special ? gRef.current.special.stage === 'return' ? gRef.current.special.returnSide ?? gRef.current.special.receiver
    : gRef.current.special.kind === 'field-goal' && gRef.current.special.stage === 'hold' ? gRef.current.possession : undefined
    : gRef.current?.live?.mode === 'return' ? gRef.current.live.offense === 'home' ? 'away' : 'home'
    : phase === 'kickoff' ? gRef.current?.kickReceiver : gRef.current?.possession;
  const controlsActive = running && controlledSide === 'home';
  const defenseActive = running && !!gRef.current && canDefensiveAction(gRef.current);
  const ticking = !!gRef.current && shouldTick(gRef.current) && !paused && !gameMode?.paused;

  // Fixed 60 Hz simulation driven by requestAnimationFrame.
  useEffect(() => {
    if (!ticking) return;
    let frame = 0, prev = performance.now(), acc = 0, lastUI = 0, lastSave = performance.now(), start = prev;
    const tick = (now: number) => {
      const g = gRef.current!;
      if (gameMode?.paused) { prev = now; acc = 0; frame = requestAnimationFrame(tick); return; }
      const elapsed = Math.max(0, now - prev) / 1000; prev = now;
      const before = soundSnapshot(g);
      const resultWasVisible = resultVisible(g);
      if (g.sideSwitch || g.tackleScene || g.playResult) {
        acc = 0; advanceFootballPresentation(g, elapsed);
      } else if (isFootballReady(g) || g.phase === 'penalty') {
        acc = 0; advanceFootballReady(g, elapsed);
      } else {
        acc += Math.min(.1, elapsed);
        while (acc >= DT && shouldTick(g) && g.phase === before.phase) {
          const s = input.current.sample(now);
          stepFootball(g, s, DT, FULL_GAME_SPEED);
          acc -= DT;
        }
      }
      playSounds(before);
      draw((now - start) / 1000 * FULL_GAME_SPEED);
      if (resultWasVisible !== resultVisible(g)) rerender();
      if (g.phase !== before.phase || !shouldTick(g)) { afterChange(); clearInput(); return; }
      if (now - lastUI > 100) {
        lastUI = now; rerender(); const s = input.current.sample(now, false);
        setPressed(s.pressed); setBulletReady(s.bulletReady);
      }
      if (now - lastSave > 2000) { lastSave = now; save(); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ticking, phase]);

  // Final-score crowd animation.
  useEffect(() => {
    if (phase !== 'final' || presentingResult) return;
    let frame = 0; const start = performance.now();
    const t = (now: number) => { draw((now - start) / 1000); if (now - start < 2500) frame = requestAnimationFrame(t); };
    frame = requestAnimationFrame(t);
    return () => cancelAnimationFrame(frame);
  }, [phase, presentingResult]);

  const contextual = (): { label: string; run: () => void } | null => {
    const g = gRef.current; if (!g || paused) return null;
    if (g.tackleScene || g.playResult || (g.turnoverNotice ?? 0) > 0) return null;
    if (g.phase === 'pre-snap' && g.possession === 'home') return { label: 'SNAP', run: () => act(snapFootball) };
    if (g.phase === 'coin-toss' || g.phase === 'overtime-toss') return { label: 'TOSS', run: () => act(tossFootball) };
    if (g.phase === 'play-dead') return { label: 'NEXT', run: () => act(advanceFootball) };
    if (g.phase === 'halftime') return { label: '2ND HALF', run: () => act(advanceFootball) };
    if (g.phase === 'kickoff-choice') return { label: 'KICK', run: () => act(x => chooseKick(x, 'full')) };
    if (g.phase === 'final') return fRef.current ? { label: 'CONTINUE', run: finishFranchise } : { label: 'NEW GAME', run: newGame };
    return null;
  };
  const finishFranchise = () => {
    const g = gRef.current, f = fRef.current;
    if (!g || !f || g.phase !== 'final' || g.playResult) return;
    const ok = f.onComplete(structuredClone(g));
    setCompleteError(ok ? '' : 'The result could not be recorded yet. Your finished game is kept — try CONTINUE again.');
  };
  const newGame = () => {
    if (fRef.current) return;
    try { clearFootball(scopeRef.current); } catch { /* save below reports any persistent storage failure */ }
    gRef.current = createFootball(Math.floor(Math.random() * 2 ** 31), createKickMatchup());
    setLoadError(''); setPaused(false); save(); rerender(); draw();
  };

  // Keyboard + interruption handling.
  const runningRef = useRef(controlsActive || defenseActive); runningRef.current = controlsActive || defenseActive;
  const ctxRef = useRef(contextual); ctxRef.current = contextual;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable=true]')) return;
      const control: KickControl | undefined = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down'
        : ['ArrowLeft', ' ', 'j', 'J'].includes(e.key) ? 'juke' : undefined;
      const id = `key:${e.code || e.key}`, now = performance.now();
      if (e.type === 'keyup') { input.current.release(id, now); setPressed(input.current.sample(now, false).pressed); return; }
      if (!control) return;
      if (!runningRef.current) {
        if (control === 'juke' && !e.repeat) { const c = ctxRef.current(); if (c) { e.preventDefault(); c.run(); } }
        return;
      }
      e.preventDefault();
      if (!e.repeat && gRef.current) { unlock(); input.current.enter(id, control, now, gRef.current); }
      setPressed(input.current.sample(now, false).pressed);
    };
    const suspend = () => {
      clearInput(); whistle.current?.stopVoice(); whistle.current?.stopEffects(); save();
      if (gRef.current && shouldTick(gRef.current)) setPaused(true);
    };
    const vis = () => { if (document.hidden) suspend(); };
    window.addEventListener('keydown', key); window.addEventListener('keyup', key);
    window.addEventListener('blur', suspend); window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', key);
      window.removeEventListener('blur', suspend); window.removeEventListener('pagehide', suspend);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [ready]);
  useEffect(() => () => { save(); crowd.current?.close(); whistle.current?.close(); }, []);

  const press = (control: KickControl, e: React.PointerEvent<HTMLButtonElement>) => {
    const context = control === 'juke' && !runningRef.current ? ctxRef.current() : null;
    if (context && gRef.current) {
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      contextGesture.current = { id: e.pointerId, phase: gRef.current.phase, event: gRef.current.event, run: context.run };
      setPressed(p => ({ ...p, juke: true })); return;
    }
    if (!controlsActive && !(control === 'juke' && defenseActive)) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    unlock(); input.current.enter(`pointer:${e.pointerId}`, control, performance.now(), gRef.current!);
    setPressed(input.current.sample(performance.now(), false).pressed);
  };
  const slide = (e: React.PointerEvent) => {
    const id = `pointer:${e.pointerId}`;
    if (!input.current.has(id) || !running) return;
    e.preventDefault();
    const targets = (['juke', 'up', 'down'] as const).flatMap(control => {
      const b = controlBar.current?.querySelector(`[data-control="${control}"]`);
      return b ? [{ control, bounds: b.getBoundingClientRect() }] : [];
    });
    input.current.enter(id, kickControlAtPoint(targets, e.clientX, e.clientY), performance.now(), gRef.current!);
    setPressed(input.current.sample(performance.now(), false).pressed);
  };
  const release = (e: React.PointerEvent, canceled = false) => {
    const context = contextGesture.current;
    if (context?.id === e.pointerId) {
      e.preventDefault(); contextGesture.current = null;
      setPressed(p => ({ ...p, juke: false }));
      if (!canceled) {
        // Mobile compatibility clicks are not guaranteed after a captured touch.
        // Execute this phase-bound gesture once, on pointer-up, and ignore its follow-up click.
        lastContextRelease.current = performance.now();
        if (!pausedRef.current && gRef.current?.phase === context.phase && gRef.current.event === context.event) context.run();
      }
      return;
    }
    input.current.release(`pointer:${e.pointerId}`, performance.now(), canceled);
    setPressed(input.current.sample(performance.now(), false).pressed);
  };
  const togglePause = () => {
    clearInput();
    if (!paused) { crowd.current?.stop(); whistle.current?.stopVoice(); whistle.current?.stopEffects(); save(); } else unlock();
    setPaused(p => !p);
  };
  const toggleSound = () => {
    const on = !soundOn;
    if (!writeSound('football', on)) return;
    setSoundOn(on); soundRef.current = on;
    if (!on) { crowd.current?.stop(); whistle.current?.stopVoice(); whistle.current?.stopEffects(); } else unlock();
  };

  const g = gRef.current;
  if (!ready || !g) return <section className="fb-game" data-testid="football-loading" aria-busy="true">
    {loadError ? <div className="fb-skeleton"><p role="alert">{loadError}</p><button type="button" className="fb-go" data-testid="button-replace-unreadable-match" onClick={newGame}>START A NEW MATCH</button><KickBackToMenu active={false} /></div>
      : <div className="fb-skeleton"><span /><span /><span /></div>}</section>;

  const teams = kickMatchupTeams(g.teams);
  const live = g.live;
  const qbHelp = running && controlsActive && !!live && canForwardPass(live);
  const ctxAction = contextual();
  const jukeLabel = 'ACTION';
  const jukeHint = running
    ? defenseActive ? `Tap: ${defensiveActionKind(g) === 'intercept' ? 'intercept / break up pass' : defensiveActionKind(g) === 'recover' ? 'dive for loose ball' : 'nearest defender tackles'}`
    : !controlsActive ? 'Watch the play'
    : g.special?.stage === 'return' || live?.mode === 'return' ? 'Tap: burst · hold: hesitate'
    : live && canForwardPass(live) ? live.mode === 'scramble'
      ? 'Release, then press ACTION to pass · Run only beyond the line'
      : 'Tap: Standard Pass · Long Press: Bullet Pass · Hold: Scramble'
    : live?.option?.phase === 'read' ? 'ACTION pitches · otherwise keep'
    : live?.option?.phase === 'pitch' ? 'Pitch airborne'
    : live?.mode === 'scramble' ? 'Keep running · steer UP/DOWN'
    : live?.mode === 'kick' ? live.play === 'field-goal' ? 'Stop the meter in the middle' : 'Tap to punt'
    : g.possession === 'away' && g.phase === 'live' ? 'Defense plays itself'
    : 'Tap: burst · hold: hesitate'
    : g.phase === 'pre-snap' ? g.possession === 'home' ? 'Press ACTION to snap' : 'Watch the snap'
    : ctxAction ? 'Tap to continue' : g.phase === 'play-call' ? 'Pick a call on the field' : '';
  const quarter = g.overtime ? 'OT' : `Q${g.quarter}`;
  const downText = g.phase === 'kickoff' || g.phase === 'kickoff-choice' ? 'KICKOFF'
    : `${ord(g.down)} & ${g.target >= 100 ? 'GOAL' : Math.max(1, Math.round(g.target - g.spot))}`;

  return <section ref={shell} className="fb-game" aria-label="Kick Return 86 full football" data-testid="football-game"
    data-phase={g.phase} data-possession={g.possession} data-paused={paused} data-live-mode={live?.mode ?? ''}
    data-spot={g.spot.toFixed(1)} data-down={g.down} data-clock={Math.round(g.clock)} data-quarter={g.quarter}
    data-clock-stoppage={footballClockStoppage(g) ?? ''} data-play-clock={g.playClock?.toFixed(3) ?? ''}
    data-field-direction={g.fieldFrame ?? 1} data-side-switch={!!g.sideSwitch}
    data-score={`${g.score.home}-${g.score.away}`} data-throws={g.stats.home.attempts} data-catches={g.stats.home.completions}
    data-special-kind={g.special?.kind ?? ''} data-special-stage={g.special?.stage ?? ''}
    data-ball-x={g.special?.ball.x.toFixed(1) ?? live?.loose?.x.toFixed(1) ?? live?.flight?.x.toFixed(1) ?? ''}
    data-ball-z={g.special?.ball.z.toFixed(1) ?? live?.loose?.z?.toFixed(1) ?? live?.flight?.z.toFixed(1) ?? ''}
    data-rare-kind={g.special?.loose?.kind ?? live?.loose?.kind ?? ''}
    data-rare-age={(g.special?.loose?.time ?? live?.loose?.time)?.toFixed(2) ?? ''}
    data-athletes={live?.athletes.length ?? g.special?.athletes.length ?? 0}
    data-return-controls={controlsActive} data-interception-age={live?.interception?.age.toFixed(2) ?? ''}
    data-save-ok={!saveError} data-bullet-ready={bulletReady} data-pass-type={live?.flight?.type ?? ''}
    data-pass-target={live?.flight?.receiver ?? ''}
    data-tackle-phase={g.tackleScene?.phase ?? ''} data-tackle-hold={g.tackleScene?.holdRemaining.toFixed(3) ?? ''}
    data-receiver={live ? highlightedReceiver(live) ?? '' : ''} data-crossed-los={!!live?.crossedLos}>
    <header className="fb-hud" data-testid="football-hud">
      <div className={`fb-team ${g.possession === 'home' ? 'fb-has-ball' : ''}`} style={{ ['--kit' as string]: teams.player.body, ['--trim' as string]: teams.player.trim }}>
        <i aria-hidden="true" /><span>{teams.player.name}</span><strong data-testid="text-score-home">{g.score.home}</strong>
        <em data-testid="timeouts-home" aria-label={`${g.timeouts.home} timeouts remaining`}>{'●'.repeat(g.timeouts.home)}{'○'.repeat(2 - g.timeouts.home)}</em>
      </div>
      <div className="fb-clock"><strong data-testid="text-clock">{quarter} {clockText(g.clock)}</strong>
        <small data-testid="text-down">{downText} · {yardLine(g.spot)}</small></div>
      <div className={`fb-team fb-away ${g.possession === 'away' ? 'fb-has-ball' : ''}`} style={{ ['--kit' as string]: teams.opponent.body, ['--trim' as string]: teams.opponent.trim }}>
        <em data-testid="timeouts-away" aria-label={`${g.timeouts.away} timeouts remaining`}>{'●'.repeat(g.timeouts.away)}{'○'.repeat(2 - g.timeouts.away)}</em>
        <strong data-testid="text-score-away">{g.score.away}</strong><span>{teams.opponent.name}</span><i aria-hidden="true" />
      </div>
    </header>

    <div className="fb-screen">
      <canvas ref={canvas} className="fb-canvas" width={KR.width} height={KR.height} role="img"
        aria-label={`Football field. ${g.message}`} data-testid="football-field" />
      {!paused && g.phase === 'pre-snap' && <div className="fb-snap-prompt" data-testid="football-snap-prompt">
        {g.possession === 'home' ? 'PRESS ACTION TO SNAP' : 'DEFENSE SET'}
      </div>}
      {!paused && !g.playResult && live && turnoverReturnLabel(live) &&
        <div className="fb-snap-prompt" data-testid={live.returnKind === 'fumble' ? 'football-fumble-return' : 'football-interception'}>{turnoverReturnLabel(live)}</div>}
      {!paused && <FootballPlayClock game={g} />}
      {!paused && isFootballReady(g) && g.phase !== 'pre-snap' && !(g.turnoverNotice! > 0) && <FootballPreplay game={g} onOffense={id => act(x => queueOffense(x, id))}
        onDefense={d => act(x => queueDefense(x, d))} />}
      {!paused && g.phase === 'penalty' && g.playResult && (g.delayPenalty?.remaining ?? 0) > 0 &&
        <FootballPenalty game={g} compact />}
      {!paused && g.sideSwitch && <div className="fb-play-result" role="status" data-testid="football-side-switch">
        QUARTER {g.sideSwitch.quarter} — TEAMS SWITCH SIDES
      </div>}
      {!paused && resultVisible(g) && <FootballPlayResult text={g.playResult!.text} />}

      {!paused && !g.sideSwitch && g.phase === 'kickoff-choice' && <div className="fb-calls" data-testid="panel-kick-choice">
        <p className="fb-calls-head">YOU KICK OFF · CHOOSE THE KICK</p>
        <div className="fb-cards fb-three">{KICKS.map(k => <button type="button" key={k.id} className="fb-card fb-kick" data-testid={`button-kick-${k.id}`}
          onClick={() => act(x => chooseKick(x, k.id))}><small>KICKOFF</small><strong>{k.name}</strong><span>{k.description}</span></button>)}</div>
      </div>}

      {!paused && !g.tackleScene && !g.playResult && (g.phase === 'coin-toss' || g.phase === 'overtime-toss' || g.phase === 'halftime' || g.phase === 'play-dead') &&
        <div className="fb-banner" data-testid="panel-result">
          <small>{g.phase === 'halftime' ? 'HALFTIME' : g.phase === 'play-dead' ? 'PLAY OVER' : g.phase === 'overtime-toss' ? 'OVERTIME' : 'COIN TOSS'}</small>
          <strong>{g.phase === 'play-dead' ? g.lastResult || g.message : g.message}</strong>
          {g.phase === 'coin-toss' && <span>Four 2-minute quarters. Choose plays; use the original controls to run and time throws. On defense, time ACTION to tackle, contest a pass or recover. Full matches save on this device.</span>}
          {g.phase === 'halftime' && <span>{teams.player.name} {g.score.home} · {teams.opponent.name} {g.score.away}</span>}
          <span>{(g.turnoverNotice ?? 0) > 0 ? 'POSSESSION CHANGES' : `Press ACTION · ${ctxAction?.label ?? 'NEXT'}`}</span>
        </div>}

      {g.phase === 'final' && !g.playResult && <div className="fb-final" data-testid="panel-final">
        <small>FINAL{g.overtime ? ' · OT' : ''}</small>
        <h3>{g.winner === 'home' ? 'YOU WIN' : g.winner === 'away' ? 'THEY WIN' : 'TIE GAME'}</h3>
        <p className="fb-final-score"><span>{teams.player.name}</span><b>{g.score.home}</b><b>{g.score.away}</b><span>{teams.opponent.name}</span></p>
        <table className="fb-final-stats" aria-label="Team statistics"><thead><tr><th scope="col" /><th scope="col">{teams.player.name}</th><th scope="col">{teams.opponent.name}</th></tr></thead>
          <tbody>{([['Total yards', (x: FootballStats) => x.rushYards + x.passYards], ['Rush yards', (x: FootballStats) => x.rushYards], ['Pass yards', (x: FootballStats) => x.passYards],
            ['Completions', (x: FootballStats) => `${x.completions}/${x.attempts}`], ['1st downs', (x: FootballStats) => x.firstDowns], ['Touchdowns', (x: FootballStats) => x.touchdowns],
            ['Field goals', (x: FootballStats) => x.fieldGoals], ['Sacks', (x: FootballStats) => x.sacks], ['Punts', (x: FootballStats) => x.punts], ['Turnovers', (x: FootballStats) => x.turnovers]] as [string, (x: FootballStats) => number | string][]).map(([label, f]) => {
            const fmt = (v: number | string) => typeof v === 'number' ? Math.round(v * 10) / 10 : v;
            return <tr key={label}><th scope="row">{label}</th><td>{fmt(f(g.stats.home))}</td><td>{fmt(f(g.stats.away))}</td></tr>; })}
            {g.rushing&&(['QB','RB'] as const).map(role=><tr key={role}><th scope="row">{role} rush yards · carries</th>
              {(['home','away'] as const).map(side=><td key={side}>{g.rushing?.[side]?.[role] ? `${g.rushing[side]![role]!.yards.toFixed(1)} · ${g.rushing[side]![role]!.carries}` : '—'}</td>)}</tr>)}
          </tbody></table>
        {g.rushing&&<p className="fb-profile-note">Runner splits include plays recorded with this version.</p>}
        {franchise ? <>
          {completeError && <p className="fb-profile-note" role="alert">{completeError}</p>}
          <div className="fb-row"><button type="button" className="fb-go" onClick={finishFranchise} data-testid="button-franchise-continue">RECORD RESULT · CONTINUE</button></div>
        </> : <div className="fb-row"><button type="button" className="fb-go" onClick={newGame} data-testid="button-new-game">NEW GAME</button>
          <KickBackToMenu active={false} onBeforeExit={save} /></div>}
      </div>}

      {paused && (g.phase !== 'final' || g.playResult) && <div className="fb-final fb-paused" data-testid="panel-paused">
        <small>PAUSED</small><h3>{saveError ? 'Game paused — save unavailable' : franchise ? 'Franchise game saved' : 'Game saved on this device'}</h3>
        <p className="fb-profile-note">{franchise?.label ? `${franchise.label} · ` : ''}{teams.player.name}: {g.profiles.home.identity} · {teams.opponent.name}: {g.profiles.away.identity}. Fictional arcade team profiles, not historical statistics. Full-game results stay on this device, separate from Classic rankings.</p>
        {audioNotice && <p className="fb-profile-note" role="status">{audioNotice}</p>}
        <p className="fb-final-score"><span>{teams.player.name}</span><b>{g.score.home}</b><b>{g.score.away}</b><span>{teams.opponent.name}</span></p>
        {g.history.length > 0 && <ol className="fb-log">{g.history.slice(-4).reverse().map((h, i) =>
          <li key={i}>{h.offense === 'home' ? teams.player.name : teams.opponent.name}: {h.play} · {h.result}</li>)}</ol>}
        <div className="fb-row">
          <button type="button" className="fb-go" onClick={togglePause} data-testid="button-resume">RESUME</button>
          <button type="button" className="fb-go fb-ghost" onClick={() => {
            if (takeTimeout(g, 'home')) { clearInput(); save(); rerender(); setPaused(false); }
          }} disabled={!canTakeTimeout(g)} data-testid="button-timeout">{g.timeouts.home > 0 ? `CALL TIMEOUT — ${g.timeouts.home} REMAINING` : 'NO TIMEOUTS REMAINING'}</button>
          <button type="button" className="fb-go fb-ghost" onClick={toggleSound} aria-pressed={soundOn} data-testid="button-football-sound">SOUND {soundOn ? 'ON' : 'OFF'}</button>
          {!franchise && <button type="button" className="fb-go fb-ghost" onClick={newGame} data-testid="button-restart">RESTART</button>}
          {franchise && <button type="button" className="fb-go fb-ghost" onClick={() => { save(); franchise.onBack(); }} data-testid="button-franchise-hq">SAVE · FRANCHISE HQ</button>}
        </div>
        {!franchise && <KickBackToMenu active={g.phase !== 'final'} onBeforeExit={save} />}
      </div>}
      {!paused && (g.phase !== 'final' || !!g.playResult) && <button type="button" className="fb-pause-btn" onClick={togglePause} data-testid="button-football-pause"
        aria-label="Pause game">{'\u2161'}</button>}
    </div>

    <p className="fb-status" aria-live="polite" data-testid="text-status">{saveError || `${g.clutchActive && (g.phase === 'live' || g.phase === 'kickoff') ? 'CLUTCH CHAOS · ' : ''}${g.message}`}</p>

    <div ref={controlBar} className="fb-controls" role="group" aria-label="Football controls" onPointerMove={slide} onContextMenu={e => e.preventDefault()}>
      <div className="fb-juke-col">
        <button type="button" className="fb-pad fb-juke" data-control="juke" data-game-pointer-input data-pressed={pressed.juke}
          data-testid="button-juke" disabled={!controlsActive && !defenseActive && !ctxAction}
          onPointerDown={e => press('juke', e)} onPointerUp={e => release(e)}
          onPointerCancel={e => release(e, true)} onLostPointerCapture={e => release(e, true)}
          onClick={e => {
            if (performance.now() - lastContextRelease.current < 500) { lastContextRelease.current = -Infinity; return; }
            if (!running) ctxAction?.run();
            else if (e.detail === 0 && (controlsActive || defenseActive)) {
              const now = performance.now(); input.current.enter('accessible-action', 'juke', now, g);
              input.current.release('accessible-action', now + 1);
            }
          }}>
          {jukeLabel}</button>
        {!qbHelp && <small className="fb-hint">{jukeHint}</small>}
      </div>
      {qbHelp && <small className="fb-qb-help">{jukeHint}</small>}
      <div className="fb-steer">
        {([-1, 1] as const).map(d => <button key={d} type="button" className="fb-pad" data-control={d < 0 ? 'up' : 'down'} data-game-pointer-input
          disabled={!controlsActive} data-pressed={d < 0 ? pressed.up : pressed.down} data-testid={d < 0 ? 'button-up' : 'button-down'}
          onPointerDown={e => press(d < 0 ? 'up' : 'down', e)} onPointerUp={e => release(e)}
          onPointerCancel={e => release(e, true)} onLostPointerCapture={e => release(e, true)}
          onClick={e => { if (e.detail === 0 && running) input.current.tapDirection(d, performance.now()); }}
          aria-label={d < 0 ? 'Move up' : 'Move down'}><span aria-hidden="true" className="fb-arrow">{d < 0 ? '\u2191' : '\u2193'}</span></button>)}
      </div>
    </div>
    {!paused && g.phase === 'penalty' && !g.playResult && <FootballPenalty game={g} />}
  </section>;
}
