import { useState, useEffect, useMemo } from 'react';
import { collection, doc, query, where, orderBy, limit, onSnapshot, documentId } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { DEFAULT_AVATAR_BACKGROUND, DEFAULT_AVATAR_COLOR, getAvatarIconById } from '../constants/avatarOptions';
import { buildProfilePath, buildDreamPath } from '../utils/urlHelpers';
import './Feed.css';
import LoadingIndicator from '../components/LoadingIndicator';

export default function Feed({ user }) {
  const [rawDreams, setRawDreams] = useState([]);
  const [followingIds, setFollowingIds] = useState([]);
  const [followingIdsLoaded, setFollowingIdsLoaded] = useState(false);
  const [followingProfiles, setFollowingProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const chunkArray = (list, chunkSize = 10) => {
    const chunks = [];
    for (let i = 0; i < list.length; i += chunkSize) {
      chunks.push(list.slice(i, i + chunkSize));
    }
    return chunks;
  };
  const viewerId = user?.uid || null;

  useEffect(() => {
    if (!user?.uid) return undefined;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      const data = snapshot.data();
      setFollowingIds(data?.followingIds || []);
      setFollowingIdsLoaded(true);
    });

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!followingIds.length) {
      setFollowingProfiles({});
      return undefined;
    }

    setFollowingProfiles({});
    const chunks = chunkArray(followingIds);
    const unsubscribes = chunks.map((chunk) => {
      const usersQuery = query(
        collection(db, 'users'),
        where(documentId(), 'in', chunk)
      );

      return onSnapshot(usersQuery, (snapshot) => {
        setFollowingProfiles((prev) => {
          const updated = { ...prev };
          snapshot.forEach((docSnap) => {
            updated[docSnap.id] = docSnap.data();
          });
          return updated;
        });
      }, () => {});
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [followingIds]);

  useEffect(() => {
    if (!followingIds.length) {
      setRawDreams([]);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    const chunkResults = new Map();
    const chunks = chunkArray(followingIds);
    const unsubscribes = chunks.map((chunk) => {
      const friendQuery = query(
        collection(db, 'dreams'),
        where('userId', 'in', chunk),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      return onSnapshot(friendQuery, (snapshot) => {
        const docs = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const createdAt = data.createdAt?.toDate?.() ?? data.createdAt ?? null;
          return {
            id: docSnap.id,
            ...data,
            visibility: data.visibility || 'private',
            createdAt
          };
        });

        chunkResults.set(chunk.join(','), docs);
        const merged = Array.from(chunkResults.values()).flat();
        const byId = new Map();
        merged.forEach((dream) => {
          byId.set(dream.id, dream);
        });
        const candidates = Array.from(byId.values()).filter((dream) => ['anonymous', 'public', 'following', 'followers'].includes(dream.visibility));
        setRawDreams(candidates);
        setLoading(false);
      }, () => {
        setError('Unable to load your following feed right now.');
        setLoading(false);
      });
    });

    return () => {
      chunkResults.clear();
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [followingIds]);

  const visibleDreams = useMemo(() => {
    if (!rawDreams.length) return [];

    const filtered = rawDreams.filter((dream) => {
      if (!dream) return false;
      const visibility = dream.visibility || 'private';
      if (viewerId && Array.isArray(dream.excludedViewerIds) && dream.excludedViewerIds.includes(viewerId)) {
        return false;
      }
      if (viewerId && Array.isArray(dream.taggedUserIds) && dream.taggedUserIds.includes(viewerId)) {
        return true;
      }
      if (visibility === 'public' || visibility === 'anonymous') {
        return true;
      }
      if (!viewerId) {
        return false;
      }

      const authorProfile = dream.userId ? followingProfiles[dream.userId] : null;
      const authorFollowingIds = Array.isArray(authorProfile?.followingIds) ? authorProfile.followingIds : [];
      const authorFollowerIds = Array.isArray(authorProfile?.followerIds) ? authorProfile.followerIds : [];

      if (visibility === 'following') {
        return authorFollowingIds.includes(viewerId);
      }

      if (visibility === 'followers') {
        return authorFollowerIds.includes(viewerId);
      }

      if (visibility === 'private') {
        return dream.userId === viewerId;
      }

      return false;
    });

    return filtered.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [rawDreams, followingProfiles, viewerId]);

  return (
    <div className="page-container">
      <div className="page-header feed-header">
        <div>
          <h1>Following Feed</h1>
          <p className="page-subtitle">Dreams that are public, anonymous, and from people you follow.</p>
        </div>
        <div className="feed-actions">
          <span className="pill">Following {followingIds.length}</span>
          <button type="button" className="ghost-btn" onClick={() => navigate('/search')}>
            Find people
          </button>
        </div>
      </div>

      {error && <div className="alert-banner">{error}</div>}

      {!followingIdsLoaded ? (
          <div className="feed-empty-card loading-slot">
            <LoadingIndicator label="Loading your following feed…" size="md" />
          </div>
      ) : followingIds.length === 0 ? (
        <div className="feed-empty-card">
          <p>You are not following anyone yet.</p>
          <p className="empty-subtitle">Follow people from Search to see their dreams here.</p>
          <button type="button" className="primary-btn" onClick={() => navigate('/search')}>
            Find people
          </button>
        </div>
      ) : loading ? (
          <div className="feed-empty-card loading-slot">
            <LoadingIndicator label="Loading your following feed…" size="md" />
        </div>
      ) : visibleDreams.length === 0 ? (
        <div className="feed-empty-card">
          <p>No dreams from the people you follow yet.</p>
          <p className="empty-subtitle">As soon as they share something public, anonymous, or limited to people they follow, it will appear here.</p>
        </div>
      ) : (
        <div className="feed-list">
          {visibleDreams.map((dream) => {
            const profile = dream.userId ? followingProfiles[dream.userId] : null;
            const isAnonymous = dream.visibility === 'anonymous';
            const authorLabel = isAnonymous
              ? 'Anonymous dreamer'
              : profile?.displayName || dream.authorDisplayName || dream.userDisplayName || dream.ownerDisplayName || 'Dreamer';
            const authorUsername = !isAnonymous ? (profile?.username || dream.authorUsername || '') : '';
            const authorHandle = authorUsername ? `@${authorUsername}` : null;
            const avatarIconId = isAnonymous ? 'ghost' : profile?.avatarIcon;
            const avatarIcon = getAvatarIconById(avatarIconId);
            const avatarBackground = profile?.avatarBackground || DEFAULT_AVATAR_BACKGROUND;
            const avatarColor = profile?.avatarColor || DEFAULT_AVATAR_COLOR;
            const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Just now';
            const snippet = dream.content ? (dream.content.length > 240 ? `${dream.content.slice(0, 240)}…` : dream.content) : 'No entry text yet.';
            const visibilityLabel = dream.visibility === 'anonymous'
              ? 'Anonymous dream'
              : dream.visibility === 'following' || dream.visibility === 'followers'
                ? 'Shared with people they follow'
                : 'Public dream';
            const showProfileLink = !isAnonymous && Boolean(dream.userId);
            const profilePath = showProfileLink ? buildProfilePath(authorUsername, dream.userId) : null;
            const handleAuthorNavigation = (event) => {
              if (!showProfileLink) return;
              event.stopPropagation();
              event.preventDefault();
              if (profilePath) {
                navigate(profilePath);
              }
            };
            const openDreamDetail = () => {
              const detailPath = isAnonymous
                ? `/dream/${dream.id}`
                : buildDreamPath(authorUsername, dream.userId, dream.id);
              navigate(detailPath, { state: { fromNav: '/feed' } });
            };

            return (
              <div
                key={dream.id}
                className="feed-card"
                role="button"
                tabIndex={0}
                onClick={openDreamDetail}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openDreamDetail();
                  }
                }}
              >
                <div className="feed-card-head">
                  <div className="feed-author-block">
                    <div
                      className="feed-avatar"
                      style={{ background: avatarBackground, color: avatarColor }}
                    >
                      <FontAwesomeIcon icon={avatarIcon} />
                    </div>
                    <div className="feed-author-meta">
                      {showProfileLink ? (
                        <button type="button" className="feed-author feed-author-link" onClick={handleAuthorNavigation}>
                          {authorLabel}
                        </button>
                      ) : (
                        <div className="feed-author">{authorLabel}</div>
                      )}
                      {authorHandle && (
                        showProfileLink ? (
                          <button type="button" className="feed-author-handle feed-author-link" onClick={handleAuthorNavigation}>
                            {authorHandle}
                          </button>
                        ) : (
                          <div className="feed-author-handle">{authorHandle}</div>
                        )
                      )}
                      <div className="feed-visibility">{visibilityLabel}</div>
                    </div>
                  </div>
                  <span className="feed-date">{dateLabel}</span>
                </div>

                {(dream.title || (dream.aiGenerated && dream.aiTitle)) ? (
                  <h3 className="feed-title">{dream.title || dream.aiTitle}</h3>
                ) : null}

                <p className="feed-content">{snippet}</p>

                {dream.aiGenerated && dream.aiInsights && (
                  <p className="feed-summary">{dream.aiInsights}</p>
                )}

                {dream.tags && dream.tags.length > 0 && (
                  <div className="feed-tags">
                    {dream.tags.map((tag, index) => (
                      <span key={index} className="tag">{tag.value}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
