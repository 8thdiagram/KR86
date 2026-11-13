import type { ReactNode } from 'react';
import { ErrorBoundary, type ErrorFallbackProps } from '../error-boundary';

function GameLoadFailure({ error }: ErrorFallbackProps) {
  return <section role="alert" className="gm-loading" data-testid="game-load-error">
    <h2>The game couldn’t load.</h2>
    <p>Reload to download a fresh copy. Your saved football progress will not be cleared.</p>
    <button type="button" className="gm-back" onClick={() => window.location.reload()} data-testid="button-game-reload">Reload game</button>
    <p>You can also return to the game menu.</p>
    <details><summary>Error details</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{error.message}</pre></details>
  </section>;
}

/** A retained game's lazy import lives outside the ordinary route boundary. */
export function GameLoadBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary FallbackComponent={GameLoadFailure}>{children}</ErrorBoundary>;
}
