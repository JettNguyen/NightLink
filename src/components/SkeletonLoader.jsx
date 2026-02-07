import PropTypes from 'prop-types';
import './SkeletonLoader.css';

export function DreamCardSkeleton() {
  return (
    <div className="dream-card-skeleton">
      <div className="skeleton-header">
        <div className="skeleton-avatar"></div>
        <div className="skeleton-info">
          <div className="skeleton-text skeleton-text-sm"></div>
          <div className="skeleton-text skeleton-text-xs"></div>
        </div>
      </div>
      <div className="skeleton-content">
        <div className="skeleton-text"></div>
        <div className="skeleton-text"></div>
        <div className="skeleton-text skeleton-text-short"></div>
      </div>
      <div className="skeleton-footer">
        <div className="skeleton-reaction"></div>
        <div className="skeleton-reaction"></div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="profile-skeleton">
      <div className="skeleton-avatar-large"></div>
      <div className="skeleton-text skeleton-text-lg"></div>
      <div className="skeleton-text skeleton-text-sm"></div>
      <div className="skeleton-button"></div>
    </div>
  );
}

export function ListSkeleton({ count = 3 }) {
  return (
    <div className="list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <DreamCardSkeleton key={i} />
      ))}
    </div>
  );
}

ListSkeleton.propTypes = {
  count: PropTypes.number
};

export default DreamCardSkeleton;
