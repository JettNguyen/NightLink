import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { faBook, faCompass, faSearch, faUser, faBell } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';
import { firebaseUserPropType, activityPreviewPropType } from '../propTypes';
import { persistFeedSeenTimestamp } from '../services/UserService';

const COMPACT_ENTER = 110;
const COMPACT_EXIT = 40;
const getWin = () => (typeof globalThis !== 'undefined' ? globalThis.window : undefined);

function Navigation({ user, activityPreview }) {
  const location = useLocation();
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(compact);
  const viewerId = user?.uid || '';
  const inbox = activityPreview?.inboxEntries ?? [];
  const unreadCount = activityPreview?.unreadActivityCount ?? inbox.filter((e) => !e?.read).length;
  const hasUnread = activityPreview?.hasUnreadActivity ?? unreadCount > 0;
  const updates = activityPreview?.followingUpdates ?? [];
  const latestTs = activityPreview?.latestFollowingTimestamp || 0;
  const remoteFeedSeenAt = activityPreview?.feedSeenAt ?? 0;
  const storageKey = `nightlink:feedSeen:${viewerId || 'anon'}`;

  const readLocalFeedSeenAt = () => {
    const w = getWin();
    if (!w) return 0;
    try { return Number(w.localStorage.getItem(storageKey)) || 0; }
    catch { return 0; }
  };

  const [localFeedSeenAt, setLocalFeedSeenAt] = useState(() => readLocalFeedSeenAt());

  useEffect(() => {
    setLocalFeedSeenAt(readLocalFeedSeenAt());
  }, [storageKey]);

  const persistLocalFeedSeenAt = useCallback((value) => {
    setLocalFeedSeenAt(value);
    const w = getWin();
    if (!w) return;
    try { w.localStorage.setItem(storageKey, String(value)); } catch {
      // localStorage unavailable (private mode or quota); ignore markers
    }
  }, [storageKey]);

  useEffect(() => {
    if (remoteFeedSeenAt > localFeedSeenAt) {
      persistLocalFeedSeenAt(remoteFeedSeenAt);
    }
  }, [remoteFeedSeenAt, localFeedSeenAt, persistLocalFeedSeenAt]);

  const effectiveFeedSeenAt = Math.max(localFeedSeenAt, remoteFeedSeenAt);

  const newFeedCount = useMemo(() => {
    const count = updates.reduce((n, e) => {
      const t = (e.updatedAt || e.createdAt)?.getTime?.() || 0;
      return t > effectiveFeedSeenAt ? n + 1 : n;
    }, 0);
    return count > 0 ? count : (latestTs > effectiveFeedSeenAt ? 1 : 0);
  }, [updates, effectiveFeedSeenAt, latestTs]);

  const hasNewFeed = newFeedCount > 0;

  const markFeedSeen = useCallback(() => {
    const ref = Math.max(latestTs, Date.now());
    persistLocalFeedSeenAt(ref);
    if (viewerId) {
      persistFeedSeenTimestamp(viewerId, ref).catch(() => {});
    }
  }, [latestTs, viewerId, persistLocalFeedSeenAt]);

  const fromNav = location.state?.fromNav;

  const currentPath = useMemo(() => {
    const p = location.pathname;
    if (p.startsWith('/dream')) return fromNav || '/journal';
    if (p.startsWith('/journal')) return '/journal';
    if (p.startsWith('/feed')) return '/feed';
    if (p.startsWith('/search')) return '/search';
    if (p.startsWith('/activity')) return '/activity';
    if (p.startsWith('/profile')) return '/profile';
    return p;
  }, [location.pathname, fromNav]);

  const isActive = (path) => currentPath === path ? 'active' : '';

  useEffect(() => {
    if (currentPath === '/feed') markFeedSeen();
  }, [currentPath, markFeedSeen]);

  useEffect(() => { compactRef.current = compact; }, [compact]);

  useEffect(() => {
    const w = getWin();
    if (!w) return;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      w.requestAnimationFrame(() => {
        const y = w.scrollY || 0;
        if (!compactRef.current && y > COMPACT_ENTER) setCompact(true);
        else if (compactRef.current && y < COMPACT_EXIT) setCompact(false);
        ticking = false;
      });
    };

    onScroll();
    w.addEventListener('scroll', onScroll, { passive: true });
    return () => w.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`navigation${compact ? ' navigation-compact' : ''}`}>
      <div className="nav-container">
        <Link to="/journal" className="nav-logo">
          <img src="/favicon.svg" alt="" className="nav-logo-icon" />
          <span>NightLink</span>
        </Link>

        <div className="nav-links">
          <Link to="/journal" aria-label="Journal" className={isActive('/journal')}>
            <FontAwesomeIcon icon={faBook} className="nav-icon" />
            <span className="nav-tab-label">Journal</span>
          </Link>
          <Link to="/feed" aria-label="Feed" className={isActive('/feed')} onClick={markFeedSeen}>
            <span className="nav-icon-wrapper">
              <FontAwesomeIcon icon={faCompass} className="nav-icon" />
              {hasNewFeed && (
                <span className="nav-activity-indicator" aria-label={`${newFeedCount} new`}>
                  {newFeedCount > 9 ? '9+' : newFeedCount}
                </span>
              )}
            </span>
            <span className="nav-tab-label">Feed</span>
          </Link>
          <Link to="/search" aria-label="Search" className={isActive('/search')}>
            <FontAwesomeIcon icon={faSearch} className="nav-icon" />
            <span className="nav-tab-label">Search</span>
          </Link>
          <Link to="/activity" aria-label="Activity" className={isActive('/activity')}>
            <span className="nav-icon-wrapper">
              <FontAwesomeIcon icon={faBell} className="nav-icon" />
              {hasUnread && (
                <span className="nav-activity-indicator" aria-label={`${unreadCount} unread`}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </span>
            <span className="nav-tab-label">Activity</span>
          </Link>
          <Link to="/profile" aria-label="Profile" className={isActive('/profile')}>
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
