import { GameHost } from '@/platform/GameHost';
import { CrtOverlay } from '@/platform/CrtOverlay';
import { lazy, Suspense } from 'react';

const SpriteAnimationPreview = lazy(() => import('@/platform/SpriteAnimationPreview'));
const SpinMovementVerification = lazy(() => import('@/platform/SpinMovementVerification')
  .then(module => ({ default: module.SpinMovementVerification })));

function App() {
  if (window.location.pathname.replace(/\/$/, '') === '/animation-preview') return <>
    <div data-testid="movement-verification" style={{ height: '100dvh', overflowY: 'auto', background: '#0b192a', color: '#f4f5e9', fontFamily: 'monospace' }}>
      <Suspense fallback={<p>Loading the game’s actual sprite renderer…</p>}>
        <SpriteAnimationPreview />
        <SpinMovementVerification />
      </Suspense>
    </div>
    <CrtOverlay />
  </>;
  return (
    <>
      <main className="kr-shell" data-testid="kick-return-shell">
        <GameHost />
      </main>
      <CrtOverlay />
    </>
  );
}

export default App;
