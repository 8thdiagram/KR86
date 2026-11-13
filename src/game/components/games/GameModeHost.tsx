import { createPortal } from 'react-dom';
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '../../lib/session';
import { GameModeContext, GameModeExitContext } from './GameModeContext';
import { GameLoadBoundary } from './GameLoadBoundary';
import { gameEntry, GameRuntime, type GameEntry } from './game-mode-runtime';
import './game-mode.css';
import './game-mode-layouts.css';

type Retained = GameEntry & { runtime: GameRuntime };
export function GameModeHost(props: { children: ReactNode; renderGame: (game: GameEntry) => ReactNode }) {
  const { scope } = useSession();
  return <ScopedGameModeHost key={scope} {...props} />;
}

function ScopedGameModeHost({ children, renderGame }: { children: ReactNode; renderGame: (game: GameEntry) => ReactNode }) {
  const [location, navigate] = useLocation();
  const requested = gameEntry(location);
  const [games, setGames] = useState<Retained[]>([]);
  const [interrupted, setInterrupted] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const active = useRef<Retained | undefined>(undefined);
  const scroll = useRef({ x: 0, y: 0 });
  const returnFocus = useRef<HTMLElement | null>(null);
  const selected = games.find(game => game.key === requested?.key);

  // Admit once; subsequent PLAY uses the same DOM, engine, iframe and React state.
  useLayoutEffect(() => {
    if (requested && !selected) setGames(previous => previous.some(g => g.key === requested.key) ? previous :
      [...previous, { ...requested, runtime: new GameRuntime() }]);
  }, [requested?.key, selected]);

  const leave = useCallback(() => {
    active.current?.runtime.pause(); // Synchronous, before route/DOM changes.
    navigate('/games');
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [navigate]);

  useLayoutEffect(() => {
    const old = active.current;
    if (old !== selected) old?.runtime.pause();
    active.current = selected;
    setInterrupted(false);
    selected?.runtime.resume();
    return () => { selected?.runtime.pause(); };
  }, [selected]);

  useLayoutEffect(() => {
    if (!requested) return;
    const body = document.body, html = document.documentElement;
    const previous = {
      position: body.style.position, top: body.style.top, left: body.style.left,
      width: body.style.width, overflow: body.style.overflow, htmlOverflow: html.style.overflow,
      overscroll: html.style.overscrollBehavior, scrollBehavior: html.style.scrollBehavior,
    };
    const viewportTag = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const oldViewport = viewportTag?.getAttribute('content');
    if (viewportTag) viewportTag.content = `${(oldViewport ?? 'width=device-width, initial-scale=1').replace(/,?\s*viewport-fit=[^,]+/g, '')}, viewport-fit=cover`;
    body.style.position = 'fixed'; body.style.top = `${-scroll.current.y}px`;
    body.style.left = `${-scroll.current.x}px`; body.style.width = '100%'; body.style.overflow = 'hidden';
    html.style.overflow = 'hidden'; html.style.overscrollBehavior = 'none'; html.style.scrollBehavior = 'auto';
    return () => {
      body.style.position = previous.position; body.style.top = previous.top; body.style.left = previous.left;
      body.style.width = previous.width; body.style.overflow = previous.overflow;
      html.style.overflow = previous.htmlOverflow; html.style.overscrollBehavior = previous.overscroll;
      if (viewportTag) {
        if (oldViewport === null) viewportTag.removeAttribute('content');
        else if (oldViewport !== undefined) viewportTag.content = oldViewport;
      }
      window.scrollTo(scroll.current.x, scroll.current.y);
      const frame = requestAnimationFrame(() => {
        window.scrollTo(scroll.current.x, scroll.current.y);
        const focus = returnFocus.current?.isConnected ? returnFocus.current :
          document.querySelector<HTMLElement>(`[data-testid="link-play-${CSS.escape(requested.id)}"]`);
        focus?.focus({ preventScroll: true });
        html.style.scrollBehavior = previous.scrollBehavior;
      });
      // The frame only restores the page; no game work is scheduled here.
      void frame;
    };
  }, [!!requested]);

  useEffect(() => {
    const cataloguePath = () => window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '').replace(/\/$/, '') === '/games';
    const remember = () => { if (!active.current && cataloguePath()) scroll.current = { x: window.scrollX, y: window.scrollY }; };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target || link.origin !== window.location.origin) return;
      const path = link.pathname.slice(import.meta.env.BASE_URL.replace(/\/$/, '').length);
      if (!gameEntry(path)) return;
      if (cataloguePath()) scroll.current = { x: window.scrollX, y: window.scrollY };
      returnFocus.current = link;
      // Standard API only; fixed immersive presentation remains the fallback.
      if (document.fullscreenEnabled && !document.fullscreenElement && event.isTrusted)
        void document.documentElement.requestFullscreen?.().catch(() => undefined);
    };
    let hadFullscreen = !!document.fullscreenElement;
    const fullscreen = () => {
      const has = !!document.fullscreenElement;
      if (hadFullscreen && !has && active.current) leave();
      hadFullscreen = has;
    };
    const suspend = () => { if (active.current) { active.current.runtime.pause(); setInterrupted(true); } };
    const visibility = () => { if (document.hidden) suspend(); };
    const blur = () => { if (document.activeElement?.tagName !== 'IFRAME') suspend(); };
    document.addEventListener('click', click, true);
    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('blur', blur);
    window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', fullscreen);
    return () => {
      document.removeEventListener('click', click, true); window.removeEventListener('scroll', remember);
      window.removeEventListener('blur', blur); window.removeEventListener('pagehide', suspend);
      document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', fullscreen);
    };
  }, [leave]);

  useLayoutEffect(() => {
    if (!requested) return;
    const viewport = window.visualViewport;
    const measure = () => {
      const element = screen.current; if (!element) return;
      element.style.width = `${viewport?.width ?? window.innerWidth}px`;
      element.style.height = `${viewport?.height ?? window.innerHeight}px`;
      element.style.top = `${viewport?.offsetTop ?? 0}px`; element.style.left = `${viewport?.offsetLeft ?? 0}px`;
    };
    measure(); window.addEventListener('resize', measure);
    viewport?.addEventListener('resize', measure); viewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure); viewport?.removeEventListener('scroll', measure);
    };
  }, [!!requested]);

  return <>
    <div hidden={!!requested} inert={!!requested}>{children}</div>
    {/* Startup recovery measures normal-flow root height; a fixed-only deep link
        otherwise looks empty even after its game and controls have mounted. */}
    {requested && <div className="gm-layout-anchor" aria-hidden="true" />}
    <div ref={screen} hidden={!requested} className="gm-screen trytry-game-active" data-game={requested?.id} data-testid="game-mode" data-paused={interrupted}>
      {requested?.id !== 'kick-return' && <div className="gm-bar"><button type="button" className="gm-back" onClick={leave} data-testid="button-game-back" aria-label="Back to Games">← BACK</button>
        <span className="gm-status">{interrupted ? 'PAUSED' : 'GAME MODE'}</span></div>}
      <div className="gm-content">
        {games.map(game => <div key={game.key} className="gm-slot" hidden={game !== selected} inert={game !== selected || interrupted} aria-hidden={game !== selected || interrupted} data-testid={`retained-game-${game.id}`}>
          <GameLoadBoundary><GameModeExitContext.Provider value={leave}><GameModeContext.Provider value={game.runtime}><Suspense fallback={<p role="status" className="gm-loading">Loading game…</p>}>{renderGame(game)}</Suspense></GameModeContext.Provider></GameModeExitContext.Provider></GameLoadBoundary>
        </div>)}
      </div>
      {interrupted && <div className="gm-interrupt" role="dialog" aria-modal="true" aria-label="Game paused">
        <h2>Paused</h2><p>Your game is still here.</p><button type="button" onClick={() => { selected?.runtime.resume(); setInterrupted(false); }} data-testid="button-game-resume">RESUME</button>
      </div>}
    </div>
  </>;
}

