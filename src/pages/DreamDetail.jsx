import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';
import './DreamDetail.css';

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', helper: 'Only you can see this dream.' },
  { value: 'public', label: 'Public', helper: 'Visible on your profile and following feed.' },
  { value: 'following', label: 'People you follow', helper: 'Shared only with the people you follow.' },
  { value: 'anonymous', label: 'Anonymous', helper: 'Shared publicly without your identity.' }
];

const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT || '/api/ai';

export default function DreamDetail({ user }) {
  const { dreamId } = useParams();
  const navigate = useNavigate();
  const [dream, setDream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [editingContent, setEditingContent] = useState(false);
  const [contentInput, setContentInput] = useState('');
  const [editableTags, setEditableTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [applyingAiTitle, setApplyingAiTitle] = useState(false);
  const [audienceOptions, setAudienceOptions] = useState([]);
  const [audienceBusy, setAudienceBusy] = useState(false);
  const [excludedViewerIds, setExcludedViewerIds] = useState([]);
  const [taggedPeople, setTaggedPeople] = useState([]);
  const [tagHandle, setTagHandle] = useState('');
  const [taggingBusy, setTaggingBusy] = useState(false);
  const [taggingStatus, setTaggingStatus] = useState('');

  const containerClass = 'page-container dream-detail-page';

  useEffect(() => {
    if (!dreamId) {
      setError('Missing dream id.');
      setLoading(false);
      return;
    }

    const ref = doc(db, 'dreams', dreamId);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      if (!snapshot.exists()) {
        setError('Dream not found.');
        setDream(null);
        setLoading(false);
        return;
      }

      const data = snapshot.data();
      if (data.userId && data.userId !== user?.uid) {
        setError('You do not have permission to view this dream.');
        setDream(null);
        setLoading(false);
        return;
      }

      const createdAtDate = data.createdAt?.toDate?.() ?? data.createdAt ?? null;

      setDream({
        id: snapshot.id,
        ...data,
        visibility: data.visibility || 'private',
        createdAt: createdAtDate
      });
      setTitleInput(data.title || '');
      if (createdAtDate) {
        setDateInput(format(createdAtDate, 'yyyy-MM-dd'));
      }
      setContentInput(data.content || '');
      setEditableTags(Array.isArray(data.tags) ? data.tags : []);
      setExcludedViewerIds(Array.isArray(data.excludedViewerIds) ? data.excludedViewerIds : []);
      setTaggedPeople(Array.isArray(data.taggedUsers) ? data.taggedUsers : []);
      setTaggingStatus('');
      setTagHandle('');
      setLoading(false);
    }, () => {
      setError('Failed to load this dream.');
      setLoading(false);
    });

    return unsubscribe;
  }, [dreamId, user?.uid]);

  const formattedDate = useMemo(() => {
    if (!dream?.createdAt) return '';
    try {
      return format(dream.createdAt, 'MMMM d, yyyy • h:mm a');
    } catch {
      return '';
    }
  }, [dream?.createdAt]);

  useEffect(() => {
    if (!user?.uid) {
      setAudienceOptions([]);
      return undefined;
    }

    let cancelled = false;
    const loadFollowing = async () => {
      try {
        const viewerSnap = await getDoc(doc(db, 'users', user.uid));
        const viewerData = viewerSnap.data() || {};
        const followingIds = Array.isArray(viewerData.followingIds) ? viewerData.followingIds : [];
        const followerIds = Array.isArray(viewerData.followerIds) ? viewerData.followerIds : [];
        const connectionIds = Array.from(new Set([...followingIds, ...followerIds])).filter((id) => id && id !== user.uid);
        if (!connectionIds.length) {
          if (!cancelled) setAudienceOptions([]);
          return;
        }

        const profiles = await Promise.all(
          connectionIds.map(async (id) => {
            try {
              const profileSnap = await getDoc(doc(db, 'users', id));
              if (!profileSnap.exists()) return null;
              const profileData = profileSnap.data();
              return {
                id,
                displayName: profileData.displayName || 'Dreamer',
                username: profileData.username || '',
              };
            } catch {
              return null;
            }
          })
        );

        if (!cancelled) {
          setAudienceOptions(profiles.filter(Boolean));
        }
      } catch {
        if (!cancelled) setAudienceOptions([]);
      }
    };

    loadFollowing();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const handleVisibilityChange = async (value) => {
    if (!dream || dream.visibility === value) return;
    setUpdatingVisibility(true);
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        visibility: value,
        updatedAt: serverTimestamp()
      });
    } catch {
      setError('Could not update visibility.');
    } finally {
      setUpdatingVisibility(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!dream) return;
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        title: titleInput.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingTitle(false);
    } catch {
      setError('Could not update title.');
    }
  };

  const handleSaveDate = async () => {
    if (!dream || !dateInput) return;
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        createdAt: new Date(dateInput),
        updatedAt: serverTimestamp()
      });
      setEditingDate(false);
    } catch {
      setError('Could not update date.');
    }
  };

  const handleCancelContentEdit = () => {
    setEditingContent(false);
    setContentInput(dream?.content || '');
    setEditableTags(Array.isArray(dream?.tags) ? dream.tags : []);
    setNewTag('');
  };

  const handleSaveContent = async () => {
    if (!dream || !contentInput.trim()) return;
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        content: contentInput.trim(),
        tags: editableTags,
        updatedAt: serverTimestamp()
      });
      setEditingContent(false);
      setNewTag('');
    } catch {
      setError('Could not update dream content.');
    }
  };

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || editableTags.some((tag) => tag.value === trimmed)) return;
    setEditableTags((prev) => [...prev, { value: trimmed, category: 'theme' }]);
    setNewTag('');
  };

  const handleRemoveTag = (value) => {
    setEditableTags((prev) => prev.filter((tag) => tag.value !== value));
  };

  const persistAudience = async (nextIds) => {
    if (!dream) return;
    setAudienceBusy(true);
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        excludedViewerIds: nextIds,
        updatedAt: serverTimestamp()
      });
      setExcludedViewerIds(nextIds);
    } catch {
      setError('Could not update audience overrides.');
    } finally {
      setAudienceBusy(false);
    }
  };

  const handleToggleAudience = (viewerId) => {
    if (!viewerId || !dream) return;
    const next = excludedViewerIds.includes(viewerId)
      ? excludedViewerIds.filter((id) => id !== viewerId)
      : [...excludedViewerIds, viewerId];
    persistAudience(next);
  };

  const normalizeHandle = (value = '') => value.replace(/^@/, '').trim().toLowerCase();

  const tagSuggestions = useMemo(() => {
    const normalized = normalizeHandle(tagHandle);
    if (!normalized) return [];
    return audienceOptions
      .filter((profile) => {
        if (!profile?.id) return false;
        if (profile.id === user?.uid) return false;
        if (taggedPeople.some((entry) => entry.userId === profile.id)) {
          return false;
        }
        const username = (profile.username || '').toLowerCase();
        const displayName = (profile.displayName || '').toLowerCase();
        return username.includes(normalized) || displayName.includes(normalized);
      })
      .slice(0, 5);
  }, [audienceOptions, tagHandle, taggedPeople, user?.uid]);

  const persistTaggedPeople = async (nextList, successMessage) => {
    if (!dream) return;
    setTaggingBusy(true);
    setTaggingStatus('');
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        taggedUsers: nextList,
        taggedUserIds: nextList.map((entry) => entry.userId),
        updatedAt: serverTimestamp()
      });
      setTaggedPeople(nextList);
      setTagHandle('');
      if (successMessage) {
        setTaggingStatus(successMessage);
      }
    } catch {
      setTaggingStatus('Could not update tagged dreamers.');
    } finally {
      setTaggingBusy(false);
    }
  };

  const handleRemoveTaggedPerson = (personId) => {
    const next = taggedPeople.filter((entry) => entry.userId !== personId);
    persistTaggedPeople(next, 'Removed.');
  };

  const handleSelectTagSuggestion = (profile) => {
    if (!profile?.id || taggingBusy) return;
    if (taggedPeople.some((entry) => entry.userId === profile.id)) {
      setTaggingStatus('Already tagged.');
      return;
    }
    const next = [
      ...taggedPeople,
      {
        userId: profile.id,
        username: profile.username || '',
        displayName: profile.displayName || 'Dreamer'
      }
    ];
    setTagHandle('');
    persistTaggedPeople(next, 'Tagged successfully.');
  };

  const handleAddTaggedPerson = async () => {
    if (taggingBusy) return;
    const raw = tagHandle.trim();
    if (!raw || !user?.uid) return;
    const normalizedHandle = normalizeHandle(raw);
    if (!normalizedHandle) return;
    if (taggedPeople.some((entry) => entry.username?.toLowerCase() === normalizedHandle)) {
      setTaggingStatus('Already tagged.');
      setTagHandle('');
      return;
    }

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

      if (taggedPeople.some((entry) => entry.userId === match.id)) {
        setTaggingStatus('Already tagged.');
        return;
      }

      const data = match.data();
      const next = [
        ...taggedPeople,
        {
          userId: match.id,
          username: data.username || normalizedHandle,
          displayName: data.displayName || 'Dreamer'
        }
      ];
      await persistTaggedPeople(next, 'Tagged successfully.');
    } catch {
      setTaggingStatus('Could not tag that user.');
    }
  };

  const handleAnalyzeDream = async () => {
    if (!dream || dream.id.startsWith('local-')) return;

    const trimmedContent = (dream.content || '').trim();
    if (!trimmedContent) {
      setStatusMessage('Dream content is empty, nothing to analyze.');
      return;
    }

    setAnalyzing(true);
    setStatusMessage('');

    try {
      const idToken = await user?.getIdToken?.();
      if (!idToken) {
        setStatusMessage('Please sign in again to use AI features.');
        setAnalyzing(false);
        return;
      }

      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dreamText: trimmedContent,
          idToken
        })
      });

      const raw = await response.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error || `Summary service error (HTTP ${response.status})`);
      }

      const generatedTitle = payload?.title?.trim() || '';
      const generatedInsights = (payload?.themes || payload?.summary || payload?.insights || '').trim();
      const updates = { aiGenerated: true };

      if (generatedTitle) {
        updates.aiTitle = generatedTitle;
        if (!dream.title?.trim()) {
          updates.title = generatedTitle;
        }
      }

      if (generatedInsights) {
        updates.aiInsights = generatedInsights;
      }

      if (!generatedTitle || !generatedInsights) {
        throw new Error('AI response was incomplete.');
      }

      await updateDoc(doc(db, 'dreams', dream.id), {
        ...updates,
        updatedAt: serverTimestamp()
      });

      setStatusMessage('Title and summary updated.');
    } catch (err) {
      setStatusMessage(err.message || 'Summary generation failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyAiTitle = async () => {
    if (!dream?.aiTitle) return;
    setApplyingAiTitle(true);
    setStatusMessage('');

    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        title: dream.aiTitle,
        updatedAt: serverTimestamp()
      });
      setStatusMessage('Title updated from AI suggestion.');
    } catch {
      setStatusMessage('Could not apply AI title.');
    } finally {
      setApplyingAiTitle(false);
    }
  };

  const handleDelete = async () => {
    if (!dream || dream.id.startsWith('local-')) return;
    if (!window.confirm('Delete this dream? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'dreams', dream.id));
      navigate('/journal');
    } catch {
      setError('Failed to delete this dream.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className={containerClass}>
        <div className="detail-placeholder">Loading dream…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={containerClass}>
        <button className="detail-back-btn" type="button" onClick={() => navigate('/journal')}>
          <span className="detail-back-icon" aria-hidden="true">&larr;</span>
          <span>Back to journal</span>
        </button>
        <div className="detail-error">{error}</div>
      </div>
    );
  }

  if (!dream) {
    return (
      <div className={containerClass}>
        <button className="detail-back-btn" type="button" onClick={() => navigate('/journal')}>
          <span className="detail-back-icon" aria-hidden="true">&larr;</span>
          <span>Back to journal</span>
        </button>
        <div className="detail-error">Dream not available.</div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <div className="detail-card">
        <div className="detail-toolbar">
          <button
            type="button"
            className="detail-back-btn"
            onClick={() => navigate('/journal')}
          >
            <span className="detail-back-icon" aria-hidden="true">&larr;</span>
            <span>Back to journal</span>
          </button>
        </div>
        <div className="detail-head">
          <div>
            {editingDate ? (
              <div className="detail-date-edit">
                <input
                  type="date"
                  className="detail-date-input"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                />
                <button type="button" className="ghost-btn" onClick={handleSaveDate}>Save</button>
                <button type="button" className="ghost-btn" onClick={() => setEditingDate(false)}>Cancel</button>
              </div>
            ) : (
              <p className="detail-date" onClick={() => setEditingDate(true)} role="button" tabIndex={0}>
                {formattedDate} <span className="edit-hint">✎</span>
              </p>
            )}
            {editingTitle ? (
              <div className="detail-title-edit">
                <input
                  type="text"
                  className="detail-title-input"
                  placeholder="Enter a title"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveTitle();
                    }
                  }}
                  autoFocus
                />
                <button type="button" className="ghost-btn" onClick={handleSaveTitle}>Save</button>
                <button type="button" className="ghost-btn" onClick={() => setEditingTitle(false)}>Cancel</button>
              </div>
            ) : (
              <h1 onClick={() => setEditingTitle(true)} role="button" tabIndex={0}>
                {dream.title || (dream.aiGenerated && dream.aiTitle) || 'Untitled dream'} <span className="edit-hint">✎</span>
              </h1>
            )}
            {!editingTitle && dream.aiTitle && dream.aiTitle !== (dream.title || '').trim() ? (
              <button type="button" className="ghost-btn" onClick={handleApplyAiTitle} disabled={applyingAiTitle}>
                {applyingAiTitle ? 'Applying…' : 'Use AI title'}
              </button>
            ) : null}
          </div>
          <div className="detail-visibility">
            <p className="detail-label">Visibility</p>
            <div className="detail-visibility-options">
              {VISIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={(dream.visibility === option.value || (option.value === 'following' && dream.visibility === 'followers')) ? 'pill pill-active' : 'pill'}
                  onClick={() => handleVisibilityChange(option.value)}
                  disabled={updatingVisibility}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {dream.visibility !== 'private' && (
          <div className="detail-audience">
            <p className="detail-label">Hide from specific people</p>
            {audienceOptions.length === 0 ? (
              <p className="detail-hint">No connections available.</p>
            ) : (
              <div className="audience-chip-grid">
                {audienceOptions.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    className={excludedViewerIds.includes(profile.id) ? 'audience-chip active' : 'audience-chip'}
                    onClick={() => handleToggleAudience(profile.id)}
                    disabled={audienceBusy}
                  >
                    <span className="chip-title">{profile.displayName}</span>
                    {profile.username && <span className="chip-subtext">@{profile.username}</span>}
                  </button>
                ))}
              </div>
            )}
            {audienceBusy && <p className="detail-hint">Updating…</p>}
          </div>
        )}

        <div className="detail-tagged">
          <p className="detail-label">Tag people</p>
          <div className="tag-people-input">
            <input
              type="text"
              placeholder="@username"
              value={tagHandle}
              onChange={(e) => {
                setTagHandle(e.target.value);
                setTaggingStatus('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTaggedPerson();
                }
              }}
            />
            <button type="button" className="add-tag-btn" onClick={handleAddTaggedPerson} disabled={taggingBusy || !tagHandle.trim()}>
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
                  disabled={taggingBusy}
                >
                  <span className="suggestion-name">{profile.displayName}</span>
                  {profile.username && <span className="suggestion-username">@{profile.username}</span>}
                </button>
              ))}
            </div>
          )}
          {taggingStatus && <p className="detail-hint">{taggingStatus}</p>}
          {taggedPeople.length ? (
            <div className="tagged-pill-row">
              {taggedPeople.map((entry) => (
                <span key={entry.userId} className="tagged-pill">
                  @{entry.username || entry.displayName}
                  <button type="button" aria-label={`Remove ${entry.username || entry.displayName}`} onClick={() => handleRemoveTaggedPerson(entry.userId)} disabled={taggingBusy}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="detail-hint">Tagged dreamers will see this on their profile.</p>
          )}
        </div>

        {!editingContent && dream.tags?.length ? (
          <div className="detail-tags">
            {dream.tags.map((tag, index) => (
              <span className="tag" key={`${dream.id}-tag-${index}`}>{tag.value}</span>
            ))}
          </div>
        ) : null}

        <div className="detail-body">
          {editingContent ? (
            <>
              <textarea
                className="detail-textarea"
                value={contentInput}
                onChange={(e) => setContentInput(e.target.value)}
              />
              <div className="detail-tags-editor">
                <label htmlFor="detail-tag-input">Tags</label>
                <div className="detail-tag-input-row">
                  <input
                    id="detail-tag-input"
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Add a tag"
                  />
                  <button type="button" className="add-tag-btn" onClick={handleAddTag}>+ Tag</button>
                </div>
                {editableTags.length ? (
                  <div className="detail-tag-list">
                    {editableTags.map((tag) => (
                      <span className="detail-tag-chip" key={`edit-tag-${tag.value}`}>
                        {tag.value}
                        <button type="button" className="detail-tag-remove" onClick={() => handleRemoveTag(tag.value)} aria-label={`Remove tag ${tag.value}`}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="detail-edit-actions">
                <button type="button" className="ghost-btn" onClick={handleCancelContentEdit}>Cancel</button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleSaveContent}
                  disabled={!contentInput.trim()}
                >
                  Save changes
                </button>
              </div>
            </>
          ) : (
            <>
              <p>{dream.content}</p>
              <button type="button" className="ghost-btn" onClick={() => {
                setEditingContent(true);
                setContentInput(dream.content || '');
                setEditableTags(Array.isArray(dream.tags) ? dream.tags : []);
              }}>
                Edit content
              </button>
            </>
          )}
        </div>

        <div className="detail-summary">
          <div>
            <h3>Summary</h3>
            {dream.aiGenerated && dream.aiInsights ? (
              <p className="detail-insight">{dream.aiInsights}</p>
            ) : (
              <p className="detail-insight muted">No summary yet.</p>
            )}
          </div>
          {!dream.aiGenerated ? (
            <button
              type="button"
              className="primary-btn"
              onClick={handleAnalyzeDream}
              disabled={analyzing}
            >
              {analyzing ? 'Generating title & summary…' : 'Generate title & summary'}
            </button>
          ) : null}
        </div>

        {dream.aiGenerated && dream.aiTitle && dream.aiTitle !== (dream.title || '').trim() ? (
          <div className="ai-title-hint">
            <p className="ai-title-label">AI suggestion: <span>{dream.aiTitle}</span></p>
            <button
              type="button"
              className="ghost-btn"
              onClick={handleApplyAiTitle}
              disabled={applyingAiTitle}
            >
              {applyingAiTitle ? 'Applying…' : 'Use AI title'}
            </button>
          </div>
        ) : null}

        {statusMessage && <p className="detail-status-message">{statusMessage}</p>}

        <div className="detail-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/journal')}>
            Close
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete dream'}
          </button>
        </div>
      </div>
    </div>
  );
}
