import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth } from './firebase';
import PropTypes from 'prop-types';
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

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    setPersistence(auth, browserLocalPersistence)
      .catch(() => {})
      .finally(() => {
        unsub = onAuthStateChanged(auth, (u) => {
          setUser(u);
          setLoading(false);
          setReady(true);
        });
      });
    return () => unsub();
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