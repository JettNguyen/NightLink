import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import './Feed.css';

export default function Feed({ user }) {
  const [dreams, setDreams] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, 'dreams'),
      where('visibility', '==', 'anonymous'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dreamsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      }));
      setDreams(dreamsList);
    });

    return unsubscribe;
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Anonymous Feed</h1>
          <p className="page-subtitle">A constellation of shared dreams—names optional, stories luminous.</p>
        </div>
      </div>

      <div className="feed-list">
        {dreams.length === 0 ? (
          <div className="empty-state">
            <p>No shared dreams yet</p>
            <p className="empty-subtitle">Dreams shared anonymously will appear here</p>
          </div>
        ) : (
          dreams.map(dream => (
            <div key={dream.id} className="feed-card">
              <div className="feed-card-head">
                <div className="feed-author">Anonymous</div>
                <span className="feed-date">
                  {dream.createdAt && format(dream.createdAt, 'MMM d, yyyy')}
                </span>
              </div>
              
              <p className="feed-content">{dream.content}</p>
              
              {dream.tags && dream.tags.length > 0 && (
                <div className="feed-tags">
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
