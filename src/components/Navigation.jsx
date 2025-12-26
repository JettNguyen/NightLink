import { useEffect, useMemo, useState } from 'react';
import { faRightFromBracket, faBook, faCompass, faSearch, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { signOut } from 'firebase/auth';
import { Link, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import './Navigation.css';

export default function Navigation() {
  const location = useLocation();
  const [isCompact, setIsCompact] = useState(false);

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

  useEffect(() => {
    const handleScroll = () => {
      setIsCompact(window.scrollY > 40);
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
