import { useEffect } from 'react';
import './Toast.css';

/**
 * Toast — a brief non-blocking message shown at the bottom of the screen.
 * Usage: <Toast message="Saved!" onDismiss={() => setMsg('')} />
 */
export default function Toast({ message, onDismiss, duration = 3000 }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, onDismiss, duration]);

  if (!message) return null;

  return (
    <div className="toast" role="status" aria-live="polite" onClick={onDismiss}>
      {message}
    </div>
  );
}
