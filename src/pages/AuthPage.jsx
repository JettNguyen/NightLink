import { useEffect, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './AuthPage.css';

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const signupGroupRef = useRef(null);
  const signinGroupRef = useRef(null);
  const [fieldHeight, setFieldHeight] = useState(null);

  useEffect(() => {
    const activeRef = isSignUp ? signupGroupRef : signinGroupRef;
    if (activeRef.current) {
      setFieldHeight(activeRef.current.scrollHeight);
    }
  }, [isSignUp, username, displayName, email, identifier]);

  const normalizeUsername = (value) => value.trim().toLowerCase();
  const usernamePattern = /^[a-zA-Z0-9_]{3,20}$/;

  const reserveUsername = async (normalizedValue) => {
    const usernameRef = doc(db, 'usernames', normalizedValue);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(usernameRef);

      if (snapshot.exists()) {
        const err = new Error('username-taken');
        err.code = 'username-taken';
        throw err;
      }

      transaction.set(usernameRef, {
        normalizedUsername: normalizedValue,
        reservedAt: serverTimestamp()
      });
    });

    return usernameRef;
  };

  const releaseUsernameReservation = async (usernameRef) => {
    if (!usernameRef) return;

    try {
      const snapshot = await getDoc(usernameRef);
      if (!snapshot.exists() || snapshot.data()?.uid) return;
      await deleteDoc(usernameRef);
    } catch (_) {
      // noop; cleanup best effort only
    }
  };

  const resolveIdentifierToEmail = async (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      const err = new Error('identifier-required');
      err.code = 'identifier-required';
      throw err;
    }

    if (trimmed.includes('@')) {
      return trimmed;
    }

    const normalizedValue = trimmed.toLowerCase();
    const usernameDoc = await getDoc(doc(db, 'usernames', normalizedValue));

    if (!usernameDoc.exists()) {
      const err = new Error('username-not-found');
      err.code = 'username-not-found';
      throw err;
    }

    const data = usernameDoc.data();
    if (!data?.email) {
      const err = new Error('username-email-missing');
      err.code = 'username-email-missing';
      throw err;
    }

    return data.email;
  };

  const saveUserProfile = async (user, profile) => {
    await setDoc(doc(db, 'users', user.uid), {
      ...profile,
      createdAt: new Date(),
      updatedAt: new Date(),
      allowAnonymousSharing: true,
      followerIds: [],
      followingIds: []
    });
  };

  const friendlyMessage = (err) => {
    if (!err?.message) return 'Something went wrong. Please try again.';
    if (err.code === 'username-taken') return 'That username is already in use.';
    if (err.code === 'identifier-required') return 'Please enter your email or username.';
    if (err.code === 'username-not-found') return 'No account found with that username.';
    if (err.code === 'username-email-missing') return 'This username cannot be used yet. Try your email.';
    if (err.message.includes('auth/email-already-in-use')) return 'That email is already in use.';
    if (err.message.includes('auth/invalid-email')) return 'Please use a valid email address.';
    if (err.message.includes('auth/invalid-credential')) return 'Email or password is incorrect.';
    if (err.message.includes('auth/user-not-found')) return 'Email or username is incorrect.';
    return err.message;
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setError('Please choose a username.');
      setLoading(false);
      return;
    }

    if (!usernamePattern.test(trimmedUsername)) {
      setError('Usernames must be 3-20 characters (letters, numbers, underscores).');
      setLoading(false);
      return;
    }

    let usernameRef = null;

    try {
      const normalizedValue = normalizeUsername(trimmedUsername);
      usernameRef = await reserveUsername(normalizedValue);
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await saveUserProfile(user, {
        email,
        displayName: displayName || trimmedUsername,
        username: trimmedUsername,
        normalizedUsername: normalizedValue,
        isAnonymous: false
      });
      await setDoc(usernameRef, {
        uid: user.uid,
        username: trimmedUsername,
        normalizedUsername: normalizedValue,
        email,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      await releaseUsernameReservation(usernameRef);
      setError(friendlyMessage(err));
    }

    setLoading(false);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const emailForSignIn = await resolveIdentifierToEmail(identifier);
      await signInWithEmailAndPassword(auth, emailForSignIn, password);
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
            onClick={() => {
              setIsSignUp(false);
              setError('');
            }}
          >
            Sign In
          </button>
          <button 
            className={isSignUp ? 'active' : ''} 
            onClick={() => {
              setIsSignUp(true);
              setError('');
            }}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="auth-form">
          <div
            className="auth-field-switch"
            style={fieldHeight ? { height: `${fieldHeight}px` } : undefined}
          >
            <div
              className={`auth-field-group signup-group ${isSignUp ? 'is-active' : ''}`}
              aria-hidden={!isSignUp}
              ref={signupGroupRef}
            >
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required={isSignUp}
                className="auth-input"
                autoComplete="username"
                tabIndex={isSignUp ? 0 : -1}
              />
              <input
                type="text"
                placeholder="Display Name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="auth-input"
                autoComplete="nickname"
                tabIndex={isSignUp ? 0 : -1}
              />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={isSignUp}
                className="auth-input"
                autoComplete="email"
                tabIndex={isSignUp ? 0 : -1}
              />
            </div>

            <div
              className={`auth-field-group signin-group ${!isSignUp ? 'is-active' : ''}`}
              aria-hidden={isSignUp}
              ref={signinGroupRef}
            >
              <input
                type="text"
                placeholder="Email or Username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required={!isSignUp}
                className="auth-input"
                autoComplete="username"
                tabIndex={!isSignUp ? 0 : -1}
              />
            </div>
          </div>

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="auth-input"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
