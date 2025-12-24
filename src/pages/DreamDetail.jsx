import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';
import './DreamDetail.css';

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', helper: 'Only you can see this dream.' },
  { value: 'public', label: 'Public', helper: 'Visible on your profile and following feed.' },
  { value: 'following', label: 'People you follow', helper: 'Shared only with the people you follow.' },
  { value: 'anonymous', label: 'Anonymous', helper: 'Shared publicly without your identity.' }
];

const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT || '/api/ai-hf';

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

      setDream({
        id: snapshot.id,
        ...data,
        visibility: data.visibility || 'private',
        createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null
      });
      setTitleInput(data.title || '');
      if (data.createdAt?.toDate) {
        setDateInput(format(data.createdAt.toDate(), 'yyyy-MM-dd'));
      } else if (data.createdAt) {
        setDateInput(format(new Date(data.createdAt), 'yyyy-MM-dd'));
      }
      setContentInput(data.content || '');
      setEditableTags(Array.isArray(data.tags) ? data.tags : []);
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
      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dreamText: trimmedContent,
          userId: dream.userId || user?.uid || undefined
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
      const generatedInsights = (payload?.themes || payload?.insights || '').trim();
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

      if (!generatedTitle && !generatedInsights) {
        setStatusMessage('No new summary was generated.');
        setAnalyzing(false);
        return;
      }

      await updateDoc(doc(db, 'dreams', dream.id), {
        ...updates,
        updatedAt: serverTimestamp()
      });

      if (payload?.fallback) {
        setStatusMessage('Summary updated using fallback titles.');
      } else {
        setStatusMessage('Title and summary updated.');
      }
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
      <div className="page-container"><div className="detail-placeholder">Loading dream…</div></div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <button className="ghost-btn" onClick={() => navigate('/journal')}>&larr; Back to journal</button>
        <div className="detail-error">{error}</div>
      </div>
    );
  }

  if (!dream) {
    return (
      <div className="page-container">
        <button className="ghost-btn" onClick={() => navigate('/journal')}>&larr; Back to journal</button>
        <div className="detail-error">Dream not available.</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <button className="ghost-btn" onClick={() => navigate('/journal')}>&larr; Back to journal</button>

      <div className="detail-card">
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
          <button
            type="button"
            className="primary-btn"
            onClick={handleAnalyzeDream}
            disabled={analyzing}
          >
            {analyzing ? 'Generating…' : 'Generate title & summary'}
          </button>
        </div>

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
