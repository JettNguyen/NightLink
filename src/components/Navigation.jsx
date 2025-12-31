import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { faBook, faCompass, faSearch, faUser, faBell } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';
import { firebaseUserPropType, activityPreviewPropType } from '../propTypes';

const COMPACT_ENTER_OFFSET = 110;
const COMPACT_EXIT_OFFSET = 40;
const getWindowRef = () => (typeof globalThis !== 'undefined' ? globalThis.window : undefined);

function Navigation({ user, activityPreview }) {
  const location = useLocation();
  const [isCompact, setIsCompact] = useState(false);
  const compactRef = useRef(isCompact);
  const viewerId = user?.uid || 'anon';
  const inboxEntries = activityPreview?.inboxEntries ?? [];
  const unreadActivityCount = activityPreview?.unreadActivityCount
    ?? inboxEntries.filter((entry) => entry?.read === false).length;
  const hasUnreadActivity = activityPreview?.hasUnreadActivity ?? unreadActivityCount > 0;
  const followingUpdates = activityPreview?.followingUpdates ?? [];
  const latestFollowingTimestamp = activityPreview?.latestFollowingTimestamp || 0;
  const feedSeenStorageKey = `nightlink:feedLastSeenAt:${viewerId}`;

  const [feedLastSeenAt, setFeedLastSeenAt] = useState(() => {
    const win = getWindowRef();
    if (!win) return 0;
    try {
      const storedValue = win.localStorage.getItem(feedSeenStorageKey);
      const parsed = Number(storedValue);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const win = getWindowRef();
    if (!win) return;
    try {
      const storedValue = win.localStorage.getItem(feedSeenStorageKey);
      const parsed = Number(storedValue);
      setFeedLastSeenAt(Number.isFinite(parsed) ? parsed : 0);
    } catch {
      setFeedLastSeenAt(0);
    }
  }, [feedSeenStorageKey]);

  const newFeedUpdatesCount = useMemo(() => {
    const derivedCount = followingUpdates.reduce((count, entry) => {
      const entryTime = (entry.updatedAt || entry.createdAt)?.getTime?.() || 0;
      return entryTime > feedLastSeenAt ? count + 1 : count;
    }, 0);

    if (derivedCount > 0) {
      return derivedCount;
    }

    return latestFollowingTimestamp > feedLastSeenAt ? 1 : 0;
  }, [followingUpdates, feedLastSeenAt, latestFollowingTimestamp]);

  const hasUnreadFeed = newFeedUpdatesCount > 0;

  const markFeedAsSeen = useCallback(() => {
    const win = getWindowRef();
    if (!win) return;
    const reference = Math.max(latestFollowingTimestamp, Date.now());
    setFeedLastSeenAt(reference);
    try {
      win.localStorage.setItem(feedSeenStorageKey, String(reference));
    } catch {
      // ignore storage errors
    }
  }, [feedSeenStorageKey, latestFollowingTimestamp]);

  const dreamOrigin = location.state?.fromNav;

  const normalizedPath = useMemo(() => {
    if (location.pathname.startsWith('/dream')) {
      return dreamOrigin || '/journal';
    }
    if (location.pathname.startsWith('/journal')) return '/journal';
    if (location.pathname.startsWith('/feed')) return '/feed';
    if (location.pathname.startsWith('/search')) return '/search';
    if (location.pathname.startsWith('/activity')) return '/activity';
    if (location.pathname.startsWith('/profile')) return '/profile';
    return location.pathname;
  }, [location.pathname, dreamOrigin]);

  const linkClass = (path) => (normalizedPath === path ? 'active' : '');

  useEffect(() => {
    if (normalizedPath === '/feed') {
      markFeedAsSeen();
    }
  }, [normalizedPath, markFeedAsSeen]);

  const handleFeedLinkClick = () => {
    markFeedAsSeen();
  };

  useEffect(() => {
    compactRef.current = isCompact;
  }, [isCompact]);

  useEffect(() => {
    const win = getWindowRef();
    if (!win) return undefined;

    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      win.requestAnimationFrame(() => {
        const currentY = win.scrollY || 0;

        if (!compactRef.current && currentY > COMPACT_ENTER_OFFSET) {
          setIsCompact(true);
        } else if (compactRef.current && currentY < COMPACT_EXIT_OFFSET) {
          setIsCompact(false);
        }

        ticking = false;
      });
    };

    handleScroll();
    win.addEventListener('scroll', handleScroll, { passive: true });
    return () => win.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`navigation${isCompact ? ' navigation-compact' : ''}`}>
      <div className="nav-container">
        <Link to="/journal" className="nav-logo">
          <img src="/favicon.svg" alt="" className="nav-logo-icon" />
          <span>NightLink</span>
        </Link>

        <div className="nav-links">
          <Link
            to="/journal"
            aria-label="Journal"
            className={linkClass('/journal')}
          >
            <FontAwesomeIcon icon={faBook} className="nav-icon" />
            <span className="nav-tab-label">Journal</span>
          </Link>
          <Link
            to="/feed"
            aria-label="Feed"
            className={linkClass('/feed')}
            onClick={handleFeedLinkClick}
          >
            <span className="nav-icon-wrapper">
              <FontAwesomeIcon icon={faCompass} className="nav-icon" />
              {hasUnreadFeed && (
                <span className="nav-activity-indicator" aria-label={`${newFeedUpdatesCount} new feed updates`}>
                  {newFeedUpdatesCount > 9 ? '9+' : newFeedUpdatesCount}
                </span>
              )}
            </span>
            <span className="nav-tab-label">Feed</span>
          </Link>
          <Link
            to="/search"
            aria-label="Search"
            className={linkClass('/search')}
          >
            <FontAwesomeIcon icon={faSearch} className="nav-icon" />
            <span className="nav-tab-label">Search</span>
          </Link>
          <Link
            to="/activity"
            aria-label="Activity"
            className={linkClass('/activity')}
          >
            <span className="nav-icon-wrapper">
              <FontAwesomeIcon icon={faBell} className="nav-icon" />
              {hasUnreadActivity && (
                <span className="nav-activity-indicator" aria-label={`${unreadActivityCount} unread notifications`}>
                  {unreadActivityCount > 9 ? '9+' : unreadActivityCount}
                </span>
              )}
            </span>
            <span className="nav-tab-label">Activity</span>
          </Link>
          <Link
            to="/profile"
            aria-label="Profile"
            className={linkClass('/profile')}
          >
            <FontAwesomeIcon icon={faUser} className="nav-icon" />
            <span className="nav-tab-label">Profile</span>
          </Link>
        </div>

      </div>
    </nav>
  );
}

export default Navigation;

Navigation.propTypes = {
  user: firebaseUserPropType,
  activityPreview: activityPreviewPropType
};
