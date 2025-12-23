import { useState, useEffect, useRef } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera, faUser } from '@fortawesome/free-solid-svg-icons';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import './Profile.css';

export default function Profile({ user }) {
  const [userData, setUserData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dreams, setDreams] = useState([]);
  const [dreamsLoading, setDreamsLoading] = useState(true);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadUserData();
  }, [user.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    const q = query(
      collection(db, 'dreams'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(12)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dreamsList = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null
        };
      });
      setDreams(dreamsList);
      setDreamsLoading(false);
    }, () => {
      setDreams([]);
      setDreamsLoading(false);
    });

    return unsubscribe;
  }, [user.uid]);

  const loadUserData = async () => {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      setUserData(data);
      setDisplayName(data.displayName || '');
      setUsername(data.username || '');
      setBio(data.bio || '');
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setUploading(true);

    try {
      const storageRef = ref(storage, `profile-photos/${user.uid}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'users', user.uid), {
        profileImageURL: photoURL,
        updatedAt: new Date()
      });

      await loadUserData();
    } catch (error) {
      alert('Failed to upload photo');
    }

    setUploading(false);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: displayName.trim(),
        username: username.trim() || null,
        bio: bio.trim() || null,
        updatedAt: new Date()
      });

      await loadUserData();
      setIsEditing(false);
    } catch (error) {
      alert('Failed to update profile');
    }

    setLoading(false);
  };

  if (!userData) {
    return <div className="page-container">Loading...</div>;
  }

  const renderDreamPreview = (dream) => {
    const title = dream.aiTitle || dream.content?.slice(0, 60) || 'Untitled dream';
    const snippet = dream.content?.length > 180 ? `${dream.content.slice(0, 180)}…` : dream.content;
    const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Pending sync';

    return (
      <div key={dream.id} className="profile-dream-card">
        <div className="profile-dream-top">
          <div className="dream-date-pill">{dateLabel}</div>
          {dream.visibility === 'anonymous' && <div className="dream-visibility-pill">Shared anonymously</div>}
        </div>
        <h3 className="profile-dream-title">{title}</h3>
        {dream.aiInsights && <p className="profile-dream-insights">{dream.aiInsights}</p>}
        <p className="profile-dream-snippet">{snippet}</p>
        {dream.tags?.length ? (
          <div className="profile-dream-tags">
            {dream.tags.map((tag, index) => (
              <span className="tag" key={`${dream.id}-tag-${index}`}>{tag.value}</span>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="profile-header">
        <div className="profile-avatar">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            style={{ display: 'none' }}
          />
          <div 
            className="avatar-circle" 
            onClick={() => fileInputRef.current?.click()}
            style={{ cursor: 'pointer', position: 'relative' }}
          >
            {userData.profileImageURL ? (
              <img 
                src={userData.profileImageURL} 
                alt="Profile" 
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            ) : (
              <FontAwesomeIcon icon={faUser} style={{ fontSize: '2rem' }} />
            )}
            {uploading && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: '50%',
                color: 'white'
              }}>
                Uploading...
              </div>
            )}
            <div className="camera-overlay">
              <FontAwesomeIcon icon={faCamera} />
            </div>
          </div>
        </div>

        {!isEditing ? (
          <div className="profile-info">
            <h1>{userData.displayName}</h1>
            {userData.username && (
              <p className="profile-username">@{userData.username}</p>
            )}
            {userData.bio && (
              <p className="profile-bio">{userData.bio}</p>
            )}
            {userData.email && !userData.isAnonymous && (
              <p className="profile-email">{userData.email}</p>
            )}
            <button onClick={() => setIsEditing(true)} className="edit-profile-btn">
              Edit Profile
            </button>
          </div>
        ) : (
          <form onSubmit={handleSaveProfile} className="profile-edit-form">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display Name"
              required
              className="profile-input"
            />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="profile-input"
            />
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Bio"
              rows={4}
              className="profile-textarea"
            />
            <div className="profile-actions">
              <button type="button" onClick={() => setIsEditing(false)} className="secondary-btn">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="primary-btn">
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="profile-stats">
        <div className="stat-item">
          <div className="stat-value">{userData.friendIds?.length || 0}</div>
          <div className="stat-label">Friends</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{userData.isAnonymous ? 'Guest' : 'Member'}</div>
          <div className="stat-label">Status</div>
        </div>
      </div>

      <div className="profile-dreams">
        <div className="profile-dreams-head">
          <div>
            <h2>Your dreams</h2>
            <p className="profile-dreams-subtitle">A gentle gallery of your latest entries.</p>
          </div>
          <Link to="/journal" className="ghost-btn">Open journal</Link>
        </div>

        {dreamsLoading ? (
          <div className="profile-dreams-loading">Loading your dreams…</div>
        ) : dreams.length === 0 ? (
          <div className="profile-dreams-empty">
            <p>No dreams yet</p>
            <p className="empty-subtitle">Start a new entry to see it here</p>
            <Link to="/journal" className="primary-btn">Write a dream</Link>
          </div>
        ) : (
          <div className="profile-dream-grid">
            {dreams.map(renderDreamPreview)}
          </div>
        )}
      </div>
    </div>
  );
}
