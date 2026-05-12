import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { mapDream, mapProfile } from '../utils/mappers';
import LoadingIndicator from '../components/LoadingIndicator';
import { ListSkeleton } from '../components/SkeletonLoader';
import { buildDreamPath } from '../utils/urlHelpers';
import './DreamJournal.css';
import { firebaseUserPropType } from '../propTypes';

const VISIBILITY_LABELS = {
  private: 'Private',
  public: 'Public',
  following: 'Followers only',
  anonymous: 'Anonymous'
};

const VISIBILITY_OPTIONS = [
  { value: 'private',   label: 'Private',              helper: 'Only you can view this entry.' },
  { value: 'public',    label: 'Public',               helper: 'Appears on your profile and Following feed.' },
  { value: 'following', label: 'People you follow',    helper: 'Only people you follow can view it.' },
  { value: 'anonymous', label: 'Anonymous',            helper: 'Shared publicly without your name attached.' }
];

const CONTENT_PREVIEW_LIMIT = 240;
const INSIGHT_PREVIEW_LIMIT = 180;

export default function DreamJournal({ user }) {
  const [dreams, setDreams] = useState([]);
  const [showNewDream, setShowNewDream] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dreamDate, setDreamDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [visibility, setVisibility] = useState('private');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [listenError, setListenError] = useState('');
  const [connectionOptions, setConnectionOptions] = useState([]);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceQuery, setAudienceQuery] = useState('');
  const [excludedViewerIds, setExcludedViewerIds] = useState([]);
  const [taggedUsers, setTaggedUsers] = useState([]);
  const [tagHandle, setTagHandle] = useState('');
  const [taggingStatus, setTaggingStatus] = useState('');
  const [taggingBusy, setTaggingBusy] = useState(false);
  const [viewerProfile, setViewerProfile] = useState(null);
  const navigate = useNavigate();
  const hasAudienceQuery = audienceQuery.trim().length > 0;

  // Real-time dreams subscription
  useEffect(() => {
    if (!user?.uid) {
      setDreams([]);
      setConnectionOptions([]);
      setInitialLoading(false);
      return;
    }

    const fetchDreams = async () => {
      const { data, error } = await supabase
        .from('dreams')
        .select('*')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false });
      if (error) {
        setListenError('Live sync failed. Check your connection.');
      } else {
        setDreams((data || []).map(mapDream));
      }
      setInitialLoading(false);
    };

    fetchDreams();

    const channel = supabase
      .channel(`journal:${user.uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dreams', filter: `user_id=eq.${user.uid}` },
        () => fetchDreams())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.uid]);

  // Load viewer profile and connections for audience controls
  useEffect(() => {
    if (!user?.uid) {
      setConnectionOptions([]);
      setAudienceLoading(false);
      return;
    }
    let cancelled = false;

    const loadFollowing = async () => {
      setAudienceLoading(true);
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.uid)
          .single();
        const profile = profileData ? mapProfile(profileData) : null;
        if (!cancelled && profile) {
          setViewerProfile({ id: profile.id, username: profile.username, displayName: profile.displayName });
        }

        const connectionIds = [
          ...new Set([...(profile?.followingIds || []), ...(profile?.followerIds || [])])
        ].filter((id) => id && id !== user.uid);

        if (!connectionIds.length) {
          if (!cancelled) { setConnectionOptions([]); setAudienceQuery(''); }
          return;
        }

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, display_name, username')
          .in('id', connectionIds);

        if (!cancelled) {
          setConnectionOptions((profilesData || []).map((r) => ({
            id: r.id,
            displayName: r.display_name || 'Dreamer',
            username: r.username || '',
          })));
          setAudienceQuery('');
        }
      } catch {
        if (!cancelled) { setConnectionOptions([]); setAudienceQuery(''); }
      } finally {
        if (!cancelled) setAudienceLoading(false);
      }
    };

    loadFollowing();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const truncate = (text, limit) => {
    if (!text) return '';
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  };

  const normalizeHandle = (value = '') => value.replace(/^@/, '').trim().toLowerCase();

  const tagSuggestions = useMemo(() => {
    const normalized = normalizeHandle(tagHandle);
    if (!normalized) return [];
    return connectionOptions
      .filter((profile) => {
        if (!profile?.id || profile.id === user?.uid) return false;
        if (taggedUsers.some((entry) => entry.userId === profile.id)) return false;
        const username = (profile.username || '').toLowerCase();
        const displayName = (profile.displayName || '').toLowerCase();
        return username.includes(normalized) || displayName.includes(normalized);
      })
      .slice(0, 5);
  }, [connectionOptions, tagHandle, taggedUsers, user?.uid]);

  const connectionLookup = useMemo(() => (
    connectionOptions.reduce((acc, p) => { acc[p.id] = p; return acc; }, {})
  ), [connectionOptions]);

  const filteredConnections = useMemo(() => {
    const normalized = audienceQuery.trim().toLowerCase();
    if (!normalized) return [];
    return connectionOptions.filter((p) => {
      const label = `${p.displayName || ''} ${p.username || ''}`.toLowerCase();
      return label.includes(normalized);
    });
  }, [audienceQuery, connectionOptions]);

  const toggleExcludedViewer = (id) => {
    if (!id) return;
    setExcludedViewerIds((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]);
  };

  const handleRemoveTaggedPerson = (personId) => {
    setTaggedUsers((prev) => prev.filter((entry) => entry.userId !== personId));
  };

  const handleSelectTagSuggestion = (profile) => {
    if (!profile?.id) return;
    if (taggedUsers.some((entry) => entry.userId === profile.id)) {
      setTaggingStatus('Already tagged.');
      return;
    }
    setTaggedUsers((prev) => [...prev, { userId: profile.id, username: profile.username || '', displayName: profile.displayName || 'Dreamer' }]);
    setTagHandle('');
    setTaggingStatus('Tagged successfully.');
  };

  const handleAddTaggedPerson = async () => {
    const raw = tagHandle.trim();
    if (!raw || !user?.uid) return;
    const normalizedHandle = normalizeHandle(raw);
    if (!normalizedHandle) return;
    if (taggedUsers.some((entry) => entry.username?.toLowerCase() === normalizedHandle)) {
      setTaggingStatus('Already tagged.');
      setTagHandle('');
      return;
    }
    setTaggingBusy(true);
    setTaggingStatus('');
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .eq('normalized_username', normalizedHandle)
        .single();
      if (!data) { setTaggingStatus('No user found for that handle.'); return; }
      if (data.id === user.uid) { setTaggingStatus('You are already the author.'); return; }
      if (taggedUsers.some((entry) => entry.userId === data.id)) { setTaggingStatus('Already tagged.'); return; }
      setTaggedUsers((prev) => [...prev, { userId: data.id, username: data.username || normalizedHandle, displayName: data.display_name || 'Dreamer' }]);
      setTagHandle('');
      setTaggingStatus('Tagged successfully.');
    } catch {
      setTaggingStatus('Could not tag that user.');
    } finally {
      setTaggingBusy(false);
    }
  };

  const resetForm = () => {
    setTitle(''); setContent(''); setDreamDate(format(new Date(), 'yyyy-MM-dd'));
    setVisibility('private'); setSaveError(''); setExcludedViewerIds([]);
    setTaggedUsers([]); setTagHandle(''); setTaggingStatus('');
  };

  const closeModal = () => { if (loading) return; setShowNewDream(false); resetForm(); };
  const handleOverlayClick = (e) => { if (e.target === e.currentTarget) closeModal(); };
  const handleOverlayKeyDown = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeModal(); } };

  const handleSaveDream = async (event) => {
    event.preventDefault();
    if (!content.trim() || !user?.uid) return;
    setLoading(true);
    setSaveError('');

    const taggedMeta = taggedUsers.map((entry) => ({
      userId: entry.userId, username: entry.username || '', displayName: entry.displayName || ''
    }));
    const resolvedTitle = title.trim() || 'Untitled dream';

    const optimistic = {
      id: `local-${Date.now()}`,
      userId: user.uid,
      title: resolvedTitle,
      content: content.trim(),
      visibility,
      aiGenerated: false,
      authorUsername: viewerProfile?.username || null,
      createdAt: new Date(dreamDate),
      excludedViewerIds,
      taggedUsers: taggedMeta,
      taggedUserIds: taggedMeta.map((e) => e.userId),
      reactionCounts: {},
      viewerReactions: {},
      tags: [],
    };

    setDreams((prev) => [optimistic, ...prev]);

    try {
      const { error } = await supabase.from('dreams').insert({
        user_id:             user.uid,
        title:               resolvedTitle,
        content:             content.trim(),
        visibility,
        ai_generated:        false,
        author_username:     viewerProfile?.username || null,
        excluded_viewer_ids: excludedViewerIds,
        tagged_users:        taggedMeta,
        tagged_user_ids:     taggedMeta.map((e) => e.userId),
        created_at:          new Date(dreamDate).toISOString(),
      });
      if (error) throw error;
      setDreams((prev) => prev.filter((d) => d.id !== optimistic.id));
      setShowNewDream(false);
      resetForm();
    } catch {
      setDreams((prev) => prev.filter((d) => d.id !== optimistic.id));
      setSaveError('Could not save your dream. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const handleCardNavigate = (dreamId) => {
    if (!dreamId || dreamId.startsWith('local-')) return;
    navigate(buildDreamPath(viewerProfile?.username || null, user?.uid, dreamId), { state: { fromNav: '/journal' } });
  };

  const renderDreamCard = (dream) => {
    const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Undated';
    const visibilityLabel = VISIBILITY_LABELS[dream.visibility] || VISIBILITY_LABELS.private;
    return (
      <div
        key={dream.id}
        className={`dream-card ${dream.id.startsWith('local-') ? 'dream-card--pending' : ''}`}
        onClick={() => handleCardNavigate(dream.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !dream.id.startsWith('local-')) {
            e.preventDefault(); handleCardNavigate(dream.id);
          }
        }}
      >
        <div className="dream-header">
          <div>
            <span className="dream-date">{dateLabel}</span>
            <span className="dream-visibility-pill">{visibilityLabel}</span>
          </div>
          <span className="dream-chevron" aria-hidden="true">→</span>
        </div>
        <p className="dream-title">{dream.title || (dream.aiGenerated && dream.aiTitle) || 'Untitled dream'}</p>
        <p className="dream-content">{truncate(dream.content, CONTENT_PREVIEW_LIMIT)}</p>
        {dream.aiGenerated && dream.aiInsights ? (
          <div className="dream-footer">
            <p className="dream-summary">{truncate(dream.aiInsights, INSIGHT_PREVIEW_LIMIT)}</p>
          </div>
        ) : null}
        {dream.tags?.length ? (
          <div className="dream-tags">
            {dream.tags.slice(0, 3).map((tag, index) => (
              <span className="tag" key={`${dream.id}-tag-${index}`}>{tag.value}</span>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="page-header journal-header">
        <div>
          <h1>Dream Journal</h1>
          <p className="page-subtitle">Your own personal dream archive.</p>
        </div>
        <div className="action-group">
          <button type="button" onClick={() => setShowNewDream(true)} className="primary-btn">
            + New Dream
          </button>
        </div>
      </div>

      {listenError && <div className="alert-banner">{listenError}</div>}

      {initialLoading ? (
        <ListSkeleton count={4} />
      ) : dreams.length ? (
        <div className="dreams-list">
          {dreams.map((dream) => renderDreamCard(dream))}
        </div>
      ) : (
        <p className="empty-state">No dreams yet. Log your dreams here!</p>
      )}

      {showNewDream && (
        <div
          className="modal-overlay"
          role="button"
          tabIndex={0}
          aria-label="Close modal"
          onClick={handleOverlayClick}
          onKeyDown={handleOverlayKeyDown}
        >
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="new-dream-heading">
            <div className="modal-header">
              <h2 id="new-dream-heading">New Dream</h2>
              <button type="button" className="close-btn" onClick={closeModal} aria-label="Close modal">×</button>
            </div>
            <form onSubmit={handleSaveDream}>
              <input
                type="text"
                className="dream-title-input"
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
              />
              <div className="dream-date-section">
                <label htmlFor="dream-date-input">When did this dream happen?</label>
                <input
                  id="dream-date-input"
                  type="date"
                  className="dream-date-input"
                  value={dreamDate}
                  onChange={(e) => setDreamDate(e.target.value)}
                  disabled={loading}
                />
              </div>
              <textarea
                className="dream-textarea"
                placeholder="Describe everything you remember…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={loading}
              />
              {saveError && <div className="alert-banner">{saveError}</div>}
              <div className="visibility-section">
                <p className="section-label">Who can see this dream?</p>
                <div className="visibility-options">
                  {VISIBILITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={visibility === option.value ? 'visibility-chip active' : 'visibility-chip'}
                      onClick={() => setVisibility(option.value)}
                      aria-pressed={visibility === option.value}
                      disabled={loading}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="visibility-helper">
                  {VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.helper}
                </p>
              </div>
              <div className="audience-section">
                <div className="control-headline">
                  <p className="section-label">Hide from specific people</p>
                  <p className="section-helper">Anyone you pick here will never see this entry, regardless of visibility.</p>
                </div>
                {audienceLoading ? (
                  <div className="loading-inline">
                    <LoadingIndicator label="Loading your connections…" size="sm" align="start" />
                  </div>
                ) : connectionOptions.length === 0 ? (
                  <p className="hint">Connect with people to curate who sees limited posts.</p>
                ) : (
                  <>
                    <div className="audience-search-input">
                      <input
                        type="text"
                        placeholder="Search your following"
                        value={audienceQuery}
                        onChange={(e) => setAudienceQuery(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                    {hasAudienceQuery && (
                      <div className="audience-result-list">
                        {filteredConnections.length ? (
                          filteredConnections.map((profile) => {
                            const isHidden = excludedViewerIds.includes(profile.id);
                            return (
                              <button
                                key={profile.id}
                                type="button"
                                className={`audience-result${isHidden ? ' active' : ''}`}
                                onClick={() => toggleExcludedViewer(profile.id)}
                                disabled={loading}
                              >
                                <div className="audience-result-meta">
                                  <span className="result-name">{profile.displayName}</span>
                                  {profile.username && <span className="result-handle">@{profile.username}</span>}
                                </div>
                                <span className="result-status">{isHidden ? 'Hidden' : 'Visible'}</span>
                              </button>
                            );
                          })
                        ) : (
                          <p className="hint">No matches for &ldquo;{audienceQuery}&rdquo;.</p>
                        )}
                      </div>
                    )}
                    {excludedViewerIds.length ? (
                      <div className="selected-pill-row">
                        {excludedViewerIds.map((id) => {
                          const profile = connectionLookup[id];
                          const label = profile?.username ? `@${profile.username}` : profile?.displayName || 'Dreamer';
                          return (
                            <span key={id} className="selected-pill">
                              {label}
                              <button type="button" onClick={() => toggleExcludedViewer(id)} aria-label={`Remove ${label}`} disabled={loading}>×</button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="hint">No one is hidden right now.</p>
                    )}
                  </>
                )}
              </div>
              <div className="tag-people-section">
                <div className="control-headline">
                  <p className="section-label">Tag people</p>
                  <p className="section-helper">Let specific friends know this dream involves them.</p>
                </div>
                <div className="tag-people-input">
                  <input
                    type="text"
                    placeholder="@username"
                    value={tagHandle}
                    onChange={(e) => { setTagHandle(e.target.value); setTaggingStatus(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTaggedPerson(); } }}
                    disabled={loading || taggingBusy}
                  />
                  <button type="button" className="add-tag-btn" onClick={handleAddTaggedPerson} disabled={loading || taggingBusy || !tagHandle.trim()}>
                    {taggingBusy ? 'Tagging…' : 'Tag'}
                  </button>
                </div>
                {tagSuggestions.length > 0 && (
                  <div className="tag-suggestion-list">
                    {tagSuggestions.map((profile) => (
                      <button type="button" key={profile.id} className="tag-suggestion-item" onClick={() => handleSelectTagSuggestion(profile)} disabled={loading}>
                        <span className="suggestion-name">{profile.displayName}</span>
                        {profile.username && <span className="suggestion-username">@{profile.username}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {taggingStatus && <p className="hint status-hint">{taggingStatus}</p>}
                {taggedUsers.length ? (
                  <div className="tagged-pill-row">
                    {taggedUsers.map((entry) => (
                      <span key={entry.userId} className="tagged-pill">
                        @{entry.username || entry.displayName}
                        <button type="button" aria-label={`Remove ${entry.username || entry.displayName}`} onClick={() => handleRemoveTaggedPerson(entry.userId)} disabled={loading}>×</button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="hint">
                    {visibility === 'private'
                      ? 'Tags are for your own record on this private dream.'
                      : 'Tagged dreamers will see this on their profile.'}
                  </p>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={closeModal} disabled={loading}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={loading || !content.trim()}>
                  {loading ? 'Saving…' : 'Save dream'}
                </button>
              </div>
              <p className="hint">Want an AI title or summary? Save first, then open the dream to generate it.</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

DreamJournal.propTypes = { user: firebaseUserPropType };
