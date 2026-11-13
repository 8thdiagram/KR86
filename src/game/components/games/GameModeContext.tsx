import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { GameRuntime } from './game-mode-runtime';

export const GameModeContext = createContext<GameRuntime | null>(null);
const noopSubscribe = () => () => undefined;
const notPaused = () => false;

/** Outside the arcade host (e.g. Founder Signal), existing game behavior is unchanged. */
export function useGameModeRuntime(onPause?: () => void, onResume?: () => void) {
  const runtime = useContext(GameModeContext);
  const actions = useRef({ onPause, onResume }); actions.current = { onPause, onResume };
  useSyncExternalStore(runtime?.subscribe ?? noopSubscribe, runtime?.snapshot ?? notPaused, notPaused);
  useLayoutEffect(() => runtime?.register({
    pause: () => actions.current.onPause?.(),
    resume: () => actions.current.onResume?.(),
  }), [runtime]);
  return runtime;
}

/** Host-provided exit (back to the game catalogue). Null outside a host frame. */
export const GameModeExitContext = createContext<(() => void) | null>(null);
export const useGameModeExit = () => useContext(GameModeExitContext);
