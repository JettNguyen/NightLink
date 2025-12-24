import { useState, useEffect, useMemo } from 'react';
import { arrayRemove, arrayUnion, collection, doc, getDoc, limit, onSnapshot, orderBy, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { format } from 'date-fns';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AVATAR_ICONS, AVATAR_BACKGROUNDS, AVATAR_COLORS, DEFAULT_AVATAR_BACKGROUND, DEFAULT_AVATAR_COLOR, getAvatarIconById } from '../constants/avatarOptions';
import './Profile.css';

export default function Profile({ user }) {
  const { userId: routeUserId } = useParams();
  const targetUserId = routeUserId || user?.uid || null;
  const viewingOwnProfile = !routeUserId || routeUserId === user?.uid;

  const [userData, setUserData] = useState(null);
  const [profileNotFound, setProfileNotFound] = useState(false);
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
  const [viewerData, setViewerData] = useState(null);
  const [followAction, setFollowAction] = useState({ type: null });
  const [connectionListType, setConnectionListType] = useState(null);
  const [connectionProfiles, setConnectionProfiles] = useState([]);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const navigate = useNavigate();

  const loadUserData = async (uid) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (!userDoc.exists()) {
        setProfileNotFound(true);
        setUserData(null);
        return;
      }

      const data = userDoc.data();
      setProfileNotFound(false);
      setUserData(data);
      setDisplayName(data.displayName || '');
      setUsername(data.username || '');
      setBio(data.bio || '');
      setAvatarIcon(data.avatarIcon || AVATAR_ICONS[0].id);
      setAvatarBackground(data.avatarBackground || AVATAR_BACKGROUNDS[0]);
      setAvatarColor(data.avatarColor || AVATAR_COLORS[0]);
    } catch {
      setProfileNotFound(true);
      setUserData(null);
    }
  };

  const fetchUsersByIds = async (ids = []) => {
    if (!ids.length) return [];
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const snapshot = await getDoc(doc(db, 'users', id));
          return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
        } catch {
          return null;
        }
      })
    );
    return results.filter(Boolean);
  };

  useEffect(() => {
    if (!user?.uid) return undefined;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      setViewerData(snapshot.exists() ? snapshot.data() : null);
    });

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!targetUserId) return;
    setProfileNotFound(false);
    setUserData(null);
    setDreams([]);
    setDreamsLoading(true);
    setIsEditing(false);
    loadUserData(targetUserId);
  }, [targetUserId]);

  useEffect(() => {
    if (!targetUserId) return undefined;

    const dreamsQuery = query(
      collection(db, 'dreams'),
      where('userId', '==', targetUserId),
      orderBy('createdAt', 'desc'),
      limit(12)
    );

    const unsubscribe = onSnapshot(dreamsQuery, (snapshot) => {
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
  }, [targetUserId]);

  useEffect(() => {
    if (!connectionListType) {
      setConnectionProfiles([]);
      setConnectionLoading(false);
      return;
    }

    const sourceIds = connectionListType === 'followers'
      ? (userData?.followerIds || [])
      : (userData?.followingIds || []);

    if (!sourceIds.length) {
      setConnectionProfiles([]);
      setConnectionLoading(false);
      return;
    }

    let cancelled = false;
    setConnectionLoading(true);

    const loadConnections = async () => {
      try {
        const profiles = await fetchUsersByIds(sourceIds);
        if (!cancelled) {
          setConnectionProfiles(profiles);
        }
      } finally {
        if (!cancelled) {
          setConnectionLoading(false);
        }
      }
    };

    loadConnections();

    return () => {
      cancelled = true;
    };
  }, [connectionListType, userData?.followerIds, userData?.followingIds]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!viewingOwnProfile || !user?.uid) return;
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

      await loadUserData(user.uid);
      setIsEditing(false);
    } catch {
      alert('Failed to update profile');
    }

    setLoading(false);
  };

  const viewerId = user?.uid || null;
  const viewerFollowingIds = viewerData?.followingIds || [];
  const targetFollowerIds = userData?.followerIds || [];
  const targetFollowingIds = userData?.followingIds || [];
  const connectionHeadingName = userData?.displayName || 'this dreamer';

  const displayAvatarIconId = viewingOwnProfile
    ? (avatarIcon || AVATAR_ICONS[0].id)
    : (userData?.avatarIcon || AVATAR_ICONS[0].id);
  const displayAvatarBackground = viewingOwnProfile
    ? (avatarBackground || AVATAR_BACKGROUNDS[0])
    : (userData?.avatarBackground || AVATAR_BACKGROUNDS[0]);
  const displayAvatarColor = viewingOwnProfile
    ? (avatarColor || AVATAR_COLORS[0])
    : (userData?.avatarColor || AVATAR_COLORS[0]);

  const isFollowingTarget = !viewingOwnProfile && viewerFollowingIds.includes(targetUserId);
  const followsYou = !viewingOwnProfile && targetFollowerIds.includes(user?.uid);

  const selectedIcon = useMemo(() => getAvatarIconById(displayAvatarIconId), [displayAvatarIconId]);
  const isFollowActionBusy = Boolean(followAction.type);
  const viewerFollowedByTarget = useMemo(() => {
    if (viewingOwnProfile || !viewerId) return false;
    return targetFollowingIds.includes(viewerId);
  }, [viewerId, viewingOwnProfile, targetFollowingIds]);
  const displayedDreams = useMemo(() => {
    if (viewingOwnProfile) return dreams;
    return dreams.filter((dream) => {
      const visibility = dream.visibility || 'private';
      if (visibility === 'public') return true;
      if ((visibility === 'following' || visibility === 'followers') && viewerFollowedByTarget) {
        return true;
      }
      return false;
    });
  }, [dreams, viewingOwnProfile, viewerFollowedByTarget]);

  const performFollowAction = async (type, operation, errorMessage) => {
    setFollowAction({ type });
    try {
      await operation();
      if (targetUserId) {
        await loadUserData(targetUserId);
      }
    } catch {
      alert(errorMessage || 'Unable to update following right now.');
    } finally {
      setFollowAction({ type: null });
    }
  };

  const handleFollow = () => {
    if (!user?.uid || !targetUserId || viewingOwnProfile || isFollowActionBusy) return;
    return performFollowAction('follow', async () => {
      await runTransaction(db, async (transaction) => {
        const viewerRef = doc(db, 'users', user.uid);
        const targetRef = doc(db, 'users', targetUserId);
        const targetSnap = await transaction.get(targetRef);
        if (!targetSnap.exists()) {
          throw new Error('profile-missing');
        }

        transaction.update(viewerRef, {
          followingIds: arrayUnion(targetUserId)
        });

        transaction.update(targetRef, {
          followerIds: arrayUnion(user.uid)
        });
      });
    }, 'Unable to follow this user.');
  };

  const handleUnfollow = () => {
    if (!user?.uid || !targetUserId || viewingOwnProfile || isFollowActionBusy) return;
    return performFollowAction('unfollow', async () => {
      await runTransaction(db, async (transaction) => {
        const viewerRef = doc(db, 'users', user.uid);
        const targetRef = doc(db, 'users', targetUserId);

        transaction.update(viewerRef, {
          followingIds: arrayRemove(targetUserId)
        });

        transaction.update(targetRef, {
          followerIds: arrayRemove(user.uid)
        });
      });
    }, 'Unable to unfollow right now.');
  };

  if (!targetUserId) {
    return <div className="page-container">Profile unavailable.</div>;
  }

  if (profileNotFound) {
    return <div className="page-container">We could not find that dreamer.</div>;
  }

  if (!userData) {
    return <div className="page-container">Loading…</div>;
  }

  const handleDreamNavigation = (dreamId) => {
    if (!dreamId) return;
    navigate(`/journal/${dreamId}`);
  };

  const handleProfileNavigation = (profileId) => {
    if (!profileId) return;
    navigate(`/profile/${profileId}`);
    setConnectionListType(null);
  };

  const renderDreamPreview = (dream) => {
    const title = dream.title || (dream.aiGenerated ? dream.aiTitle?.trim() : '');
    const snippet = dream.content?.length > 180 ? `${dream.content.slice(0, 180)}…` : dream.content;
    const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Pending sync';
    let visibilityLabel = 'Private';
    if (dream.visibility === 'anonymous') visibilityLabel = 'Shared anonymously';
    else if (dream.visibility === 'public') visibilityLabel = 'Public dream';
    else if (dream.visibility === 'following' || dream.visibility === 'followers') visibilityLabel = 'People you follow';

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
          <p className="pending-title">Title pending</p>
        )}
        {dream.aiGenerated && dream.aiInsights && (
          <p className="profile-dream-summary">{dream.aiInsights}</p>
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

  const dreamSectionTitle = viewingOwnProfile ? 'Your dreams' : 'Recent dreams';
  const dreamSectionSubtitle = viewingOwnProfile
    ? 'A gentle gallery of your latest entries.'
    : 'Only entries they have shared with you appear here.';

  return (
    <div className="page-container">
      <div className="profile-header">
        <div className="profile-avatar">
          <div
            className="avatar-circle"
            style={{ background: displayAvatarBackground }}
            aria-label="Profile avatar"
          >
            <FontAwesomeIcon icon={selectedIcon} style={{ color: displayAvatarColor, fontSize: '2.4rem' }} />
          </div>
        </div>

        {viewingOwnProfile && isEditing ? (
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
        ) : (
          <div className="profile-info">
            <h1>{userData.displayName || 'Dreamer'}</h1>
            {userData.username && <p className="profile-username">@{userData.username}</p>}
            {userData.bio && <p className="profile-bio">{userData.bio}</p>}
            {viewingOwnProfile && userData.email && !userData.isAnonymous && (
              <p className="profile-email">{userData.email}</p>
            )}
            {viewingOwnProfile && (
              <button onClick={() => setIsEditing(true)} className="edit-profile-btn">
                Edit Profile
              </button>
            )}
            {!viewingOwnProfile && (
              <div className="follow-actions">
                <button
                  type="button"
                  className={isFollowingTarget ? 'ghost-btn' : 'primary-btn'}
                  onClick={isFollowingTarget ? handleUnfollow : handleFollow}
                  disabled={isFollowActionBusy}
                >
                  {isFollowActionBusy ? 'Working…' : isFollowingTarget ? 'Following' : 'Follow'}
                </button>
                {followsYou && <span className="follow-note">Follows you</span>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="profile-stats">
        <button
          type="button"
          className="stat-item stat-button"
          onClick={() => setConnectionListType((prev) => (prev === 'followers' ? null : 'followers'))}
          aria-expanded={connectionListType === 'followers'}
        >
          <div className="stat-value">{targetFollowerIds.length}</div>
          <div className="stat-label">Followers</div>
        </button>
        <button
          type="button"
          className="stat-item stat-button"
          onClick={() => setConnectionListType((prev) => (prev === 'following' ? null : 'following'))}
          aria-expanded={connectionListType === 'following'}
        >
          <div className="stat-value">{targetFollowingIds.length}</div>
          <div className="stat-label">Following</div>
        </button>
      </div>

      {connectionListType && (
        <div className="connection-panel">
          <div className="connection-panel-head">
            <div>
              <h2>
                {connectionListType === 'followers'
                  ? viewingOwnProfile ? 'Your followers' : `Followers of ${connectionHeadingName}`
                  : viewingOwnProfile ? 'People you follow' : `People ${connectionHeadingName} follows`}
              </h2>
              <p className="connection-panel-subtitle">Tap anyone to jump into their profile.</p>
            </div>
            <button type="button" className="ghost-btn" onClick={() => setConnectionListType(null)}>
              Close
            </button>
          </div>

          {connectionLoading ? (
            <p className="connection-panel-placeholder">Loading…</p>
          ) : connectionProfiles.length === 0 ? (
            <p className="connection-panel-placeholder">
              {connectionListType === 'followers'
                ? viewingOwnProfile ? 'No followers yet.' : 'No followers to show yet.'
                : viewingOwnProfile ? 'You are not following anyone yet.' : 'No following info to show yet.'}
            </p>
          ) : (
            <div className="connection-list">
              {connectionProfiles.map((connection) => (
                <button
                  type="button"
                  key={connection.id}
                  className="connection-card"
                  onClick={() => handleProfileNavigation(connection.id)}
                >
                  <div
                    className="connection-avatar"
                    style={{ background: connection.avatarBackground || DEFAULT_AVATAR_BACKGROUND }}
                  >
                    <FontAwesomeIcon
                      icon={getAvatarIconById(connection.avatarIcon)}
                      style={{ color: connection.avatarColor || DEFAULT_AVATAR_COLOR }}
                    />
                  </div>
                  <div className="connection-meta">
                    <div className="connection-name">{connection.displayName || 'Dreamer'}</div>
                    {connection.username && <div className="connection-username">@{connection.username}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="profile-dreams">
        <div className="profile-dreams-head">
          <div>
            <h2>{dreamSectionTitle}</h2>
            <p className="profile-dreams-subtitle">{dreamSectionSubtitle}</p>
          </div>
        </div>

        {dreamsLoading ? (
          <div className="profile-dreams-loading">Loading dreams…</div>
        ) : displayedDreams.length === 0 ? (
          <div className="profile-dreams-empty">
            <p>{viewingOwnProfile ? 'No dreams yet' : 'No dreams shared with you yet'}</p>
            <p className="empty-subtitle">
              {viewingOwnProfile
                ? 'Start a new entry to see it here.'
                : viewerFollowedByTarget
                  ? 'They have not shared any public or limited dreams recently.'
                  : 'This dreamer only shares entries with people they follow.'}
            </p>
          </div>
        ) : (
          <div className="profile-dream-grid">
            {displayedDreams.map(renderDreamPreview)}
          </div>
        )}
      </div>
    </div>
  );
}
