import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import './DreamJournal.css';

const VISIBILITY_LABELS = {
  private: 'Private',
  public: 'Public',
  following: 'People you follow',
  followers: 'People you follow',
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

// AI endpoint (defaults to the Vercel function path)
const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT || '/api/ai';

// Call AI endpoint with timeout and Firebase ID token
const fetchAIAnalysis = async (dreamText, user, timeoutMs = 15000) => {
  if (!user) throw new Error('User not authenticated');
  const idToken = await user.getIdToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dreamText, idToken }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('AI request timed out');
    }
    throw err;
  }
};

export default function DreamJournal({ user }) {
  const [dreams, setDreams] = useState([]);
  const [showNewDream, setShowNewDream] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dreamDate, setDreamDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [listenError, setListenError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.uid) {
      setDreams([]);
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

  const truncate = (text, limit) => {
    if (!text) return '';
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  };

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || tags.some((tag) => tag.value === trimmed)) return;
    setTags([...tags, { category: 'theme', value: trimmed }]);
    setNewTag('');
  };

  const handleRemoveTag = (value) => {
    setTags(tags.filter((tag) => tag.value !== value));
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setDreamDate(format(new Date(), 'yyyy-MM-dd'));
    setTags([]);
    setNewTag('');
    setVisibility('private');
    setSaveError('');
  };

  const closeModal = () => {
    if (loading) return;
    setShowNewDream(false);
    resetForm();
  };

  const handleSaveDream = async (event) => {
    event.preventDefault();
    if (!content.trim() || !user?.uid) return;

    setLoading(true);
    setAiLoading(true);
    setSaveError('');

    const trimmedContent = content.trim();
    const userTitle = title.trim();

    let aiTitle = '';
    let aiThemes = '';

    try {
      const aiResult = await fetchAIAnalysis(trimmedContent, user);
      aiTitle = aiResult?.title?.trim() || '';
      aiThemes = (aiResult?.themes || aiResult?.summary || '').trim();
    } catch (err) {
      setAiLoading(false);
      setLoading(false);
      setSaveError(err.message || 'AI analysis failed. Please try again.');
      return;
    }

    setAiLoading(false);

    if (!aiTitle || !aiThemes) {
      setLoading(false);
      setSaveError('AI response was incomplete. Please try again.');
      return;
    }

    const resolvedTitle = userTitle || aiTitle;
    const aiGenerated = true;

    const optimistic = {
      id: `local-${Date.now()}`,
      title: resolvedTitle,
      content: trimmedContent,
      tags,
      visibility,
      aiGenerated,
      aiTitle,
      aiInsights: aiThemes,
      createdAt: new Date(dreamDate)
    };

    setDreams((prev) => [optimistic, ...prev]);

    try {
      await addDoc(collection(db, 'dreams'), {
        userId: user.uid,
        title: resolvedTitle,
        content: trimmedContent,
        tags,
        visibility,
        aiGenerated,
        aiTitle,
        aiInsights: aiThemes,
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
    navigate(`/journal/${dreamId}`);
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

        {dream.tags?.length ? (
          <div className="dream-tags">
            {dream.tags.slice(0, 3).map((tag, index) => (
              <span className="tag" key={`${dream.id}-tag-${index}`}>
                {tag.value}
              </span>
            ))}
          </div>
        ) : null}

        {dream.aiGenerated && dream.aiInsights ? (
          <div className="dream-footer">
            <p className="dream-summary">{truncate(dream.aiInsights, INSIGHT_PREVIEW_LIMIT)}</p>
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
          <p className="page-subtitle">Log every dream while it is still fresh.</p>
        </div>
        <div className="action-group">
          <button type="button" onClick={() => setShowNewDream(true)} className="primary-btn">
            + New Dream
          </button>
        </div>
      </div>

      {listenError && <div className="alert-banner">{listenError}</div>}

      {initialLoading ? (
        <div className="dreams-loading">Loading your dreams…</div>
      ) : dreams.length ? (
        <div className="dreams-list">
          {dreams.map((dream) => renderDreamCard(dream))}
        </div>
      ) : (
        <p className="empty-state">No dreams yet. Record the first whisper.</p>
      )}

      {showNewDream && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>New Dream</h2>
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

              <div className="tags-section">
                <label htmlFor="dream-tag-input">Tags</label>
                <div className="tags-input">
                  <input
                    id="dream-tag-input"
                    type="text"
                    placeholder="Add a tag and press enter"
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddTag();
                      }
                    }}
                    disabled={loading}
                  />
                  <button type="button" className="add-tag-btn" onClick={handleAddTag} disabled={loading}>
                    + Tag
                  </button>
                </div>

                {tags.length ? (
                  <div className="tags-list">
                    {tags.map((tag) => (
                      <span className="tag" key={`form-tag-${tag.value}`}>
                        {tag.value}
                        <button type="button" className="remove-tag" onClick={() => handleRemoveTag(tag.value)} aria-label={`Remove tag ${tag.value}`}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

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

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={closeModal} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={loading || !content.trim()}>
                  {aiLoading ? 'Analyzing…' : loading ? 'Saving…' : 'Save dream'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
