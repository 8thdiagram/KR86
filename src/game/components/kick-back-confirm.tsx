import { useState } from 'react';
import { useGameModeExit } from './games/GameModeContext';
import './kick-back-confirm.css';

/**
 * Pause-menu "Back to Game Menu" for Kick Return 86. Active games ask once;
 * cancel returns to the same paused menu. The save is never cleared here.
 */
export function KickBackToMenu({ active, onBeforeExit, className = '' }: { active: boolean; onBeforeExit?: () => void; className?: string }) {
  const exit = useGameModeExit();
  const [asking, setAsking] = useState(false);
  if (!exit) return null;
  const go = () => { setAsking(false); onBeforeExit?.(); exit(); };
  if (asking) return <div className={`kbm-confirm ${className}`} role="alertdialog" aria-label="Leave this game?" data-testid="panel-back-confirm">
    <strong>LEAVE THIS GAME?</strong>
    <span>This closes the current session without clearing your saved progress.</span>
    <div className="kbm-row">
      <button type="button" className="kbm-btn kbm-stay" autoFocus onClick={() => setAsking(false)} data-testid="button-back-cancel">KEEP PLAYING</button>
      <button type="button" className="kbm-btn kbm-leave" onClick={go} data-testid="button-back-confirm">LEAVE</button>
    </div>
  </div>;
  return <button type="button" className={`kbm-btn kbm-open ${className}`} onClick={() => active ? setAsking(true) : go()}
    data-testid="button-back-to-menu" aria-label="Back to game menu">BACK TO GAME MENU</button>;
}
