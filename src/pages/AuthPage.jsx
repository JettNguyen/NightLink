import { useEffect, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './AuthPage.css';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const err = (code) => { const e = new Error(code); e.code = code; return e; };

const friendlyMsg = (e) => {
  if (!e?.message) return 'Something went wrong.';
  const map = {
    'username-taken': 'Username already taken.',
    'identifier-required': 'Enter your email or username.',
    'username-not-found': 'No account with that username.',
    'username-email-missing': 'Try using your email instead.'
  };
  if (map[e.code]) return map[e.code];
  if (e.message.includes('auth/email-already-in-use')) return 'Email already in use.';
  if (e.message.includes('auth/invalid-email')) return 'Invalid email address.';
  if (e.message.includes('auth/invalid-credential')) return 'Wrong email or password.';
  if (e.message.includes('auth/user-not-found')) return 'Account not found.';
  return e.message;
};

export default function AuthPage() {
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const signupRef = useRef(null);
  const signinRef = useRef(null);
  const [height, setHeight] = useState(null);
  const isSignUp = mode === 'signup';

  useEffect(() => {
    const ref = isSignUp ? signupRef : signinRef;
    if (ref.current) setHeight(ref.current.scrollHeight);
  }, [isSignUp, username, displayName, email, identifier]);

  const reserveUsername = async (name) => {
    const ref = doc(db, 'usernames', name);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) throw err('username-taken');
      tx.set(ref, { normalizedUsername: name, reservedAt: serverTimestamp() });
    });
    return ref;
  };

  const releaseUsername = async (ref) => {
    if (!ref) return;
    try {
      const snap = await getDoc(ref);
      if (!snap.exists() || snap.data()?.uid) return;
      await deleteDoc(ref);
    } catch {
      // Ignore cleanup failures to avoid masking the primary auth error
    }
  };

  const resolveEmail = async (val) => {
    const v = val.trim();
    if (!v) throw err('identifier-required');
    if (v.includes('@')) return v;
    const snap = await getDoc(doc(db, 'usernames', v.toLowerCase()));
    if (!snap.exists()) throw err('username-not-found');
    if (!snap.data()?.email) throw err('username-email-missing');
    return snap.data().email;
  };

  const createProfile = async (user, data) => {
    await setDoc(doc(db, 'users', user.uid), {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      allowAnonymousSharing: true,
      followerIds: [],
      followingIds: []
    });
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const name = username.trim();
    if (!name) { setError('Choose a username.'); setLoading(false); return; }
    if (!USERNAME_RE.test(name)) {
      setError('3-20 chars: letters, numbers, underscores.');
      setLoading(false);
      return;
    }

    let ref = null;
    try {
      const normalized = name.toLowerCase();
      ref = await reserveUsername(normalized);
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await createProfile(user, {
        email,
        displayName: displayName || name,
        username: name,
        normalizedUsername: normalized,
        isAnonymous: false
      });
      await setDoc(ref, {
        uid: user.uid,
        username: name,
        normalizedUsername: normalized,
        email,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      await releaseUsername(ref);
      setError(friendlyMsg(e));
    }
    setLoading(false);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const mail = await resolveEmail(identifier);
      await signInWithEmailAndPassword(auth, mail, password);
    } catch (e) {
      setError(friendlyMsg(e));
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h1 className="auth-title">
          <span className="auth-title-icon" aria-hidden="true">
            <img src="/favicon.svg" alt="" />
          </span>
          <span className="auth-title-text">NightLink</span>
        </h1>
        <p className="auth-subtitle">Your dreams, your story</p>

        <div className="auth-tabs">
          <button className={!isSignUp ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); }}>
            Sign In
          </button>
          <button className={isSignUp ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>
            Sign Up
          </button>
        </div>

        <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="auth-form">
          <div className="auth-field-switch" style={height ? { height: `${height}px` } : undefined}>
            <div
              className={`auth-field-group signup-group ${isSignUp ? 'is-active' : ''}`}
              aria-hidden={!isSignUp}
              ref={signupRef}
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
              ref={signinRef}
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
            {loading ? 'Working...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
