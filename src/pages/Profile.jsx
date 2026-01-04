import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRightFromBracket, faPencil, faGear } from '@fortawesome/free-solid-svg-icons';
import { format } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { AVATAR_ICONS, AVATAR_BACKGROUNDS, AVATAR_COLORS, DEFAULT_AVATAR_BACKGROUND, DEFAULT_AVATAR_COLOR, getAvatarIconById } from '../constants/avatarOptions';
import LoadingIndicator from '../components/LoadingIndicator';
import { buildProfilePath, buildDreamPath } from '../utils/urlHelpers';
import './Profile.css';
import { firebaseUserPropType } from '../propTypes';

export default function Profile({ user }) {
  const { handle: routeHandle } = useParams();
  const [targetUserId, setTargetUserId] = useState(() => (routeHandle ? null : (user?.uid || null)));
  const viewingOwnProfile = Boolean(user?.uid && targetUserId && targetUserId === user.uid);
  const [userData, setUserData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [dreams, setDreams] = useState([]);
  const [dreamsLoading, setDreamsLoading] = useState(true);
  const [taggedDreams, setTaggedDreams] = useState([]);
  const [taggedDreamsLoading, setTaggedDreamsLoading] = useState(true);
  const [dreamTab, setDreamTab] = useState('authored');
  const [isEditing, setIsEditing] = useState(false);
  const [avatarIcon, setAvatarIcon] = useState(AVATAR_ICONS[0].id);
  const [avatarBackground, setAvatarBackground] = useState(AVATAR_BACKGROUNDS[0]);
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [viewerData, setViewerData] = useState(null);
  const [followAction, setFollowAction] = useState({ type: null });
  const [connectionListType, setConnectionListType] = useState(null);
  const [connectionProfiles, setConnectionProfiles] = useState([]);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const navigate = useNavigate();
  const viewerId = user?.uid || null;
  const editingRef = useRef(false);

  useEffect(() => {
    editingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    if (!routeHandle) {
      setTargetUserId(user?.uid || null);
      setProfileNotFound(false);
      return;
    }

    let cancelled = false;

    const resolveHandle = async () => {
      setProfileLoading(true);
      setProfileNotFound(false);
      setUserData(null);

      try {
        const directSnap = await getDoc(doc(db, 'users', routeHandle));
        if (!cancelled && directSnap.exists()) {
          setTargetUserId(directSnap.id);
          return;
        }

        const normalizedHandle = routeHandle.toLowerCase();
        const userQuery = query(
          collection(db, 'users'),
          where('normalizedUsername', '==', normalizedHandle),
          limit(1)
        );
        const matches = await getDocs(userQuery);

        if (!cancelled && !matches.empty) {
          setTargetUserId(matches.docs[0].id);
          return;
        }

        if (!cancelled) {
          setTargetUserId(null);
          setProfileNotFound(true);
          setProfileLoading(false);
        }
      } catch {
        if (!cancelled) {
          setTargetUserId(null);
          setProfileNotFound(true);
          setProfileLoading(false);
        }
      }
    };

    resolveHandle();

    return () => {
      cancelled = true;
    };
  }, [routeHandle, user?.uid]);

  const fetchUsersByIds = useCallback(async (ids = []) => {
    const seen = new Set();
    const normalizedIds = [];

    ids.forEach((rawId) => {
      if (typeof rawId !== 'string') return;
      const trimmed = rawId.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      normalizedIds.push(trimmed);
    });

    if (!normalizedIds.length) return [];

    const results = await Promise.all(
      normalizedIds.map(async (id) => {
        try {
          const snapshot = await getDoc(doc(db, 'users', id));
          return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
        } catch {
          return null;
        }
      })
    );
    return results.filter(Boolean);
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      setViewerData(snapshot.exists() ? snapshot.data() : null);
    });

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!targetUserId) return undefined;

    setProfileNotFound(false);
    setProfileLoading(true);
    setUserData(null);
    setDreams([]);
    setDreamsLoading(true);
    setTaggedDreams([]);
    setTaggedDreamsLoading(true);
    setConnectionProfiles([]);
    setConnectionLoading(false);
    setConnectionListType(null);
    setIsEditing(false);
    setDreamTab('authored');

    const userRef = doc(db, 'users', targetUserId);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (!snapshot.exists()) {
        setProfileNotFound(true);
        setUserData(null);
        setProfileLoading(false);
        return;
      }

      const data = snapshot.data();
      setProfileNotFound(false);
      setUserData(data);

      if (!viewingOwnProfile || !editingRef.current) {
        setDisplayName(data.displayName || '');
        setUsername(data.username || '');
        setBio(data.bio || '');
        if (viewingOwnProfile) {
          setAvatarIcon(data.avatarIcon || AVATAR_ICONS[0].id);
          setAvatarBackground(data.avatarBackground || AVATAR_BACKGROUNDS[0]);
          setAvatarColor(data.avatarColor || AVATAR_COLORS[0]);
        }
      }

      setProfileLoading(false);
    }, () => {
      setProfileNotFound(true);
      setUserData(null);
      setProfileLoading(false);
    });

    return unsubscribe;
  }, [targetUserId, viewingOwnProfile]);

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
    if (!targetUserId) {
      setTaggedDreams([]);
      setTaggedDreamsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setTaggedDreamsLoading(true);

    const taggedQuery = query(
      collection(db, 'dreams'),
      where('taggedUserIds', 'array-contains', targetUserId),
      orderBy('createdAt', 'desc'),
      limit(12)
    );

    const unsubscribe = onSnapshot(taggedQuery, async (snapshot) => {
      const baseList = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null
        };
      });

      try {
        const authorIds = Array.from(new Set(
          baseList.map((entry) => entry.userId).filter((id) => id && id !== targetUserId)
        ));

        let authorMap = {};
        if (authorIds.length) {
          const profiles = await fetchUsersByIds(authorIds);
          authorMap = profiles.reduce((acc, profile) => {
            acc[profile.id] = profile;
            return acc;
          }, {});
        }

        if (!cancelled) {
          const enriched = baseList.map((entry) => (
            authorMap[entry.userId]
              ? { ...entry, authorProfile: authorMap[entry.userId] }
              : entry
          ));
          setTaggedDreams(enriched);
        }
      } catch {
        if (!cancelled) {
          setTaggedDreams(baseList);
        }
      } finally {
        if (!cancelled) {
          setTaggedDreamsLoading(false);
        }
      }
    }, () => {
      if (!cancelled) {
        setTaggedDreams([]);
        setTaggedDreamsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [targetUserId, fetchUsersByIds]);

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
  }, [connectionListType, userData?.followerIds, userData?.followingIds, fetchUsersByIds]);

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
      setIsEditing(false);
    } catch {
      alert('Failed to update profile');
    }

    setLoading(false);
  };

  const viewerFollowingIds = viewerData?.followingIds || [];
  const targetFollowerIds = userData?.followerIds || [];
  const targetFollowingIds = userData?.followingIds || [];
  const connectionHeadingName = userData?.displayName || 'this dreamer';
  const targetProfileUsername = userData?.username || '';
  const viewerUsername = viewerData?.username || '';
  const activeProfileUsername = viewingOwnProfile ? (targetProfileUsername || viewerUsername) : targetProfileUsername;

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
  const followsYou = !viewingOwnProfile && targetFollowingIds.includes(user?.uid);

  const selectedIcon = useMemo(() => getAvatarIconById(displayAvatarIconId), [displayAvatarIconId]);
  const isFollowActionBusy = Boolean(followAction.type);
  const viewerFollowedByTarget = useMemo(() => {
    if (viewingOwnProfile || !viewerId) return false;
    return targetFollowingIds.includes(viewerId);
  }, [viewerId, viewingOwnProfile, targetFollowingIds]);
  const viewerCanSeeTaggedDream = useCallback((dream) => {
    if (!dream) return false;
    if (viewerId && Array.isArray(dream.excludedViewerIds) && dream.excludedViewerIds.includes(viewerId)) {
      return false;
    }
    if (viewerId && dream.userId === viewerId) return true;
    if (viewerId && Array.isArray(dream.taggedUserIds) && dream.taggedUserIds.includes(viewerId)) {
      return true;
    }
    if (viewerId === targetUserId) return true;
    const visibility = dream.visibility || 'private';
    if (visibility === 'public' || visibility === 'anonymous') return true;
    if ((visibility === 'following' || visibility === 'followers') && viewerId) {
      const authorFollowing = dream.authorProfile?.followingIds || [];
      if (authorFollowing.includes(viewerId)) {
        return true;
      }
    }
    return false;
  }, [viewerId, targetUserId]);
  const displayedDreams = useMemo(() => {
    if (viewingOwnProfile) return dreams;
    return dreams.filter((dream) => {
      if (!dream) return false;
      const excluded = viewerId && Array.isArray(dream.excludedViewerIds) && dream.excludedViewerIds.includes(viewerId);
      if (excluded) return false;
      if (viewerId && Array.isArray(dream.taggedUserIds) && dream.taggedUserIds.includes(viewerId)) {
        return true;
      }
      const visibility = dream.visibility || 'private';
      if (visibility === 'public') return true;
      if ((visibility === 'following' || visibility === 'followers') && viewerFollowedByTarget) {
        return true;
      }
      return false;
    });
  }, [dreams, viewingOwnProfile, viewerFollowedByTarget, viewerId]);
  const taggedDreamsForProfile = useMemo(() => {
    if (!targetUserId) return [];
    return taggedDreams
      .filter((dream) => {
        if (!dream) return false;
        if (!Array.isArray(dream.taggedUserIds) || !dream.taggedUserIds.includes(targetUserId)) {
          return false;
        }
        if (viewerId === targetUserId) {
          return true;
        }
        return viewerCanSeeTaggedDream(dream);
      })
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [taggedDreams, targetUserId, viewerId, viewerCanSeeTaggedDream]);

  const performFollowAction = async (type, operation, errorMessage) => {
    setFollowAction({ type });
    try {
      await operation();
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

  const handleDreamNavigation = useCallback((dreamId, ownerUsername, ownerId) => {
    if (!dreamId) return;
    const slug = ownerUsername || activeProfileUsername;
    const owner = ownerId || targetUserId;
    navigate(buildDreamPath(slug, owner, dreamId), { state: { fromNav: '/profile' } });
  }, [activeProfileUsername, navigate, targetUserId]);

  const handleProfileNavigation = useCallback((profile) => {
    if (!profile) return;
    if (typeof profile === 'string') {
      navigate(buildProfilePath(null, profile));
      setConnectionListType(null);
      return;
    }
    const profileId = profile.id;
    navigate(buildProfilePath(profile.username, profileId));
    setConnectionListType(null);
  }, [navigate]);

  if (!targetUserId) {
    return <div className="page-container">Profile unavailable.</div>;
  }

  if (profileNotFound) {
    return <div className="page-container">We could not find that dreamer.</div>;
  }

  if (!userData) {
    return (
      <div className="page-container">
        <div className="profile-loading loading-slot">
          <LoadingIndicator label="Loading profile…" size="lg" />
        </div>
      </div>
    );
  }

  const renderDreamPreview = (dream) => {
    const title = dream.title || (dream.aiGenerated ? dream.aiTitle?.trim() : '');
    const snippet = dream.content?.length > 180 ? `${dream.content.slice(0, 180)}…` : dream.content;
    const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Pending sync';
    let visibilityLabel = 'Private';
    if (dream.visibility === 'anonymous') visibilityLabel = 'Shared anonymously';
    else if (dream.visibility === 'public') visibilityLabel = 'Public dream';
    else if (dream.visibility === 'following' || dream.visibility === 'followers') visibilityLabel = 'People you follow';
    const taggedList = Array.isArray(dream.taggedUsers) ? dream.taggedUsers : [];
    const visibleTagged = taggedList.slice(0, 3);
    const remainingTagged = Math.max(taggedList.length - visibleTagged.length, 0);

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
        <p className="profile-dream-snippet">{snippet}</p>
        {dream.aiGenerated && dream.aiInsights && (
          <p className="profile-dream-summary">{dream.aiInsights}</p>
        )}
        {taggedList.length ? (
          <div className="profile-tagged-peek">
            <span className="tagged-label">Tagged</span>
            <div className="tagged-pill-row">
              {visibleTagged.map((entry, index) => {
                const label = entry.username ? `@${entry.username}` : (entry.displayName || 'Dreamer');
                return (
                  <span className="tagged-pill" key={`${dream.id}-tagged-${entry.userId || index}`}>
                    {label}
                  </span>
                );
              })}
              {remainingTagged > 0 && (
                <span className="tagged-pill extra">+{remainingTagged} more</span>
              )}
            </div>
          </div>
        ) : null}
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

  const renderTaggedDream = (dream) => {
    const authorProfile = dream.authorProfile || null;
    const isAnonymous = dream.visibility === 'anonymous';
    const authorName = isAnonymous
      ? 'Anonymous dreamer'
      : authorProfile?.displayName || dream.authorDisplayName || dream.userDisplayName || 'Dreamer';
    const authorHandle = !isAnonymous ? (authorProfile?.username || dream.authorUsername || '') : '';
    const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Shared recently';
    const snippet = dream.content?.length > 200 ? `${dream.content.slice(0, 200)}…` : (dream.content || 'No description yet.');
    const summary = dream.aiGenerated && dream.aiInsights ? dream.aiInsights : '';

    return (
      <div
        key={dream.id}
        className="tagged-dream-card"
        role="button"
        tabIndex={0}
        onClick={() => handleDreamNavigation(dream.id, authorHandle, dream.userId)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleDreamNavigation(dream.id, authorHandle, dream.userId);
          }
        }}
      >
        <div className="tagged-dream-head">
          <div>
            <p className="tagged-author">{authorName}</p>
            <p className="tagged-meta">
              {authorHandle ? `@${authorHandle} • ` : ''}
              {dateLabel}
            </p>
          </div>
          {!isAnonymous && dream.userId && (
            <button
              type="button"
              className="tagged-view-profile"
              onClick={(event) => {
                event.stopPropagation();
                handleProfileNavigation({ id: dream.userId, username: authorHandle });
              }}
            >
              View profile
            </button>
          )}
        </div>
        <p className="tagged-snippet">{snippet}</p>
        {summary ? <p className="tagged-summary">{summary}</p> : null}
        <div className="tagged-pill-row">
          <span className="tagged-pill shared-pill">Shared with you</span>
          {isAnonymous && <span className="tagged-pill muted-pill">Anonymous</span>}
        </div>
      </div>
    );
  };

  const isTaggedTab = dreamTab === 'tagged';
  const dreamSectionTitle = isTaggedTab
    ? (viewingOwnProfile ? 'Tagged dreams' : 'Tagged for this dreamer')
    : (viewingOwnProfile ? 'Your dreams' : 'Recent dreams');
  const dreamSectionSubtitle = isTaggedTab
    ? (viewingOwnProfile
      ? 'Anytime someone mentions you, it lands in this list.'
      : 'Entries that mention this dreamer and are visible to you.')
    : (viewingOwnProfile
      ? 'A gallery of your latest journal entries.'
      : 'Only entries they have shared with you appear here.');
  const activeDreams = isTaggedTab ? taggedDreamsForProfile : displayedDreams;
  const activeDreamsLoading = isTaggedTab ? taggedDreamsLoading : dreamsLoading;
  const emptyPrimary = isTaggedTab
    ? (viewingOwnProfile ? 'Nobody has tagged you yet' : 'No tagged dreams to show')
    : (viewingOwnProfile ? 'No dreams yet' : 'No dreams shared with you yet');
  const emptySecondary = isTaggedTab
    ? (viewingOwnProfile
      ? 'When another dreamer mentions you, their entry appears here automatically.'
      : 'As soon as a visible tagged entry exists, it will show up in this tab.')
    : (viewingOwnProfile
      ? 'Start a new entry to see it here.'
      : viewerFollowedByTarget
        ? 'They have not shared any public or limited dreams recently.'
        : 'This dreamer only shares entries with people they follow.');
  const authoredTabLabel = viewingOwnProfile ? 'Your dreams' : 'Their dreams';
  const taggedTabLabel = viewingOwnProfile ? 'Tagged' : 'Tagged dreams';

  if (profileLoading) {
    return (
      <div className="page-container">
        <div className="profile-loading loading-slot">
          <LoadingIndicator label="Loading profile…" size="lg" />
        </div>
      </div>
    );
  }

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
              <div className="profile-btn-row">
                <button onClick={() => setIsEditing(true)} className="edit-profile-btn">
                  <FontAwesomeIcon icon={faPencil} />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => navigate('/settings')}
                >
                  <FontAwesomeIcon icon={faGear} />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  className="sign-out-profile-btn"
                  onClick={async () => {
                    try {
                      await signOut(auth);
                    } catch {
                      alert('Sign out failed. Please try again.');
                    }
                  }}
                >
                  <FontAwesomeIcon icon={faRightFromBracket} />
                  <span>Sign Out</span>
                </button>
              </div>
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
            <div className="connection-panel-placeholder loading-slot">
              <LoadingIndicator label="Fetching dreamers…" size="sm" />
            </div>
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
                  onClick={() => handleProfileNavigation(connection)}
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
          <div className="dream-tab-group">
            <button
              type="button"
              className={isTaggedTab ? 'dream-tab' : 'dream-tab active'}
              onClick={() => setDreamTab('authored')}
              aria-pressed={dreamTab === 'authored'}
            >
              {authoredTabLabel}
            </button>
            <button
              type="button"
              className={isTaggedTab ? 'dream-tab active' : 'dream-tab'}
              onClick={() => setDreamTab('tagged')}
              aria-pressed={dreamTab === 'tagged'}
            >
              {taggedTabLabel}
            </button>
          </div>
        </div>

        {activeDreamsLoading ? (
          <div className="profile-dreams-loading loading-slot">
            <LoadingIndicator label="Loading dreams…" />
          </div>
        ) : activeDreams.length === 0 ? (
          <div className="profile-dreams-empty">
            <p>{emptyPrimary}</p>
            <p className="empty-subtitle">{emptySecondary}</p>
          </div>
        ) : (
          <div className="profile-dream-grid">
            {isTaggedTab
              ? activeDreams.map((dream) => renderTaggedDream(dream))
              : activeDreams.map(renderDreamPreview)}
          </div>
        )}
      </div>
    </div>
  );
}

Profile.propTypes = {
  user: firebaseUserPropType
};
