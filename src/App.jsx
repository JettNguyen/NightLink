import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import AuthPage from './pages/AuthPage';
import DreamJournal from './pages/DreamJournal';
import Feed from './pages/Feed';
import Navigation from './components/Navigation';
import Profile from './pages/Profile';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

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

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Router>
      <div className="app">
        <Navigation />
        <main style={{ paddingTop: '60px', minHeight: '100vh' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/journal" />} />
            <Route path="/journal" element={<DreamJournal user={user} />} />
            <Route path="/feed" element={<Feed user={user} />} />
            <Route path="/profile" element={<Profile user={user} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
