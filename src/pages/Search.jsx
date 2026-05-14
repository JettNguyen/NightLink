import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { mapDream } from '../utils/mappers';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { DEFAULT_AVATAR_BACKGROUND, DEFAULT_AVATAR_COLOR, getAvatarIconById } from '../constants/avatarOptions';
import LoadingIndicator from '../components/LoadingIndicator';
import { formatDreamDate } from '../utils/dates';
import { buildProfilePath, buildDreamPath } from '../utils/urlHelpers';
import './Search.css';
import { appUserPropType } from '../propTypes';

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
  const filters = [{ id: 'people', label: 'People' }, { id: 'dreams', label: 'Dreams' }];

  useEffect(() => {
    const handler = setTimeout(() => { runSearch(); }, 280);
    return () => clearTimeout(handler);
  }, [searchTerm, filter]);

  const runSearch = async () => {
    const term = searchTerm.trim();
    if (term.length < MIN_CHARS) {
      setUserResults([]); setDreamResults([]); setLastTerm(''); setLoading(false); setError('');
      return;
    }
    setLoading(true); setError(''); setLastTerm(term);
    try {
      const lower = `%${term.toLowerCase()}%`;
      if (filter === 'people') {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_icon, avatar_background, avatar_color')
          .or(`display_name.ilike.${lower},username.ilike.${lower}`)
          .neq('id', currentUserId || '00000000-0000-0000-0000-000000000000')
          .limit(15);
        setUserResults((data || []).map((r) => ({
          id: r.id,
          displayName: r.display_name || 'Dreamer',
          username: r.username || '',
          avatarIcon: r.avatar_icon,
          avatarBackground: r.avatar_background,
          avatarColor: r.avatar_color,
        })));
        setDreamResults([]);
      } else {
        const { data } = await supabase
          .from('dreams')
          .select('*')
          .in('visibility', ['public', 'anonymous'])
          .or(`content.ilike.${lower},ai_title.ilike.${lower},title.ilike.${lower}`)
          .neq('user_id', currentUserId || '00000000-0000-0000-0000-000000000000')
          .order('created_at', { ascending: false })
          .limit(24);
        setDreamResults((data || []).map(mapDream));
        setUserResults([]);
      }
    } catch {
      setError('Search hiccup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileNavigation = (profile) => {
    if (!profile?.id) return;
    navigate(buildProfilePath(profile.username, profile.id));
  };

  const handleDreamNavigation = (dream) => {
    if (!dream?.id) return;
    const path = dream.visibility === 'anonymous'
      ? `/dream/${dream.id}`
      : buildDreamPath(dream.authorUsername, dream.userId, dream.id);
    navigate(path, { state: { fromNav: '/search' } });
  };

  const renderDream = (dream) => {
    const title = dream.title || (dream.aiGenerated ? dream.aiTitle?.trim() : '');
    const snippet = dream.content?.length > 200 ? `${dream.content.slice(0, 200)}…` : dream.content;
    const dateLabel = dream.createdAt ? formatDreamDate(dream.createdAt) : 'Recent';
    return (
      <div className="search-dream-card" key={dream.id} role="button" tabIndex={0}
        onClick={() => handleDreamNavigation(dream)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDreamNavigation(dream); } }}>
        <div className="search-dream-meta">
          <span className="pill">{dateLabel}</span>
          <span className="pill">{dream.visibility === 'anonymous' ? 'Anonymous dream' : 'Public dream'}</span>
        </div>
        {title ? <h3>{title}</h3> : <p className="pending-title">Untitled dream</p>}
        {dream.aiGenerated && dream.aiInsights && <p className="dream-summary">{dream.aiInsights}</p>}
        <p className="dream-snippet">{snippet}</p>
        {dream.tags?.length ? (
          <div className="dream-tags">
            {dream.tags.map((tag, idx) => <span className="tag" key={`${dream.id}-tag-${idx}`}>{tag.value}</span>)}
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
            <button key={option.id} className={filter === option.id ? 'chip chip-active' : 'chip'} onClick={() => setFilter(option.id)} type="button" aria-pressed={filter === option.id}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="search-input-wrap">
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={filter === 'people' ? 'Search names or usernames' : 'Search public dream titles or text'} />
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
              <div className="section-head"><h2>People</h2><span className="pill">{userResults.length}</span></div>
              {loading ? (
                <div className="placeholder loading-slot"><LoadingIndicator label="Pulling profiles…" size="md" /></div>
              ) : userResults.length === 0 ? (
                <div className="placeholder">No matching people.</div>
              ) : (
                <div className="people-grid">
                  {userResults.map((u) => (
                    <div className="person-card" key={u.id} role="button" tabIndex={0}
                      onClick={() => handleProfileNavigation(u)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleProfileNavigation(u); } }}>
                      <div className="person-avatar" style={{ background: u.avatarBackground || DEFAULT_AVATAR_BACKGROUND }}>
                        <FontAwesomeIcon icon={getAvatarIconById(u.avatarIcon)} style={{ color: u.avatarColor || DEFAULT_AVATAR_COLOR }} />
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
              <div className="section-head"><h2>Public dreams</h2><span className="pill">{dreamResults.length}</span></div>
              {loading ? (
                <div className="placeholder loading-slot"><LoadingIndicator label="Collecting dreams…" size="md" /></div>
              ) : dreamResults.length === 0 ? (
                <div className="placeholder">No dreams matched &ldquo;{lastTerm}&rdquo;.</div>
              ) : (
                <div className="dream-grid">{dreamResults.map(renderDream)}</div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

Search.propTypes = { user: appUserPropType };
