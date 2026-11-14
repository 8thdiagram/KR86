import { createPortal } from 'react-dom';
import './crt-overlay.css';

export function CrtOverlay() {
  return createPortal(
    <div className="kr-crt-overlay" aria-hidden="true" />,
    document.body,
  );
}
