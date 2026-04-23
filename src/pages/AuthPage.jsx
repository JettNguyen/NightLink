import { useEffect, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, fetchSignInMethodsForEmail, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
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
  const [showPassword, setShowPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
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

  const handleForgotPassword = async () => {
    const email = forgotEmail.trim();
    if (!email) { setError('Enter your email address.'); return; }
    setForgotLoading(true);
    setError('');
    setForgotStatus('');
    try {
      await sendPasswordResetEmail(auth, email);
      setForgotStatus('Reset email sent — check your inbox.');
    } catch (e) {
      setError(friendlyMsg(e));
    }
    setForgotLoading(false);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    let mail = '';
    try {
      mail = await resolveEmail(identifier);
      await signInWithEmailAndPassword(auth, mail, password);
    } catch (e) {
      const baseMsg = friendlyMsg(e);
      let msg = baseMsg;
      let hintNeeded = e?.code === 'auth/invalid-credential' || e?.code === 'auth/wrong-password';

      if (mail) {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, mail);
          if (methods.includes('google.com')) {
            hintNeeded = true;
          }
        } catch {
          // ignore provider lookup errors; fall back to default message
        }
      }

      if (hintNeeded) {
        msg = `${baseMsg.replace(/\.$/, '')}. If you previously tapped Continue with Google, use that option first, then set a password in Settings → Account access.`;
      }

      setError(msg);
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const { user } = await signInWithPopup(auth, googleProvider);
      let provisioned = false;

      // Check if user profile exists
      const userDoc = await getDoc(doc(db, 'users', user.uid));

      if (!userDoc.exists()) {
        // First-time Google sign-in - create profile with auto-generated username
        const emailPrefix = user.email?.split('@')[0] || 'dreamer';
        const baseUsername = emailPrefix.replace(/[^a-zA-Z0-9_]/g, '_') || 'dreamer';
        let username = baseUsername;
        let counter = 1;

        // Find available username
        while (true) {
          const normalized = username.toLowerCase();
          const usernameDoc = await getDoc(doc(db, 'usernames', normalized));
          if (!usernameDoc.exists()) {
            // Claim this username
            await setDoc(doc(db, 'usernames', normalized), {
              uid: user.uid,
              username,
              normalizedUsername: normalized,
              email: user.email,
              updatedAt: serverTimestamp()
            });

            // Create user profile
            await createProfile(user, {
              email: user.email,
              displayName: user.displayName || username,
              username,
              normalizedUsername: username.toLowerCase(),
              isAnonymous: false,
              photoURL: user.photoURL || null
            });

            provisioned = true;
            break;
          }
          username = `${baseUsername}${counter}`;
          counter++;

          if (counter > 5000) {
            throw new Error('Unable to allocate username. Please try again.');
          }
        }
      } else {
        provisioned = true;
      }

      if (!provisioned) {
        throw new Error('Unable to finish account setup.');
      }
    } catch (e) {
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch {
          // Ignore sign-out errors and keep original message
        }
      }
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

        {mode !== 'forgot' && (
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              role="tab"
              aria-selected={!isSignUp}
              className={!isSignUp ? 'active' : ''}
              onClick={() => { setMode('signin'); setError(''); setShowPassword(false); }}
            >
              Sign In
            </button>
            <button
              role="tab"
              aria-selected={isSignUp}
              className={isSignUp ? 'active' : ''}
              onClick={() => { setMode('signup'); setError(''); setShowPassword(false); }}
            >
              Sign Up
            </button>
          </div>
        )}

        {mode === 'forgot' ? (
          <div className="auth-form">
            <p className="auth-forgot-desc">
              Enter your email and we&apos;ll send you a password reset link.
            </p>
            <input
              type="email"
              placeholder="Email address"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              className="auth-input"
              autoComplete="email"
            />
            {error && <p className="auth-error">{error}</p>}
            {forgotStatus && <p className="auth-success">{forgotStatus}</p>}
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={forgotLoading}
              className="auth-submit"
            >
              {forgotLoading ? 'Sending…' : 'Send Reset Email'}
            </button>
            <button
              type="button"
              className="auth-back-link"
              onClick={() => { setMode('signin'); setError(''); setForgotStatus(''); setForgotEmail(''); }}
            >
              ← Back to Sign In
            </button>
          </div>
        ) : (
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

            <div className="auth-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="auth-input"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {isSignUp && (
              <p className="auth-password-hint">At least 8 characters</p>
            )}
            {!isSignUp && (
              <button
                type="button"
                className="auth-forgot-link"
                onClick={() => { setMode('forgot'); setError(''); setForgotEmail(identifier.includes('@') ? identifier : ''); }}
              >
                Forgot your password?
              </button>
            )}

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Working…' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="auth-google-btn">
              <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                  <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z" />
                  <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z" />
                  <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z" />
                  <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z" />
                </g>
              </svg>
              Continue with Google
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
