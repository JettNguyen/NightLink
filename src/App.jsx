import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth } from './firebase';
import PropTypes from 'prop-types';
import AuthPage from './pages/AuthPage';
import DreamJournal from './pages/DreamJournal';
import DreamDetail from './pages/DreamDetail';
import Feed from './pages/Feed';
import Navigation from './components/Navigation';
import Profile from './pages/Profile';
import Search from './pages/Search';
import Activity from './pages/Activity';
import LoadingIndicator from './components/LoadingIndicator';
import useActivityPreview from './hooks/useActivityPreview';
import { firebaseUserPropType } from './propTypes';

function ProtectedRoute({ user, children }) {
  return user ? children : <Navigate to="/login" replace />;
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
      {showNav && <Navigation user={user} activityPreview={activity} />}
      <main style={{ minHeight: '100vh' }}>
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />
          <Route path="/login" element={user ? <Navigate to="/journal" replace /> : <AuthPage />} />
          <Route path="/journal" element={wrap(DreamJournal)} />
          <Route path="/profile/:handle/dream/:dreamId" element={wrap(DreamDetail)} />
          <Route path="/dream/:dreamId" element={wrap(DreamDetail)} />
          <Route path="/journal/:dreamId" element={<ProtectedRoute user={user}><LegacyRedirect /></ProtectedRoute>} />
          <Route path="/feed" element={wrap(Feed)} />
          <Route path="/profile" element={wrap(Profile)} />
          <Route path="/profile/:handle" element={wrap(Profile)} />
          <Route path="/search" element={wrap(Search)} />
          <Route
            path="/activity"
            element={<ProtectedRoute user={user}><Activity user={user} activityPreview={activity} /></ProtectedRoute>}
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
      <AppContent user={user} loading={loading} ready={ready} />
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