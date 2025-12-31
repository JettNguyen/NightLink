import PropTypes from 'prop-types';
import './LoadingIndicator.css';

const TRACK_SIZES = {
  sm: 'loading-track-sm',
  md: 'loading-track-md',
  lg: 'loading-track-lg'
};

const ALIGN_CLASSES = {
  center: 'loading-indicator-center',
  start: 'loading-indicator-start'
};

export default function LoadingIndicator({ label = 'Loading…', size = 'md', align = 'center', className = '' }) {
  const trackSizeClass = TRACK_SIZES[size] || TRACK_SIZES.md;
  const alignmentClass = ALIGN_CLASSES[align] || ALIGN_CLASSES.center;
  const classes = ['loading-indicator', alignmentClass, className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status" aria-live="polite">
      <div className={`loading-track ${trackSizeClass}`}>
        <span className="loading-orb" aria-hidden="true" />
        <span className="loading-orb loading-orb-delay" aria-hidden="true" />
      </div>
      {label ? <p className="loading-label">{label}</p> : null}
    </div>
  );
}

LoadingIndicator.propTypes = {
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  align: PropTypes.oneOf(['center', 'start']),
  className: PropTypes.string
};
