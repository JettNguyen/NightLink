import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth } from './firebase';
import AuthPage from './pages/AuthPage';
import DreamJournal from './pages/DreamJournal';
import DreamDetail from './pages/DreamDetail';
import Feed from './pages/Feed';
import Navigation from './components/Navigation';
import Profile from './pages/Profile';
import Search from './pages/Search';

function ProtectedRoute({ user, children }) {
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppContent({ user, loading, authReady }) {
  const location = useLocation();
  const showNavigation = user && location.pathname !== '/login';
  const redirectPath = useMemo(() => (user ? '/journal' : '/login'), [user]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <div style={{ color: '#e2e8f0', letterSpacing: '0.02em' }}>Loading your space…</div>
      </div>
    );
  }

  // If auth is ready and no user, force redirect to login (prevents blank screen)
  if (authReady && !user && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app">
      {showNavigation && <Navigation />}
      <main style={{ paddingTop: showNavigation ? '60px' : 0, minHeight: '100vh' }}>
        <Routes>
          <Route path="/" element={<Navigate to={redirectPath} replace />} />
          <Route path="/login" element={user ? <Navigate to="/journal" replace /> : <AuthPage />} />
          <Route
            path="/journal"
            element={(
              <ProtectedRoute user={user}>
                <DreamJournal user={user} />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/journal/:dreamId"
            element={(
              <ProtectedRoute user={user}>
                <DreamDetail user={user} />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/feed"
            element={(
              <ProtectedRoute user={user}>
                <Feed user={user} />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/profile"
            element={(
              <ProtectedRoute user={user}>
                <Profile user={user} />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/profile/:userId"
            element={(
              <ProtectedRoute user={user}>
                <Profile user={user} />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/search"
            element={(
              <ProtectedRoute user={user}>
                <Search user={user} />
              </ProtectedRoute>
            )}
          />
          <Route path="*" element={<Navigate to={redirectPath} replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};

    setPersistence(auth, browserLocalPersistence)
      .catch(() => {})
      .finally(() => {
        unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          setUser(currentUser);
          setLoading(false);
          setAuthReady(true);
        });
      });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  return (
    <Router>
      <AppContent user={user} loading={loading} authReady={authReady} />
    </Router>
  );
}

export default App;
