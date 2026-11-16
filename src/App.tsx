import { GameHost } from '@/platform/GameHost';
import { CrtOverlay } from '@/platform/CrtOverlay';

function App() {
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
