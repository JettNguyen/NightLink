import { useState } from 'react';
import { createUserWithEmailAndPassword, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './AuthPage.css';

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const saveUserProfile = async (user, profile) => {
    await setDoc(doc(db, 'users', user.uid), {
      ...profile,
      createdAt: new Date(),
      updatedAt: new Date(),
      allowAnonymousSharing: true,
      allowFriendRequests: true,
      friendIds: [],
      pendingIncomingRequestIds: [],
      pendingOutgoingRequestIds: []
    });
  };

  const friendlyMessage = (err) => {
    if (!err?.message) return 'Something went wrong. Please try again.';
    if (err.message.includes('auth/email-already-in-use')) return 'That email is already in use.';
    if (err.message.includes('auth/invalid-email')) return 'Please use a valid email address.';
    if (err.message.includes('auth/invalid-credential')) return 'Email or password is incorrect.';
    return err.message;
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await saveUserProfile(user, {
        email,
        displayName: displayName || email.split('@')[0],
        isAnonymous: false
      });
    } catch (err) {
      setError(friendlyMessage(err));
    }

    setLoading(false);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(friendlyMessage(err));
    }

    setLoading(false);
  };

  const handleGuestSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      const { user } = await signInAnonymously(auth);

      await saveUserProfile(user, {
        email: null,
        displayName: 'Guest',
        isAnonymous: true
      });
    } catch (err) {
      setError(friendlyMessage(err));
    }

    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h1 className="auth-title">NightLink</h1>
        <p className="auth-subtitle">Your dreams, your story</p>

        <div className="auth-tabs">
          <button 
            className={!isSignUp ? 'active' : ''} 
            onClick={() => setIsSignUp(false)}
          >
            Sign In
          </button>
          <button 
            className={isSignUp ? 'active' : ''} 
            onClick={() => setIsSignUp(true)}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="auth-form">
          {isSignUp && (
            <input
              type="text"
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="auth-input"
            />
          )}
          
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="auth-input"
          />
          
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="auth-input"
          />

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button onClick={handleGuestSignIn} disabled={loading} className="guest-btn">
          Continue as Guest
        </button>
      </div>
    </div>
  );
}
