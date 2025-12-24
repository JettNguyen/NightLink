import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { faRightFromBracket, faBook, faCompass, faSearch, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { signOut } from 'firebase/auth';
import { Link, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import './Navigation.css';

export default function Navigation() {
  const location = useLocation();
  const navLinksRef = useRef(null);
  const linkRefs = useRef({});
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0, opacity: 0 });

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {
      alert('Sign out failed. Please try again.');
    }
  };

  const normalizedPath = useMemo(() => {
    if (location.pathname.startsWith('/journal')) return '/journal';
    if (location.pathname.startsWith('/feed')) return '/feed';
    if (location.pathname.startsWith('/search')) return '/search';
    if (location.pathname.startsWith('/profile')) return '/profile';
    return location.pathname;
  }, [location.pathname]);

  const linkClass = (path) => (normalizedPath === path ? 'active' : '');

  const updateIndicator = useCallback(() => {
    const container = navLinksRef.current;
    const activeEl = linkRefs.current[normalizedPath];

    if (!container || !activeEl) {
      setIndicatorStyle((prev) => (prev.opacity ? { ...prev, opacity: 0 } : prev));
      return;
    }

    const left = activeEl.offsetLeft - container.scrollLeft;
    const width = activeEl.offsetWidth;
    setIndicatorStyle({ width, left, opacity: 1 });
  }, [normalizedPath]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    const container = navLinksRef.current;
    container?.addEventListener('scroll', updateIndicator, { passive: true });

    return () => {
      window.removeEventListener('resize', updateIndicator);
      container?.removeEventListener('scroll', updateIndicator);
    };
  }, [updateIndicator]);

  return (
    <nav className="navigation">
      <div className="nav-container">
        <Link to="/journal" className="nav-logo">
          <img src="/favicon.svg" alt="" className="nav-logo-icon" />
          <span>NightLink</span>
        </Link>

        <div className="nav-links" ref={navLinksRef}>
          <Link
            to="/journal"
            aria-label="Journal"
            className={linkClass('/journal')}
            ref={(el) => {
              linkRefs.current['/journal'] = el;
            }}
          >
            <FontAwesomeIcon icon={faBook} className="nav-icon" />
            <span className="nav-tab-label">Journal</span>
          </Link>
          <Link
            to="/feed"
            aria-label="Feed"
            className={linkClass('/feed')}
            ref={(el) => {
              linkRefs.current['/feed'] = el;
            }}
          >
            <FontAwesomeIcon icon={faCompass} className="nav-icon" />
            <span className="nav-tab-label">Feed</span>
          </Link>
          <Link
            to="/search"
            aria-label="Search"
            className={linkClass('/search')}
            ref={(el) => {
              linkRefs.current['/search'] = el;
            }}
          >
            <FontAwesomeIcon icon={faSearch} className="nav-icon" />
            <span className="nav-tab-label">Search</span>
          </Link>
          <Link
            to="/profile"
            aria-label="Profile"
            className={linkClass('/profile')}
            ref={(el) => {
              linkRefs.current['/profile'] = el;
            }}
          >
            <FontAwesomeIcon icon={faUser} className="nav-icon" />
            <span className="nav-tab-label">Profile</span>
          </Link>
          <span
            className="nav-indicator"
            style={{
              width: `${indicatorStyle.width}px`,
              transform: `translateX(${indicatorStyle.left}px)`,
              opacity: indicatorStyle.opacity
            }}
          />
        </div>

        <div className="nav-actions">
          <button onClick={handleSignOut} className="sign-out-btn">
            <FontAwesomeIcon icon={faRightFromBracket} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
