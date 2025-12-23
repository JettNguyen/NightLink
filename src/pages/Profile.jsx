import { useState, useEffect, useMemo } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser,
  faMoon,
  faStar,
  faCloud,
  faCloudMoon,
  faSun,
  faFeather,
  faBed,
  faEye,
  faSeedling,
  faMountain,
  faRainbow,
  faBolt,
  faCompass,
  faRocket,
  faTree,
  faWater,
  faGhost,
  faHeart,
  faLeaf,
  faMagic
} from '@fortawesome/free-solid-svg-icons';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import './Profile.css';

const AVATAR_ICONS = [
  { id: 'moon', icon: faMoon, label: 'Moonrise' },
  { id: 'star', icon: faStar, label: 'Starlight' },
  { id: 'cloud', icon: faCloud, label: 'Cloud Drift' },
  { id: 'cloud-moon', icon: faCloudMoon, label: 'Night Cloud' },
  { id: 'sun', icon: faSun, label: 'Sunrise' },
  { id: 'feather', icon: faFeather, label: 'Feather' },
  { id: 'bed', icon: faBed, label: 'Bed' },
  { id: 'eye', icon: faEye, label: 'Inner Eye' },
  { id: 'seedling', icon: faSeedling, label: 'Seedling' },
  { id: 'mountain', icon: faMountain, label: 'Summit' },
  { id: 'rainbow', icon: faRainbow, label: 'Rainbow' },
  { id: 'bolt', icon: faBolt, label: 'Spark' },
  { id: 'compass', icon: faCompass, label: 'Compass' },
  { id: 'rocket', icon: faRocket, label: 'Rocket' },
  { id: 'tree', icon: faTree, label: 'Grove' },
  { id: 'water', icon: faWater, label: 'Tide' },
  { id: 'ghost', icon: faGhost, label: 'Spirit' },
  { id: 'heart', icon: faHeart, label: 'Heart' },
  { id: 'leaf', icon: faLeaf, label: 'Leaf' },
  { id: 'magic', icon: faMagic, label: 'Wand' }
];

const AVATAR_BACKGROUNDS = ['#081427', '#0f1b2c', '#1f2a44', '#2e0f2c', '#301b35', '#142c24', '#1c1c38', '#2e1b14', '#062019', '#1b2338'];
const AVATAR_COLORS = ['#fef9c3', '#ffe5ec', '#c7d2fe', '#e0e7ff', '#bbf7d0', '#bae6fd', '#f0abfc', '#fbcfe8', '#fdba74', '#a5f3fc'];

export default function Profile({ user }) {
  const [userData, setUserData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [dreams, setDreams] = useState([]);
  const [dreamsLoading, setDreamsLoading] = useState(true);
  const [avatarIcon, setAvatarIcon] = useState(AVATAR_ICONS[0].id);
  const [avatarBackground, setAvatarBackground] = useState(AVATAR_BACKGROUNDS[0]);
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const navigate = useNavigate();

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
      setAvatarIcon(data.avatarIcon || AVATAR_ICONS[0].id);
      setAvatarBackground(data.avatarBackground || AVATAR_BACKGROUNDS[0]);
      setAvatarColor(data.avatarColor || AVATAR_COLORS[0]);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: displayName.trim(),
        username: username.trim() || null,
        bio: bio.trim() || null,
        avatarIcon,
        avatarBackground,
        avatarColor,
        updatedAt: new Date()
      });

      await loadUserData();
      setIsEditing(false);
    } catch (error) {
      alert('Failed to update profile');
    }

    setLoading(false);
  };

  const selectedIcon = useMemo(() => {
    const iconEntry = AVATAR_ICONS.find((entry) => entry.id === avatarIcon);
    return iconEntry?.icon || faUser;
  }, [avatarIcon]);

  if (!userData) {
    return <div className="page-container">Loading...</div>;
  }

  const handleDreamNavigation = (dreamId) => {
    if (!dreamId) return;
    navigate(`/journal/${dreamId}`);
  };

  const renderDreamPreview = (dream) => {
    const title = dream.aiGenerated ? dream.aiTitle?.trim() : '';
    const snippet = dream.content?.length > 180 ? `${dream.content.slice(0, 180)}…` : dream.content;
    const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Pending sync';
    const visibilityLabel =
      dream.visibility === 'anonymous'
        ? 'Shared anonymously'
        : dream.visibility === 'public'
          ? 'Public dream'
          : 'Private';

    return (
      <div
        key={dream.id}
        className="profile-dream-card"
        role="button"
        tabIndex={0}
        onClick={() => handleDreamNavigation(dream.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleDreamNavigation(dream.id);
          }
        }}
      >
        <div className="profile-dream-top">
          <div className="dream-date-pill">{dateLabel}</div>
          <div className="dream-visibility-pill">{visibilityLabel}</div>
        </div>
        {title ? (
          <h3 className="profile-dream-title">{title}</h3>
        ) : (
          <p className="ai-placeholder">AI title not generated yet.</p>
        )}
        {dream.aiGenerated && dream.aiInsights && (
          <p className="profile-dream-insights">{dream.aiInsights}</p>
        )}
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
          <div
            className="avatar-circle"
            style={{ background: avatarBackground }}
            aria-label="Profile avatar"
          >
            <FontAwesomeIcon icon={selectedIcon} style={{ color: avatarColor, fontSize: '2.4rem' }} />
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
            <div className="avatar-customizer">
              <p className="customizer-label">Avatar icon</p>
              <div className="avatar-option-grid">
                {AVATAR_ICONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`avatar-option ${avatarIcon === option.id ? 'selected' : ''}`}
                    onClick={() => setAvatarIcon(option.id)}
                  >
                    <FontAwesomeIcon icon={option.icon} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>

              <p className="customizer-label">Background</p>
              <div className="color-swatch-grid">
                {AVATAR_BACKGROUNDS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${avatarBackground === color ? 'selected' : ''}`}
                    style={{ background: color }}
                    onClick={() => setAvatarBackground(color)}
                    aria-label={`Select background ${color}`}
                  />
                ))}
              </div>

              <p className="customizer-label">Icon color</p>
              <div className="color-swatch-grid">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${avatarColor === color ? 'selected' : ''}`}
                    style={{ background: color }}
                    onClick={() => setAvatarColor(color)}
                    aria-label={`Select icon color ${color}`}
                  />
                ))}
              </div>
            </div>
            <div className="profile-actions">
              <button
                type="button"
                onClick={() => {
                  setDisplayName(userData.displayName || '');
                  setUsername(userData.username || '');
                  setBio(userData.bio || '');
                  setAvatarIcon(userData.avatarIcon || AVATAR_ICONS[0].id);
                  setAvatarBackground(userData.avatarBackground || AVATAR_BACKGROUNDS[0]);
                  setAvatarColor(userData.avatarColor || AVATAR_COLORS[0]);
                  setIsEditing(false);
                }}
                className="secondary-btn"
              >
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
