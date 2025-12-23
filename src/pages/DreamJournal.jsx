import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import './DreamJournal.css';

const VISIBILITY_LABELS = {
  private: 'Private',
  public: 'Public',
  anonymous: 'Anonymous'
};

const CONTENT_PREVIEW_LIMIT = 240;
const INSIGHT_PREVIEW_LIMIT = 180;

export default function DreamJournal({ user }) {
  const [dreams, setDreams] = useState([]);
  const [showNewDream, setShowNewDream] = useState(false);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(false);
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
      setListenError('');
    }, () => {
      setListenError('Live sync failed. Check your Firestore rules.');
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
    setContent('');
    setTags([]);
    setNewTag('');
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
    setSaveError('');

    const optimistic = {
      id: `local-${Date.now()}`,
      content: content.trim(),
      tags,
      visibility: 'private',
      aiGenerated: false,
      aiTitle: '',
      aiInsights: '',
      createdAt: new Date()
    };

    setDreams((prev) => [optimistic, ...prev]);

    try {
      await addDoc(collection(db, 'dreams'), {
        userId: user.uid,
        content: content.trim(),
        tags,
        visibility: 'private',
        aiGenerated: false,
        aiTitle: '',
        aiInsights: '',
        createdAt: serverTimestamp(),
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
          {dream.aiGenerated && dream.aiTitle ? dream.aiTitle : 'Dream entry'}
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
            <p className="dream-insights">{truncate(dream.aiInsights, INSIGHT_PREVIEW_LIMIT)}</p>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Dream Journal</h1>
          <p className="page-subtitle">Capture every fragment while it is still cosmic.</p>
        </div>
        <div className="action-group">
          <button type="button" onClick={() => setShowNewDream(true)} className="primary-btn">
            + New Dream
          </button>
        </div>
      </div>

      {listenError && <div className="alert-banner">{listenError}</div>}

      {dreams.length ? (
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

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={closeModal} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={loading || !content.trim()}>
                  {loading ? 'Saving…' : 'Save dream'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
