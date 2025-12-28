import { useEffect, useMemo, useRef, useState } from 'react';
import { faRightFromBracket, faBook, faCompass, faSearch, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { signOut } from 'firebase/auth';
import { Link, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import './Navigation.css';

const COMPACT_ENTER_OFFSET = 110;
const COMPACT_EXIT_OFFSET = 40;

export default function Navigation() {
  const location = useLocation();
  const [isCompact, setIsCompact] = useState(false);
  const compactRef = useRef(isCompact);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {
      alert('Sign out failed. Please try again.');
    }
  };

  const dreamOrigin = location.state?.fromNav;

  const normalizedPath = useMemo(() => {
    if (location.pathname.startsWith('/dream')) {
      return dreamOrigin || '/journal';
    }
    if (location.pathname.startsWith('/journal')) return '/journal';
    if (location.pathname.startsWith('/feed')) return '/feed';
    if (location.pathname.startsWith('/search')) return '/search';
    if (location.pathname.startsWith('/profile')) return '/profile';
    return location.pathname;
  }, [location.pathname, dreamOrigin]);

  const linkClass = (path) => (normalizedPath === path ? 'active' : '');

  useEffect(() => {
    compactRef.current = isCompact;
  }, [isCompact]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      window.requestAnimationFrame(() => {
        const currentY = window.scrollY || 0;

        if (!compactRef.current && currentY > COMPACT_ENTER_OFFSET) {
          setIsCompact(true);
        } else if (compactRef.current && currentY < COMPACT_EXIT_OFFSET) {
          setIsCompact(false);
        }

        ticking = false;
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
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
          >
            <FontAwesomeIcon icon={faCompass} className="nav-icon" />
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
            to="/profile"
            aria-label="Profile"
            className={linkClass('/profile')}
          >
            <FontAwesomeIcon icon={faUser} className="nav-icon" />
            <span className="nav-tab-label">Profile</span>
          </Link>
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
