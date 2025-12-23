import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';
import './Search.css';

const MIN_CHARS = 2;

export default function Search({ user }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [userResults, setUserResults] = useState([]);
  const [dreamResults, setDreamResults] = useState([]);
  const [error, setError] = useState('');
  const [lastTerm, setLastTerm] = useState('');
  const [filter, setFilter] = useState('people'); // 'people' | 'dreams'

  useEffect(() => {
    const handler = setTimeout(() => {
      runSearch();
    }, 280);

    return () => clearTimeout(handler);
  }, [searchTerm, filter]);

  const runSearch = async () => {
    const term = searchTerm.trim();
    if (term.length < MIN_CHARS) {
      setUserResults([]);
      setDreamResults([]);
      setLastTerm('');
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    setLastTerm(term);

    try {
      const lower = term.toLowerCase();

      if (filter === 'people') {
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(50)));
        const users = usersSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((u) => {
            const name = (u.displayName || '').toLowerCase();
            const username = (u.username || '').toLowerCase();
            return name.includes(lower) || username.includes(lower);
          })
          .slice(0, 15);

        setUserResults(users);
        setDreamResults([]);
      } else {
        const dreamsSnap = await getDocs(
          query(
            collection(db, 'dreams'),
            where('visibility', '==', 'anonymous'),
            limit(60)
          )
        );

        const dreams = dreamsSnap.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null
            };
          })
          .sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
          })
          .filter((d) => {
            const text = (d.content || '').toLowerCase();
            const title = (d.aiTitle || '').toLowerCase();
            return text.includes(lower) || title.includes(lower);
          })
          .slice(0, 24);

        setDreamResults(dreams);
        setUserResults([]);
      }
    } catch (err) {
      console.error('Search failed', err);
      setError('Search hiccup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderDream = (dream) => {
    const title = dream.aiTitle || (dream.content || 'Untitled dream').slice(0, 80);
    const snippet = dream.content?.length > 200 ? `${dream.content.slice(0, 200)}…` : dream.content;
    const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Recent';

    return (
      <div className="search-dream-card" key={dream.id}>
        <div className="search-dream-meta">
          <span className="pill">{dateLabel}</span>
          <span className="pill">Public dream</span>
        </div>
        <h3>{title}</h3>
        {dream.aiInsights && <p className="dream-insight">{dream.aiInsights}</p>}
        <p className="dream-snippet">{snippet}</p>
        {dream.tags?.length ? (
          <div className="dream-tags">
            {dream.tags.map((tag, idx) => (
              <span className="tag" key={`${dream.id}-tag-${idx}`}>{tag.value}</span>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Search</h1>
          <p className="page-subtitle">Find friends and wander through public dreams.</p>
        </div>
      </div>

      <div className="search-box card-shell">
        <div className="filter-toggle" role="group" aria-label="Search filter">
          <button
            className={filter === 'people' ? 'chip chip-active' : 'chip'}
            onClick={() => setFilter('people')}
            type="button"
          >
            People
          </button>
          <button
            className={filter === 'dreams' ? 'chip chip-active' : 'chip'}
            onClick={() => setFilter('dreams')}
            type="button"
          >
            Dreams
          </button>
        </div>
        <div className="search-input-wrap">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={filter === 'people' ? 'Search names or usernames' : 'Search public dream titles or text'}
            autoFocus
          />
          <button className="primary-btn" onClick={runSearch} disabled={loading || searchTerm.trim().length < MIN_CHARS}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        <p className="hint">Type at least {MIN_CHARS} characters. Filter to search only people or only public dreams.</p>
      </div>

      {error && <div className="alert-banner">{error}</div>}

      {searchTerm.trim().length < MIN_CHARS && !loading ? (
        <div className="empty-state">Start typing to explore {filter === 'people' ? 'people' : 'public dreams'}.</div>
      ) : (
        <div className="search-results">
          {filter === 'people' ? (
            <section className="result-section">
              <div className="section-head">
                <h2>People</h2>
                <span className="pill">{userResults.length}</span>
              </div>
              {loading ? (
                <div className="placeholder">Pulling profiles…</div>
              ) : userResults.length === 0 ? (
                <div className="placeholder">No matching people.</div>
              ) : (
                <div className="people-grid">
                  {userResults.map((u) => (
                    <div className="person-card" key={u.id}>
                      <div className="avatar-fallback">{(u.displayName || 'N')[0].toUpperCase()}</div>
                      <div>
                        <div className="person-name">{u.displayName || 'Unnamed'}</div>
                        {u.username && <div className="person-username">@{u.username}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="result-section">
              <div className="section-head">
                <h2>Public dreams</h2>
                <span className="pill">{dreamResults.length}</span>
              </div>
              {loading ? (
                <div className="placeholder">Collecting dreams…</div>
              ) : dreamResults.length === 0 ? (
                <div className="placeholder">No dreams matched "{lastTerm}".</div>
              ) : (
                <div className="dream-grid">
                  {dreamResults.map(renderDream)}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
