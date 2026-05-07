import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// When a lazy chunk 404s after a new deployment, reload once to pick up the new index.html.
window.addEventListener('vite:preloadError', () => {
  const key = 'vite_reload_attempted';
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1');
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
