import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import PropTypes from 'prop-types';
import { supabase } from './supabase';
import AuthPage from './pages/AuthPage';
import DreamJournal from './pages/DreamJournal';
import DreamDetail from './pages/DreamDetail';
import Feed from './pages/Feed';
import Navigation from './components/Navigation';
import OfflineIndicator from './components/OfflineIndicator';
import LoadingIndicator from './components/LoadingIndicator';
import ErrorBoundary from './components/ErrorBoundary';
import useActivityPreview from './hooks/useActivityPreview';
import { firebaseUserPropType } from './propTypes';

// Lazy load less critical pages
const Profile = lazy(() => import('./pages/Profile'));
const Search = lazy(() => import('./pages/Search'));
const Activity = lazy(() => import('./pages/Activity'));
const Settings = lazy(() => import('./pages/Settings'));
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));

function ProtectedRoute({ user, children }) {
  return user ? children : <Navigate to="/login" replace />;
}

function LazyRouteLoader() {
  return (
    <div className="lazy-route-loading">
      <LoadingIndicator label="Loading…" size="md" />
    </div>
  );
}

function LegacyRedirect() {
  const { dreamId } = useParams();
  return <Navigate to={`/dream/${dreamId}`} replace />;
}

function AppContent({ user, loading, ready }) {
  const { pathname } = useLocation();
  const showNav = user && pathname !== '/login';
  const home = useMemo(() => (user ? '/journal' : '/login'), [user]);
  const activity = useActivityPreview(user?.uid);

  if (loading) {
    return (
      <div className="app-loading-shell">
        <LoadingIndicator label="Loading your space…" size="lg" />
      </div>
    );
  }

  if (ready && !user && pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  const wrap = (Component) => (
    <ProtectedRoute user={user}><Component user={user} /></ProtectedRoute>
  );

  return (
    <div className="app">
      <OfflineIndicator />
      {showNav && <Navigation user={user} activityPreview={activity} />}
    <main style={{ minHeight: '100dvh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />
          <Route path="/login" element={user ? <Navigate to="/journal" replace /> : <AuthPage />} />
          <Route path="/terms" element={<Suspense fallback={<LazyRouteLoader />}><TermsOfUse /></Suspense>} />
          <Route path="/privacy" element={<Suspense fallback={<LazyRouteLoader />}><PrivacyPolicy /></Suspense>} />
          <Route path="/journal" element={wrap(DreamJournal)} />
          <Route path="/profile/:handle/dream/:dreamId" element={wrap(DreamDetail)} />
          <Route path="/dream/:dreamId" element={wrap(DreamDetail)} />
          <Route path="/journal/:dreamId" element={<ProtectedRoute user={user}><LegacyRedirect /></ProtectedRoute>} />
          <Route path="/feed" element={wrap(Feed)} />
          <Route path="/profile" element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LazyRouteLoader />}>
                <Profile user={user} />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/profile/:handle" element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LazyRouteLoader />}>
                <Profile user={user} />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/search" element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LazyRouteLoader />}>
                <Search user={user} />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LazyRouteLoader />}>
                <Settings user={user} />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route
            path="/activity"
            element={
              <ProtectedRoute user={user}>
                <Suspense fallback={<LazyRouteLoader />}>
                  <Activity user={user} activityPreview={activity} />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="/notifications" element={<Navigate to="/activity" replace />} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </div>
  );
}

// Build a normalized user object with the same shape the rest of the app expects.
const buildNormalizedUser = (session) => {
  if (!session) return null;
  const { user, access_token } = session;
  return {
    uid: user.id,
    email: user.email || '',
    displayName: user.user_metadata?.display_name || user.user_metadata?.full_name || null,
    photoURL: user.user_metadata?.avatar_url || null,
    providerData: (user.identities || []).map((i) => ({ providerId: i.provider })),
    getIdToken: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || access_token || null;
    }
  };
};

// Ensure a profile row exists for OAuth (Google) sign-ins.
// Email/password sign-ups create the profile explicitly in AuthPage.jsx.
const ensureProfile = async (session) => {
  if (!session) return;
  const { user } = session;
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();
  if (existing) return; // profile already exists

  // Auto-generate a username from the email prefix
  const emailPrefix = user.email?.split('@')[0] || 'dreamer';
  const base = emailPrefix.replace(/[^a-zA-Z0-9_]/g, '_') || 'dreamer';
  let username = base;
  let counter = 1;
  while (counter <= 5000) {
    const { data: taken } = await supabase
      .from('profiles')
      .select('id')
      .eq('normalized_username', username.toLowerCase())
      .single();
    if (!taken) break;
    username = `${base}${counter}`;
    counter++;
  }

  await supabase.from('profiles').insert({
    id:                 user.id,
    email:              user.email,
    display_name:       user.user_metadata?.full_name || user.user_metadata?.display_name || username,
    username,
    normalized_username: username.toLowerCase(),
    is_anonymous:       false,
    following_ids:      [],
    follower_ids:       [],
  });
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Hydrate session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) ensureProfile(session).catch(console.error);
      setUser(buildNormalizedUser(session));
      setLoading(false);
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) ensureProfile(session).catch(console.error);
      setUser(buildNormalizedUser(session));
      setLoading(false);
      setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = 'dark'; }, []);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ErrorBoundary>
        <AppContent user={user} loading={loading} ready={ready} />
      </ErrorBoundary>
    </Router>
  );
}

export default App;

ProtectedRoute.propTypes = {
  user: firebaseUserPropType,
  children: PropTypes.node.isRequired
};

AppContent.propTypes = {
  user: firebaseUserPropType,
  loading: PropTypes.bool.isRequired,
  ready: PropTypes.bool.isRequired
};