/**
 * Route-free immersive frame for a single contained game (Founder Signal). Reuses the Game Mode
 * screen styling, runtime pause lifecycle, viewport locking and interrupt overlay of the host above,
 * but never touches history, the router, fullscreen or the catalogue. The underlying page stays mounted (inert).
 */
export function ContainedGameMode({ id, onBack, onPausedChange, banner, children }: {
  id: string; onBack: () => void; onPausedChange?: (paused: boolean) => void; banner?: ReactNode; children: ReactNode;
}) {
  const [runtime] = useState(() => new GameRuntime());
  const [interrupted, setInterrupted] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const pausedCb = useRef(onPausedChange); pausedCb.current = onPausedChange;
  useLayoutEffect(() => {
    const body = document.body, html = document.documentElement, root = document.getElementById('root');
    const y = window.scrollY, x = window.scrollX;
    const prev = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow, ho: html.style.overflow, ob: html.style.overscrollBehavior, sb: html.style.scrollBehavior };
    body.style.position = 'fixed'; body.style.top = `${-y}px`; body.style.left = `${-x}px`; body.style.width = '100%'; body.style.overflow = 'hidden';
    html.style.overflow = 'hidden'; html.style.overscrollBehavior = 'none'; html.style.scrollBehavior = 'auto';
    const wasInert = root?.inert ?? false; if (root) root.inert = true;
    const viewport = window.visualViewport;
    const measure = () => {
      const el = screen.current; if (!el) return;
      el.style.width = `${viewport?.width ?? window.innerWidth}px`; el.style.height = `${viewport?.height ?? window.innerHeight}px`;
      el.style.top = `${viewport?.offsetTop ?? 0}px`; el.style.left = `${viewport?.offsetLeft ?? 0}px`;
    };
    measure(); window.addEventListener('resize', measure); viewport?.addEventListener('resize', measure); viewport?.addEventListener('scroll', measure);
    runtime.resume();
    return () => {
      runtime.pause();
      window.removeEventListener('resize', measure); viewport?.removeEventListener('resize', measure); viewport?.removeEventListener('scroll', measure);
      body.style.position = prev.position; body.style.top = prev.top; body.style.left = prev.left; body.style.width = prev.width; body.style.overflow = prev.overflow;
      html.style.overflow = prev.ho; html.style.overscrollBehavior = prev.ob;
      if (root) root.inert = wasInert;
      window.scrollTo(x, y); html.style.scrollBehavior = prev.sb;
    };
  }, [runtime]);
  useEffect(() => {
    const suspend = () => { runtime.pause(); setInterrupted(true); pausedCb.current?.(true); };
    const vis = () => { if (document.hidden) suspend(); };
    const blur = () => { if (document.activeElement?.tagName !== 'IFRAME') suspend(); };
    window.addEventListener('blur', blur); window.addEventListener('pagehide', suspend); document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('blur', blur); window.removeEventListener('pagehide', suspend); document.removeEventListener('visibilitychange', vis); };
  }, [runtime]);
  const back = () => { runtime.pause(); onBack(); };
  return createPortal(
    <div ref={screen} className="gm-screen trytry-game-active" data-game={id} data-testid="founder-game-mode" data-paused={interrupted}>
      {id !== 'kick-return' && <div className="gm-bar"><button type="button" className="gm-back" onClick={back} data-testid="button-game-back" aria-label="Back to game selection">← BACK</button>
        <span className="gm-status">{interrupted ? 'PAUSED' : 'GAME MODE'}</span></div>}
      <div className="gm-content">
        <div className="gm-slot gm-contained-slot" inert={interrupted} aria-hidden={interrupted} data-testid={`retained-game-${id}`}>
          <GameModeExitContext.Provider value={back}><GameModeContext.Provider value={runtime}><Suspense fallback={<p role="status" className="gm-loading">Loading game…</p>}>{children}</Suspense></GameModeContext.Provider></GameModeExitContext.Provider>
        </div>
      </div>
      {banner}
      {interrupted && <div className="gm-interrupt" role="dialog" aria-modal="true" aria-label="Game paused">
        <h2>Paused</h2><p>Your game is still here.</p>
        <button type="button" onClick={() => { runtime.resume(); setInterrupted(false); pausedCb.current?.(false); }} data-testid="button-game-resume">RESUME</button>
      </div>}
    </div>, document.body);
}
