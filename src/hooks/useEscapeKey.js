import { useEffect } from 'react';

/**
 * Closes a dismissible surface when the user presses Escape.
 *
 * Listens on `document` rather than on the overlay element itself: nothing
 * inside a freshly opened modal has focus, so a keydown bound to the overlay
 * never fires until the user clicks a field first.
 */
export default function useEscapeKey(onEscape, active = true) {
  useEffect(() => {
    if (!active || typeof onEscape !== 'function') return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      onEscape();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, active]);
}
