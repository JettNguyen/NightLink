import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, getDocs, limit } from 'firebase/firestore';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import LoadingIndicator from '../components/LoadingIndicator';
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
  { value: 'private', label: 'Private', helper: 'Only you can view this entry.' },
  { value: 'public', label: 'Public', helper: 'Appears on your profile and Following feed.' },
  { value: 'following', label: 'People you follow', helper: 'Only people you follow can view it.' },
  { value: 'anonymous', label: 'Anonymous', helper: 'Shared publicly without your name attached.' }
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

  useEffect(() => {
    if (!user?.uid) {
      setDreams([]);
      setConnectionOptions([]);
      return undefined;
    }

    const q = query(
      collection(db, 'dreams'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dreamsList = snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          ...data,
          visibility: data.visibility || 'private',
          createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null
        };
      });
      setDreams(dreamsList);
      setInitialLoading(false);
      setListenError('');
    }, () => {
      setListenError('Live sync failed. Check your Firestore rules.');
      setInitialLoading(false);
    });

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setConnectionOptions([]);
      setAudienceLoading(false);
      setAudienceQuery('');
      return undefined;
    }

    let cancelled = false;
    const loadFollowing = async () => {
      setAudienceLoading(true);
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const data = userSnap.data() || {};
        if (!cancelled) {
          setViewerProfile({
            id: user.uid,
            username: data.username || '',
            displayName: data.displayName || ''
          });
        }
        const followingIds = Array.isArray(data.followingIds) ? data.followingIds : [];
        const followerIds = Array.isArray(data.followerIds) ? data.followerIds : [];
        const connectionIds = Array.from(new Set([...followingIds, ...followerIds])).filter((id) => id && id !== user.uid);
        if (!connectionIds.length) {
          if (!cancelled) {
            setConnectionOptions([]);
            setAudienceQuery('');
          }
          return;
        }

        const profiles = await Promise.all(
          connectionIds.map(async (id) => {
            try {
              const snap = await getDoc(doc(db, 'users', id));
              if (!snap.exists()) return null;
              const data = snap.data();
              return {
                id,
                displayName: data.displayName || 'Dreamer',
                username: data.username || '',
              };
            } catch {
              return null;
            }
          })
        );

        if (!cancelled) {
          setConnectionOptions(profiles.filter(Boolean));
          setAudienceQuery('');
        }
      } catch {
        if (!cancelled) {
          setConnectionOptions([]);
          setAudienceQuery('');
        }
      } finally {
        if (!cancelled) {
          setAudienceLoading(false);
        }
      }
    };

    loadFollowing();
    return () => {
      cancelled = true;
    };
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
        if (!profile?.id) return false;
        if (profile.id === user?.uid) return false;
        if (taggedUsers.some((entry) => entry.userId === profile.id)) {
          return false;
        }
        const username = (profile.username || '').toLowerCase();
        const displayName = (profile.displayName || '').toLowerCase();
        return username.includes(normalized) || displayName.includes(normalized);
      })
      .slice(0, 5);
  }, [connectionOptions, tagHandle, taggedUsers, user?.uid]);

  const connectionLookup = useMemo(() => (
    connectionOptions.reduce((acc, profile) => {
      acc[profile.id] = profile;
      return acc;
    }, {})
  ), [connectionOptions]);

  const filteredConnections = useMemo(() => {
    const normalized = audienceQuery.trim().toLowerCase();
    if (!normalized) return [];
    return connectionOptions.filter((profile) => {
      const label = `${profile.displayName || ''} ${profile.username || ''}`.toLowerCase();
      return label.includes(normalized);
    });
  }, [audienceQuery, connectionOptions]);

  const toggleExcludedViewer = (viewerId) => {
    if (!viewerId) return;
    setExcludedViewerIds((prev) => (
      prev.includes(viewerId) ? prev.filter((id) => id !== viewerId) : [...prev, viewerId]
    ));
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

    setTaggedUsers((prev) => ([
      ...prev,
      {
        userId: profile.id,
        username: profile.username || '',
        displayName: profile.displayName || 'Dreamer'
      }
    ]));
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
      const usersRef = collection(db, 'users');
      const matches = await getDocs(query(usersRef, where('normalizedUsername', '==', normalizedHandle), limit(1)));
      if (matches.empty) {
        setTaggingStatus('No user found for that handle.');
        return;
      }

      const match = matches.docs[0];
      if (match.id === user.uid) {
        setTaggingStatus('You are already the author.');
        return;
      }
      if (taggedUsers.some((entry) => entry.userId === match.id)) {
        setTaggingStatus('Already tagged.');
        return;
      }

      const data = match.data();
      setTaggedUsers((prev) => [
        ...prev,
        {
          userId: match.id,
          username: data.username || normalizedHandle,
          displayName: data.displayName || 'Dreamer',
        }
      ]);
      setTagHandle('');
      setTaggingStatus('Tagged successfully.');
    } catch {
      setTaggingStatus('Could not tag that user.');
    } finally {
      setTaggingBusy(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setDreamDate(format(new Date(), 'yyyy-MM-dd'));
    setVisibility('private');
    setSaveError('');
    setExcludedViewerIds([]);
    setTaggedUsers([]);
    setTagHandle('');
    setTaggingStatus('');
  };

  const closeModal = () => {
    if (loading) return;
    setShowNewDream(false);
    resetForm();
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  };

  const handleOverlayKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  };

  const handleSaveDream = async (event) => {
    event.preventDefault();
    if (!content.trim() || !user?.uid) return;

    setLoading(true);
    setSaveError('');

    const trimmedContent = content.trim();
    const userTitle = title.trim();
    const resolvedTitle = userTitle || 'Untitled dream';
    const aiGenerated = false;
    const taggedMeta = taggedUsers.map((entry) => ({
      userId: entry.userId,
      username: entry.username || '',
      displayName: entry.displayName || ''
    }));
    const authorUsername = viewerProfile?.username || null;

    const optimistic = {
      id: `local-${Date.now()}`,
      title: resolvedTitle,
      content: trimmedContent,
      visibility,
      aiGenerated,
      authorUsername,
      createdAt: new Date(dreamDate),
      excludedViewerIds,
      taggedUsers: taggedMeta,
      taggedUserIds: taggedMeta.map((entry) => entry.userId)
    };

    setDreams((prev) => [optimistic, ...prev]);

    try {
      await addDoc(collection(db, 'dreams'), {
        userId: user.uid,
        title: resolvedTitle,
        content: trimmedContent,
        visibility,
        aiGenerated,
        authorUsername,
        excludedViewerIds,
        taggedUsers: taggedMeta,
        taggedUserIds: taggedMeta.map((entry) => entry.userId),
        createdAt: new Date(dreamDate),
        updatedAt: serverTimestamp()
      });

      setDreams((prev) => prev.filter((dream) => dream.id !== optimistic.id));
      setShowNewDream(false);
      resetForm();
    } catch {
      setDreams((prev) => prev.filter((dream) => dream.id !== optimistic.id));
      setSaveError('Could not save your dream. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const handleCardNavigate = (dreamId) => {
    if (!dreamId || dreamId.startsWith('local-')) return;
    const viewerUsername = viewerProfile?.username || null;
    navigate(buildDreamPath(viewerUsername, user?.uid, dreamId), { state: { fromNav: '/journal' } });
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
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !dream.id.startsWith('local-')) {
            event.preventDefault();
            handleCardNavigate(dream.id);
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

        <p className="dream-title">
          {dream.title || (dream.aiGenerated && dream.aiTitle) || 'Untitled dream'}
        </p>

        <p className="dream-content">{truncate(dream.content, CONTENT_PREVIEW_LIMIT)}</p>

        {dream.aiGenerated && dream.aiInsights ? (
          <div className="dream-footer">
            <p className="dream-summary">{truncate(dream.aiInsights, INSIGHT_PREVIEW_LIMIT)}</p>
          </div>
        ) : null}

        {dream.tags?.length ? (
          <div className="dream-tags">
            {dream.tags.slice(0, 3).map((tag, index) => (
              <span className="tag" key={`${dream.id}-tag-${index}`}>
                {tag.value}
              </span>
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
        <div className="dreams-loading loading-slot">
          <LoadingIndicator label="Loading your dreams…" size="lg" />
        </div>
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
                onChange={(event) => setTitle(event.target.value)}
                disabled={loading}
              />

              <div className="dream-date-section">
                <label htmlFor="dream-date-input">When did this dream happen?</label>
                <input
                  id="dream-date-input"
                  type="date"
                  className="dream-date-input"
                  value={dreamDate}
                  onChange={(event) => setDreamDate(event.target.value)}
                  disabled={loading}
                />
              </div>

              <textarea
                className="dream-textarea"
                placeholder="Describe everything you remember…"
                value={content}
                onChange={(event) => setContent(event.target.value)}
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
                  {VISIBILITY_OPTIONS.find((option) => option.value === visibility)?.helper}
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
                        onChange={(event) => setAudienceQuery(event.target.value)}
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
                          <p className="hint">
                            No matches for &ldquo;{audienceQuery}&rdquo;.
                          </p>
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
                              <button
                                type="button"
                                onClick={() => toggleExcludedViewer(id)}
                                aria-label={`Remove ${label}`}
                                disabled={loading}
                              >
                                ×
                              </button>
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
                    onChange={(event) => {
                      setTagHandle(event.target.value);
                      setTaggingStatus('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddTaggedPerson();
                      }
                    }}
                    disabled={loading || taggingBusy}
                  />
                  <button
                    type="button"
                    className="add-tag-btn"
                    onClick={handleAddTaggedPerson}
                    disabled={loading || taggingBusy || !tagHandle.trim()}
                  >
                    {taggingBusy ? 'Tagging…' : 'Tag'}
                  </button>
                </div>
                {tagSuggestions.length > 0 && (
                  <div className="tag-suggestion-list">
                    {tagSuggestions.map((profile) => (
                      <button
                        type="button"
                        key={profile.id}
                        className="tag-suggestion-item"
                        onClick={() => handleSelectTagSuggestion(profile)}
                        disabled={loading}
                      >
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
                        <button type="button" aria-label={`Remove ${entry.username || entry.displayName}`} onClick={() => handleRemoveTaggedPerson(entry.userId)} disabled={loading}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="hint">Tagged dreamers will see this on their profile.</p>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={closeModal} disabled={loading}>
                  Cancel
                </button>
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

DreamJournal.propTypes = {
  user: firebaseUserPropType
};
