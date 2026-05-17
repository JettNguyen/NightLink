import { useEffect } from 'react';
import PropTypes from 'prop-types';
import './Toast.css';

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

Toast.propTypes = {
  message: PropTypes.string,
  onDismiss: PropTypes.func.isRequired,
  duration: PropTypes.number,
};
