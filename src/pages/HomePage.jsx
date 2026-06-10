import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

export default function HomePage() {
  useEffect(() => {
    document.documentElement.classList.add('no-overscroll');
    return () => document.documentElement.classList.remove('no-overscroll');
  }, []);

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-logo-row">
          <img src="/favicon.svg" alt="Nightlink" className="home-logo-icon" />
          <span className="home-logo-text">Nightlink</span>
        </div>
        <h1>Your private space for dream reflection and trusted connection.</h1>
        <p className="home-subtitle">
          Capture dreams, unlock AI-powered insights, and share only when you choose.
          Built with privacy-first controls so your dreams stay sacred.
        </p>
        <div className="home-cta-row">
          <Link to="/login" className="home-cta-primary">Create account</Link>
          <Link to="/login" className="home-cta-secondary">Sign in</Link>
        </div>
      </section>

      <section className="home-section">
        <h2>What you can do</h2>
        <div className="home-feature-grid">
          <article className="home-feature-card">
            <h3>Journal with intention</h3>
            <p>Write, tag, and organize dreams in a focused space designed for nightly reflection.</p>
          </article>
          <article className="home-feature-card">
            <h3>AI insight styles</h3>
            <p>Choose from grounded, mystical, and astrology-style interpretations that match your vibe.</p>
          </article>
          <article className="home-feature-card">
            <h3>Optional social sharing</h3>
            <p>Keep dreams private by default, or share selected entries with your community.</p>
          </article>
        </div>
      </section>

      <section className="home-section home-security">
        <h2>Privacy by design</h2>
        <ul>
          <li>Dream visibility controls on every entry</li>
          <li>AI summaries for reflection only</li>
          <li>No AI model training on your dream content</li>
          <li>Account and policy controls in-app at any time</li>
        </ul>
      </section>

      <footer className="home-footer">
        <Link to="/terms">Terms of Use</Link>
        <span aria-hidden="true">•</span>
        <Link to="/privacy">Privacy Policy</Link>
      </footer>
    </div>
  );
}
