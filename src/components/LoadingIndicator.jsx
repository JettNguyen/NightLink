import PropTypes from 'prop-types';
import './LoadingIndicator.css';

const SIZES = { sm: 'loading-track-sm', md: 'loading-track-md', lg: 'loading-track-lg' };
const ALIGNS = { center: 'loading-indicator-center', start: 'loading-indicator-start' };

export default function LoadingIndicator({ label = 'Loading…', size = 'md', align = 'center', className = '' }) {
  const classes = ['loading-indicator', ALIGNS[align] || ALIGNS.center, className].filter(Boolean).join(' ');

  return (
    <div role="status" aria-live="polite" className={classes}>
      <div className={`loading-track ${SIZES[size] || SIZES.md}`}>
        <span className="loading-orb" aria-hidden="true" />
        <span className="loading-orb loading-orb-delay" aria-hidden="true" />
      </div>
      {label && <p className="loading-label">{label}</p>}
    </div>
  );
}

LoadingIndicator.propTypes = {
  label: PropTypes.node,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  align: PropTypes.oneOf(['center', 'start']),
  className: PropTypes.string
};
