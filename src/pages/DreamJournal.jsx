import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import './DreamJournal.css';

export default function DreamJournal({ user }) {
  const [dreams, setDreams] = useState([]);
  const [showNewDream, setShowNewDream] = useState(false);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [saveError, setSaveError] = useState('');
  const [listenError, setListenError] = useState('');

  const deriveTitle = (text) => {
    const clean = text.trim();
    if (!clean) return 'Untitled dream';
    const sentence = clean.split(/(?<=[.!?])\s+/)[0];
    const clipped = sentence.length > 64 ? `${sentence.slice(0, 64).trim()}…` : sentence;
    return clipped;
  };

  const deriveInsights = (text) => {
    const lower = text.toLowerCase();
    const keywords = ['flight', 'water', 'teeth', 'falling', 'chase', 'exam', 'crowd'];
    const hits = keywords.filter(k => lower.includes(k));
    const tone = lower.includes('calm') || lower.includes('peace') ? 'calm' : lower.includes('anx') ? 'anxious' : 'mixed';
    return `Tone: ${tone}. Notable motifs: ${hits.length ? hits.join(', ') : 'none spotted'}.`;
  };

  const toggleExpanded = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!user?.uid) return () => {};

    const q = query(
      collection(db, 'dreams'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dreamsList = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null
        };
      });
      setDreams(dreamsList);
      setListenError('');
    }, (error) => {
      console.error('Dreams listener failed', error);
      setListenError('Live sync failed. Check console for details and your Firestore rules.');
    });

    return unsubscribe;
  }, [user.uid]);

  const handleAddTag = () => {
    if (newTag.trim() && !tags.some(t => t.value === newTag.trim())) {
      setTags([...tags, { category: 'theme', value: newTag.trim() }]);
      setNewTag('');
    }
  };

  const handleSaveDream = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    setSaveError('');
    const optimistic = {
      id: `local-${Date.now()}`,
      content: content.trim(),
      tags,
      createdAt: new Date(),
      optimistic: true,
      aiTitle: deriveTitle(content),
      aiInsights: deriveInsights(content)
    };
    setDreams(prev => [optimistic, ...prev]);
    try {
      await addDoc(collection(db, 'dreams'), {
        userId: user.uid,
        content: content.trim(),
        tags,
        mentionedPeople: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        visibility: 'private',
        sharedWithUserIds: [],
        hasReflection: false,
        aiTitle: deriveTitle(content),
        aiInsights: deriveInsights(content)
      });

      setContent('');
      setTags([]);
      setShowNewDream(false);
    } catch (error) {
      console.error('Failed to save dream', error);
      setSaveError('Could not save. Check console and Firestore rules.');
      setDreams(prev => prev.filter(d => !d.optimistic));
    }
    setLoading(false);
  };

  const handleDeleteDream = async (dreamId) => {
    if (dreamId.startsWith('local-')) {
      setDreams(prev => prev.filter(d => d.id !== dreamId));
      return;
    }
    if (!window.confirm('Delete this dream?')) return;
    
    try {
      await deleteDoc(doc(db, 'dreams', dreamId));
    } catch (error) {
      alert('Failed to delete dream');
    }
  };

  const handleAnalyzeDream = async (dream) => {
    if (dream.id.startsWith('local-')) return;
    setAnalyzingId(dream.id);
    const localTitle = deriveTitle(dream.content);
    const localInsights = deriveInsights(dream.content);

    let nextTitle = localTitle;
    let nextInsights = localInsights;

    try {
      const endpoint = import.meta.env.VITE_AI_ENDPOINT;
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: dream.content })
        });
        if (res.ok) {
          const data = await res.json();
          nextTitle = data.title || nextTitle;
          nextInsights = data.insights || nextInsights;
        }
      }
    } catch (error) {
      console.error('AI analysis failed, using local heuristics', error);
    }

    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        aiTitle: nextTitle,
        aiInsights: nextInsights,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to save AI analysis', error);
    } finally {
      setAnalyzingId(null);
      setDreams(prev => prev.map(d => d.id === dream.id ? { ...d, aiTitle: nextTitle, aiInsights: nextInsights } : d));
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Dream Journal</h1>
          <p className="page-subtitle">Capture every fragment while it is still cosmic.</p>
        </div>
        <div className="action-group">
          <button onClick={() => setShowNewDream(true)} className="primary-btn">
            + New Dream
          </button>
        </div>
      </div>

      {showNewDream && (
        <div className="modal-overlay" onClick={() => setShowNewDream(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Dream</h2>
              <button onClick={() => setShowNewDream(false)} className="close-btn">×</button>
            </div>

            <form onSubmit={handleSaveDream}>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Describe your dream..."
                className="dream-textarea"
                rows={8}
                required
              />

              <div className="tags-section">
                <div className="tags-input">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add tag..."
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  />
                  <button type="button" onClick={handleAddTag} className="add-tag-btn">
                    Add
                  </button>
                </div>

                <div className="tags-list">
                  {tags.map((tag, index) => (
                    <span key={index} className="tag">
                      {tag.value}
                      <button 
                        type="button" 
                        onClick={() => setTags(tags.filter((_, i) => i !== index))}
                        className="remove-tag"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowNewDream(false)} className="secondary-btn">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="primary-btn">
                  {loading ? 'Saving...' : 'Save Dream'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(saveError || listenError) && (
        <div className="alert-banner">
          {saveError || listenError}
        </div>
      )}

      <div className="dreams-list">
        {dreams.length === 0 ? (
          <div className="empty-state">
            <p>No dreams yet</p>
            <p className="empty-subtitle">Start capturing your dreams</p>
          </div>
        ) : (
          dreams.map(dream => (
            <div key={dream.id} className="dream-card">
              <div className="dream-topline">
                <div>
                  <p className="dream-title">{dream.aiTitle || deriveTitle(dream.content)}</p>
                  {dream.aiInsights && <p className="dream-insights">{dream.aiInsights}</p>}
                </div>
                <div className="dream-actions">
                  {!dream.id.startsWith('local-') && (
                    <button
                      type="button"
                      className="ghost-btn dream-action"
                      onClick={() => handleAnalyzeDream(dream)}
                      disabled={analyzingId === dream.id}
                    >
                      {analyzingId === dream.id ? 'Analyzing…' : 'Analyze'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost-btn dream-action"
                    onClick={() => toggleExpanded(dream.id)}
                  >
                    {expandedIds.has(dream.id) ? 'Collapse' : 'Expand'}
                  </button>
                </div>
              </div>
              <div className="dream-header">
                <span className="dream-date">
                  {dream.createdAt && format(dream.createdAt, 'MMM d, yyyy')}
                </span>
                <button onClick={() => handleDeleteDream(dream.id)} className="delete-btn">
                  Delete
                </button>
              </div>
              
              <p className="dream-content">
                {expandedIds.has(dream.id) ? dream.content : `${dream.content.slice(0, 200)}${dream.content.length > 200 ? '…' : ''}`}
              </p>
              
              {dream.tags && dream.tags.length > 0 && (
                <div className="dream-tags">
                  {dream.tags.map((tag, index) => (
                    <span key={index} className="tag">{tag.value}</span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
