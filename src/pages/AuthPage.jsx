import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '../supabase';
import './AuthPage.css';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const NATIVE_OAUTH_REDIRECT = 'dev.nightlink://auth/callback';
const NATIVE_OAUTH_SCHEME = 'dev.nightlink://';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const friendlyMsg = (e) => {
  const msg = e?.message || '';
  if (!msg) return 'Something went wrong.';
  if (msg.includes('User already registered') || msg.includes('already been registered')) return 'Email already in use.';
  if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) return 'Wrong email or password.';
  if (msg.includes('Email not confirmed')) return 'Check your inbox and confirm your email first.';
  if (msg.includes('username-taken')) return 'Username already taken.';
  if (msg.includes('identifier-required')) return 'Enter your email or username.';
  if (msg.includes('username-not-found')) return 'No account with that username.';
  return msg;
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
  const navigate = useNavigate();
  const isSignUp = mode === 'signup';

  useEffect(() => {
    const ref = isSignUp ? signupRef : signinRef;
    if (ref.current) setHeight(ref.current.scrollHeight);
  }, [isSignUp, username, displayName, email, identifier]);

  // Resolve a login identifier to an email. Supports raw email or username lookup.
  const resolveEmail = async (val) => {
    const v = val.trim();
    if (!v) throw new Error('identifier-required');
    if (v.includes('@')) return v;
    const { data, error: qErr } = await supabase
      .from('profiles')
      .select('email')
      .eq('normalized_username', v.toLowerCase())
      .single();
    if (qErr || !data?.email) throw new Error('username-not-found');
    return data.email;
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const name = username.trim();
    if (!name) { setError('Choose a username.'); setLoading(false); return; }
    if (!USERNAME_RE.test(name)) {
      setError('3–20 chars: letters, numbers, underscores.');
      setLoading(false);
      return;
    }

    try {
      const normalized = name.toLowerCase();

      // Check username availability
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('normalized_username', normalized)
        .single();
      if (existing) throw new Error('username-taken');

      // Create auth user
      const { data: authData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName.trim() || name,
            username: name,
          }
        }
      });
      if (signUpErr) throw signUpErr;

      const uid = authData.user?.id;
      if (!uid) throw new Error('Signup failed — no user ID returned.');

      // Create profile row
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: uid,
        email: email.trim(),
        display_name: displayName.trim() || name,
        username: name,
        normalized_username: normalized,
        is_anonymous: false,
        following_ids: [],
        follower_ids: [],
      });
      if (profileErr) throw profileErr;
    } catch (err) {
      setError(friendlyMsg(err));
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    const addr = forgotEmail.trim();
    if (!addr) { setError('Enter your email address.'); return; }
    setForgotLoading(true);
    setError('');
    setForgotStatus('');
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(addr);
      if (err) throw err;
      setForgotStatus('Reset email sent — check your inbox.');
    } catch (err) {
      setError(friendlyMsg(err));
    }
    setForgotLoading(false);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const mail = await resolveEmail(identifier);
      const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (err) throw err;
    } catch (err) {
      setError(friendlyMsg(err));
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const { data, error: err } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: NATIVE_OAUTH_REDIRECT,
            skipBrowserRedirect: true,
          }
        });
        if (err) throw err;
        if (!data?.url) throw new Error('Could not start Google sign in.');

        let finished = false;
        let appUrlListener;
        let browserFinishedListener;
        let authStateSubscription;

        const cleanup = async () => {
          if (appUrlListener) await appUrlListener.remove();
          if (browserFinishedListener) await browserFinishedListener.remove();
          if (authStateSubscription) authStateSubscription.unsubscribe();
        };

        const completeNativeOAuth = async (source) => {
          if (finished) return;
          finished = true;
          setLoading(false);
          navigate('/journal', { replace: true });

          Browser.close()
            .then(() => {})
            .catch((closeErr) => {
              const closeMessage = closeErr?.message || closeErr?.errorMessage || String(closeErr);
              if ((closeMessage || '').includes('No active window to close')) {
                return;
              }
            });

          await cleanup();
        };

        const { data: authListenerData } = supabase.auth.onAuthStateChange(async (event) => {
          if (event !== 'SIGNED_IN') return;
          try {
            await completeNativeOAuth('SIGNED_IN listener');
          } catch {
            setLoading(false);
          }
        });
        authStateSubscription = authListenerData.subscription;

        appUrlListener = await CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
          if (finished || !url?.startsWith(NATIVE_OAUTH_SCHEME)) return;
          try {
            const parsed = new URL(url);
            const code = parsed.searchParams.get('code');

            if (code) {
              const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
              if (exchangeError) throw exchangeError;
            } else {
              const hashParams = new URLSearchParams((parsed.hash || '').replace(/^#/, ''));
              const accessToken = hashParams.get('access_token');
              const refreshToken = hashParams.get('refresh_token');
              if (!accessToken || !refreshToken) {
                throw new Error('Missing auth session data from Google callback.');
              }
              const { error: setSessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (setSessionError) throw setSessionError;
            }

            await completeNativeOAuth('appUrlOpen callback');
          } catch (exchangeErr) {
            setError(friendlyMsg(exchangeErr));
            setLoading(false);
          } finally {
            if (!finished) await cleanup();
          }
        });

        browserFinishedListener = await Browser.addListener('browserFinished', async () => {
          // If the browser closes naturally, keep listeners active a little longer
          // because callback handoff can be delayed on iOS.
          if (finished) return;
          await wait(1200);
          if (finished) return;
          await cleanup();
          setLoading(false);
        });

        await Browser.open({
          url: data.url,
          presentationStyle: 'fullscreen',
        });
        return;
      }

      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (err) throw err;
      // After redirect, onAuthStateChange fires and App.jsx provisions the profile if needed
    } catch (err) {
      setError(friendlyMsg(err));
      setLoading(false);
    }
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
