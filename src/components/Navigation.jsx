import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { signOut } from 'firebase/auth';
import { Link, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import './Navigation.css';

export default function Navigation() {
  const location = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {
      alert('Sign out failed. Please try again.');
    }
  };

  const linkClass = (path) => (location.pathname === path ? 'active' : '');

  return (
    <nav className="navigation">
      <div className="nav-container">
        <Link to="/journal" className="nav-logo">
          NightLink
        </Link>

        <div className="nav-links">
          <Link to="/journal" className={linkClass('/journal')}>
            Journal
          </Link>
          <Link to="/feed" className={linkClass('/feed')}>
            Feed
          </Link>
          <Link to="/search" className={linkClass('/search')}>
            Search
          </Link>
          <Link to="/profile" className={linkClass('/profile')}>
            Profile
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
