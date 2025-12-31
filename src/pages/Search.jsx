import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { DEFAULT_AVATAR_BACKGROUND, DEFAULT_AVATAR_COLOR, getAvatarIconById } from '../constants/avatarOptions';
import LoadingIndicator from '../components/LoadingIndicator';
import { buildProfilePath, buildDreamPath } from '../utils/urlHelpers';
import './Search.css';
import { firebaseUserPropType } from '../propTypes';

const MIN_CHARS = 2;

export default function Search({ user }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [userResults, setUserResults] = useState([]);
  const [dreamResults, setDreamResults] = useState([]);
  const [error, setError] = useState('');
  const [lastTerm, setLastTerm] = useState('');
  const [filter, setFilter] = useState('people');
  const navigate = useNavigate();
  const currentUserId = user?.uid || null;
  const filters = [
    { id: 'people', label: 'People' },
    { id: 'dreams', label: 'Dreams' }
  ];

  const normalizeText = (value = '') => value.trim().toLowerCase();

  const getTimestampValue = (value) => {
    if (!value) return 0;
    if (typeof value.toDate === 'function') {
      const date = value.toDate();
      return date?.getTime?.() ?? 0;
    }
    if (typeof value.seconds === 'number') {
      return value.seconds * 1000;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  };

  const scoreUserResult = (user) => {
    let score = 0;
    if (user.username) score += 4;
    if (user.displayName) score += 2;
    const freshness = getTimestampValue(user.updatedAt) || getTimestampValue(user.createdAt);
    if (freshness) score += freshness / 1_000_000_000_000;
    return score;
  };

  const dedupeUsers = (users) => {
    const uniqueMap = new Map();

    users.forEach((user) => {
      const key = normalizeText(user.normalizedUsername || user.username || user.email) || user.id;
      const existing = uniqueMap.get(key);

      if (!existing) {
        uniqueMap.set(key, user);
        return;
      }

      if (scoreUserResult(user) > scoreUserResult(existing)) {
        uniqueMap.set(key, user);
      }
    });

    return Array.from(uniqueMap.values());
  };

  const handleProfileNavigation = (profile) => {
    if (!profile?.id) return;
    navigate(buildProfilePath(profile.username, profile.id));
  };

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
      const lower = normalizeText(term);

      if (filter === 'people') {
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(50)));
        const users = usersSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((u) => {
            if (currentUserId && u.id === currentUserId) return false;
            const name = normalizeText(u.displayName || '');
            const username = normalizeText(u.username || '');
            return name.includes(lower) || username.includes(lower);
          });

        const uniqueUsers = dedupeUsers(users).slice(0, 15);

        setUserResults(uniqueUsers);
        setDreamResults([]);
      } else {
        const dreamsSnap = await getDocs(
          query(
            collection(db, 'dreams'),
            where('visibility', 'in', ['anonymous', 'public']),
            limit(60)
          )
        );

        const dreams = dreamsSnap.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              visibility: data.visibility || 'private',
              createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null
            };
          })
          .filter((d) => {
            if (!currentUserId) return true;
            return d.userId !== currentUserId;
          })
          .sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
          })
          .filter((d) => {
            const text = (d.content || '').toLowerCase();
            const title = d.aiGenerated ? (d.aiTitle || '').toLowerCase() : '';
            return text.includes(lower) || title.includes(lower);
          })
          .slice(0, 24);

        setDreamResults(dreams);
        setUserResults([]);
      }
    } catch {
      setError('Search hiccup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDreamNavigation = (dream) => {
    if (!dream?.id) return;
    navigate(buildDreamPath(dream.authorUsername, dream.userId, dream.id), { state: { fromNav: '/search' } });
  };

  const renderDream = (dream) => {
    const title = dream.title || (dream.aiGenerated ? dream.aiTitle?.trim() : '');
    const snippet = dream.content?.length > 200 ? `${dream.content.slice(0, 200)}…` : dream.content;
    const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Recent';

    return (
      <div
        className="search-dream-card"
        key={dream.id}
        role="button"
        tabIndex={0}
        onClick={() => handleDreamNavigation(dream)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleDreamNavigation(dream);
          }
        }}
      >
        <div className="search-dream-meta">
          <span className="pill">{dateLabel}</span>
            <span className="pill">{dream.visibility === 'anonymous' ? 'Anonymous dream' : 'Public dream'}</span>
        </div>
        {title ? <h3>{title}</h3> : <p className="pending-title">Untitled dream</p>}
        {dream.aiGenerated && dream.aiInsights && <p className="dream-summary">{dream.aiInsights}</p>}
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
      <div className="page-header search-header">
        <div>
          <h1>Search</h1>
          <p className="page-subtitle">Find people and explore public dreams.</p>
        </div>
      </div>

      <div className="search-box card-shell">
        <div className="filter-toggle">
          <span className="filter-label">Filter by:</span>
          {filters.map((option) => (
            <button
              key={option.id}
              className={filter === option.id ? 'chip chip-active' : 'chip'}
              onClick={() => setFilter(option.id)}
              type="button"
              aria-pressed={filter === option.id}
            >
              {option.label}
            </button>
          ))}
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
                <div className="placeholder loading-slot">
                  <LoadingIndicator label="Pulling profiles…" size="md" />
                </div>
              ) : userResults.length === 0 ? (
                <div className="placeholder">No matching people.</div>
              ) : (
                <div className="people-grid">
                  {userResults.map((u) => (
                    <div
                      className="person-card"
                      key={u.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleProfileNavigation(u)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleProfileNavigation(u);
                        }
                      }}
                    >
                      <div
                        className="person-avatar"
                        style={{
                          background: u.avatarBackground || DEFAULT_AVATAR_BACKGROUND
                        }}
                      >
                        <FontAwesomeIcon
                          icon={getAvatarIconById(u.avatarIcon)}
                          style={{ color: u.avatarColor || DEFAULT_AVATAR_COLOR }}
                        />
                      </div>
                      <div>
                        <div className="person-name">{u.displayName || 'Dreamer'}</div>
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
                <div className="placeholder loading-slot">
                  <LoadingIndicator label="Collecting dreams…" size="md" />
                </div>
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

Search.propTypes = {
  user: firebaseUserPropType
};
