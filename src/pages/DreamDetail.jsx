import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';
import './DreamDetail.css';

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', helper: 'Only you can see this dream.' },
  { value: 'public', label: 'Public', helper: 'Visible on your profile and friends feed.' },
  { value: 'anonymous', label: 'Anonymous', helper: 'Shared publicly without your identity.' }
];

export default function DreamDetail({ user }) {
  const { dreamId } = useParams();
  const navigate = useNavigate();
  const [dream, setDream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiStatus, setAiStatus] = useState('');

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
      if (data.userId && data.userId !== user.uid) {
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
      setLoading(false);
    }, () => {
      setError('Failed to load this dream.');
      setLoading(false);
    });

    return unsubscribe;
  }, [dreamId, user.uid]);

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

  const handleAnalyzeDream = async () => {
    if (!dream || dream.id.startsWith('local-')) return;
    const endpoint = import.meta.env.VITE_AI_ENDPOINT;
    if (!endpoint) {
      setAiStatus('AI analysis is disabled. Configure VITE_AI_ENDPOINT to enable it.');
      return;
    }

    setAnalyzing(true);
    setAiStatus('');

    let generatedTitle = '';
    let generatedInsights = '';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: dream.content })
      });

      if (res.ok) {
        const data = await res.json();
        generatedTitle = data.title?.trim() || '';
        generatedInsights = data.insights?.trim() || '';
      } else {
        setAiStatus('AI service is unavailable. Please try again later.');
        setAnalyzing(false);
        return;
      }
    } catch {
      setAiStatus('AI analysis failed. Please try again.');
      setAnalyzing(false);
      return;
    }

    const updates = {};
    if (generatedTitle) updates.aiTitle = generatedTitle;
    if (generatedInsights) updates.aiInsights = generatedInsights;

    if (!Object.keys(updates).length) {
      setAiStatus('No new insights were generated.');
      setAnalyzing(false);
      return;
    }

    updates.aiGenerated = true;

    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        ...updates,
        updatedAt: serverTimestamp()
      });
      setAiStatus('AI insight refreshed.');
    } catch {
      setAiStatus('Could not save AI insight just now.');
    } finally {
      setAnalyzing(false);
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
            <p className="detail-date">{formattedDate}</p>
            <h1>{dream.aiGenerated && dream.aiTitle ? dream.aiTitle : 'Dream entry'}</h1>
          </div>
          <div className="detail-visibility">
            <p className="detail-label">Visibility</p>
            <div className="detail-visibility-options">
              {VISIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={dream.visibility === option.value ? 'pill pill-active' : 'pill'}
                  onClick={() => handleVisibilityChange(option.value)}
                  disabled={updatingVisibility}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {dream.tags?.length ? (
          <div className="detail-tags">
            {dream.tags.map((tag, index) => (
              <span className="tag" key={`${dream.id}-tag-${index}`}>{tag.value}</span>
            ))}
          </div>
        ) : null}

        <div className="detail-body">
          <p>{dream.content}</p>
        </div>

        <div className="detail-ai">
          <div>
            <h3>AI insight</h3>
            {dream.aiGenerated && dream.aiInsights ? (
              <p className="detail-insight">{dream.aiInsights}</p>
            ) : (
              <p className="detail-insight muted">No AI insights yet.</p>
            )}
          </div>
          <button
            type="button"
            className="primary-btn"
            onClick={handleAnalyzeDream}
            disabled={analyzing}
          >
            {analyzing ? 'Analyzing…' : 'Run Analyze'}
          </button>
        </div>

        {aiStatus && <p className="detail-ai-message">{aiStatus}</p>}

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
